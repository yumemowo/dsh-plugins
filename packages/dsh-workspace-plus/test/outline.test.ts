import { describe, expect, it } from 'vitest'
import { buildOutline, offsetOf, visibleRows } from '../src/client/data/outline.ts'
import type { OutlineInput } from '../src/client/data/outline.ts'
import { buildRootLayout, buildLayout } from '../src/client/data/layout.ts'
import { deriveNesting } from '../src/client/data/nest.ts'
import type { SessionRow } from '../src/client/data/types.ts'

/**
 * 扁平行序列
 *
 * 这一层是「界面上从上到下是什么」的唯一答案，因此这里逐条钉的是顺序、露面与高度
 */

const NOW = 1_000_000

/** 一条会话行 */
function row(id: string, updatedAt = NOW - 1000): SessionRow {
  return {
    id,
    title: '会话 ' + id,
    blank: false,
    running: false,
    runningSubagentCount: 0,
    completed: false,
    updatedAt,
  }
}

const WORKSPACE_IDS = ['ws-1', 'ws-2', 'ws-3', 'ws-4']
const PATHS: Record<string, string> = {
  'ws-1': '/repo',
  'ws-2': '/repo/pkg',
  'ws-3': '/elsewhere',
  'ws-4': '/third',
}
const VIRTUAL_GROUPS = [
  { id: 'vg-1', name: '甲', workspaceIds: ['ws-1', 'ws-2'] },
  { id: 'vg-2', name: '乙', workspaceIds: ['ws-3'] },
]

