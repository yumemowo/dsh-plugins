import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Group } from '../src/spec.ts'

/**
 * 宿主半边的分叉落位接线
 *
 * 判定本身另有单测（`test/forkPlacement.test.ts`），这里验的是「接上了没有」：
 * `session/created` 能不能真的把一笔归组写进去、失败会不会留痕而不是让创建失败
 */

/** 一个内存版存储域替身，与服务自己的用例同形 */
function storageStub(initial: Record<string, Group[]> = {}) {
  const records = new Map<string, { groups: Group[]; nesting: null }>(
    Object.entries(initial).map(([key, groups]) => [key, { groups, nesting: null }]),
  )
  /**
   * 写盘之后的通知出口
   *
   * 真域在写盘确认之后才发 domain/changed，替身照同一次序：先落 records，再通知
   * 次序反过来时「信号到达时快照已是新的」这条就测不出来了
   */
  let notify: ((change: { domain: string; table: string; key: string; operation: 'put' | 'deleted' }) => void) | undefined
  const table = {
    get: (key: string) => records.get(key),
    entries: () => records.entries(),
    put: async (key: string, value: { groups: Group[]; nesting: null }) => {
      records.set(key, value)
      notify?.({ domain: 'workspace_plus', table: 'by_workspace', key, operation: 'put' })
    },
    delete: async (key: string) => {
      records.delete(key)
      notify?.({ domain: 'workspace_plus', table: 'by_workspace', key, operation: 'deleted' })
    },
  }
  let stored: unknown = { virtualWorkspaces: [] }
  const global = {
    get: () => stored as { virtualWorkspaces: unknown[]; nested?: boolean; orderSlots?: object; picker?: unknown },
    set: async (value: unknown) => {
      stored = JSON.parse(JSON.stringify(value))
    },
  }
  return {
    records,
    table,
    /** 让替身把写盘通知发给宿主 */
    onWrite: (listener: typeof notify) => {
      notify = listener
    },
    domain: { table: () => table, global, close: async () => {} },
  }
}

/**
 * 造一个能跑 `apply` 的宿主 context
 *
 * 三个服务各按本插件实际用到的形状给：存储域、日志、以及会话创建事件的订阅点
 */
