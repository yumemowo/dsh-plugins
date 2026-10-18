import { describe, expect, it } from 'vitest'
import { planWorkspaceMove } from '../src/client/data/move.ts'
import type { MoveBinding } from '../src/client/data/move.ts'

/**
 * 一次移动要写哪几笔
 *
 * 只回答「按来源与目的地的差该发哪几笔」，不碰盘也不碰渲染。
 * 三份名单就是三次写入的实参，用例因此断言名单本身，不必看快照。
 */

/** 用两份表搭出一组现状读数 */
function state(scopes: Record<string, string>, bindings: Record<string, MoveBinding> = {}) {
  return {
    scopeOf: (id: string) => scopes[id] ?? '',
    bindingOf: (id: string) => bindings[id],
  }
}

describe('planWorkspaceMove', () => {
  it('moves the workspace into a virtual group it is not in', () => {
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: 'wg-2' },
      followers: [],
      ...state({ 'ws-1': 'wg-1' }),
    })

    expect(plan.reslotted).toEqual([{ workspaceId: 'ws-1', scope: 'wg-2' }])
    expect(plan.nested).toEqual([])
    expect(plan.unnested).toEqual([])
  })

  it('writes nothing for a workspace that already sits there', () => {
    // 已在目的地那一片：再写一次是多余的落盘
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: 'wg-2' },
      followers: [],
      ...state({ 'ws-1': 'wg-2' }),
    })

    expect(plan.reslotted).toEqual([])
  })

  it('moves the workspace out to the root when the target scope is empty', () => {
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: '' },
      followers: [],
      ...state({ 'ws-1': 'wg-1' }),
    })

    expect(plan.reslotted).toEqual([{ workspaceId: 'ws-1', scope: '' }])
  })

  it('carries the followers that sit in another scope', () => {
    // 已放进别处分组的后代跟着走，留在原地会让层级在分组边界上断开；
    // 已在目的地那一片的不必写
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: 'wg-2' },
      followers: ['ws-2', 'ws-3'],
      ...state({ 'ws-1': 'wg-1', 'ws-2': 'wg-1', 'ws-3': 'wg-2' }),
    })

    expect(plan.reslotted).toEqual([
      { workspaceId: 'ws-1', scope: 'wg-2' },
      { workspaceId: 'ws-2', scope: 'wg-2' },
    ])
  })

  it('nests the whole moving set when the target names a session group', () => {
    // 进某个会话分组：所有跟着走的都要写归属，原来那一份被覆盖，不必先解除
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: 'wg-2', nest: { workspaceId: 'ws-9', groupId: 'group-a' } },
      followers: ['ws-2'],
      ...state({ 'ws-1': 'wg-1' }),
    })

    expect(plan.nested).toEqual(['ws-1', 'ws-2'])
    expect(plan.unnested).toEqual([])
  })

  it('drops a binding whose parent workspace stays behind', () => {
    // 只换虚拟分组、没有指名新分组：原来那份归属的父工作区不在新那一片，
    // 这条归属已经不可能生效，留着只会在挪回去时毫无征兆地复活
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: 'wg-2' },
      followers: [],
      ...state(
        { 'ws-1': 'wg-1', 'ws-9': 'wg-1' },
        { 'ws-1': { workspaceId: 'ws-9', groupId: 'group-a' } },
      ),
    })

    expect(plan.unnested).toEqual(['ws-1'])
    expect(plan.nested).toEqual([])
  })

  it('keeps a binding whose parent workspace comes along', () => {
    // 父工作区也在目的地那一片：这条归属照样成立，不该被顺手清掉
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: 'wg-2' },
      followers: [],
      ...state(
        { 'ws-1': 'wg-1', 'ws-9': 'wg-2' },
        { 'ws-1': { workspaceId: 'ws-9', groupId: 'group-a' } },
      ),
    })

    expect(plan.unnested).toEqual([])
  })

  it('writes nothing for a workspace with no binding and no scope change', () => {
    const plan = planWorkspaceMove({
      workspaceId: 'ws-1',
      target: { scope: '' },
      followers: [],
      ...state({}),
    })

    expect(plan).toEqual({ reslotted: [], nested: [], unnested: [] })
  })
})
