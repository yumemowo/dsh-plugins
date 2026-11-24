import { describe, expect, it } from 'vitest'
import { forkPlacement } from '../src/client/data/forkPlacement.ts'
import type { Group } from '../src/client/remote.ts'

/**
 * 分叉落位的判据
 *
 * 只认「源会话此刻在哪个分组」这一格：子会话 id 由发起分叉的那一处给，判据不再需要看会话本身
 * 放宽任何一条都会让分叉出的会话落错地方，而那种错位不会报错——界面只是「这条会话出现在了别的地方」
 */

/** 造一个会话分组 */
function group(id: string, sessionIds: string[]): Group {
  return { id, name: id, sessionIds }
}

describe('forkPlacement', () => {
  it('places the child in the group that holds the source', () => {
    const placement = forkPlacement({
      sourceId: 's-source',
      byWorkspace: { 'ws-1': [group('group-a', ['s-source'])] },
    })

    expect(placement).toEqual({ workspaceId: 'ws-1', groupId: 'group-a' })
  })

  it('reports the workspace that holds the source group', () => {
    // 分组名与分组 id 在多个工作区里可能重名，落位只能按工作区给出
    const placement = forkPlacement({
      sourceId: 's-source',
      byWorkspace: { 'ws-1': [group('group-a', ['s-other'])], 'ws-2': [group('group-b', ['s-source'])] },
    })

    expect(placement).toEqual({ workspaceId: 'ws-2', groupId: 'group-b' })
  })

  it('reports nothing when the source sits in no group', () => {
    // 源会话自己就在未归组区里，子会话跟着它待在那儿，没有可写的归属
    const placement = forkPlacement({
      sourceId: 's-source',
      byWorkspace: { 'ws-1': [group('group-a', ['s-other'])] },
    })

    expect(placement).toBeUndefined()
  })

  it('reports nothing when no workspace has any group', () => {
    // 用户还没建过分组：整份元数据是空的，什么都没得落
    const placement = forkPlacement({ sourceId: 's-source', byWorkspace: {} })

    expect(placement).toBeUndefined()
  })
})