function hostContext(options: {
  storage: ReturnType<typeof storageStub>
  sessionIds?: readonly string[]
  hasRegistry?: boolean
}): {
  ctx: Context
  warnings: unknown[][]
  /** 触发一次会话创建 */
  created: (session: { id: string; header: { parentSession?: string; origin?: 'subagent' } }) => void
  /** 等异步落位走完 */
  settle: () => Promise<void>
  /** apply 注册进宿主的服务，订阅通道挂在它上面 */
  service: () => unknown
} {
  const listeners: ((session: unknown) => void)[] = []
  const changeListeners: ((change: unknown) => void)[] = []
  const warnings: unknown[][] = []
  /** apply 交给 host 的 facade，订阅通道要从这里取 */
  let facade: unknown
  const total = 4
  const ctx = {
    get: (name: string) => {
      if (name === 'workspaceRegistry') {
        if (options.hasRegistry === false) return undefined
        return { list: () => [{ sessionIds: options.sessionIds ?? [] }] }
      }
      return undefined
    },
    storageDomain: { open: async () => options.storage.domain },
    effect: (install: () => () => void) => install(),
    on: (event: string, listener: (payload: never) => void) => {
      if (event === 'session/created') listeners.push(listener as (session: unknown) => void)
      if (event === 'domain/changed') changeListeners.push(listener as (change: unknown) => void)
      return () => {}
    },
    provide: (name: string, value: unknown) => {
      if (name === 'workspacePlus') facade = value
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: (...args: unknown[]) => {
        warnings.push(args)
      },
    },
  } as unknown as Context
  // 替身写完盘之后把 domain/changed 发给宿主，与真域的次序一致
  options.storage.onWrite((change) => {
    for (const listener of [...changeListeners]) listener(change)
  })
  return {
    ctx,
    warnings,
    service: () => facade,
    created: (session) => {
      for (const listener of [...listeners]) listener(session)
    },
    settle: async () => {
      // 落位链上有打开存储、读快照、写分组几段 await，用真实的两轮宏任务把它走完
      for (let round = 0; round < total; round += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    },
  }
}

describe('host fork placement wiring', () => {
  it('places a forked session into the group that holds its source', async () => {
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    const host = hostContext({ storage, sessionIds: ['source'] })

    apply(host.ctx)
    host.created({ id: 'child', header: { parentSession: 'source' } })
    await host.settle()

    expect(storage.records.get('ws-1')?.groups[0]?.sessionIds).toEqual(['source', 'child'])
  })

  it('leaves a session without a source alone', async () => {
    // 新建会话走同一条创建路径，没有来源会话时不该有任何写入
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    const host = hostContext({ storage, sessionIds: ['source'] })

    apply(host.ctx)
    host.created({ id: 'fresh', header: {} })
    await host.settle()

    expect(storage.records.get('ws-1')?.groups[0]?.sessionIds).toEqual(['source'])
  })

  it('leaves a reopened session where the user put it', async () => {
    // 重新打开一条已存盘的分叉会话会再次触发创建，那时它已是工作区成员
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    const host = hostContext({ storage, sessionIds: ['source', 'child'] })

    apply(host.ctx)
    host.created({ id: 'child', header: { parentSession: 'source' } })
    await host.settle()

    expect(storage.records.get('ws-1')?.groups[0]?.sessionIds).toEqual(['source'])
  })

  it('keeps going without a workspace registry', async () => {
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    const host = hostContext({ storage, hasRegistry: false })

    apply(host.ctx)
    host.created({ id: 'child', header: { parentSession: 'source' } })
    await host.settle()

    expect(storage.records.get('ws-1')?.groups[0]?.sessionIds).toEqual(['source'])
    expect(host.warnings).toEqual([])
  })

  it('signals a finished placement through the snapshot feed', async () => {
    // 已打开的界面靠这一帧知道该 reload ：它由存储域的写盘通知转出来，因此到达时快照已是新的
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    const host = hostContext({ storage, sessionIds: ['source'] })
    apply(host.ctx)
    // facade 由 apply 交给宿主，订阅入口在它上面
    const api = host.service() as {
      followSnapshotChanges: (signal: AbortSignal) => AsyncIterable<unknown>
    }
    const abort = new AbortController()
    const iterator = api.followSnapshotChanges(abort.signal)[Symbol.asyncIterator]()

    host.created({ id: 'child', header: { parentSession: 'source' } })
    await host.settle()

    const frame = (await Promise.race([
      iterator.next(),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ])) as { done: boolean; value: { domain: string; key: string } }
    expect(frame.done).toBe(false)
    // 帧描述的是「哪条记录被写了」，not 某个分叉落了位：这条通道不认业务语义
    expect(frame.value.domain).toBe('workspace_plus')
    expect(frame.value.key).toBe('ws-1')
    // 信号到达时写入已经落盘：收到的一侧此刻 reload 就能读到新位置
    expect(storage.records.get('ws-1')?.groups[0]?.sessionIds).toEqual(['source', 'child'])
    abort.abort()
  })

  it('stays silent when nothing was written', async () => {
    // 没有写入却推了一帧，界面会白 reload 一次；判据没命中时必须安静
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    const host = hostContext({ storage, sessionIds: ['source'] })
    apply(host.ctx)
    const api = host.service() as {
      followSnapshotChanges: (signal: AbortSignal) => AsyncIterable<unknown>
    }
    const abort = new AbortController()
    const iterator = api.followSnapshotChanges(abort.signal)[Symbol.asyncIterator]()

    host.created({ id: 'fresh', header: {} })
    await host.settle()

    const frame = await Promise.race([
      iterator.next(),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ])
    expect(frame).toBe('timeout')
    abort.abort()
  })

  it('reports a failed placement without failing the creation', async () => {
    // 写入被拒时留痕：分叉本身已经成功，归组失败不该冒泡成创建失败
    // 源会话必须真在某个分组里，否则判据会在写入之前就返回，这条路径就测不到了
    const storage = storageStub({ 'ws-1': [{ id: 'group-a', name: '前端', sessionIds: ['source'] }] })
    storage.table.put = async () => {
      throw new Error('disk is full')
    }
    const host = hostContext({ storage, sessionIds: ['source'] })

    apply(host.ctx)
    host.created({ id: 'child', header: { parentSession: 'source' } })
    await host.settle()

    expect(
      host.warnings.flat().some((entry) => String(entry).includes('fork placement')),
    ).toBe(true)
  })
})
