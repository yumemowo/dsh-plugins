import { describe, expect, it } from 'vitest'
import { buildOutline } from '../src/client/data/outline.ts'
import type { OutlineInput } from '../src/client/data/outline.ts'
import { deriveNesting } from '../src/client/data/nest.ts'
import type { SessionRow } from '../src/client/data/types.ts'
import { virtualAddress } from '../src/rootEntry.ts'

/**
 * 扁平行序列
 *
 * 逐条钉顺序、露面与高度：这三样错了界面只是错位或高度不对，不会有任何报错
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
  return {
    workspaceIds: WORKSPACE_IDS,
    virtualGroups: VIRTUAL_GROUPS,
    rowsOf: (workspaceId) => rows[workspaceId] ?? [],
    groupsOf: (workspaceId) => groupsOf[workspaceId] ?? [],
    nesting,
    isScopeExpanded: () => false,
    alwaysVisibleSessionIds: new Set<string>(),
    now: NOW,
    stray: [],
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

    // ws-2 按 cwd 挂在 ws-1 之下，因此它排在 ws-1 体内，它自己那行会话也跟着进来
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

  it('adds an overflow row only while a section hides something', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const rowsOf = many.map((id) => row(id, NOW - (many.indexOf(id) + 1) * 60_000))
    const base = fixture()
    const collapsed = buildOutline({
      ...base,
      rowsOf: (id) => (id === 'ws-1' ? rowsOf : base.rowsOf(id)),
      groupsOf: (id) => (id === 'ws-1' ? [] : base.groupsOf(id)),
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
      rowsOf: (id) => (id === 'ws-1' ? rowsOf : base.rowsOf(id)),
      groupsOf: (id) => (id === 'ws-1' ? [] : base.groupsOf(id)),
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
  })

  it('keeps the ungrouped bucket after every workspace', () => {
    const rows = buildOutline(fixture({ stray: [row('u1')] }))

    expect(shape(rows).slice(-2)).toEqual(['strayHead', 'session:u1'])
  })

  it('keeps the ungrouped bucket out of a focused screen', () => {
    // 聚焦时那一片内容之外的东西整段不进序列，「未分组」桶正是其中之一
    const rows = buildOutline(fixture({ stray: [row('u1')], focused: virtualAddress('vg-1') }))

    expect(rows.some((row) => row.kind === 'strayHead')).toBe(false)
    // 守一手：这份夹具在有未分组会话时会列出那一段，否则上面那条在「本来就没有」时假通过
    expect(buildOutline(fixture({ stray: [row('u1')] })).some((row) => row.kind === 'strayHead')).toBe(true)
  })

  it('gives every row a unique key', () => {
    const rows = buildOutline(fixture({ stray: [row('u1')] }))
    const keys = rows.map((row) => row.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps the same rows no matter which containers are collapsed', () => {
    // 折叠态不在这条序列上：收起走的是撑开体的轨道高度，内容始终留在文档里
    // 序列因此只答「有哪些行、按什么顺序」，答不出「此刻看得见几条」
    const rows = buildOutline(fixture())

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
      'empty',
      'workspace:ws-4',
      'empty',
    ])
  })

  it('keeps every row under a header that exists, depth first', () => {
    // 渲染按 ownerKey 逐层展开，因此这一格必须自洽
    // 每行的归属要么是最外层，要么是一条真实存在的题头行，且题头在序列里按深度优先收口
    const rows = buildOutline(fixture({ stray: [row('u1')] }))
    const stack: string[] = []

    for (const each of rows) {
      // 回到这行该在的那一层：一路弹出已经收口的题头
      while (stack.length > 0 && stack[stack.length - 1] !== each.ownerKey) stack.pop()
      expect(
        stack.length > 0 || each.ownerKey === '',
        'owner "' + each.ownerKey + '" is not open at row "' + each.key + '"',
      ).toBe(true)
      // 题头自己收得下东西，子工作区与分组都要能被逐层展开
      const opens =
        each.kind === 'workspaceHead' ||
        each.kind === 'groupHead' ||
        each.kind === 'virtualHead' ||
        each.kind === 'strayHead'
      if (opens) stack.push(each.key)
    }

    // 守一手：这份夹具确实有嵌套，否则上面那条在平铺序列上恒真
    expect(rows.filter((each) => each.ownerKey !== '').length).toBeGreaterThan(0)
  })
})
