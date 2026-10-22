import { describe, expect, it } from 'vitest'
import { maybeDropSearcher } from '../src/client/data/dropSearcher.ts'
import type { DropNode, DropTarget } from '../src/client/data/dropSearcher.ts'
import { buildWorkspaceTree, dropRelationsOf } from '../src/client/data/tree.ts'
import type { WorkspaceTree } from '../src/client/data/tree.ts'
import { deriveNesting } from '../src/client/data/nest.ts'

/**
 * 检测器的行为
 *
 * 一次检测最多交回两个节点：一个画框、一个画线。落在哪个节点上由检测结果直接给出，
 * 调用方不再自己沿祖先链找区域，也不再把几格合并成一圈。
 *
 * 判定全在节点上做：指针落在哪个节点由适配层读出，此后沿树往上走，不碰 DOM。
 */

/**
 * 一份最小的树
 *
 * 注册表序 ws-1 ws-2 ws-3，ws-1 与 ws-2 在 vg-1 组内，ws-3 平铺在根节点；
 * ws-c1 按 cwd 挂在 ws-1 之下
 */
function fixture(): WorkspaceTree {
  const workspaceIds = ['ws-1', 'ws-2', 'ws-3', 'ws-c1']
  const paths: Record<string, string> = {
    'ws-1': '/repo',
    'ws-2': '/other',
    'ws-3': '/third',
    'ws-c1': '/repo/pkg',
  }
  const virtualOf = (id: string): string => (id === 'ws-1' || id === 'ws-2' ? 'vg-1' : '')
  const nesting = deriveNesting({
    enabled: true,
    workspaceIds,
    pathOf: (id) => paths[id],
    virtualOf,
    bindingOf: () => undefined,
    groupIdsOf: () => new Set<string>(),
  })
  return buildWorkspaceTree({
    workspaceIds,
    virtualGroups: [{ id: 'vg-1', workspaceIds: ['ws-1', 'ws-2'] }],
    nesting,
    pathOf: (id) => paths[id],
  })
}

const ws = (id: string) => ({ kind: 'workspace', id }) as const

/** 量一条带的读数：检测器只拿它分线的上下半 */
function band(rect: { top: number; height: number }): () => { top: number; height: number } {
  return () => rect
}

const at = (y: number) => ({ x: 0, y })

function targetOf(
  kind: 'inside' | 'order',
  node: DropNode,
  commit: (side?: 'before' | 'after') => void = () => {},
): DropTarget {
  return { kind, node, commit }
}

