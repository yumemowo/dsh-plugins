import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  buildRootLayout,
  containsSession,
  groupIdOfSession,
  sameGroupSections,
  virtualWorkspaceIdOf,
} from '../src/client/data/layout.ts'
import { deriveNesting } from '../src/client/data/nest.ts'
import { sameSessionStatus } from '../src/client/data/status.ts'
import {
  compareSessionRows,
  flatRowsInFocus,
  flatSessionRows,
  groupSessionsByWorkspace,
  straySessions,
} from '../src/client/data/sessions.ts'
import {
  buildGroupMenuItems,
  buildParentGroupMenuItem,
  buildRowContextMenuItems,
  buildSessionMenuItems,
  buildVirtualWorkspaceMenuItem,
  buildVirtualWorkspaceMenuItems,
  buildWorkspaceMenuItems,
  parseParentGroupId,
} from '../src/client/menus.tsx'
import type { SessionRow } from '../src/client/data/types.ts'
import { officialSessionLabels } from '../src/client/official.ts'
import { normalizeSnapshot } from '../src/client/remote.ts'
import { menuLabelArrow, menuLabelText } from './menu-label.ts'
import { workspaceTranslate } from './locale-stub.ts'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

/** 造一行会话渲染数据 */
function row(id: string, title = id): SessionRow {
  return {
    id,
    title,
    blank: false,
    running: false,
    runningSubagentCount: 0,
    completed: false,
    updatedAt: 0,
  }
}

/** 造一个分组定义 */
function group(id: string, name: string, sessionIds: string[]) {
  return { id, name, sessionIds }
}

describe('buildLayout', () => {
  it('keeps sessions inside their group in metadata order', () => {
    const layout = buildLayout([row('a'), row('b'), row('c')], [group('g1', '前端', ['c', 'a'])])

    expect(layout.groups.map((section) => section.label)).toEqual(['前端'])
    expect(layout.groups[0]?.sessions.map((s) => s.id)).toEqual(['c', 'a'])
    expect(layout.loose.map((s) => s.id)).toEqual(['b'])
  })

  it('creates no group at all when the user has created none', () => {
    const layout = buildLayout([row('a'), row('b')], [])

    // 没有用户分组时不应凭空出现分组结构，会话直接平铺
    expect(layout.groups).toEqual([])
    expect(layout.loose.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('leaves ungrouped sessions loose rather than inventing a bucket group', () => {
    const layout = buildLayout([row('a'), row('b')], [group('g1', '前端', ['a'])])

    expect(layout.groups.map((section) => section.id)).toEqual(['g1'])
    expect(layout.loose.map((s) => s.id)).toEqual(['b'])
  })

  it('reports no loose rows when every session is grouped', () => {
    const layout = buildLayout([row('a')], [group('g1', '前端', ['a'])])

    expect(layout.loose).toEqual([])
  })

  it('skips metadata entries whose session is no longer listed', () => {
    const layout = buildLayout([row('a')], [group('g1', '前端', ['a', 'gone'])])

    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.sessions.map((s) => s.id)).toEqual(['a'])
  })

  it('treats a session listed in two groups as belonging to the first only', () => {
    const layout = buildLayout(
      [row('a')],
      [group('g1', '第一', ['a']), group('g2', '第二', ['a'])],
    )

    expect(layout.groups[0]?.sessions.map((s) => s.id)).toEqual(['a'])
    expect(layout.groups[1]?.sessions).toEqual([])
    // 被分组认领过的会话不会再出现在平铺区，避免重复渲染
    expect(layout.loose).toEqual([])
  })

  it('renders an empty group rather than dropping it', () => {
    const layout = buildLayout([], [group('g1', '空组', [])])

    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.sessions).toEqual([])
  })

  it('keeps group identity stable across rebuilds', () => {
    const groups = [group('g1', '前端', ['a']), group('g2', '后端', [])]
    const first = buildLayout([row('a')], groups)
    const second = buildLayout([row('a')], groups)

    // 分组 id 必须逐次一致，否则展开折叠状态会每次都重置
    expect(first.groups.map((s) => s.id)).toEqual(second.groups.map((s) => s.id))
  })
})

describe('groupIdOfSession', () => {
  it('reports the group that holds the session', () => {
    const layout = buildLayout([row('a'), row('b')], [group('g1', '前端', ['a'])])

    expect(groupIdOfSession(layout.groups, 'a')).toBe('g1')
  })

  it('reports an empty id for a session outside every group', () => {
    const layout = buildLayout([row('a'), row('b')], [group('g1', '前端', ['a'])])

    // 空串对应选择器里的「未分组」选项
    expect(groupIdOfSession(layout.groups, 'b')).toBe('')
  })

  it('reports an empty id for an unknown session', () => {
    const layout = buildLayout([row('a')], [group('g1', '前端', ['a'])])

    expect(groupIdOfSession(layout.groups, 'ghost')).toBe('')
  })

  it('reports an empty id when no groups exist', () => {
    const layout = buildLayout([row('a')], [])

    expect(groupIdOfSession(layout.groups, 'a')).toBe('')
  })
})

describe('containsSession', () => {
  it('reports whether the current session is among the rows', () => {
    expect(containsSession([row('a'), row('b')], 'b')).toBe(true)
  })

  it('reports false when the current session is not among the rows', () => {
    expect(containsSession([row('a'), row('b')], 'c')).toBe(false)
  })

  it('reports false while no session is selected', () => {
    // 没有选中会话时不应把文件夹染成强调色
    expect(containsSession([row('a')], undefined)).toBe(false)
  })

  it('reports false for an empty workspace', () => {
    expect(containsSession([], 'a')).toBe(false)
  })
})

describe('buildSessionMenuItems', () => {
  /** 造分组段输入，分组顺序即传入顺序 */
  function grouping(currentGroupId: string) {
    return {
      sections: [
        { id: 'g1', label: '前端', sessions: [] },
        { id: 'g2', label: '后端', sessions: [] },
        { id: 'g3', label: '工具', sessions: [] },
      ],
      currentGroupId,
      groupLabel: '移动到…',
      ungroupLabel: '取消分组',
    }
  }

  /** 官方三项操作的文案（取自官方 workspace 命名空间） */
  const official = officialSessionLabels(workspaceTranslate())

  it('lists the official three actions before the package own group item', () => {
    const items = buildSessionMenuItems({ grouping: grouping(''), official })

    // 官方三项在前（它们是会话本身的操作），分组项是叠加其上的归类操作
    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'rename',
      'fork',
      'archive',
      'separator',
      'group',
    ])
  })

  it('separates the official actions from the group item', () => {
    const items = buildSessionMenuItems({ grouping: grouping(''), official })

    // 两类操作之间必须有分隔线，否则会混成一个列表
    const separator = items.find((item) => (item as { id?: string }).id === 'separator')
    expect(separator).toMatchObject({ type: 'separator' })
  })

  it('draws no separator when only one section exists', () => {
    const onlyOfficial = buildSessionMenuItems({ official })
    const onlyGrouping = buildSessionMenuItems({ grouping: grouping('') })

    // 分隔线是用来分两段的，只有一段时它是多余的空行
    for (const items of [onlyOfficial, onlyGrouping]) {
      expect(items.some((item) => (item as { type?: string }).type === 'separator')).toBe(false)
    }
  })

  it('keeps the official actions for a row without grouping context', () => {
    // 「未分组」桶里的会话没有分组可归，但官方三项照常可用
    const items = buildSessionMenuItems({ official })

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['rename', 'fork', 'archive'])
  })

  it('falls back to the group item alone when official services are absent', () => {
    // 宿主未加载官方 ui-workspace 时不留点不动的死按钮
    const items = buildSessionMenuItems({ grouping: grouping('') })

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['group'])
  })

  it('keeps submenu groups in workspace view order', () => {
    const items = buildSessionMenuItems({ grouping: grouping('') })

    const groupItem = items.find((item) => (item as { id?: string }).id === 'group') as {
      submenu?: { id: string }[]
    }
    expect(groupItem.submenu?.map((entry) => entry.id)).toEqual(['group:g1', 'group:g2', 'group:g3'])
  })

  it('gives the group item a trailing arrow because it opens a submenu', () => {
    const items = buildSessionMenuItems({ grouping: grouping('') })
    const groupItem = items.find((item) => (item as { id?: string }).id === 'group')

    // 二级菜单只靠悬停展开，行尾箭头是菜单上唯一的可见提示
    expect(menuLabelArrow((groupItem as { label?: unknown }).label)).toBeDefined()
  })

  it('hides the session own group from the submenu', () => {
    const items = buildSessionMenuItems({ grouping: grouping('g2') })

    const groupItem = items.find((item) => (item as { id?: string }).id === 'group') as {
      submenu?: { id: string }[]
    }
    expect(groupItem.submenu?.map((entry) => entry.id)).toEqual(['group:g1', 'group:g3'])
  })

  it('shows the ungroup action right below the group item when grouped', () => {
    const items = buildSessionMenuItems({ grouping: grouping('g2') })

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['group', 'ungroup'])
  })

  it('omits the ungroup action when the session is loose', () => {
    const items = buildSessionMenuItems({ grouping: grouping('') })

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['group'])
  })

  it('disables the group item when no other group exists', () => {
    const input = {
      grouping: {
        sections: [{ id: 'g1', label: '前端', sessions: [] }],
        currentGroupId: 'g1',
        groupLabel: '移动到…',
        ungroupLabel: '取消分组',
      },
    }
    const items = buildSessionMenuItems(input)

    const groupItem = items[0] as { label?: unknown; disabled?: boolean }
    expect(groupItem.disabled).toBe(true)
    // 候选为空时原语不把该项当子菜单父项（既不展开也不给 aria-haspopup）
    // 此时画箭头就是在指一个展不开的菜单
    expect(menuLabelArrow(groupItem.label)).toBeUndefined()
    expect(menuLabelText(groupItem.label)).toBe('移动到…')
  })
})

