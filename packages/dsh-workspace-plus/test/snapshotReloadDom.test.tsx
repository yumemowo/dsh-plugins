// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsSnapshot } from '../src/client/remote.ts'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { storeViewModeProps, viewModeStoreStub } from './viewMode-stub.ts'

/**
 * 快照 reload 的时序
 *
 * 就绪信号、推送与写入失败都会并发触发 reload ，而它们的响应可能乱序回来
 * 迟到的旧响应会把已经画好的新内容盖回去——表现是「分叉出的会话有时在源会话旁边，
 * 有时又跳回未归组区」，刷新一次看着正常、再看又不一样
 *
 * 这些现象没有任何报错伴随，只能按真实 DOM 的落位来断言
 */

const SUMMARIES: Record<string, unknown> = {
  's-source': summary('s-source', 3000),
  's-child': summary('s-child', 2000),
}

/** 分叉落位之后：两个会话都在同一个分组里 */
function placed(): WorkspaceGroupsSnapshot {
  return snapshot({
    byWorkspace: { w1: [{ id: 'sg1', name: '前端', sessionIds: ['s-source', 's-child'] }] },
  })
}

/** 落位之前：只有源会话在分组里，分叉出的那条还在未归组区 */
function unplaced(): WorkspaceGroupsSnapshot {
  return snapshot({
    byWorkspace: { w1: [{ id: 'sg1', name: '前端', sessionIds: ['s-source'] }] },
  })
}

/**
 * 造一份区域 props
 * @param loadGroups - 快照拉取入口，由用例控制每次返回什么
 * @param listeners - 收集就绪订阅，用例据此手动触发 reload 
 */
function regionProps(
  loadGroups: WorkspaceGroupsProps['loadGroups'],
  listeners: (() => void)[],
  owned: readonly string[] = ['s-source', 's-child'],
): WorkspaceGroupsProps {
  const workspaceState = {
    items: [
      {
        workspaceId: 'w1',
        path: '/tmp/w1',
        title: 'W1',
        sessionIds: [...owned],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    phase: 'ready',
  }
  const sessionState = { ids: ['s-source', 's-child'], byId: SUMMARIES, phase: 'ready' }
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) => select(workspaceState)) as never,
    useSessions: ((select: (s: unknown) => unknown) => select(sessionState)) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => undefined,
    loadGroups,
    // 区域挂上就绪订阅时把它交出来，用例据此手动发起第二次 reload 
    onReady: (listener) => {
      listeners.push(listener)
      return () => {}
    },
    createGroup: async () => snapshot(),
    renameGroup: async () => snapshot(),
    deleteGroup: async () => snapshot(),
    moveSession: async () => snapshot(),
    setSegmentOrder: async () => snapshot(),
    moveGroupBefore: async () => snapshot(),
    moveVirtualWorkspaceBefore: async () => snapshot(),
    createVirtualWorkspace: async () => snapshot(),
    renameVirtualWorkspace: async () => snapshot(),
    deleteVirtualWorkspace: async () => snapshot(),
    moveWorkspace: async () => snapshot(),
    nestWorkspaces: async () => snapshot(),
    unnestWorkspaces: async () => snapshot(),
    setNested: async () => snapshot(),
    forgetWorkspace: async () => snapshot(),
    focusEntry: async () => snapshot(),
    togglePinned: async () => snapshot(),
    setSessionPinned: async () => {},
    insertWorkspaceBefore: async () => {},
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    ...shellSeats(),
    ...storeViewModeProps(viewModeStoreStub()),
  }
}

/** 挂载区域并等首帧落地 */
async function mount(props: WorkspaceGroupsProps): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props))
  })
  await act(async () => {
    for (let round = 0; round < 4; round += 1) await Promise.resolve()
  })
  return container
}

/** 让挂起的 promise 链走完几轮 */
async function flush(): Promise<void> {
  await act(async () => {
    for (let round = 0; round < 4; round += 1) await Promise.resolve()
  })
}

/** 一个分组段里的会话标题，按渲染顺序 */
function groupTitles(container: HTMLElement): string[] {
  const scope = container.querySelector('.groupBody > .sessions')
  if (scope === null) return []
  return Array.from(scope.querySelectorAll('.row .rowTitle')).map((node) => node.textContent ?? '')
}

