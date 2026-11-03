import { describe, expect, it } from 'vitest'
import type { NestingBinding } from '../src/client/data/nest.ts'
import type { OutlineRow } from '../src/client/data/outline.ts'
import type { ContainerNode } from '../src/client/data/nest.ts'
import { dropAreasOf } from '../src/client/data/dnd/relations.ts'
import type { OutlineIndex } from '../src/client/data/dnd/outlineIndex.ts'
import type { NodeRef } from '../src/client/data/dnd/zones.ts'
import { indexFrom, outlineRowsFrom } from './support/outlineFixture.ts'
import { virtualAddress, workspaceAddress } from '../src/rootEntry.ts'
import type { RootEntryAddress } from '../src/rootEntry.ts'

/**
 * 行序列上的查询索引
 *
 * 这一层把行序列扫成一张表，让拖拽层只认节点身份。两条关系分开取是它的要点
 * 容器回答「放进哪一片」，兄弟回答「排在第几」，同一格不会既算排序又算放入
 *
 * 另有几条守的是「索引与序列不许分叉」：表里的位置必须能在那条序列里找到对应行
 */

/** 序列里的一个工作区节点 */
function ws(id: string): NodeRef {
  return { kind: 'workspace', id }
}

/** 序列里的一个虚拟分组节点 */
function vg(id: string): NodeRef {
  return { kind: 'virtual', id }
}

interface Fixture {
  workspaceIds: readonly string[]
  virtualGroups?: readonly { id: string; workspaceIds: readonly string[] }[]
  paths?: Record<string, string>
  bindings?: Record<string, NestingBinding>
  /** 某个工作区名下真实存在的会话分组 */
  groupIds?: Record<string, string[]>
  /** 当前聚焦的条目地址，缺省是「全部工作区」 */
  focused?: RootEntryAddress
}

/** 装配一份索引，路径、归属与虚拟分组按传入的几格给，其余按空 */
function fixture(input: Fixture): OutlineIndex {
  return indexFrom(input)
}

/**
 * 某个容器里的全部成员，直接从行序列读
 *
 * 索引不再交出这份名单：它的调用方要的是「这一层列几条」（`rootsOf`）
 * 而「这个容器里有几个成员」只有用例需要拿来当对照基线
 * 容器按形状比：行序列与索引各自持有一批发牌，引用不可跨过去比
 * @param rows - 行序列
 * @param container - 那一个容器
 */
function membersIn(rows: readonly OutlineRow[], container: ContainerNode): NodeRef[] {
  const same = (each: ContainerNode): boolean => {
    if (each.kind !== container.kind) return false
    if (each.kind === 'root' || container.kind === 'root') return true
    if (each.kind === 'virtual' && container.kind === 'virtual') return each.id === container.id
    if (each.kind === 'group' && container.kind === 'group') {
      return each.workspaceId === container.workspaceId && each.groupId === container.groupId
    }
    return false
  }
  const seen = new Set<string>()
  const out: NodeRef[] = []
  for (const row of rows) {
    if (!same(row.container)) continue
    if (row.kind === 'workspaceHead') {
      if (seen.has('w/' + row.workspaceId)) continue
      seen.add('w/' + row.workspaceId)
      out.push(ws(row.workspaceId))
    }
    if (row.kind === 'virtualHead') {
      const id = row.groupId ?? ''
      if (seen.has('v/' + id)) continue
      seen.add('v/' + id)
      out.push(vg(id))
    }
  }
  return out
}

