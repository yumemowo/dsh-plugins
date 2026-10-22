import { describe, expect, it } from 'vitest'
import { deriveNesting } from '../src/client/data/nest.ts'
import type { NestingBinding } from '../src/client/data/nest.ts'
import {
  buildWorkspaceTree,
  dropRelationsOf,
  looseZoneKeyOf,
  zoneKeyOf,
} from '../src/client/data/tree.ts'
import type { TreeNodeRef, TreeInput } from '../src/client/data/tree.ts'

/**
 * 工作区列表的统一节点树
 *
 * 这一层把真实工作区与虚拟工作区分组收成一棵树，让拖拽层只认节点身份。两条关系分开取是它的要点：
 * 容器回答「放进哪一片」，兄弟回答「排在第几」，同一格不会既算排序又算放入
 */

/** 树上的一个工作区节点 */
function ws(id: string): TreeNodeRef {
  return { kind: 'workspace', id }
}

/** 树上的一个虚拟分组节点 */
function vg(id: string): TreeNodeRef {
  return { kind: 'virtual', id }
}

interface Fixture {
  workspaceIds: readonly string[]
  virtualGroups?: readonly { id: string; workspaceIds: readonly string[] }[]
  paths?: Record<string, string>
  bindings?: Record<string, NestingBinding>
  /** 某个工作区名下真实存在的会话分组 */
  groupIds?: Record<string, string[]>
}

/** 装配一棵树，路径、归属与虚拟分组按传入的几格给，其余按空 */
function fixture(input: Fixture): ReturnType<typeof buildWorkspaceTree> {
  const { workspaceIds, virtualGroups = [], paths = {}, bindings = {}, groupIds = {} } = input
  const virtualOf = (id: string): string =>
    virtualGroups.find((group) => group.workspaceIds.includes(id))?.id ?? ''
  const treeInput: TreeInput = {
    workspaceIds,
    virtualGroups,
    nesting: deriveNesting({
      enabled: true,
      workspaceIds,
      pathOf: (id) => paths[id],
      virtualOf,
      bindingOf: (id) => bindings[id],
      groupIdsOf: (id) => new Set(groupIds[id] ?? []),
    }),
    sessionGroupsOf: (id) => groupIds[id] ?? [],
    // 拖拽认祖先与同层都按 cwd 看，与渲染那一层的同组要求不是同一个问题
    pathOf: (id) => paths[id],
  }
  return buildWorkspaceTree(treeInput)
}