describe('buildRowContextMenuItems', () => {
  const rowItems = buildWorkspaceMenuItems({
    newGroupLabel: '新建分组',
    renameLabel: '重命名',
    deleteLabel: '删除工作区',
  })

  it('puts the new-session item in front of the row menu', () => {
    const items = buildRowContextMenuItems(rowItems, '新建会话')

    // 右键菜单 = 行内 `...` 菜单 + 行内 `+` 那一项（它没有菜单形态，因此补在最前）
    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-session',
      'new-group',
      'rename',
      'delete',
    ])
  })

  it('keeps every row menu item so both entries share one dispatch', () => {
    const items = buildRowContextMenuItems(rowItems, '新建会话')

    // 右键是 `...` 的捷径，除新增项外，条目对象必须是同一批，否则同一个动作会在两个入口下各走一套
    expect(items.slice(1)).toEqual(rowItems)
  })

  it('adds nothing when the row has no create entry', () => {
    // 未分组桶的工作区行没有可建会话的工作区归属，补一项就是点不动的死按钮
    expect(buildRowContextMenuItems(rowItems, undefined)).toEqual(rowItems)
    expect(buildRowContextMenuItems([], undefined)).toEqual([])
  })

  it('gives the new-session item the official sidebar icon', () => {
    // 同一个菜单里「新建分组」也带 `+`，两项都用 `+` 就只能靠文字区分
    const items = buildRowContextMenuItems(rowItems, '新建会话')
    const icon = (items[0] as { icon?: { type: () => unknown } }).icon

    expect(icon?.type()).toBe('IconNewChatOutlineRegular')
  })
})