describe('indexOutline', () => {
  it('holds only the nodes the focused list draws', () => {
    // 聚焦一片内容之后界面上只剩那一片：索引里的节点因此也只该是那几行
    // 目标范围大于渲染范围时，计划里会出现界面上根本不存在的落点
    const index = fixture({
      workspaceIds: ['ws-1', 'ws-c1', 'ws-2', 'ws-3'],
      virtualGroups: [
        { id: 'vg-1', workspaceIds: ['ws-1', 'ws-c1'] },
        { id: 'vg-2', workspaceIds: ['ws-2'] },
      ],
      paths: { 'ws-1': '/repo', 'ws-c1': '/repo/pkg', 'ws-2': '/other', 'ws-3': '/third' },
      focused: virtualAddress('vg-2'),
    })

    expect(index.allNodes().map((node) => node.kind + '/' + node.id)).toEqual(['workspace/ws-2'])
    expect(index.virtualGroups).toEqual([])
    expect(index.containerOf(ws('ws-2'))).toEqual({ kind: 'root' })
  })

  it('turns the focused workspace into the root place', () => {
    // 全部视图里「根节点那一片空白」在聚焦之后变成了被聚焦的工作区自己
    // 索引因此把它当成根节点的顶层，而不是它原来所在的那一片
    //
    // 聚焦只对菜单里出现的条目成立，而工作区分组名下的成员不在菜单里（那里只有分组一项）
    // 因此这一条聚焦的是一个平铺在根节点上的工作区
    const index = fixture({
      workspaceIds: ['ws-1', 'ws-2', 'ws-3'],
      paths: { 'ws-1': '/repo', 'ws-2': '/other', 'ws-3': '/third' },
      focused: workspaceAddress('ws-2'),
    })

    expect(index.allNodes().map((node) => node.kind + '/' + node.id)).toEqual(['workspace/ws-2'])
    expect(index.containerOf(ws('ws-2'))).toEqual({ kind: 'root' })
    expect(index.rootsOf(index.containers.root)).toEqual([ws('ws-2')])
  })

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
    const index = fixture(base)

    // 根节点那一层的顶层成员与根节点布局的单一有序名单同序：分组在前、平铺在后
    // 两个分组都在名单里——空分组同样是一个条目，不因为它没有成员就消失
    expect(index.rootsOf(index.containers.root)).toEqual([vg('vg-1'), vg('vg-2'), ws('ws-3')])
  })

  it('leaves a nested loose workspace out of the root entries', () => {
    // 根节点那一层的条目是「渲染层要列出来的那些」：被嵌套的工作区在父工作区体内渲染，不在这一层
    // 两者同属根节点那一个容器，因此「容器里有几个成员」与「这一层列几条」是两件事
    const input = {
      workspaceIds: ['ws-1', 'ws-c1'],
      paths: { 'ws-1': '/repo', 'ws-c1': '/repo/pkg' },
    }
    const index = fixture(input)

    expect(index.rootsOf(index.containers.root)).toEqual([ws('ws-1')])
    expect(membersIn(outlineRowsFrom(input), index.containers.root)).toEqual([ws('ws-1'), ws('ws-c1')])
  })

  it('hands back one instance per node and per container', () => {
    // 同一份推导里同一个容器恒交回同一实例，节点同理
    // 因此容器可以直接当 Map 的键、可以用引用比较，不必序列化成字符串
    const index = fixture(base)

    expect(index.containerOf(ws('ws-1'))).toBe(index.containerOf(ws('ws-2')))
    expect(index.containerOf(ws('ws-1'))).toBe(index.containers.virtualOf('vg-1'))
    expect(index.containerOf(vg('vg-1'))).toBe(index.containers.root)
    // 两次取同一段兄弟交回同一批节点实例
    expect(index.siblingsOf(ws('ws-2'))[0]).toBe(index.siblingsOf(ws('ws-1'))[0])
    // 容器与节点都可以按引用比较：rootsOf 交回的与 siblingsOf 交回的是同一批实例
    expect(index.rootsOf(index.containers.virtualOf('vg-1'))[0]).toBe(index.siblingsOf(ws('ws-2'))[0])
  })

  it('reports the container each node belongs to', () => {
    const index = fixture(base)

    expect(index.containerOf(ws('ws-1'))).toEqual({ kind: 'virtual', id: 'vg-1' })
    expect(index.containerOf(ws('ws-2'))).toEqual({ kind: 'virtual', id: 'vg-1' })
    expect(index.containerOf(ws('ws-3'))).toEqual({ kind: 'root' })
    // 分组节点落在根节点那一层，它自己不是一个容器
    expect(index.containerOf(vg('vg-1'))).toEqual({ kind: 'root' })
  })

  it('returns no container for a node outside the sequence', () => {
    const index = fixture(base)

    // 元数据里可能记着一个已经删掉的工作区或分组，查不到时返回 undefined 而不是抛错
    expect(index.containerOf(ws('gone'))).toBeUndefined()
    expect(index.containerOf(vg('gone'))).toBeUndefined()
  })

  it('lists only the top level of a container in its roots', () => {
    const index = fixture(base)

    // ws-c1 的父工作区落在同一个容器里，因此它渲染在父工作区体内，不是这一层的顶层
    expect(membersIn(outlineRowsFrom(base), index.containers.virtualOf('vg-1'))).toEqual([
      ws('ws-1'),
      ws('ws-c1'),
      ws('ws-2'),
    ])
    expect(index.rootsOf(index.containers.virtualOf('vg-1'))).toEqual([ws('ws-1'), ws('ws-2')])
    // 根节点那一层的顶层既有分组也有平铺工作区：两者在界面上是同一条列表上的条目
    expect(index.rootsOf(index.containers.root)).toEqual([vg('vg-1'), vg('vg-2'), ws('ws-3')])
  })

  it('keeps the registry segment as the sibling list after a workspace moves into a session group', () => {
    const index = fixture({
      ...base,
      bindings: { 'ws-c1': { workspaceId: 'ws-1', groupId: 'group-a' } },
      groupIds: { 'ws-1': ['group-a'] },
    })

    // 放进会话分组改变渲染位置，不改变注册表上的先后：容器变成分组体，兄弟仍是父工作区名下那一列
    expect(index.containerOf(ws('ws-c1'))).toEqual({
      kind: 'group',
      workspaceId: 'ws-1',
      groupId: 'group-a',
    })
    expect(index.siblingsOf(ws('ws-c1'))).toEqual([ws('ws-c1')])
  })

  it('reads the sibling segment of a top level member from its container', () => {
    const index = fixture(base)

    // 没有父工作区时同层名单取所在容器的顶层，与渲染出来的那一排同源
    expect(index.siblingsOf(ws('ws-2'))).toEqual([ws('ws-1'), ws('ws-2')])
    expect(index.siblingsOf(ws('ws-c1'))).toEqual([ws('ws-c1')])
    // 虚拟分组的兄弟就是整份分组名单，数组序即界面序
    expect(index.siblingsOf(vg('vg-2'))).toEqual([vg('vg-1'), vg('vg-2')])
  })

  it('keeps a nested workspace out of the top level without losing its container', () => {
    // 父子链本身不对外交：拖拽用的是 dropAncestorsOf 那一条边，而它与这里同一份归属
    // 界面看得见的后果只有一条——被嵌套的那个不在这一层的顶层里，但它仍属这个容器
    const index = fixture(base)

    expect(index.rootsOf(index.containers.virtualOf('vg-1'))).not.toContainEqual(ws('ws-c1'))
    expect(index.containerOf(ws('ws-c1'))).toEqual(index.containers.virtualOf('vg-1'))
    // 虚拟分组不参与工作区的父子链，它自己就是根节点那一层的条目
    expect(index.containerOf(vg('vg-1'))).toEqual({ kind: 'root' })
  })

  it('ignores a workspace recorded by two virtual groups after the first', () => {
    const index = fixture({
      ...base,
      virtualGroups: [
        { id: 'vg-1', workspaceIds: [] },
        { id: 'vg-2', workspaceIds: ['ws-3'] },
      ],
    })

    // 一个工作区被两个分组同时记录时以先出现的为准，渲染出的每个工作区因此只有一个位置
    expect(index.containerOf(ws('ws-3'))).toEqual({ kind: 'virtual', id: 'vg-2' })
    // ws-1 与 ws-2 不再被任何分组记录，因此退回平铺在根节点上
    expect(index.rootsOf(index.containers.root)).toEqual([
      vg('vg-1'),
      vg('vg-2'),
      ws('ws-1'),
      ws('ws-2'),
    ])
  })
})