describe('buildWorkspaceTree', () => {
  const base = {
    workspaceIds: ['ws-1', 'ws-c1', 'ws-2', 'ws-3'],
    virtualGroups: [
      { id: 'vg-1', workspaceIds: ['ws-1', 'ws-c1', 'ws-2'] },
      { id: 'vg-2', workspaceIds: [] },
    ],
    paths: {
      'ws-1': '/repo',
      'ws-c1': '/repo/pkg',
      'ws-2': '/other',
      'ws-3': '/other/sub',
    },
  }

  it('lists every virtual group before the loose workspaces at the root', () => {
    const tree = fixture(base)

    // 根节点那一层的顶层成员与根节点布局的单一有序名单同序：分组在前、平铺在后
    // 两个分组都在名单里——空分组同样是一个条目，不因为它没有成员就消失
    expect(tree.rootsOf(tree.containers.root)).toEqual([vg('vg-1'), vg('vg-2'), ws('ws-3')])
  })

  it('leaves a nested loose workspace out of the root entries', () => {
    // 根节点那一层的条目是「渲染层要列出来的那些」：被嵌套的工作区在父工作区体内渲染，不在这一层
    const tree = fixture({
      workspaceIds: ['ws-1', 'ws-c1'],
      paths: { 'ws-1': '/repo', 'ws-c1': '/repo/pkg' },
    })

    expect(tree.rootsOf(tree.containers.root)).toEqual([ws('ws-1')])
    expect(tree.membersOf(tree.containers.root)).toEqual([ws('ws-1'), ws('ws-c1')])
  })

  it('hands back one instance per node and per container', () => {
    // 同一份推导里同一个容器恒交回同一实例，节点同理
    // 因此容器可以直接当 Map 的键、可以用引用比较，不必序列化成字符串
    const tree = fixture(base)

    expect(tree.containerOf(ws('ws-1'))).toBe(tree.containerOf(ws('ws-2')))
    expect(tree.containerOf(ws('ws-1'))).toBe(tree.containers.virtualOf('vg-1'))
    expect(tree.containerOf(vg('vg-1'))).toBe(tree.containers.root)
    // 两次取同一段兄弟交回同一批节点实例
    expect(tree.siblingsOf(ws('ws-2'))[0]).toBe(tree.siblingsOf(ws('ws-1'))[0])
    expect(tree.siblingsOf(ws('ws-2'))[0]).toBe(tree.parentOf(ws('ws-c1')))
  })

  it('reports the container each node belongs to', () => {
    const tree = fixture(base)

    expect(tree.containerOf(ws('ws-1'))).toEqual({ kind: 'virtual', id: 'vg-1' })
    expect(tree.containerOf(ws('ws-2'))).toEqual({ kind: 'virtual', id: 'vg-1' })
    expect(tree.containerOf(ws('ws-3'))).toEqual({ kind: 'root' })
    // 分组节点落在根节点那一层，它自己不是一个容器
    expect(tree.containerOf(vg('vg-1'))).toEqual({ kind: 'root' })
  })

  it('returns no container for a node outside the tree', () => {
    const tree = fixture(base)

    // 元数据里可能记着一个已经删掉的工作区或分组，查不到时返回 undefined 而不是抛错
    expect(tree.containerOf(ws('gone'))).toBeUndefined()
    expect(tree.containerOf(vg('gone'))).toBeUndefined()
  })

  it('lists only the top level of a container in its roots', () => {
    const tree = fixture(base)

    // ws-c1 的父工作区落在同一个容器里，因此它渲染在父工作区体内，不是这一层的顶层
    expect(tree.membersOf(tree.containers.virtualOf('vg-1'))).toEqual([
      ws('ws-1'),
      ws('ws-c1'),
      ws('ws-2'),
    ])
    expect(tree.rootsOf(tree.containers.virtualOf('vg-1'))).toEqual([ws('ws-1'), ws('ws-2')])
    // 根节点那一层的顶层既有分组也有平铺工作区：两者在界面上是同一条列表上的条目
    expect(tree.rootsOf(tree.containers.root)).toEqual([vg('vg-1'), vg('vg-2'), ws('ws-3')])
  })

  it('keeps the registry segment as the sibling list after a workspace moves into a session group', () => {
    const tree = fixture({
      ...base,
      bindings: { 'ws-c1': { workspaceId: 'ws-1', groupId: 'group-a' } },
      groupIds: { 'ws-1': ['group-a'] },
    })

    // 放进会话分组改变渲染位置，不改变注册表上的先后：容器变成分组体，兄弟仍是父工作区名下那一列
    expect(tree.containerOf(ws('ws-c1'))).toEqual({
      kind: 'group',
      workspaceId: 'ws-1',
      groupId: 'group-a',
    })
    expect(tree.siblingsOf(ws('ws-c1'))).toEqual([ws('ws-c1')])
  })

  it('reads the sibling segment of a top level member from its container', () => {
    const tree = fixture(base)

    // 没有父工作区时同层名单取所在容器的顶层，与渲染出来的那一排同源
    expect(tree.siblingsOf(ws('ws-2'))).toEqual([ws('ws-1'), ws('ws-2')])
    expect(tree.siblingsOf(ws('ws-c1'))).toEqual([ws('ws-c1')])
    // 虚拟分组的兄弟就是整份分组名单，数组序即界面序
    expect(tree.siblingsOf(vg('vg-2'))).toEqual([vg('vg-1'), vg('vg-2')])
  })

  it('reports the parent and the ancestor chain of a workspace', () => {
    const tree = fixture(base)

    expect(tree.parentOf(ws('ws-1'))).toBeUndefined()
    expect(tree.parentOf(ws('ws-c1'))).toEqual(ws('ws-1'))
    // 虚拟分组不参与工作区的父子链
    expect(tree.parentOf(vg('vg-1'))).toBeUndefined()
    expect(tree.ancestorsOf(ws('ws-c1'))).toEqual([ws('ws-1')])
    expect(tree.ancestorsOf(ws('ws-1'))).toEqual([])
    expect(tree.ancestorsOf(vg('vg-1'))).toEqual([])
  })

  it('ignores a workspace recorded by two virtual groups after the first', () => {
    const tree = fixture({
      ...base,
      virtualGroups: [
        { id: 'vg-1', workspaceIds: [] },
        { id: 'vg-2', workspaceIds: ['ws-3'] },
      ],
    })

    // 一个工作区被两个分组同时记录时以先出现的为准，渲染出的每个工作区因此只有一个位置
    expect(tree.containerOf(ws('ws-3'))).toEqual({ kind: 'virtual', id: 'vg-2' })
    // ws-1 与 ws-2 不再被任何分组记录，因此退回平铺在根节点上
    expect(tree.rootsOf(tree.containers.root)).toEqual([
      vg('vg-1'),
      vg('vg-2'),
      ws('ws-1'),
      ws('ws-2'),
    ])
  })
})