describe('buildWorkspaceMenuItems', () => {
  const labels = {
    newGroupLabel: '新建分组',
    renameLabel: '重命名工作区',
    deleteLabel: '删除工作区',
  }

  it('offers new group, rename and delete in that order', () => {
    const items = buildWorkspaceMenuItems(labels)

    // 官方管理菜单是「重命名、删除」，本包自有的建组项排在最前
    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['new-group', 'rename', 'delete'])
  })

  it('marks only the delete entry as dangerous', () => {
    const items = buildWorkspaceMenuItems(labels) as readonly { id: string; danger?: boolean }[]

    expect(items.filter((item) => item.danger === true).map((item) => item.id)).toEqual(['delete'])
  })

  it('keeps new group out of the row and inside the menu', () => {
    const items = buildWorkspaceMenuItems(labels)

    // 「新建分组」不是高频操作，因此不占行内位置（行内只有 `...` 与 `+`）
    expect(items[0]).toMatchObject({ id: 'new-group', label: '新建分组' })
  })

  it('omits the virtual-workspace entry when the row offers none', () => {
    const items = buildWorkspaceMenuItems(labels)

    // 未分组桶的工作区行没有可移入的地方，补一项就是点不动的死入口
    expect(items.some((item) => (item as { id?: string }).id === 'move-virtual-workspace')).toBe(
      false,
    )
  })

  it('puts rename above the move-to entry, and omits ungroup until grouped', () => {
    const items = buildWorkspaceMenuItems({
      ...labels,
      virtualWorkspaceGrouping: {
        sections: [],
        currentGroupId: '',
        newLabel: '新建工作区分组',
        moveToLabel: '移动到…',
        ungroupLabel: '移出工作区分组',
      },
    })

    // 改名紧挨在「新建分组」之后、归类操作之前，未归组时没有「移出」这一格
    // 归类块与删除之间由分隔线断开
    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-group',
      'rename',
      'separator-virtual-workspace',
      'move-virtual-workspace',
      'separator-delete',
      'delete',
    ])
  })

  it('shows ungroup right below move-to once the workspace is grouped', () => {
    const items = buildWorkspaceMenuItems({
      ...labels,
      virtualWorkspaceGrouping: {
        sections: [],
        currentGroupId: 'wg1',
        newLabel: '新建工作区分组',
        moveToLabel: '移动到…',
        ungroupLabel: '移出工作区分组',
      },
    })

    // 「移动到…」与「移出工作区分组」是一对归类操作，平级相邻
    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-group',
      'rename',
      'separator-virtual-workspace',
      'move-virtual-workspace',
      'ungroup-workspace',
      'separator-delete',
      'delete',
    ])
  })

  it('leaves the top-level ungroup entry without an icon', () => {
    const items = buildWorkspaceMenuItems({
      ...labels,
      virtualWorkspaceGrouping: {
        sections: [],
        currentGroupId: 'wg1',
        newLabel: '新建工作区分组',
        moveToLabel: '移动到…',
        ungroupLabel: '移出工作区分组',
      },
    })
    const ungroup = items.find((item) => (item as { id?: string }).id === 'ungroup-workspace')

    // 移出是动作而不是可移入的目标，因此不带图标
    expect(ungroup).toMatchObject({ label: '移出工作区分组' })
    expect((ungroup as { icon?: unknown }).icon).toBeUndefined()
  })
})

/**
 * 工作区行「移动工作区分组」子菜单
 *
 * 建组与移入合成一条动作，入口在工作区行上，用户点下去要么放进已有分组
 * 要么先建一个再放，因此二级菜单把「新建 → 各分组 → 移出」三段排在一起
 */
describe('buildWorkspaceMenuItems with a parent-group entry', () => {
  const labels = {
    newGroupLabel: '新建分组',
    renameLabel: '重命名工作区',
    deleteLabel: '删除工作区',
  }

  /** 一祖先一分组的选项集 */
  function grouping(current?: { parentId: string; groupId: string }) {
    return {
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
      ],
      ...(current === undefined ? {} : { current }),
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    }
  }

  it('omits the parent-group entry when the row offers none', () => {
    const items = buildWorkspaceMenuItems(labels)

    expect(items.some((item) => (item as { id?: string }).id === 'move-to-parent-group')).toBe(false)
  })

  it('offers the parent-group entry and no ungroup while the workspace is loose', () => {
    const items = buildWorkspaceMenuItems({ ...labels, parentGrouping: grouping() })

    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-group',
      'rename',
      'separator-parent-group',
      'move-to-parent-group',
      'separator-delete',
      'delete',
    ])
  })

  it('adds the ungroup entry right below move-to once the workspace is nested', () => {
    const items = buildWorkspaceMenuItems({
      ...labels,
      parentGrouping: grouping({ parentId: 'w1', groupId: 'g1' }),
    })

    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-group',
      'rename',
      'separator-parent-group',
      'move-to-parent-group',
      'ungroup-child-workspace',
      'separator-delete',
      'delete',
    ])
    // 「移出」不带图标，它是移出动作，不是可移入的目标
    const ungroup = items[4] as { icon?: unknown }
    expect(ungroup.icon).toBeUndefined()
  })

  it('keeps the two grouping levels as separate top-level entries', () => {
    // 一个进父工作区体内的会话分组，一个进根节点的虚拟工作区分组，两个层级，两个一级项
    const items = buildWorkspaceMenuItems({
      ...labels,
      parentGrouping: grouping(),
      virtualWorkspaceGrouping: {
        sections: [{ id: 'wg1', label: '前端仓库', workspaceIds: [], roots: [] }],
        currentGroupId: '',
        newLabel: '新建工作区分组…',
        moveToLabel: '移动到…',
        ungroupLabel: '移出工作区分组',
      },
    })

    const ids = items.map((item) => (item as { id?: string }).id)
    expect(ids).toEqual([
      'new-group',
      'rename',
      'separator-parent-group',
      'move-to-parent-group',
      'separator-virtual-workspace',
      'move-virtual-workspace',
      'separator-delete',
      'delete',
    ])
  })

  it('draws no separator around the delete entry when the row has no grouping block', () => {
    // 未分组桶里的工作区行没有归类操作，删除项前面留一条分隔线就是把它从空气里隔开
    const items = buildWorkspaceMenuItems(labels)

    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-group',
      'rename',
      'delete',
    ])
  })

  it('labels a parent group with its ancestor name only when several ancestors exist', () => {
    const single = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
      ],
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })
    const many = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
        { parentId: 'w2', parentLabel: 'W2', groups: [{ id: 'g2', label: '前端' }] },
      ],
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    // 只有一个祖先时分组名本身就是唯一的坐标，不必再挂一个前缀
    expect((single.submenu ?? []).map((item) => item.label)).toEqual(['前端'])
    // 两个祖先下都有同名分组，加上祖先名才分得清
    expect((many.submenu ?? []).map((item) => item.label)).toEqual(['W1 / 前端', 'W2 / 前端'])
  })

  it('encodes the target parent and group in the submenu id', () => {
    const item = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
      ],
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    expect((item.submenu ?? [])[0]?.id).toBe('pg:w1:g1')
    expect(parseParentGroupId('pg:w1:g1')).toEqual({ parentId: 'w1', groupId: 'g1' })
  })

  it('hides the parent group the workspace already sits in', () => {
    const item = buildParentGroupMenuItem({
      candidates: [
        {
          parentId: 'w1',
          parentLabel: 'W1',
          groups: [
            { id: 'g1', label: '前端' },
            { id: 'g2', label: '后端' },
          ],
        },
      ],
      current: { parentId: 'w1', groupId: 'g1' },
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    // 把已在的分组再列一次，点下去是无意义的操作
    expect(item.submenu?.map((entry) => entry.id)).toEqual(['pg:w1:g2'])
  })

  it('keeps a same-named group under another ancestor', () => {
    const item = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
        { parentId: 'w2', parentLabel: 'W2', groups: [{ id: 'g1', label: '前端' }] },
      ],
      current: { parentId: 'w1', groupId: 'g1' },
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    // 分组 id 只在一个工作区内唯一，按 id 单独比对会把另一个祖先名下那个同名分组一并剔掉
    expect(item.submenu?.map((entry) => entry.id)).toEqual(['pg:w2:g1'])
  })

  it('disables the entry when no ancestor holds a group', () => {
    const item = buildParentGroupMenuItem({
      candidates: [{ parentId: 'w1', parentLabel: 'W1', groups: [] }],
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    // 没有可移入的目标时一级项禁用，而不是指一个展不开的菜单
    expect(item.disabled).toBe(true)
    expect(menuLabelArrow(item.label)).toBeUndefined()
  })

  it('disables the entry when the only ancestor group is the one it sits in', () => {
    const item = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
      ],
      current: { parentId: 'w1', groupId: 'g1' },
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    expect(item.disabled).toBe(true)
    expect(item.submenu).toEqual([])
  })

  it('gives the entry a trailing arrow because it opens a submenu', () => {
    const item = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
      ],
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    expect(menuLabelArrow(item.label)).toBeDefined()
  })

  it('leaves the entry without the virtual-workspace icon', () => {
    // IconVirtualWorkspace16 是虚拟工作区分组的字形，这一项进的是父工作区体内的会话分组
    // 带上那个图标会把两个层级的入口画成同一个东西
    const item = buildParentGroupMenuItem({
      candidates: [
        { parentId: 'w1', parentLabel: 'W1', groups: [{ id: 'g1', label: '前端' }] },
      ],
      moveToLabel: '移动到分组…',
      ungroupLabel: '移出分组',
    })

    expect(item.icon).toBeUndefined()
  })
})