describe('maybeDropSearcher', () => {
  it('returns nothing when the pointer node is on no target', () => {
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('order', ws('ws-2'))])

    expect(searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-3'))).toBeNull()
  })

  it('returns one node for an inside target', () => {
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('inside', tree.containers.virtualOf('vg-1'))])

    // 指针落在组内一条成员行上：它自己不是落点，但它所在的那一片是
    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-1'))

    expect(check?.inside).toEqual({ kind: 'virtual', id: 'vg-1' })
    expect(check?.order).toBeUndefined()
  })

  it('lets a member row answer for the container that encloses it', () => {
    // 组内任何一条成员行都能让罩着它的那一片响应：链是树算的，不必把成员逐一列进名单
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('inside', tree.containers.virtualOf('vg-1'))])

    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-1'))

    expect(check?.inside).toEqual({ kind: 'virtual', id: 'vg-1' })
  })

  it('returns a box and a line at the same time from two different nodes', () => {
    // 框说「放进这一片」，线说「排在这一条之前 / 之后」，两件事可以同时成立
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [
      targetOf('order', ws('ws-2')),
      targetOf('inside', tree.containers.virtualOf('vg-1')),
    ])

    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-2'))

    expect(check?.order).toEqual({ kind: 'workspace', id: 'ws-2' })
    expect(check?.inside).toEqual({ kind: 'virtual', id: 'vg-1' })
  })

  it('refuses a drop that lands both readings on one node', () => {
    // 同一格两种读法都成立是分组嵌套的性质，那件事尚未实现。
    // 判定点守在检测层：框与线各自沿链找、互不知道对方在哪一层，
    // 只有在这里才看得出它们是不是指着同一格
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [
      targetOf('order', ws('ws-2')),
      targetOf('inside', ws('ws-2')),
    ])

    expect(() => searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-2'))).toThrow(
      /banded/,
    )
  })

  it('draws no box for a line that names none', () => {
    // 线只回答「排到这一行前后」，框问的是「指针这一点归哪一片」——
    // 那条链上没有能放进去的东西时，就只剩一条线
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('order', ws('ws-3'))])

    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-3'))

    expect(check?.order).toEqual({ kind: 'workspace', id: 'ws-3' })
    expect(check?.inside).toBeUndefined()
  })

  it('takes the box from the chain rather than from the line', () => {
    // 指针落在根节点那一层的行上：框归根节点那一片，线归这一行，两条同源而不相干
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [
      targetOf('order', ws('ws-3')),
      targetOf('inside', tree.containers.root),
    ])

    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-3'))

    expect(check?.inside).toEqual({ kind: 'root' })
    expect(check?.order).toEqual({ kind: 'workspace', id: 'ws-3' })
  })

  it('reads the upper half of a row as before and the lower half as after', () => {
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('order', ws('ws-2'))])
    const row = band({ top: 100, height: 20 })

    expect(searcher.checkDrop(row, at(105), ws('ws-2'))?.side).toBe('before')
    expect(searcher.checkDrop(row, at(115), ws('ws-2'))?.side).toBe('after')
  })

  it('reads a zero-height row as before', () => {
    // jsdom 恒零矩形，尚未布局的节点也如此：那时分不出上下，
    // 读作「之前」让线落在这条行自己身上，与指针到底指着哪一条无关
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('order', ws('ws-2'))])

    expect(searcher.checkDrop(band({ top: 100, height: 0 }), at(100), ws('ws-2'))?.side).toBe('before')
  })

  it('walks the node chain rather than the document', () => {
    // 跨虚拟分组的两个工作区在 DOM 上互为祖先，在树上却不是父子：
    // ws-3 平铺在根节点，链上不到 ws-1 所在的那一片
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('inside', ws('ws-1'))])

    expect(searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-3'))).toBeNull()
  })

  it('commits the box and the line as two separate writes', () => {
    const tree = fixture()
    const calls: string[] = []
    const searcher = maybeDropSearcher(tree, [
      targetOf('order', ws('ws-2'), (side) => calls.push('order:' + side)),
      targetOf('inside', tree.containers.virtualOf('vg-1'), () => calls.push('inside')),
    ])

    // 指针在参照行的上缘，因此是「插到它之前」；框与线是两次独立的写入
    searcher.commit(searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-2'))!)

    expect(calls).toEqual(['inside', 'order:before'])
  })

  it('commits nothing for an empty result', () => {
    const tree = fixture()
    const calls: string[] = []
    const searcher = maybeDropSearcher(tree, [targetOf('inside', ws('ws-1'), () => calls.push('a'))])

    searcher.commit({})

    expect(calls).toEqual([])
  })

  it('reads a row that is not on the tree by its own identity', () => {
    // 会话行与置顶行不在树上：它们以行身份直接当节点，链上只有它自己
    const tree = fixture()
    const searcher = maybeDropSearcher(tree, [targetOf('order', { kind: 'row', id: 'session-1' })])

    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), { kind: 'row', id: 'session-1' })

    expect(check?.order).toEqual({ kind: 'row', id: 'session-1' })
  })

  it('reads the session group a child sits in as nearer than its parent workspace', () => {
    // 一个按 cwd 挂在父工作区之下的子工作区，被放进了父工作区的会话分组：
    // 它渲染在组体里，因此「它所在的那一片」是那个会话分组，而不是父工作区。
    //
    // 链上若把祖先排在容器之前，框会套到父工作区上，而线仍画在这一行上——
    // 用户读到的是一条线在组里、框在组外，两个落点互相矛盾
    const workspaceIds = ['ws-1', 'ws-c1', 'ws-4']
    const paths: Record<string, string> = {
      'ws-1': '/repo',
      'ws-c1': '/repo/pkg',
      'ws-4': '/elsewhere',
    }
    const nesting = deriveNesting({
      enabled: true,
      workspaceIds,
      pathOf: (id) => paths[id],
      virtualOf: () => '',
      bindingOf: (id) => (id === 'ws-c1' ? { workspaceId: 'ws-1', groupId: 'group-a' } : undefined),
      groupIdsOf: (id) => (id === 'ws-1' ? new Set(['group-a']) : new Set<string>()),
    })
    const tree = buildWorkspaceTree({
      workspaceIds,
      virtualGroups: [],
      nesting,
      sessionGroupsOf: (id) => (id === 'ws-1' ? ['group-a'] : []),
      pathOf: (id) => paths[id],
    })
    const group = tree.containers.groupOf('ws-1', 'group-a')
    const searcher = maybeDropSearcher(tree, [
      targetOf('order', ws('ws-c1')),
      targetOf('inside', group),
      targetOf('inside', ws('ws-1')),
    ])

    // 指针落在 ws-c1 那一行上
    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), ws('ws-c1'))

    // 框与线必须说同一层：框落在那个会话分组上，而不是父工作区
    expect(check?.inside).toEqual(group)
    expect(check?.order).toEqual({ kind: 'workspace', id: 'ws-c1' })
  })

  it('keeps the pointer in the group a child already sits in', () => {
    // 子工作区已经住进父工作区的会话分组：拖到那个分组的组头上读作原地投放。
    //
    // 这一片必须留在名单里。整条跳过它时指针一落到组头就没人接，链继续往上走到外层的
    // 虚拟分组——框因此套在整个虚拟分组上，而这一行明明就在这个分组体内
    const workspaceIds = ['ws-p', 'ws-c', 'ws-x']
    const paths: Record<string, string> = {
      'ws-p': '/repo',
      'ws-c': '/repo/pkg',
      'ws-x': '/repo/other',
    }
    const bindingOf = (id: string): { workspaceId: string; groupId: string } | undefined =>
      id === 'ws-c' ? { workspaceId: 'ws-p', groupId: 'g-111' } : undefined
    const nesting = deriveNesting({
      enabled: true,
      workspaceIds,
      pathOf: (id) => paths[id],
      virtualOf: () => 'vg-1',
      bindingOf,
      groupIdsOf: (id) => (id === 'ws-p' ? new Set(['g-111']) : new Set<string>()),
    })
    const tree = buildWorkspaceTree({
      workspaceIds,
      virtualGroups: [{ id: 'vg-1', workspaceIds }],
      nesting,
      sessionGroupsOf: (id) => (id === 'ws-p' ? ['g-111'] : []),
      pathOf: (id) => paths[id],
    })
    const node = tree.workspaceNodes.find((entry) => entry.id === 'ws-c')
    if (node === undefined) throw new Error('fixture 少了 ws-c')
    const writes: string[] = []
    const relations = dropRelationsOf(tree, node, {
      moveToGroup: (groupId) => writes.push('moveToGroup:' + groupId),
      reorder: () => writes.push('reorder'),
      nestInto: () => writes.push('nestInto'),
      unnest: () => writes.push('unnest'),
    })
    const searcher = maybeDropSearcher(
      tree,
      relations.map((relation) => ({
        kind: relation.kind,
        node: tree.nodesByZone().get(relation.zones[0] ?? '') ?? tree.containers.root,
        commit: () => (relation.kind === 'inside' ? relation.commit() : relation.place('before')),
      })),
    )
    const group = tree.containers.groupOf('ws-p', 'g-111')

    const check = searcher.checkDrop(band({ top: 0, height: 10 }), at(0), group)

    expect(check?.inside).toEqual(group)
    if (check !== null) searcher.commit(check)
    expect(writes).toEqual([])
  })
})
