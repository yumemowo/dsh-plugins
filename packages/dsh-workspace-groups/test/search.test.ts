import { describe, expect, it } from 'vitest'
import {
  SEARCH_QUERY_MAX_CODE_UNITS,
  sanitizeSearchQuery,
  searchSessions,
} from '../src/client/data/search.ts'
import type { Group } from '../src/client/remote.ts'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

/** 造一份会话列表快照 */
function listState(
  rows: {
    id: string
    displayTitle?: string
    updatedAt?: number
    blank?: boolean
    origin?: 'subagent'
  }[],
  current?: string,
): SessionListState {
  const byId: Record<string, unknown> = {}
  for (const item of rows) {
    byId[item.id] = {
      id: item.id,
      displayTitle: item.displayTitle ?? item.id,
      running: false,
      blank: item.blank === true,
      updatedAt: item.updatedAt ?? 0,
      ...(item.origin === undefined ? {} : { origin: item.origin }),
    }
  }
  return {
    ids: rows.map((row) => row.id),
    byId,
    current,
    phase: 'ready',
  } as unknown as SessionListState
}

/** 造一个工作区视图 */
function workspace(id: string, title: string, sessionIds: string[]): WorkspaceView {
  return {
    workspaceId: id,
    path: `/tmp/${id}`,
    title,
    sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as WorkspaceView
}

/** 造一个分组定义 */
function group(id: string, name: string, sessionIds: string[]): Group {
  return { id, name, sessionIds }
}

/** 一条结果的路径文案，供断言 */
function pathOf(
  result: ReturnType<typeof searchSessions>,
  index: number,
): { workspace?: string; group?: string } {
  const match = result.matches[index]
  return {
    ...(match?.workspace === undefined ? {} : { workspace: match.workspace.title }),
    ...(match?.group === undefined ? {} : { group: match.group.name }),
  }
}

describe('sanitizeSearchQuery', () => {
  it('drops NUL characters that the wire contract forbids', () => {
    expect(sanitizeSearchQuery('a\0b')).toBe('ab')
  })

  it('leaves a query inside the code-unit bound untouched', () => {
    const query = 'x'.repeat(SEARCH_QUERY_MAX_CODE_UNITS)

    expect(sanitizeSearchQuery(query)).toBe(query)
  })

  it('truncates an over-long query at the wire bound', () => {
    const query = 'x'.repeat(SEARCH_QUERY_MAX_CODE_UNITS + 50)

    expect(sanitizeSearchQuery(query)).toHaveLength(SEARCH_QUERY_MAX_CODE_UNITS)
  })

  it('never splits a surrogate pair at the truncation point', () => {
    // 上限前一个码元是高代理、上限处是低代理：整对一起留下或一起去掉，
    // 否则后端会拿到一个孤立代理
    const query = 'x'.repeat(SEARCH_QUERY_MAX_CODE_UNITS - 1) + '\u{1f600}'

    const sanitized = sanitizeSearchQuery(query)

    expect(sanitized).toHaveLength(SEARCH_QUERY_MAX_CODE_UNITS - 1)
    expect(sanitized.charCodeAt(sanitized.length - 1)).toBeLessThan(0xd800)
  })
})

describe('searchSessions', () => {
  const workspaces = [workspace('w1', '前端仓库', ['a', 'b', 'c'])]

  it('returns nothing for an empty or whitespace-only query', () => {
    const sessions = listState([{ id: 'a', displayTitle: '修复登录' }])

    expect(searchSessions(sessions, workspaces, {}, [], '', 20)).toEqual({
      matches: [],
      hasMore: false,
    })
    expect(searchSessions(sessions, workspaces, {}, [], '   ', 20).matches).toEqual([])
  })

  it('matches on the session title case-insensitively', () => {
    const sessions = listState([
      { id: 'a', displayTitle: 'Fix Login Timeout' },
      { id: 'b', displayTitle: '更新文档' },
    ])

    const result = searchSessions(sessions, workspaces, {}, [], 'login', 20)

    expect(result.matches.map((match) => match.row.id)).toEqual(['a'])
  })

  it('matches the workspace title as well, like the official local pass', () => {
    const sessions = listState([
      { id: 'a', displayTitle: '无关标题' },
      { id: 'b', displayTitle: '另一个' },
    ])

    // 官方本地那一段是「会话标题 或 工作区标题」，输入工作区名要能列出其会话
    const result = searchSessions(sessions, workspaces, {}, [], '前端', 20)

    expect(result.matches.map((match) => match.row.id)).toEqual(['a', 'b'])
  })

  it('orders matches by recency with the id as the tie-break', () => {
    const sessions = listState([
      { id: 'b', displayTitle: '命中 b', updatedAt: 100 },
      { id: 'a', displayTitle: '命中 a', updatedAt: 300 },
      { id: 'c', displayTitle: '命中 c', updatedAt: 100 },
    ])

    const result = searchSessions(sessions, workspaces, {}, [], '命中', 20)

    // 时间相同时按 id 排，因此结果与宿主给的列表顺序无关
    expect(result.matches.map((match) => match.row.id)).toEqual(['a', 'b', 'c'])
  })

  it('carries the owning workspace and group on each match', () => {
    const sessions = listState([{ id: 'a', displayTitle: '命中' }])
    const groups = { w1: [group('g1', '前端', ['a'])] }

    const result = searchSessions(sessions, workspaces, groups, [], '命中', 20)

    expect(pathOf(result, 0)).toEqual({ workspace: '前端仓库', group: '前端' })
  })

  it('leaves the group off when the session is not in any group', () => {
    const sessions = listState([{ id: 'b', displayTitle: '命中' }])
    const groups = { w1: [group('g1', '前端', ['a'])] }

    const result = searchSessions(sessions, workspaces, groups, [], '命中', 20)

    expect(pathOf(result, 0)).toEqual({ workspace: '前端仓库' })
  })

  it('leaves the workspace off for a session outside every workspace', () => {
    const sessions = listState([{ id: 'orphan', displayTitle: '命中' }])

    // 无所属工作区的会话没有工作区标题可匹配，但仍要能被自己的标题搜到
    const result = searchSessions(sessions, workspaces, {}, [], '命中', 20)

    expect(pathOf(result, 0)).toEqual({})
  })

  it('keeps archived, subagent and idle blank sessions out of the results', () => {
    const sessions = listState([
      { id: 'a', displayTitle: '命中' },
      { id: 'archived', displayTitle: '命中' },
      { id: 'sub', displayTitle: '命中', origin: 'subagent' },
      { id: 'blank', displayTitle: '命中', blank: true },
    ])
    const withAll = [workspace('w1', '前端仓库', ['a', 'archived', 'sub', 'blank'])]

    const result = searchSessions(sessions, withAll, {}, ['archived'], '命中', 20)

    // 可见性规则与渲染列表同一处，归档 / 子代理 / 空闲的空白行都不进结果
    expect(result.matches.map((match) => match.row.id)).toEqual(['a'])
  })

  it('keeps the selected blank session out of the results as well', () => {
    const sessions = listState([{ id: 'blank', displayTitle: '命中', blank: true }], 'blank')

    // 空白行是「准备开始一个新会话」的占位，即使它是当前选中项也没有可搜的标题
    const result = searchSessions(
      sessions,
      [workspace('w1', '前端仓库', ['blank'])],
      {},
      [],
      '命中',
      20,
    )

    expect(result.matches).toEqual([])
  })

  it('caps the page and reports the remaining matches', () => {
    const sessions = listState(
      Array.from({ length: 5 }, (_, index) => ({ id: `s${index}`, displayTitle: '命中' })),
    )
    const withAll = [workspace('w1', '前端仓库', ['s0', 's1', 's2', 's3', 's4'])]

    const result = searchSessions(sessions, withAll, {}, [], '命中', 2)

    expect(result.matches).toHaveLength(2)
    expect(result.hasMore).toBe(true)
  })

  it('reports no remainder when the page holds every match', () => {
    const sessions = listState([{ id: 'a', displayTitle: '命中' }])

    const result = searchSessions(sessions, workspaces, {}, [], '命中', 20)

    expect(result.matches).toHaveLength(1)
    expect(result.hasMore).toBe(false)
  })
})
