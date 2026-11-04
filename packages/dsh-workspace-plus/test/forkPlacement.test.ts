import { describe, expect, it } from 'vitest'
import { forkPlacement, placeForkedSession } from '../src/forkPlacement.ts'
import type { CreatedSession, ForkPlacementStore, SessionOwners } from '../src/forkPlacement.ts'
import type { Group } from '../src/spec.ts'

/**
 * 分叉落位
 *
 * 宿主在会话创建那一刻调它，判据里任何一条放宽都会让不该动的会话被挪进分组
 * 而那种错位不会报错：界面只是「这条会话出现在了别的地方」
 */

/** 造一个会话分组 */
function group(id: string, sessionIds: string[]): Group {
  return { id, name: id, sessionIds }
}

/** 造一个会话创建时读得到的那两格 */
function created(id: string, header: CreatedSession['header'] = {}): CreatedSession {
  return { id, header }
}

/** 工作区注册表替身，成员表由调用方给定 */
function registryWith(...sessionIds: string[]): SessionOwners {
  return { list: () => [{ sessionIds }] }
}

/** 分组存储替身，记下每一次写入 */
function storeWith(byWorkspace: Record<string, Group[]>): ForkPlacementStore & {
  moves: { workspaceId: string; sessionId: string; groupId: string }[]
} {
  const moves: { workspaceId: string; sessionId: string; groupId: string }[] = []
  return {
    moves,
    list: async () => ({ byWorkspace }),
    moveSession: async (workspaceId, sessionId, groupId) => {
      moves.push({ workspaceId, sessionId, groupId })
      return {}
    },
  }
}

describe('forkPlacement', () => {
  it('places the child beside its source inside the same group', () => {
    const placement = forkPlacement({
      childId: 'child',
      parentId: 'source',
      origin: undefined,
      attached: false,
      byWorkspace: { 'ws-1': [group('group-a', ['source'])] },
    })

    expect(placement).toEqual({ workspaceId: 'ws-1', groupId: 'group-a' })
  })

  it('reports nothing when the source sits in no group', () => {
    // 源会话自己就在未归组区里，子会话跟着它待在那儿，没有可写的归属
    const placement = forkPlacement({
      childId: 'child',
      parentId: 'source',
      origin: undefined,
      attached: false,
      byWorkspace: { 'ws-1': [group('group-a', ['other'])] },
    })

    expect(placement).toBeUndefined()
  })

  it('reports nothing for a session that is not a fork', () => {
    const placement = forkPlacement({
      childId: 'child',
      parentId: undefined,
      origin: undefined,
      attached: false,
      byWorkspace: { 'ws-1': [group('group-a', ['source'])] },
    })

    expect(placement).toBeUndefined()
  })

  it('reports nothing for a subagent child', () => {
    // 子代理会话在侧边栏里本就不渲染，把它们写进分组留下的是一份界面读不到的归属
    const placement = forkPlacement({
      childId: 'child',
      parentId: 'source',
      origin: 'subagent',
      attached: false,
      byWorkspace: { 'ws-1': [group('group-a', ['source'])] },
    })

    expect(placement).toBeUndefined()
  })

  it('leaves a session already accounted to a workspace alone', () => {
    // 重新打开一条已存盘的分叉会话同样走会话创建：它早已挂在工作区名下
    // 少了这一条，用户手动把子会话移出分组之后，下次打开它又会被挪回去
    const placement = forkPlacement({
      childId: 'child',
      parentId: 'source',
      origin: undefined,
      attached: true,
      byWorkspace: { 'ws-1': [group('group-a', ['source'])] },
    })

    expect(placement).toBeUndefined()
  })

  it('skips a child that already sits in the group', () => {
    const placement = forkPlacement({
      childId: 'child',
      parentId: 'source',
      origin: undefined,
      attached: false,
      byWorkspace: { 'ws-1': [group('group-a', ['source', 'child'])] },
    })

    expect(placement).toBeUndefined()
  })

  it('reports the workspace that holds the source group', () => {
    // 分组 id 只在自己那个工作区内唯一，因此目标工作区必须取自命中那一条记录
    const placement = forkPlacement({
      childId: 'child',
      parentId: 'source',
      origin: undefined,
      attached: false,
      byWorkspace: {
        'ws-1': [group('group-a', ['other'])],
        'ws-2': [group('group-a', ['source'])],
      },
    })

    expect(placement).toEqual({ workspaceId: 'ws-2', groupId: 'group-a' })
  })
})

describe('placeForkedSession', () => {
  it('writes the child into the group that holds its source', async () => {
    const store = storeWith({ 'ws-1': [group('group-a', ['source'])] })

    const placement = await placeForkedSession(
      Promise.resolve(store),
      // 分叉流程在会话创建之后才把它挂进工作区，因此此刻成员表里没有它
      registryWith('source'),
      created('child', { parentSession: 'source' }),
    )

    expect(placement).toEqual({ workspaceId: 'ws-1', groupId: 'group-a' })
    expect(store.moves).toEqual([
      { workspaceId: 'ws-1', sessionId: 'child', groupId: 'group-a' },
    ])
  })

  it('writes nothing for a session created without a source', async () => {
    const store = storeWith({ 'ws-1': [group('group-a', ['source'])] })

    const placement = await placeForkedSession(Promise.resolve(store), registryWith('source'), created('child'))

    expect(placement).toBeUndefined()
    expect(store.moves).toEqual([])
  })

  it('writes nothing for a subagent child', async () => {
    const store = storeWith({ 'ws-1': [group('group-a', ['source'])] })

    const placement = await placeForkedSession(
      Promise.resolve(store),
      registryWith('source'),
      created('child', { parentSession: 'source', origin: 'subagent' }),
    )

    expect(placement).toBeUndefined()
    expect(store.moves).toEqual([])
  })

  it('writes nothing while the child is already a workspace member', async () => {
    // 重新打开一条已存盘的分叉会话会再次走到这里，那时它早已是成员
    const store = storeWith({ 'ws-1': [group('group-a', ['source'])] })

    const placement = await placeForkedSession(
      Promise.resolve(store),
      registryWith('source', 'child'),
      created('child', { parentSession: 'source' }),
    )

    expect(placement).toBeUndefined()
    expect(store.moves).toEqual([])
  })

  it('decides membership before it waits on the store', async () => {
    // 判据读的是「会话创建那一刻」的成员表：分叉流程建好会话之后才把它挂进工作区
    // 那一格若挪到等存储之后，读到的就是挂载之后的值，新分叉会被判成「不是新分叉」而落不了位
    // 用一份永不就绪的存储把这个次序钉死：会话已是成员时它根本不该被 await 到
    const pending = new Promise<ForkPlacementStore>(() => {})

    const settled = await Promise.race([
      placeForkedSession(pending, registryWith('source', 'child'), created('child', {
        parentSession: 'source',
      })),
      Promise.resolve('still-waiting' as const),
    ])

    expect(settled).toBeUndefined()
  })

  it('writes nothing when the workspace registry is absent', async () => {
    // 注册表缺席时无从判断「是不是新分叉」，宁可不动也不猜
    const store = storeWith({ 'ws-1': [group('group-a', ['source'])] })

    const placement = await placeForkedSession(
      Promise.resolve(store),
      undefined,
      created('child', { parentSession: 'source' }),
    )

    expect(placement).toBeUndefined()
    expect(store.moves).toEqual([])
  })
})