describe('the index and the row sequence', () => {
  /**
   * 一份带分组、嵌套与子工作区的夹具
   *
   * 覆盖全部四种节点来源：虚拟分组、组内顶层工作区、cwd 子工作区、被放进会话分组的子工作区
   */
  const rich = {
    workspaceIds: ['ws-1', 'ws-c1', 'ws-2', 'ws-3'],
    virtualGroups: [{ id: 'vg-1', workspaceIds: ['ws-1', 'ws-c1', 'ws-2'] }],
    paths: { 'ws-1': '/repo', 'ws-c1': '/repo/pkg', 'ws-2': '/other', 'ws-3': '/third' },
    groupIds: { 'ws-1': ['group-a'] },
  }

  it('holds a node for every row the sequence lists', () => {
    // 索引只吃行序列：界面上每画一行，索引里就该有对应的一份身份
    // 反过来说，索引里多出来的那个身份界面上没有，用户也就指不到它
    const index = indexFrom(rich)
    const rows = outlineRowsFrom(rich)

    const fromRows = new Set<string>()
    for (const row of rows) {
      if (row.kind === 'workspaceHead') fromRows.add('workspace/' + row.workspaceId)
      if (row.kind === 'virtualHead') fromRows.add('virtual/' + (row.groupId ?? ''))
    }

    expect(new Set(index.allNodes().map((node) => node.kind + '/' + node.id))).toEqual(fromRows)
  })

  it('puts a child workspace in the container the sequence gives it', () => {
    // 容器由行自己带着，索引不再按嵌套推导重算一遍：两处各算一次时
    // 聚焦裁剪过的布局会与未裁剪的推导对不上，计划因此落到屏幕上没有的位置
    const index = indexFrom(rich)
    const row = outlineRowsFrom(rich).find(
      (entry) => entry.kind === 'workspaceHead' && entry.workspaceId === 'ws-c1',
    )
    if (row === undefined) throw new Error('fixture 少了 ws-c1 那一行')

    expect(row.container).toEqual({ kind: 'virtual', id: 'vg-1' })
    expect(index.containerOf(ws('ws-c1'))).toEqual(index.containers.virtualOf('vg-1'))
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
    const index = fixture(base)
    const areas = dropAreasOf(index, ws('ws-1'), writes())
    const order = areas.filter((entry) => entry.accepts === 'order').map((entry) => entry.zones[0])

    expect(order).toContain('workspaceHead/ws-2')
    // ws-3 平铺在根节点那一层。来源在虚拟分组里，两者既不并排也不同父工作区
    // 但「移到 root 层这一行的前后」仍是一个合法落点：落上去先回 root 层，再排队
    expect(order).toContain('workspaceHead/ws-3')
    // 自己的子工作区不是同层兄弟，不给位次
    expect(order).not.toContain('workspaceHead/ws-c1')
  })

  it('pairs the root level row with leaving the group it currently sits in', () => {
    // 落到 root 层那一行前后，位置要真的变：位次只是一半，另一半是「退出此刻所在的分组」
    // 后者由根节点那一片自己的 inside 关系给出——它罩着整片列表，落到任何一行上都成立
    const index = fixture(base)
    const areas = dropAreasOf(index, ws('ws-1'), writes())

    const rootInside = areas.find(
      (entry) => entry.accepts === 'inside' && entry.zones.includes('root'),
    )
    const rootOrder = areas.find(
      (entry) => entry.accepts === 'order' && entry.zones[0] === 'workspaceHead/ws-3',
    )

    expect(rootInside).toBeDefined()
    expect(rootOrder).toBeDefined()
  })

  it('reads manual nesting and cwd nesting through the same parent edge', () => {
    // 对拖拽来说两种嵌套没有区别：都是「这个工作区在谁里面」
    // ws-c1 按 cwd 挂在 ws-1 下，ws-c2 与它的路径无关，但落盘把它放进了 ws-1 的分组
    const index = fixture({
      workspaceIds: ['ws-1', 'ws-c1', 'ws-c2'],
      paths: { 'ws-1': '/repo', 'ws-c1': '/repo/pkg', 'ws-c2': '/repo/other' },
      bindings: { 'ws-c2': { workspaceId: 'ws-1', groupId: 'group-x' } },
      groupIds: { 'ws-1': ['group-x'] },
    })

    expect(index.dropAncestorsOf(ws('ws-c1'))).toEqual([{ kind: 'workspace', id: 'ws-1' }])
    expect(index.dropAncestorsOf(ws('ws-c2'))).toEqual([{ kind: 'workspace', id: 'ws-1' }])
    // 两者的父节点相同，因此互为同层兄弟：一条来自路径、一条来自落盘归属
    expect(index.dropSiblingsOf(ws('ws-c1')).map((entry) => entry.id)).toEqual(['ws-c1', 'ws-c2'])
  })

  it('never puts one row in both the order and the inside table', () => {
    // 一行不能同时承接两种关系：能谈先后就不再承接放入
    // 那时它的直接父工作区承接 inside
    const index = fixture(base)
    const areas = dropAreasOf(index, ws('ws-1'), writes())
    const orderZones = new Set(
      areas.filter((entry) => entry.accepts === 'order').flatMap((entry) => entry.zones),
    )
    const clashing = areas
      .filter((entry) => entry.accepts === 'inside')
      .filter((entry) => entry.zones.some((key) => orderZones.has(key)))

    expect(clashing).toEqual([])
  })

  it('never turns a root level row into an inside place', () => {
    // 用户拖一个在分组里的工作区到根节点那层的平铺行上时，那是 order 关系
    // 两者的 cwd 没有祖先关系，来源进不了那一行体内，因此不该画框
    const index = fixture(base)
    const areas = dropAreasOf(index, ws('ws-1'), writes())

    expect(areas.some((entry) => entry.accepts === 'inside' && entry.zones.includes('workspaceHead/ws-3'))).toBe(false)
  })

  it('offers an inside place for every other virtual group', () => {
    const index = fixture(base)
    const areas = dropAreasOf(index, ws('ws-1'), writes())
    const inside = areas.filter((entry) => entry.accepts === 'inside')

    // 别的分组两格（组头 + 组体），自己所在的那个分组不在其中
    expect(inside.some((entry) => entry.zones.includes('virtualWorkspaceHead/vg-2'))).toBe(true)
    expect(inside.some((entry) => entry.zones.includes('virtualWorkspaceHead/vg-1'))).toBe(false)
  })

  it('offers the root list once when the source sits in a group', () => {
    const index = fixture(base)
    const areas = dropAreasOf(index, ws('ws-1'), writes())

    expect(areas.some((entry) => entry.accepts === 'inside' && entry.zones.includes('root'))).toBe(true)
  })

  it('offers no root place while the source already sits at the root', () => {
    const index = fixture({ workspaceIds: ['ws-1', 'ws-2'], paths: { 'ws-1': '/a', 'ws-2': '/b' } })
    const areas = dropAreasOf(index, ws('ws-1'), writes())

    expect(areas.some((entry) => entry.zones.includes('root'))).toBe(false)
  })

  it('commits the write each relation was built for', () => {
    const index = fixture(base)
    const io = writes()
    const areas = dropAreasOf(index, ws('ws-1'), io)
    const toGroup = areas.find(
      (entry) => entry.accepts === 'inside' && entry.zones.includes('virtualWorkspaceHead/vg-2'),
    )
    toGroup?.commit({ kind: 'inside' })

    expect(io.calls).toEqual(['move:vg-2'])
  })

  it('never turns an unrelated row into an inside place', () => {
    // 三个互不相干的工作区各在自己的位置：ws-b 与 ws-a 既无 cwd 关系也不是同层
    const index = fixture({
      workspaceIds: ['ws-a', 'ws-b', 'ws-c'],
      virtualGroups: [
        { id: 'vg-a', workspaceIds: ['ws-a'] },
        { id: 'vg-b', workspaceIds: ['ws-b'] },
      ],
      paths: { 'ws-a': '/a', 'ws-b': '/b', 'ws-c': '/c' },
    })
    const areas = dropAreasOf(index, ws('ws-a'), writes())

    // 那一行最多作为位次参照，绝不能变成「放进它体内」
    expect(areas.some((entry) => entry.accepts === 'inside' && entry.zones.includes('workspaceHead/ws-b'))).toBe(false)
  })
})