describe('buildVirtualWorkspaceMenuItem', () => {
  /** 造选项集，分组顺序即传入顺序 */
  function input(currentGroupId: string) {
    return {
      sections: [
        { id: 'wg1', label: '前端', workspaceIds: ['w1'], roots: ['w1'] },
        { id: 'wg2', label: '后端', workspaceIds: [], roots: [] },
        { id: 'wg3', label: '工具', workspaceIds: [], roots: [] },
      ],
      currentGroupId,
      newLabel: '新建工作区分组',
      moveToLabel: '移动到…',
      ungroupLabel: '移出工作区分组',
    }
  }

  it('offers create first, then the candidate groups', () => {
    const item = buildVirtualWorkspaceMenuItem(input(''))

    expect(item.id).toBe('move-virtual-workspace')
    expect(menuLabelText(item.label)).toBe('移动到…')
    // 二级菜单只靠悬停展开，行尾箭头是菜单上唯一的可见提示
    expect(menuLabelArrow(item.label)).toBeDefined()
    expect(item.submenu?.map((entry) => entry.id)).toEqual([
      'create-virtual-workspace',
      'vw:wg1',
      'vw:wg2',
      'vw:wg3',
    ])
  })

  it('drops the group the workspace is already in', () => {
    const item = buildVirtualWorkspaceMenuItem(input('wg2'))

    // 把工作区移动到它已经在的分组是无意义的操作
    expect(item.submenu?.some((entry) => entry.id === 'vw:wg2')).toBe(false)
  })

  it('keeps ungroup out of the submenu, which is for moving into a group', () => {
    // 「移出」不是「移动」，它由工作区菜单作为一级项渲染
    // 见 buildWorkspaceMenuItems 的「shows ungroup right below move-to」一例
    expect(
      buildVirtualWorkspaceMenuItem(input('wg1')).submenu?.some(
        (entry) => entry.id === 'ungroup-workspace',
      ),
    ).toBe(false)
  })

  it('leaves the create entry without an icon and with the ellipsis label', () => {
    const item = buildVirtualWorkspaceMenuItem(input(''))

    // 建组是子菜单里唯一的独立动作，不是一个可以移入的目标：靠省略号表明
    // 「点下去还要再填一次」，且不带图标（带图标会与上面带 `+` 的「新建分组」撞形）
    const create = item.submenu?.[0]
    expect(create?.id).toBe('create-virtual-workspace')
    expect(create?.label).toBe('新建工作区分组')
    expect(create?.icon).toBeUndefined()
    // 其余候选分组同样不带图标，因此子菜单里的标签左缘是对齐的
    expect(item.submenu?.slice(1).every((entry) => entry.icon === undefined)).toBe(true)
  })

  it('stays usable with no group at all because create leads the submenu', () => {
    const item = buildVirtualWorkspaceMenuItem({
      sections: [],
      currentGroupId: '',
      newLabel: '新建工作区分组',
      moveToLabel: '移动到…',
      ungroupLabel: '移出工作区分组',
    })

    // 一级项不禁用：即便一个分组都没有，它下面还有「新建」可点
    expect(item.disabled).toBe(false)
    expect(item.submenu?.map((entry) => entry.id)).toEqual(['create-virtual-workspace'])
  })
})

describe('buildVirtualWorkspaceMenuItems', () => {
  const labels = { renameLabel: '重命名工作区分组', deleteLabel: '删除工作区分组' }

  it('offers rename and delete in that order', () => {
    const items = buildVirtualWorkspaceMenuItems(labels)

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['rename', 'delete'])
  })

  it('marks only the delete entry as dangerous', () => {
    const items = buildVirtualWorkspaceMenuItems(labels) as readonly { id: string; danger?: boolean }[]

    expect(items.filter((item) => item.danger === true).map((item) => item.id)).toEqual(['delete'])
  })
})