describe('zone keys', () => {
  it('names a head zone and a body zone for the node kinds that have both', () => {
    // 六族键构造器收在一处之后，形状由这一条钉住：键就是 DOM 标记上的字符串
    expect(zoneKeyOf(ws('ws-1'), 'head')).toBe('workspaceHead/ws-1')
    // 整块那一格是它体内那一片：指针停在体内的子工作区或会话上时，仍算落在这一个工作区上
    expect(zoneKeyOf(ws('ws-1'), 'body')).toBe('workspaceBody/ws-1')
    expect(zoneKeyOf(vg('vg-1'), 'head')).toBe('virtualWorkspaceHead/vg-1')
    expect(zoneKeyOf(vg('vg-1'), 'body')).toBe('virtualWorkspaceBody/vg-1')
    expect(zoneKeyOf({ kind: 'group', workspaceId: 'ws-1', groupId: 'g1' }, 'head')).toBe(
      'groupHead/ws-1/g1',
    )
    expect(zoneKeyOf({ kind: 'group', workspaceId: 'ws-1', groupId: 'g1' }, 'body')).toBe(
      'sessionGroup/ws-1/g1',
    )
    // 根节点那一片只有整块那一格，它是全部「移出虚拟工作区分组」的兜底
    expect(zoneKeyOf({ kind: 'root' }, 'body')).toBe('root')
    expect(zoneKeyOf({ kind: 'root' }, 'head')).toBeUndefined()
    expect(looseZoneKeyOf('ws-1')).toBe('loose/ws-1')
  })
})
describe('drop relations', () => {
  const base = {
    workspaceIds: ['ws-1', 'ws-c1', 'ws-2', 'ws-3'],
    virtualGroups: [
      { id: 'vg-1', workspaceIds: ['ws-1', 'ws-c1', 'ws-2'] },
      { id: 'vg-2', workspaceIds: [] },
    ],
    paths: {
      'ws-1': '/repo',
      'ws-c1': '/repo/pkg',
      'ws-2': '/other',
      'ws-3': '/other/sub',
    },
  }

  /** 一套什么都不做的写入，只记下各自被调了几次 */
  function writes() {
    const calls: string[] = []
    return {
      calls,
      moveToGroup: (groupId: string) => calls.push('move:' + groupId),
      reorder: (before: string | undefined) => calls.push('reorder:' + String(before)),
      nestInto: (parentId: string, groupId: string) => calls.push('nest:' + parentId + '/' + groupId),
      unnest: () => calls.push('unnest'),
    }
  }

  it('offers a reorder for every same layer sibling and every root level row', () => {
    // 同层按 cwd 父工作区认：ws-1 名下有 ws-c1（路径上挂在它里面），因此 ws-c1 是它的子工作区而非兄弟
    // 真正的同层兄弟是 ws-2，另有根节点那层的平铺行 ws-3
    const tree = fixture(base)
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())
    const order = relations.filter((entry) => entry.kind === 'order').map((entry) => entry.zones[0])

    expect(order).toContain('workspaceHead/ws-2')
    // ws-3 平铺在根节点那一层。来源在虚拟分组里，两者既不并排也不同父，
    // 但「移到 root 层这一行的前后」仍是一个合法落点：落上去先回 root 层，再排队
    expect(order).toContain('workspaceHead/ws-3')
    // 自己的子工作区不是同层兄弟，不给位次
    expect(order).not.toContain('workspaceHead/ws-c1')
  })

  it('pairs the root level row with leaving the group it currently sits in', () => {
    // 落到 root 层那一行前后，位置要真的变：位次只是一半，另一半是「退出此刻所在的分组」。
    // 后者由根节点那一片自己的 inside 关系给出——它罩着整片列表，落到任何一行上都成立
    const tree = fixture(base)
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())

    const rootInside = relations.find(
      (entry) => entry.kind === 'inside' && entry.zones.includes('root'),
    )
    const rootOrder = relations.find(
      (entry) => entry.kind === 'order' && entry.zones[0] === 'workspaceHead/ws-3',
    )

    expect(rootInside).toBeDefined()
    expect(rootOrder).toBeDefined()
  })

  it('reads manual nesting and cwd nesting through the same parent edge', () => {
    // 对拖拽来说两种嵌套没有区别：都是「这个工作区在谁里面」
    // ws-c1 按 cwd 挂在 ws-1 下；ws-c2 与它的路径无关，但落盘把它放进了 ws-1 的分组
    const tree = fixture({
      workspaceIds: ['ws-1', 'ws-c1', 'ws-c2'],
      paths: { 'ws-1': '/repo', 'ws-c1': '/repo/pkg', 'ws-c2': '/repo/other' },
      bindings: { 'ws-c2': { workspaceId: 'ws-1', groupId: 'group-x' } },
      groupIds: { 'ws-1': ['group-x'] },
    })

    expect(tree.dropParentOf(ws('ws-c1'))).toEqual({ kind: 'workspace', id: 'ws-1' })
    expect(tree.dropParentOf(ws('ws-c2'))).toEqual({ kind: 'workspace', id: 'ws-1' })
    // 两者的父节点相同，因此互为同层兄弟：一条来自路径、一条来自落盘归属
    expect(tree.dropSiblingsOf(ws('ws-c1')).map((entry) => entry.id)).toEqual(['ws-c1', 'ws-c2'])
  })

  it('never puts one row in both the order and the inside table', () => {
    // 一行不能同时承接两种关系：能谈先后就不再承接放入，
    // 那时它的直接父工作区承接 inside
    const tree = fixture(base)
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())
    const orderZones = new Set(
      relations.filter((entry) => entry.kind === 'order').flatMap((entry) => entry.zones),
    )
    const clashing = relations
      .filter((entry) => entry.kind === 'inside')
      .filter((entry) => entry.zones.some((key) => orderZones.has(key)))

    expect(clashing).toEqual([])
  })

  it('never turns a root level row into an inside place', () => {
    // 用户拖一个在分组里的工作区到根节点那层的平铺行上时，那是 order 关系
    // 两者的 cwd 没有祖先关系，来源进不了那一行体内，因此不该画框
    const tree = fixture(base)
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())

    expect(relations.some((entry) => entry.kind === 'inside' && entry.zones.includes('workspaceHead/ws-3'))).toBe(false)
  })

  it('offers an inside place for every other virtual group', () => {
    const tree = fixture(base)
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())
    const inside = relations.filter((entry) => entry.kind === 'inside')

    // 别的分组两格（组头 + 组体）；自己所在的那个分组不在其中
    expect(inside.some((entry) => entry.zones.includes('virtualWorkspaceHead/vg-2'))).toBe(true)
    expect(inside.some((entry) => entry.zones.includes('virtualWorkspaceHead/vg-1'))).toBe(false)
  })

  it('offers the root list once when the source sits in a group', () => {
    const tree = fixture(base)
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())

    expect(relations.some((entry) => entry.kind === 'inside' && entry.zones.includes('root'))).toBe(true)
  })

  it('offers no root place while the source already sits at the root', () => {
    const tree = fixture({ workspaceIds: ['ws-1', 'ws-2'], paths: { 'ws-1': '/a', 'ws-2': '/b' } })
    const relations = dropRelationsOf(tree, ws('ws-1'), writes())

    expect(relations.some((entry) => entry.zones.includes('root'))).toBe(false)
  })

  it('commits the write each relation was built for', () => {
    const tree = fixture(base)
    const io = writes()
    const relations = dropRelationsOf(tree, ws('ws-1'), io)
    const toGroup = relations.find(
      (entry) => entry.kind === 'inside' && entry.zones.includes('virtualWorkspaceHead/vg-2'),
    )
    toGroup?.kind === 'inside' && toGroup.commit()

    expect(io.calls).toEqual(['move:vg-2'])
  })

  it('never turns an unrelated row into an inside place', () => {
    // 三个互不相干的工作区各在自己的位置：ws-b 与 ws-a 既无 cwd 关系也不是同层
    const tree = fixture({
      workspaceIds: ['ws-a', 'ws-b', 'ws-c'],
      virtualGroups: [
        { id: 'vg-a', workspaceIds: ['ws-a'] },
        { id: 'vg-b', workspaceIds: ['ws-b'] },
      ],
      paths: { 'ws-a': '/a', 'ws-b': '/b', 'ws-c': '/c' },
    })
    const relations = dropRelationsOf(tree, ws('ws-a'), writes())

    // 那一行最多作为位次参照，绝不能变成「放进它体内」
    expect(relations.some((entry) => entry.kind === 'inside' && entry.zones.includes('workspaceHead/ws-b'))).toBe(false)
  })
})