/** 一份输入的骨架：默认三层都展开、各段都折叠 */
function fixture(overrides: Partial<OutlineInput> = {}): OutlineInput {
  const nesting = deriveNesting({
    enabled: true,
    workspaceIds: WORKSPACE_IDS,
    pathOf: (id) => PATHS[id],
    virtualOf: (id) => (id === 'ws-1' || id === 'ws-2' ? 'vg-1' : id === 'ws-3' ? 'vg-2' : ''),
    bindingOf: () => undefined,
    groupIdsOf: (id) => (id === 'ws-1' ? new Set(['g1']) : new Set<string>()),
  })
  const rows: Record<string, SessionRow[]> = {
    'ws-1': [row('s1'), row('s2')],
    'ws-2': [row('s3')],
    'ws-3': [],
    'ws-4': [],
  }
  const groupsOf: Record<string, { id: string; name: string; sessionIds: string[] }[]> = {
    'ws-1': [{ id: 'g1', name: '分组甲', sessionIds: ['s1'] }],
  }
  const layouts = new Map<string, ReturnType<typeof buildLayout>>()
  const layoutOf = (workspaceId: string): ReturnType<typeof buildLayout> => {
    const cached = layouts.get(workspaceId)
    if (cached !== undefined) return cached
    const built = buildLayout(
      rows[workspaceId] ?? [],
      groupsOf[workspaceId] ?? [],
      () => [],
      nesting.looseChildIdsOf(workspaceId),
    )
    layouts.set(workspaceId, built)
    return built
  }

  return {
    rootLayout: buildRootLayout(WORKSPACE_IDS, VIRTUAL_GROUPS, nesting),
    workspaceLayoutOf: layoutOf,
    depthOf: (id) => nesting.levelOf(id),
    containers: {
      root: nesting.containers.root,
      virtualOf: nesting.containers.virtualOf,
      groupOf: nesting.containers.groupOf,
    },
    expansion: {
      isWorkspaceExpanded: () => true,
      isVirtualWorkspaceExpanded: () => true,
      isGroupExpanded: () => true,
    },
    isScopeExpanded: () => false,
    alwaysVisibleSessionIds: new Set<string>(),
    now: NOW,
    stray: [],
    hideStray: false,
    compareRows: (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
    keys: {
      workspaceHead: (id) => 'workspaceHead/' + id,
      workspaceBody: (id) => 'workspaceBody/' + id,
      workspaceRegion: (id) => 'workspaceRegion/' + id,
      sessionGroupHead: (w, g) => 'groupHead/' + w + '/' + g,
      sessionGroupZone: (w, g) => 'sessionGroup/' + w + '/' + g,
      sessionGroupRegion: (w, g) => 'sessionGroupRegion/' + w + '/' + g,
      virtualHead: (id) => 'virtualWorkspaceHead/' + id,
      virtualBody: (id) => 'virtualWorkspaceBody/' + id,
      virtualRegion: (id) => 'virtualRegion/' + id,
      loose: (id) => 'loose/' + id,
    },
    ...overrides,
  }
}

/** 行序列的简述：种类 + 身份，便于一眼看出顺序 */
function shape(rows: ReturnType<typeof buildOutline>): string[] {
  return rows.map((row) => {
    if (row.kind === 'session') return 'session:' + row.sessionId
    if (row.kind === 'workspaceHead') return 'workspace:' + row.workspaceId
    if (row.kind === 'virtualHead') return 'virtual:' + row.key.slice('virtual/'.length)
    if (row.kind === 'groupHead') return 'group:' + row.key.slice('group/'.length)
    return row.kind
  })
}

describe('buildOutline', () => {
  it('walks each root section before the loose ones', () => {
    const rows = buildOutline(fixture())

    // ws-2 按 cwd 挂在 ws-1 之下，因此它排在 ws-1 体内；它自己那行会话也跟着进来
    expect(shape(rows)).toEqual([
      'virtual:vg-1',
      'workspace:ws-1',
      'workspace:ws-2',
      'session:s3',
      'group:ws-1/g1',
      'session:s1',
      'session:s2',
      'virtual:vg-2',
      'workspace:ws-3',
      // 一条会话都没有的工作区给一个空态行，它也占高度
      'empty',
      'workspace:ws-4',
      'empty',
    ])
  })

  it('puts a child workspace ahead of the session groups of its parent', () => {
    const rows = buildOutline(fixture())

    expect(rows.findIndex((row) => row.key === 'workspace/ws-2')).toBeLessThan(
      rows.findIndex((row) => row.key === 'group/ws-1/g1'),
    )
  })

  it('marks the whole section as hidden while its virtual group is collapsed', () => {
    const rows = buildOutline(
      fixture({
        expansion: {
          isWorkspaceExpanded: () => true,
          isVirtualWorkspaceExpanded: () => false,
          isGroupExpanded: () => true,
        },
      }),
    )

    // 段头自己仍露面（它要能被点开），段内一行都不露面
    expect(rows.find((row) => row.key === 'virtual/vg-1')?.visible).toBe(true)
    expect(rows.find((row) => row.key === 'workspace/ws-1')?.visible).toBe(false)
    // 不在任何分组里的 ws-4 不受影响
    expect(rows.find((row) => row.key === 'workspace/ws-4')?.visible).toBe(true)
  })

  it('marks the body as hidden while its workspace is collapsed', () => {
    const rows = buildOutline(
      fixture({
        expansion: {
          isWorkspaceExpanded: (key) => key !== 'ws-1',
          isVirtualWorkspaceExpanded: () => true,
          isGroupExpanded: () => true,
        },
      }),
    )

    expect(rows.find((row) => row.key === 'workspace/ws-1')?.visible).toBe(true)
    expect(rows.find((row) => row.kind === 'groupHead')?.visible).toBe(false)
  })

  it('hides the sessions of a collapsed group but keeps its head', () => {
    const rows = buildOutline(
      fixture({
        expansion: {
          isWorkspaceExpanded: () => true,
          isVirtualWorkspaceExpanded: () => true,
          isGroupExpanded: () => false,
        },
      }),
    )

    expect(rows.find((row) => row.kind === 'groupHead')?.visible).toBe(true)
    const inGroup = rows.find((row) => row.kind === 'session' && row.scope?.kind === 'group')
    expect(inGroup?.visible).toBe(false)
    // 未归组那一段与分组无关，仍在
    const loose = rows.find((row) => row.kind === 'session' && row.scope?.kind === 'loose')
    expect(loose?.visible).toBe(true)
  })

  it('gives each row its own height including the lead', () => {
    const rows = buildOutline(fixture())
    const head = rows.find((row) => row.kind === 'workspaceHead')
    const session = rows.find((row) => row.kind === 'session')

    expect(head?.lead).toBe(2)
    expect(head?.height).toBe(34 + 2)
    expect(session?.height).toBe(32 + 2)
  })

  it('leaves the very first row of the list without a lead', () => {
    const rows = buildOutline(fixture())

    // 根节点第一项上方没有上一条，样式表那里也是 0
    expect(rows[0]?.lead).toBe(0)
  })

  it('gives the second workspace of a segment the wider lead', () => {
    // 关掉嵌套且谁都不在谁体内：这一段的两条都是顶层，第二条与前一条之间是 4
    const nesting = deriveNesting({
      enabled: false,
      workspaceIds: ['ws-1', 'ws-2'],
      pathOf: () => undefined,
      virtualOf: () => 'vg-1',
      bindingOf: () => undefined,
      groupIdsOf: () => new Set<string>(),
    })
    const emptyLayout = { groups: [], loose: [], children: [] }
    const rows = buildOutline({
      ...fixture(),
      rootLayout: buildRootLayout(
        ['ws-1', 'ws-2'],
        [{ id: 'vg-1', name: '甲', workspaceIds: ['ws-1', 'ws-2'] }],
        nesting,
      ),
      workspaceLayoutOf: () => emptyLayout,
      depthOf: () => 0,
      containers: {
        root: nesting.containers.root,
        virtualOf: nesting.containers.virtualOf,
        groupOf: nesting.containers.groupOf,
      },
    })

    const heads = rows.filter((row) => row.kind === 'workspaceHead')
    expect(heads.map((row) => row.lead)).toEqual([2, 4])
  })

  it('keeps a nested workspace inside the lead band of its parent', () => {
    // 子工作区排在父工作区体内，它与父工作区之间只有段内那 2px，不拉宽
    const rows = buildOutline(fixture())

    expect(rows.find((row) => row.key === 'workspace/ws-2')?.lead).toBe(2)
  })

  it('adds an overflow row only while a section hides something', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const rowsOf = many.map((id) => row(id, NOW - (many.indexOf(id) + 1) * 60_000))
    const base = fixture()
    const collapsed = buildOutline({
      ...base,
      workspaceLayoutOf: (id) =>
        id === 'ws-1' ? { groups: [], loose: rowsOf, children: [] } : base.workspaceLayoutOf(id),
    })

    const overflow = collapsed.filter(
      (row) => row.kind === 'overflow' && row.scope?.kind === 'loose' && row.workspaceId === 'ws-1',
    )
    expect(overflow).toHaveLength(1)
    const shown = collapsed.filter(
      (row) => row.kind === 'session' && row.scope?.kind === 'loose' && row.workspaceId === 'ws-1',
    )
    expect(shown).toHaveLength(5)
  })

  it('lists every row while its section is expanded', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const rowsOf = many.map((id) => row(id, NOW - (many.indexOf(id) + 1) * 60_000))
    const base = fixture()
    const expanded = buildOutline({
      ...base,
      isScopeExpanded: (ref) => ref.kind === 'loose' && ref.workspaceId === 'ws-1',
      workspaceLayoutOf: (id) =>
        id === 'ws-1' ? { groups: [], loose: rowsOf, children: [] } : base.workspaceLayoutOf(id),
    })

    const shown = expanded.filter(
      (row) => row.kind === 'session' && row.workspaceId === 'ws-1' && row.scope?.kind === 'loose',
    )
    expect(shown).toHaveLength(7)
    // 按钮仍在：它此刻是「收起」那一档，与 SessionList 同一判据
    const overflow = expanded.filter(
      (row) => row.kind === 'overflow' && row.workspaceId === 'ws-1' && row.scope?.kind === 'loose',
    )
    expect(overflow).toHaveLength(1)
    expect(overflow[0]?.visible).toBe(true)
  })

  it('keeps the ungrouped bucket after every workspace', () => {
    const rows = buildOutline(fixture({ stray: [row('u1')] }))

    expect(shape(rows).slice(-2)).toEqual(['strayHead', 'session:u1'])
  })

  it('drops the ungrouped bucket while focused', () => {
    const rows = buildOutline(fixture({ stray: [row('u1')], hideStray: true }))

    expect(rows.some((row) => row.kind === 'strayHead')).toBe(false)
  })

  it('gives every row a unique key', () => {
    const rows = buildOutline(fixture({ stray: [row('u1')] }))
    const keys = rows.map((row) => row.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('hands back only the rows that are showing', () => {
    const rows = buildOutline(
      fixture({
        expansion: {
          isWorkspaceExpanded: (key) => key !== 'ws-1',
          isVirtualWorkspaceExpanded: () => true,
          isGroupExpanded: () => true,
        },
      }),
    )

    const shown = visibleRows(rows)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every((row) => row.visible)).toBe(true)
    // 收起的工作区那条仍在序列里，只是不在这一份里
    expect(rows.some((row) => !row.visible)).toBe(true)
  })

  it('counts only the showing rows into the offset', () => {
    const rows = buildOutline(
      fixture({
        expansion: {
          isWorkspaceExpanded: (key) => key !== 'ws-1',
          isVirtualWorkspaceExpanded: () => true,
          isGroupExpanded: () => true,
        },
      }),
    )
    const target = rows[rows.length - 1]
    const expected = rows
      .slice(0, rows.length - 1)
      .filter((row) => row.visible)
      .reduce((total, row) => total + row.height, 0)

    expect(offsetOf(rows, target?.key ?? '')).toBe(expected)
    expect(offsetOf(rows, 'no-such-row')).toBeUndefined()
  })
})