describe('buildGroupMenuItems', () => {
  const labels = { renameLabel: '重命名分组', deleteLabel: '删除分组' }

  it('offers rename and delete in that order', () => {
    const items = buildGroupMenuItems(labels)

    // 与工作区菜单同形：改名在前、删除在后
    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['rename', 'delete'])
  })

  it('marks only the delete entry as dangerous', () => {
    const items = buildGroupMenuItems(labels) as readonly { id: string; danger?: boolean }[]

    expect(items.filter((item) => item.danger === true).map((item) => item.id)).toEqual(['delete'])
  })

  it('keeps new group out of the group row menu', () => {
    const items = buildGroupMenuItems(labels)

    // 「新建分组」是工作区行的事，分组行的高频建造操作是行内 `+`
    expect(items.some((item) => (item as { id?: string }).id === 'new-group')).toBe(false)
  })
})

describe('flatSessionRows', () => {
  /** 造一份会话列表状态，`updatedAt` 决定最近更新倒序 */
  function listState(
    rows: { id: string; updatedAt?: number; blank?: boolean; origin?: 'subagent' }[],
    current?: string,
  ): SessionListState {
    const byId: Record<string, unknown> = {}
    for (const item of rows) {
      byId[item.id] = {
        id: item.id,
        displayTitle: item.id,
        running: false,
        blank: item.blank === true,
        retainedBy: item.id === current ? { mainView: 1 } : {},
        updatedAt: item.updatedAt ?? 0,
        ...(item.origin === undefined ? {} : { origin: item.origin }),
      }
    }
    return { ids: rows.map((r) => r.id), byId, phase: 'ready' } as unknown as SessionListState
  }

  it('collects every visible session regardless of workspace', () => {
    // 平铺列表的成员集合与工作区归属无关，这正是官方「单列表」的含义
    const rows = flatSessionRows(listState([{ id: 'a' }, { id: 'b' }]))

    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('applies the same visibility rules as the grouped view', () => {
    // 归档、子代理来源与未选中的空白会话都不出现，两个视图的取舍必须一致
    const rows = flatSessionRows(
      listState([
        { id: 'a' },
        { id: 'archived' },
        { id: 'child', origin: 'subagent' },
        { id: 'blank', blank: true },
        { id: 'current', blank: true },
      ], 'current'),
      ['archived'],
    )

    expect(rows.map((r) => r.id)).toEqual(['a', 'current'])
  })

  it('reports nothing when the list has no visible session', () => {
    expect(flatSessionRows(listState([]))).toEqual([])
  })
})

describe('flatRowsInFocus', () => {
  /** 会话 id → 属于哪个工作区，无所属的会话不登记 */
  const owners = new Map([
    ['a', 'w1'],
    ['b', 'w2'],
  ])

  it('keeps every row when nothing is focused', () => {
    const rows = [row('a'), row('b'), row('orphan')]

    expect(flatRowsInFocus(rows, owners, undefined).map((r) => r.id)).toEqual([
      'a',
      'b',
      'orphan',
    ])
  })

  it('keeps only the rows owned by the focused scope', () => {
    expect(flatRowsInFocus([row('a'), row('b')], owners, ['w2']).map((r) => r.id)).toEqual(['b'])
  })

  it('drops rows that belong to no workspace while something is focused', () => {
    // 无所属的会话在「未分组」桶里，聚焦到某一片内容时与它们无关
    // 它们不在索引里，因此不需要单独判断
    expect(flatRowsInFocus([row('orphan')], owners, ['w1'])).toEqual([])
  })

  it('drops everything when the focused scope owns no visible session', () => {
    expect(flatRowsInFocus([row('a'), row('b')], owners, ['w9'])).toEqual([])
  })

  it('does not mutate the rows it was given', () => {
    const rows = [row('a'), row('b')]

    const kept = flatRowsInFocus(rows, owners, undefined)

    expect(kept).not.toBe(rows)
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('compareSessionRows', () => {
  it('leads with the blank session and orders the rest by recency', () => {
    // 与工作区视图用同一个比较器，两种展示方式下的先后因此一致
    const rows = [
      { ...row('old'), updatedAt: 1 },
      { ...row('blank'), blank: true, updatedAt: 0 },
      { ...row('new'), updatedAt: 9 },
    ]

    expect([...rows].sort(compareSessionRows).map((r) => r.id)).toEqual(['blank', 'new', 'old'])
  })
})

describe('straySessions', () => {
  /**
   * 造一份最小可用的会话列表状态
   *
   * 「当前选中」落在会话自己的保留计数上，官方 `mainSessionId` 读的就是它
   * 因此 `current` 参数写成谁的计数为 1，而不是再往快照上挂一个 `current` 字段
   */
  function listState(
    rows: { id: string; origin?: 'subagent'; blank?: boolean }[],
    current?: string,
  ): SessionListState {
    const byId: Record<string, unknown> = {}
    for (const item of rows) {
      byId[item.id] = {
        id: item.id,
        displayTitle: item.id,
        running: false,
        blank: item.blank === true,
        retainedBy: item.id === current ? { mainView: 1 } : {},
        updatedAt: 0,
        ...(item.origin === undefined ? {} : { origin: item.origin }),
      }
    }
    return { ids: rows.map((r) => r.id), byId, phase: 'ready' } as unknown as SessionListState
  }

  /** 造一个工作区视图 */
  function workspace(id: string, sessionIds: string[]): WorkspaceView {
    return {
      workspaceId: id,
      path: `/tmp/${id}`,
      title: id,
      sessionIds,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as WorkspaceView
  }

  it('reports no stray rows when every session has a workspace', () => {
    const stray = straySessions(
      listState([{ id: 'a' }, { id: 'b' }]),
      [workspace('w1', ['a']), workspace('w2', ['b'])],
    )

    // 平时每个会话都有归属，隐式「未分组」区段因此不出现
    expect(stray).toEqual([])
  })

  it('collects a session left behind by a deleted workspace', () => {
    // 删除工作区只移除注册，会话记录还在，但不再属于任何工作区
    const stray = straySessions(listState([{ id: 'orphan' }]), [])

    expect(stray.map((row) => row.id)).toEqual(['orphan'])
  })

  it('keeps a workspace member out of the ungrouped bucket even when hidden', () => {
    // 归档会话仍在 workspace.sessionIds 里，不能因为「不可见」就掉进未分组桶
    const stray = straySessions(
      listState([{ id: 'archived' }]),
      [workspace('w1', ['archived'])],
      ['archived'],
    )

    expect(stray).toEqual([])
  })

  it('hides subagent-origin strays', () => {
    const stray = straySessions(listState([{ id: 'child', origin: 'subagent' }]), [])

    expect(stray).toEqual([])
  })

  it('hides archived strays', () => {
    const stray = straySessions(listState([{ id: 'gone' }]), [], ['gone'])

    expect(stray).toEqual([])
  })

  it('keeps only the selected blank stray as the provisional row', () => {
    const stray = straySessions(listState([{ id: 'blank', blank: true }], 'blank'), [])

    expect(stray.map((row) => row.id)).toEqual(['blank'])
  })

  it('preserves session list order', () => {
    const stray = straySessions(listState([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), [workspace('w1', ['b'])])

    expect(stray.map((row) => row.id)).toEqual(['a', 'c'])
  })
})

describe('groupSessionsByWorkspace', () => {
  /**
   * 造一份最小可用的会话列表状态
   *
   * 每个会话的 `children` 是它名下那份子代理目录
   * 落在 `projectionsBySession[parent].values.subagentCatalog` 上
   * 与官方 `runningChildCount` 读的是同一格，子代理自身的运行态留在它自己的摘要里
   */
  function listState(
    rows: {
      id: string
      origin?: 'subagent'
      blank?: boolean
      parentId?: string
      running?: boolean
      displayTitle?: string
      children?: { id: string }[]
    }[],
    current?: string,
  ): SessionListState {
    const byId: Record<string, unknown> = {}
    const projectionsBySession: Record<string, unknown> = {}
    for (const item of rows) {
      byId[item.id] = {
        id: item.id,
        displayTitle: item.displayTitle ?? item.id,
        running: item.running === true,
        blank: item.blank === true,
        retainedBy: item.id === current ? { mainView: 1 } : {},
        updatedAt: 0,
        ...(item.origin === undefined ? {} : { origin: item.origin }),
        ...(item.parentId === undefined ? {} : { parentId: item.parentId }),
      }
      if (item.children !== undefined) {
        projectionsBySession[item.id] = {
          values: { subagentCatalog: item.children.map((child) => ({ id: child.id })) },
          state: 'ready',
          error: null,
        }
      }
    }
    return {
      ids: rows.map((r) => r.id),
      byId,
      projectionsBySession,
      phase: 'ready',
    } as unknown as SessionListState
  }

  /** 造一个工作区视图 */
  function workspace(id: string, sessionIds: string[]): WorkspaceView {
    return {
      workspaceId: id,
      path: `/tmp/${id}`,
      title: id,
      sessionIds,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as WorkspaceView
  }

  it('buckets sessions under their owning workspace', () => {
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'b' }]),
      [workspace('w1', ['a']), workspace('w2', ['b'])],
    )

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
    expect(grouped.get('w2')?.map((s) => s.id)).toEqual(['b'])
  })

  it('hides subagent-origin sessions from the sidebar', () => {
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'child', origin: 'subagent' }]),
      [workspace('w1', ['a', 'child'])],
    )

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
  })

  it('hides an archived session that is still a workspace member', () => {
    // 归档不会把会话移出 workspace.sessionIds，因此必须按归档集过滤
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'archived' }]),
      [workspace('w1', ['a', 'archived'])],
      ['archived'],
    )

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
  })

  it('hides an archived session even when it is the current one', () => {
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'archived' }], 'archived'),
      [workspace('w1', ['a', 'archived'])],
      ['archived'],
    )

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
  })

  it('hides a blank session that is not the current one', () => {
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'blank', blank: true }]),
      [workspace('w1', ['a', 'blank'])],
    )

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
  })

  it('keeps the selected blank session as the provisional new-session row', () => {
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'blank', blank: true }], 'blank'),
      [workspace('w1', ['a', 'blank'])],
    )

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a', 'blank'])
  })

  it('leaves the blank session title empty for the renderer to name', () => {
    // 空白会话的存储标题取空串（官方 sessionTitle 同样如此），显示名由渲染期
    // 套语言包的固定名「新会话」，宿主给的后备标题（目录名）不能当成它的名字
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'blank', blank: true, displayTitle: 'w1' }], 'blank'),
      [workspace('w1', ['blank'])],
    )

    expect(grouped.get('w1')?.[0]?.title).toBe('')
  })

  it('shows the host summary title once the session is really started', () => {
    // 会话正式启用后宿主投影摘要标题，渲染行随之带上正式名字
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a', displayTitle: '修复登录超时' }]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.title).toBe('修复登录超时')
  })

  it('omits a workspace member absent from the session list', () => {
    const grouped = groupSessionsByWorkspace(listState([{ id: 'a' }]), [workspace('w1', ['a', 'gone'])])

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
  })

  it('counts a running subagent against its ancestor row', () => {
    // 子代理行自己隐藏，但它运行时祖先行要亮起运行点
    // 目录挂在父会话的宿主投影上，子代理自身的运行态仍在它自己的摘要里
    const grouped = groupSessionsByWorkspace(
      listState([
        { id: 'a', children: [{ id: 'child' }] },
        { id: 'child', origin: 'subagent', parentId: 'a', running: true },
      ]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(1)
  })

  it('counts every running direct child listed in the parent catalog', () => {
    const grouped = groupSessionsByWorkspace(
      listState([
        { id: 'a', children: [{ id: 'child' }, { id: 'other' }] },
        { id: 'child', origin: 'subagent', parentId: 'a', running: true },
        { id: 'other', origin: 'subagent', parentId: 'a', running: true },
      ]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(2)
  })

  it('does not count a finished subagent against its ancestor row', () => {
    const grouped = groupSessionsByWorkspace(
      listState([
        { id: 'a', children: [{ id: 'child' }] },
        { id: 'child', origin: 'subagent', parentId: 'a', running: false },
      ]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(0)
  })

  it('counts a child the status snapshot reports running before the summary does', () => {
    // 统一状态快照优先于摘要里的运行态，与官方 sessionNode 同一分工
    const sessions = listState([
      { id: 'a', children: [{ id: 'child' }] },
      { id: 'child', origin: 'subagent', parentId: 'a', running: false },
    ])
    const statuses = new Map([['child', { running: true }]]) as never

    const grouped = groupSessionsByWorkspace(sessions, [workspace('w1', ['a'])], [], statuses)

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(1)
  })

  it('reports zero subagents for an ordinary session', () => {
    const grouped = groupSessionsByWorkspace(listState([{ id: 'a' }]), [workspace('w1', ['a'])])

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(0)
  })
})

/**
 * 投影结果的身份稳定性
 *
 * 流式期间每次活动只替换发生变化的那条摘要，其余对象保持同一引用
 * 投影若每次都造新行对象，行级 memo 的逐格比对必然全部落空，长列表会在每次活动时逐行重算
 */
describe('session row identity', () => {
  function listStateOf(
    rows: { id: string; displayTitle?: string; updatedAt?: number }[],
    current?: string,
  ): SessionListState {
    const byId: Record<string, unknown> = {}
    for (const item of rows) {
      byId[item.id] = {
        id: item.id,
        displayTitle: item.displayTitle ?? item.id,
        running: false,
        blank: false,
        retainedBy: item.id === current ? { mainView: 1 } : {},
        updatedAt: item.updatedAt ?? 0,
      }
    }
    return { ids: rows.map((r) => r.id), byId, phase: 'ready' } as unknown as SessionListState
  }

  function workspaceOf(id: string, sessionIds: string[]): WorkspaceView {
    return {
      workspaceId: id,
      path: `/tmp/${id}`,
      title: id,
      sessionIds,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as WorkspaceView
  }

  it('reuses the row object when its summary is unchanged', () => {
    const sessions = listStateOf([{ id: 'a' }, { id: 'b' }])
    const first = groupSessionsByWorkspace(sessions, [workspaceOf('w1', ['a', 'b'])]).get('w1')
    const second = groupSessionsByWorkspace(sessions, [workspaceOf('w1', ['a', 'b'])]).get('w1')

    // 同一份摘要对象再次投影，必须得到同一个行对象，否则按引用比对的行级 memo 失效
    expect(second?.[0]).toBe(first?.[0])
    expect(second?.[1]).toBe(first?.[1])
  })

  it('gives a changed summary a new row object and leaves the rest alone', () => {
    const sessions = listStateOf([{ id: 'a' }, { id: 'b' }])
    const before = groupSessionsByWorkspace(sessions, [workspaceOf('w1', ['a', 'b'])]).get('w1')
    // 模拟一次流式活动：只替换 'a' 的摘要，'b' 保持同一引用
    const next = {
      ...sessions,
      byId: {
        ...(sessions.byId as Record<string, unknown>),
        a: { ...(sessions.byId as Record<string, unknown>)['a'] as object, updatedAt: 1 },
      },
    }
    const after = groupSessionsByWorkspace(next, [workspaceOf('w1', ['a', 'b'])]).get('w1')

    expect(after?.[0]).not.toBe(before?.[0])
    expect(after?.[0]?.updatedAt).toBe(1)
    // 未变的那条必须保持同一身份——它正是 memo 要挡下的行
    expect(after?.[1]).toBe(before?.[1])
  })

  it('rebuilds a row when the subagent count changes under it', () => {
    // 子代理运行数由别的会话与宿主投影决定，与自身摘要不同步，因此也要参与缓存的有效性判断
    const base = listStateOf([{ id: 'a' }])
    const before = groupSessionsByWorkspace(base, [workspaceOf('w1', ['a'])]).get('w1')
    const withChild = listStateOf([{ id: 'a' }])
    ;(withChild.byId as Record<string, unknown>)['child'] = {
      id: 'child',
      displayTitle: 'child',
      running: true,
      blank: false,
      retainedBy: {},
      updatedAt: 0,
      origin: 'subagent',
      parentId: 'a',
    }
    withChild.ids.push('child' as never)
    ;(withChild as unknown as { projectionsBySession: Record<string, unknown> }).projectionsBySession = {
      a: { values: { subagentCatalog: [{ id: 'child' }] }, state: 'ready', error: null },
    }
    const after = groupSessionsByWorkspace(withChild, [workspaceOf('w1', ['a'])]).get('w1')

    expect(before?.[0]?.runningSubagentCount).toBe(0)
    expect(after?.[0]?.runningSubagentCount).toBe(1)
  })
})

/**
 * 归组菜单上下文的比对
 *
 * 分组段每次渲染都是新的数组与对象，若按引用比对，整片列表的行级 memo 都会失效
 */
describe('sameGroupSections', () => {
  it('treats rebuilt sections with the same ids and names as equal', () => {
    const a = [{ id: 'g1', label: '前端', sessions: [] }]
    const b = [{ id: 'g1', label: '前端', sessions: [] }]

    expect(sameGroupSections(a, b)).toBe(true)
  })

  it('reports a renamed group as changed', () => {
    expect(
      sameGroupSections(
        [{ id: 'g1', label: '前端', sessions: [] }],
        [{ id: 'g1', label: '后端', sessions: [] }],
      ),
    ).toBe(false)
  })

  it('reports an added group as changed', () => {
    expect(
      sameGroupSections([{ id: 'g1', label: '前端', sessions: [] }], [
        { id: 'g1', label: '前端', sessions: [] },
        { id: 'g2', label: '后端', sessions: [] },
      ]),
    ).toBe(false)
  })

  it('treats a missing grouping as different from any list', () => {
    expect(sameGroupSections(undefined, [])).toBe(false)
    expect(sameGroupSections(undefined, undefined)).toBe(true)
  })
})

/**
 * 状态位的比对
 *
 * 状态位每次渲染都是新对象，按引用比会让每一行都判定为变过
 */
describe('sameSessionStatus', () => {
  it('treats equal states and labels as the same dot', () => {
    expect(sameSessionStatus({ state: 'ongoing', label: '进行中' }, { state: 'ongoing', label: '进行中' })).toBe(true)
  })

  it('reports a different label as changed', () => {
    expect(sameSessionStatus({ state: 'ongoing', label: '进行中' }, { state: 'ongoing', label: '已完成' })).toBe(false)
  })

  it('reports appearing and disappearing dots as changed', () => {
    expect(sameSessionStatus(undefined, { state: 'done', label: '已完成' })).toBe(false)
    expect(sameSessionStatus({ state: 'done', label: '已完成' }, undefined)).toBe(false)
    expect(sameSessionStatus(undefined, undefined)).toBe(true)
  })
})

/**
 * 根节点上的切分
 *
 * 与会话那一层同一套取舍，只是输入换成工作区列表与工作区分组定义
 */
describe('buildRootLayout', () => {
  /** 造一个工作区分组定义 */
  function wgroup(id: string, name: string, workspaceIds: string[]) {
    return { id, name, workspaceIds }
  }

  it('keeps a workspace inside its group in metadata order', () => {
    const layout = buildRootLayout(
      ['w1', 'w2', 'w3'],
      [wgroup('g1', '前端', ['w3', 'w1'])],
    )

    expect(layout.groups.map((section) => section.label)).toEqual(['前端'])
    expect(layout.groups[0]?.workspaceIds).toEqual(['w3', 'w1'])
    expect(layout.loose).toEqual(['w2'])
  })

  it('leaves every workspace loose when the user has created no group', () => {
    const layout = buildRootLayout(['w1', 'w2'], [])

    // 没有用户分组时这一层不改变任何行的位置：界面与没有这个功能时一致
    expect(layout.groups).toEqual([])
    expect(layout.loose).toEqual(['w1', 'w2'])
  })

  it('invents no ungrouped bucket of its own', () => {
    const layout = buildRootLayout(['w1', 'w2'], [wgroup('g1', '前端', ['w1'])])

    // 未归组的工作区平铺在分组之后，不占一个显式的区段
    expect(layout.groups.map((section) => section.id)).toEqual(['g1'])
    expect(layout.loose).toEqual(['w2'])
  })

  it('skips metadata entries whose workspace no longer exists', () => {
    const layout = buildRootLayout(['w1'], [wgroup('g1', '前端', ['w1', 'gone'])])

    expect(layout.groups[0]?.workspaceIds).toEqual(['w1'])
  })

  it('treats a workspace listed in two groups as belonging to the first only', () => {
    const layout = buildRootLayout(
      ['w1'],
      [wgroup('g1', '第一', ['w1']), wgroup('g2', '第二', ['w1'])],
    )

    expect(layout.groups[0]?.workspaceIds).toEqual(['w1'])
    expect(layout.groups[1]?.workspaceIds).toEqual([])
    // 被分组认领过的工作区不会再出现在平铺区，避免重复渲染
    expect(layout.loose).toEqual([])
  })

  it('renders an empty group rather than dropping it', () => {
    const layout = buildRootLayout([], [wgroup('g1', '空组', [])])

    // 空分组是「刚建完还没移入工作区」的通常状态，不能悄悄消失
    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.workspaceIds).toEqual([])
  })

  it('keeps a nested workspace in its group membership while rendering only the top', () => {
    // 一个项目下的工作区收进同一个虚拟分组之后，它们之间的层级照样渲染
    // 归组这件事不因内嵌而消失，菜单据此判断「它已经在这个分组里了」，不给它再列一次
    const paths: Record<string, string> = {
      repo: '/src/dsh_plugins',
      pkg: '/src/dsh_plugins/packages/dsh-workspace-plus',
    }
    const nesting = deriveNesting({
      enabled: true,
      workspaceIds: ['repo', 'pkg'],
      pathOf: (id) => paths[id],
      virtualOf: () => 'vg1',
      bindingOf: () => undefined,
      groupIdsOf: () => new Set<string>(),
    })
    const layout = buildRootLayout(
      ['repo', 'pkg'],
      [wgroup('vg1', 'dsh plugins', ['repo', 'pkg'])],
      nesting,
    )

    // 归属保住全量，渲染只列这一层的顶层
    expect(layout.groups[0]?.workspaceIds).toEqual(['repo', 'pkg'])
    expect(layout.groups[0]?.roots).toEqual(['repo'])
    // 归属查询读得到，菜单因此不会再列出它自己所在的那个分组
    expect(virtualWorkspaceIdOf(layout.groups, 'pkg')).toBe('vg1')
  })

  it('keeps group identity stable across rebuilds', () => {
    const groups = [wgroup('g1', '前端', ['w1']), wgroup('g2', '后端', [])]
    const first = buildRootLayout(['w1'], groups)
    const second = buildRootLayout(['w1'], groups)

    // 分组 id 必须逐次一致，否则展开折叠状态会每次都重置
    expect(first.groups.map((s) => s.id)).toEqual(second.groups.map((s) => s.id))
  })
})

describe('virtualWorkspaceIdOf', () => {
  it('reports the group that holds the workspace', () => {
    const sections = buildRootLayout(['w1', 'w2'], [
      { id: 'g1', name: '前端', workspaceIds: ['w1'] },
    ]).groups

    expect(virtualWorkspaceIdOf(sections, 'w1')).toBe('g1')
  })

  it('reports an empty id for a workspace outside every group', () => {
    const sections = buildRootLayout(['w1', 'w2'], [
      { id: 'g1', name: '前端', workspaceIds: ['w1'] },
    ]).groups

    // 空串对应菜单里的「不在任何工作区分组」这一事实
    expect(virtualWorkspaceIdOf(sections, 'w2')).toBe('')
  })

  it('reports an empty id when no group exists', () => {
    expect(virtualWorkspaceIdOf([], 'w1')).toBe('')
  })
})

/**
 * 两端版本错位
 *
 * 浏览器半边随热重载换新，宿主半边要重启 `dsh` 才换
 * 因此新客户端可能收到旧宿主回的、没有 `workspaceGroups` 这一格的快照
 * 缺格直接遍历会抛 `groups is not iterable`，把整片区域（对照模式下还包括承载它的右侧栏）打挂，这里固化降级行为
 */
describe('normalizeSnapshot', () => {
  it('fills in the grouping field a pre-upgrade host omits', () => {
    const normalized = normalizeSnapshot({ byWorkspace: {} })

    expect(normalized.workspaceGroups).toEqual([])
  })

  it('keeps a complete snapshot as it is', () => {
    const normalized = normalizeSnapshot({
      byWorkspace: { w1: [] },
      workspaceGroups: [{ id: 'wg1', name: '前端', workspaceIds: [] }],
    })

    expect(normalized.workspaceGroups.map((group) => group.id)).toEqual(['wg1'])
  })

  it('treats a non-array grouping field as absent', () => {
    // 字段在但形状不对时同样不能交给遍历
    expect(normalizeSnapshot({ workspaceGroups: null }).workspaceGroups).toEqual([])
    expect(normalizeSnapshot(undefined).workspaceGroups).toEqual([])
  })
})

describe('buildRootLayout with a pre-upgrade snapshot', () => {
  it('treats a missing grouping field as no workspace group', () => {
    // 旧宿主半边回的只有 byWorkspace 那一格
    const layout = buildRootLayout(['w1', 'w2'], undefined)

    expect(layout.groups).toEqual([])
    expect(layout.loose).toEqual(['w1', 'w2'])
  })

  it('keeps every workspace loose rather than throwing', () => {
    expect(() => buildRootLayout(['w1'], undefined)).not.toThrow()
  })
})