/** 工作区里未归组那一段的会话标题 */
function looseTitles(container: HTMLElement): string[] {
  const scopes = Array.from(container.querySelectorAll('.workspaceBody > .sessions'))
  const found = scopes.find((scope) => scope.querySelector('.row'))
  if (found === undefined) return []
  return Array.from(found.querySelectorAll('.row .rowTitle')).map((node) => node.textContent ?? '')
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('settling sessions', () => {
  it('keeps a group-recorded session out of the trailing ungrouped bucket until its workspace claims it', async () => {
    // 宿主分叉时先建会话、后挂工作区，而落位写在会话创建那一刻
    // 挂载前那次快照里，分组元数据已有它、工作区成员表还没有——画进末尾桶就是一闪
    const listeners: (() => void)[] = []
    // 成员表里只有源会话：分叉出的那条正在归位
    const props = regionProps(async () => placed() as never, listeners, ['s-source'])

    const container = await mount(props)

    // 它没有出现在任何地方——既不在分组段，也不在末尾的未分组桶
    expect(groupTitles(container)).toEqual(['会话 s-source'])
    expect(looseTitles(container)).toEqual([])
    expect(container.textContent).not.toContain('会话 s-child')
  })

  it('shows it in its group once the workspace claims it', async () => {
    // 挂载完成之后它就是正常成员了，判据不能把它长期藏起来
    const listeners: (() => void)[] = []
    const props = regionProps(async () => placed() as never, listeners, ['s-source', 's-child'])

    const container = await mount(props)

    expect(groupTitles(container)).toEqual(['会话 s-source', '会话 s-child'])
  })
})

describe('snapshot reload ordering', () => {
  it('does not issue a second reload while one is in flight', async () => {
    // 并发发出去的两次请求之间没有先后，谁先回来取决于网络，而它们各自都可能被当成最新的那份
    // 因此在途时只记「落地后再来一次」，不真的发出去
    const pending: { resolve: (value: WorkspaceGroupsSnapshot) => void }[] = []
    const loadGroups = (): ReturnType<WorkspaceGroupsProps['loadGroups']> => {
      let resolve: (value: WorkspaceGroupsSnapshot) => void = () => {}
      const promise = new Promise<WorkspaceGroupsSnapshot>((settle) => {
        resolve = settle
      })
      pending.push({ resolve })
      return promise as never
    }
    const listeners: (() => void)[] = []

    await mount(regionProps(loadGroups, listeners))
    expect(pending).toHaveLength(1)

    // 在途期间再来一次就绪信号：不该发出第二个请求
    await act(async () => {
      for (const listener of listeners) listener()
    })
    expect(pending).toHaveLength(1)
  })

  it('reloads once more after a settled request that was asked again', async () => {
    // 一次操作会推出多帧，同一窗口里的那些并成一次补拉：漏掉补拉就停在旧内容上
    const pending: { resolve: (value: WorkspaceGroupsSnapshot) => void }[] = []
    const loadGroups = (): ReturnType<WorkspaceGroupsProps['loadGroups']> => {
      let resolve: (value: WorkspaceGroupsSnapshot) => void = () => {}
      const promise = new Promise<WorkspaceGroupsSnapshot>((settle) => {
        resolve = settle
      })
      pending.push({ resolve })
      return promise as never
    }
    const listeners: (() => void)[] = []

    const container = await mount(regionProps(loadGroups, listeners))
    await act(async () => {
      for (const listener of listeners) listener()
    })

    // 第一次落地：落位前的内容
    pending[0]?.resolve(unplaced())
    await flush()
    // 补拉已经发出，此时才有第二个请求
    expect(pending).toHaveLength(2)

    pending[1]?.resolve(placed())
    await flush()

    expect(groupTitles(container)).toEqual(['会话 s-source', '会话 s-child'])
    expect(looseTitles(container)).toEqual([])
  })

  it('applies the landed snapshot before any follow-up arrives', async () => {
    // 结账即采用：等补拉回来才画会让界面多停一拍
    const pending: { resolve: (value: WorkspaceGroupsSnapshot) => void }[] = []
    const loadGroups = (): ReturnType<WorkspaceGroupsProps['loadGroups']> => {
      let resolve: (value: WorkspaceGroupsSnapshot) => void = () => {}
      const promise = new Promise<WorkspaceGroupsSnapshot>((settle) => {
        resolve = settle
      })
      pending.push({ resolve })
      return promise as never
    }
    const listeners: (() => void)[] = []

    const container = await mount(regionProps(loadGroups, listeners))
    pending[0]?.resolve(placed())
    await flush()

    expect(groupTitles(container)).toEqual(['会话 s-source', '会话 s-child'])
  })

  it('keeps the last good snapshot when a reload fails', async () => {
    // 一次拉取失败只是一次网络抖动，清空界面会让所有分组消失、会话退回未归组
    // 那种画面正是「位置不固定」的另一半来源
    let call = 0
    const loadGroups = (): ReturnType<WorkspaceGroupsProps['loadGroups']> => {
      call += 1
      if (call === 1) return Promise.resolve(placed()) as never
      return Promise.reject(new Error('offline')) as never
    }
    const listeners: (() => void)[] = []

    const container = await mount(regionProps(loadGroups, listeners))
    expect(groupTitles(container)).toEqual(['会话 s-source', '会话 s-child'])

    // 第二次拉取失败，界面必须保持原样
    await act(async () => {
      for (const listener of listeners) listener()
    })
    await flush()

    expect(groupTitles(container)).toEqual(['会话 s-source', '会话 s-child'])
  })
})
