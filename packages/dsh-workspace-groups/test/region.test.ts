import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  buildRootLayout,
  containsSession,
  groupIdOfSession,
  sameGroupSections,
  virtualWorkspaceIdOf,
} from '../src/client/data/layout.ts'
import { sameSessionStatus } from '../src/client/data/status.ts'
import { groupSessionsByWorkspace, straySessions } from '../src/client/data/sessions.ts'
import {
  buildGroupMenuItems,
  buildRowContextMenuItems,
  buildSessionMenuItems,
  buildVirtualWorkspaceMenuItem,
  buildVirtualWorkspaceMenuItems,
  buildWorkspaceMenuItems,
} from '../src/client/menus.tsx'
import type { SessionRow } from '../src/client/data/types.ts'
import { officialSessionLabels } from '../src/client/official.ts'
import { normalizeSnapshot } from '../src/client/remote.ts'
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
  /** 造分组段输入；分组顺序即传入顺序 */
  function grouping(currentGroupId: string) {
    return {
      sections: [
        { id: 'g1', label: '前端', sessions: [] },
        { id: 'g2', label: '后端', sessions: [] },
        { id: 'g3', label: '工具', sessions: [] },
      ],
      currentGroupId,
      groupLabel: '分组',
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

    // 分隔线是用来分两段的；只有一段时它是多余的空行
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
        groupLabel: '分组',
        ungroupLabel: '取消分组',
      },
    }
    const items = buildSessionMenuItems(input)

    const groupItem = items[0] as { disabled?: boolean }
    expect(groupItem.disabled).toBe(true)
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

    // 右键是 `...` 的捷径：除新增项外，条目对象必须是同一批，否则同一个动作
    // 会在两个入口下各走一套
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

    expect(icon?.type()).toBe('IconNewChatOutline16')
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

    // 官方管理菜单是「重命名、删除」；本包自有的建组项排在最前
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

    // 改名紧挨在「新建分组」之后、归类操作之前；未归组时没有「移出」这一格
    expect(items.map((item) => (item as { id?: string }).id)).toEqual([
      'new-group',
      'rename',
      'move-virtual-workspace',
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
      'move-virtual-workspace',
      'ungroup-workspace',
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
 * 建组与移入合成一条动作：入口在工作区行上，用户点下去要么放进已有分组、
 * 要么先建一个再放，因此二级菜单把「新建 → 各分组 → 移出」三段排在一起
 */
describe('buildVirtualWorkspaceMenuItem', () => {
  /** 造选项集；分组顺序即传入顺序 */
  function input(currentGroupId: string) {
    return {
      sections: [
        { id: 'wg1', label: '前端', workspaceIds: ['w1'] },
        { id: 'wg2', label: '后端', workspaceIds: [] },
        { id: 'wg3', label: '工具', workspaceIds: [] },
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
    expect(item.label).toBe('移动到…')
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
    // 「移出」不是「移动」：它由工作区菜单作为一级项渲染，见
    // buildWorkspaceMenuItems 的「shows ungroup right below move-to」一例
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

    // 「新建分组」是工作区行的事；分组行的高频建造操作是行内 `+`
    expect(items.some((item) => (item as { id?: string }).id === 'new-group')).toBe(false)
  })
})

describe('straySessions', () => {
  /** 造一份最小可用的会话列表状态 */
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
        updatedAt: 0,
        ...(item.origin === undefined ? {} : { origin: item.origin }),
      }
    }
    return { ids: rows.map((r) => r.id), byId, current, phase: 'ready' } as unknown as SessionListState
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

    // 平时每个会话都有归属，隐式「未分组」区段因此不出现。
    expect(stray).toEqual([])
  })

  it('collects a session left behind by a deleted workspace', () => {
    // 删除工作区只移除注册：会话记录还在，但不再属于任何工作区。
    const stray = straySessions(listState([{ id: 'orphan' }]), [])

    expect(stray.map((row) => row.id)).toEqual(['orphan'])
  })

  it('keeps a workspace member out of the ungrouped bucket even when hidden', () => {
    // 归档会话仍在 workspace.sessionIds 里，不能因为「不可见」就掉进未分组桶。
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
  /** 造一份最小可用的会话列表状态 */
  function listState(
    rows: {
      id: string
      origin?: 'subagent'
      blank?: boolean
      parentId?: string
      running?: boolean
      displayTitle?: string
    }[],
    current?: string,
  ): SessionListState {
    const byId: Record<string, unknown> = {}
    for (const item of rows) {
      byId[item.id] = {
        id: item.id,
        displayTitle: item.displayTitle ?? item.id,
        running: item.running === true,
        blank: item.blank === true,
        updatedAt: 0,
        ...(item.origin === undefined ? {} : { origin: item.origin }),
        ...(item.parentId === undefined ? {} : { parentId: item.parentId }),
      }
    }
    return { ids: rows.map((r) => r.id), byId, current, phase: 'ready' } as unknown as SessionListState
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
    // 归档不会把会话移出 workspace.sessionIds，因此必须按归档集过滤。
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
    // 套语言包的固定名「新会话」；宿主给的后备标题（目录名）不能当成它的名字
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
    // 子代理行自己隐藏，但它运行时祖先行要亮起运行点。
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'child', origin: 'subagent', parentId: 'a', running: true }]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(1)
  })

  it('counts nested running subagents against every ancestor', () => {
    const grouped = groupSessionsByWorkspace(
      listState([
        { id: 'a' },
        { id: 'child', origin: 'subagent', parentId: 'a', running: true },
        { id: 'grandchild', origin: 'subagent', parentId: 'child', running: true },
      ]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(2)
  })

  it('does not count a finished subagent against its ancestor row', () => {
    const grouped = groupSessionsByWorkspace(
      listState([{ id: 'a' }, { id: 'child', origin: 'subagent', parentId: 'a', running: false }]),
      [workspace('w1', ['a'])],
    )

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(0)
  })

  it('reports zero subagents for an ordinary session', () => {
    const grouped = groupSessionsByWorkspace(listState([{ id: 'a' }]), [workspace('w1', ['a'])])

    expect(grouped.get('w1')?.[0]?.runningSubagentCount).toBe(0)
  })
})

/**
 * 投影结果的身份稳定性
 *
 * 流式期间每次活动只替换发生变化的那条摘要，其余对象保持同一引用。投影若每次都
 * 造新行对象，行级 memo 的逐格比对必然全部落空，长列表会在每次活动时逐行重算
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
        updatedAt: item.updatedAt ?? 0,
      }
    }
    return { ids: rows.map((r) => r.id), byId, current, phase: 'ready' } as unknown as SessionListState
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
    // 子代理运行数由别的会话决定，与自身摘要不同步，因此也要参与缓存的有效性判断
    const base = listStateOf([{ id: 'a' }])
    const before = groupSessionsByWorkspace(base, [workspaceOf('w1', ['a'])]).get('w1')
    const withChild = listStateOf([{ id: 'a' }])
    ;(withChild.byId as Record<string, unknown>)['child'] = {
      id: 'child',
      displayTitle: 'child',
      running: true,
      blank: false,
      updatedAt: 0,
      origin: 'subagent',
      parentId: 'a',
    }
    withChild.ids.push('child' as never)
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
 * 浏览器半边随热重载换新，宿主半边要重启 `dsh` 才换，因此新客户端可能收到旧宿主
 * 回的、没有 `workspaceGroups` 这一格的快照。缺格直接遍历会抛 `groups is not
 * iterable`，把整片区域（对照模式下还包括承载它的右侧栏）打挂——这里固化降级行为
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
