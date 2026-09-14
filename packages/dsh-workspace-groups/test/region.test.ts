import { describe, expect, it } from 'vitest'
import {
  buildLayout,
  containsSession,
  groupIdOfSession,
} from '../src/client/data/layout.ts'
import { groupSessionsByWorkspace, straySessions } from '../src/client/data/sessions.ts'
import { buildSessionMenuItems, buildWorkspaceMenuItems } from '../src/client/menus.tsx'
import type { SessionRow } from '../src/client/data/types.ts'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

/** 造一行会话渲染数据。 */
function row(id: string, title = id): SessionRow {
  return { id, title, blank: false, running: false, completed: false, updatedAt: 0 }
}

/** 造一个分组定义。 */
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

    // 没有用户分组时不应凭空出现分组结构，会话直接平铺。
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
    // 被分组认领过的会话不会再出现在平铺区，避免重复渲染。
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

    // 分组 id 必须逐次一致，否则展开折叠状态会每次都重置。
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

    // 空串对应选择器里的「未分组」选项。
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
    // 没有选中会话时不应把文件夹染成强调色。
    expect(containsSession([row('a')], undefined)).toBe(false)
  })

  it('reports false for an empty workspace', () => {
    expect(containsSession([], 'a')).toBe(false)
  })
})

describe('buildSessionMenuItems', () => {
  /** 造菜单输入；分组顺序即传入顺序。 */
  function menuInput(currentGroupId: string) {
    return {
      sections: [
        { id: 'g1', label: '前端', sessions: [] },
        { id: 'g2', label: '后端', sessions: [] },
        { id: 'g3', label: '工具', sessions: [] },
      ],
      currentGroupId,
      label: '分组',
      ungroupLabel: '取消分组',
    }
  }

  it('keeps submenu groups in workspace view order', () => {
    const items = buildSessionMenuItems(menuInput(''))

    const groupItem = items[0] as { submenu?: { id: string }[] }
    expect(groupItem.submenu?.map((entry) => entry.id)).toEqual(['group:g1', 'group:g2', 'group:g3'])
  })

  it('hides the session own group from the submenu', () => {
    const items = buildSessionMenuItems(menuInput('g2'))

    const groupItem = items[0] as { submenu?: { id: string }[] }
    expect(groupItem.submenu?.map((entry) => entry.id)).toEqual(['group:g1', 'group:g3'])
  })

  it('shows the ungroup action right below the group item when grouped', () => {
    const items = buildSessionMenuItems(menuInput('g2'))

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['group', 'ungroup'])
  })

  it('omits the ungroup action when the session is loose', () => {
    const items = buildSessionMenuItems(menuInput(''))

    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['group'])
  })

  it('disables the group item when no other group exists', () => {
    const input = {
      sections: [{ id: 'g1', label: '前端', sessions: [] }],
      currentGroupId: 'g1',
      label: '分组',
      ungroupLabel: '取消分组',
    }
    const items = buildSessionMenuItems(input)

    const groupItem = items[0] as { disabled?: boolean }
    expect(groupItem.disabled).toBe(true)
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

    // 官方管理菜单是「重命名、删除」；本包自有的建组项排在最前。
    expect(items.map((item) => (item as { id?: string }).id)).toEqual(['new-group', 'rename', 'delete'])
  })

  it('marks only the delete entry as dangerous', () => {
    const items = buildWorkspaceMenuItems(labels) as readonly { id: string; danger?: boolean }[]

    expect(items.filter((item) => item.danger === true).map((item) => item.id)).toEqual(['delete'])
  })

  it('keeps new group out of the row and inside the menu', () => {
    const items = buildWorkspaceMenuItems(labels)

    // 「新建分组」不是高频操作，因此不占行内位置（行内只有 `...` 与 `+`）。
    expect(items[0]).toMatchObject({ id: 'new-group', label: '新建分组' })
  })
})

describe('straySessions', () => {
  /** 造一份最小可用的会话列表状态。 */
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

  /** 造一个工作区视图。 */
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
  /** 造一份最小可用的会话列表状态。 */
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

  /** 造一个工作区视图。 */
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

  it('omits a workspace member absent from the session list', () => {
    const grouped = groupSessionsByWorkspace(listState([{ id: 'a' }]), [workspace('w1', ['a', 'gone'])])

    expect(grouped.get('w1')?.map((s) => s.id)).toEqual(['a'])
  })
})
