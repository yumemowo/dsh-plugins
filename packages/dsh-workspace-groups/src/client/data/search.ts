/**
 * 搜索：只按标题匹配的本地结果
 *
 * 官方 `ui-workspace` 的搜索是「本地标题匹配 + Host 内容检索」两段合并，本包只做前一段
 * 匹配对象是会话标题与工作区标题，与官方本地那一段同一口径
 * 不接 `session.search`，因此没有摘录，也没有加载与失败两态
 *
 * 排序与条数上限照官方：按最近更新倒序、id 作稳定次序，并按 `session.search` 的响应上限截断
 * 被截断时由调用方给出「缩小搜索范围」的提示
 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { Group } from '../remote.ts'
import { groupSessionsByWorkspace, straySessions } from './sessions.ts'
import type { SessionRow } from './types.ts'

/** `session.search` 线上的查询长度上限，按 JavaScript UTF-16 码元计 */
export const SEARCH_QUERY_MAX_CODE_UNITS = 500

/**
 * 把一个输入值收进线上的查询契约
 *
 * 去掉 NUL 并按码元数截断；截断点上若正落在一个代理对中间就少取一个码元，否则半个字符会让后端拿到一个孤立代理
 */
export function sanitizeSearchQuery(value: string): string {
  const withoutNul = value.replaceAll('\0', '')
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul
  let end = SEARCH_QUERY_MAX_CODE_UNITS
  const last = withoutNul.charCodeAt(end - 1)
  const next = withoutNul.charCodeAt(end)
  if (last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--
  return withoutNul.slice(0, end)
}

/**
 * 一条命中的会话及其归属
 *
 * 归属带上 id 与显示名两份：显示名给结果行拼路径，id 供「打开结果」把这条会话所在的折叠层展开
 * 按名字反查既不可靠（工作区可重名）也会多一次查找
 */
export interface SearchMatch {
  row: SessionRow
  /** 会话所属工作区；无所属工作区时缺省 */
  workspace?: { id: string; title: string }
  /** 会话所属分组；未归组时缺省 */
  group?: { id: string; name: string }
}

/** 一次搜索的结果页 */
export interface SessionSearchResult {
  /** 按最近更新倒序的结果，已按上限截断 */
  matches: SearchMatch[]
  /** 是否还有被上限截掉的结果 */
  hasMore: boolean
}

/** 最近更新在前，id 作稳定次序（id 在列表里唯一） */
function byRecency(a: SearchMatch, b: SearchMatch): number {
  if (b.row.updatedAt !== a.row.updatedAt) return b.row.updatedAt - a.row.updatedAt
  return a.row.id < b.row.id ? -1 : 1
}

/**
 * 会话标题或所属工作区标题包含查询词即命中
 * @param workspaceTitle - 该会话所属工作区的显示名；无所属工作区时缺省
 * @param query - 已转小写的查询词
 */
function matchesQuery(
  row: SessionRow,
  workspaceTitle: string | undefined,
  query: string,
): boolean {
  if (row.title.toLowerCase().includes(query)) return true
  return workspaceTitle !== undefined && workspaceTitle.toLowerCase().includes(query)
}

/**
 * 取一个工作区里「会话 → 所属分组」的索引
 *
 * 元数据里一个会话可能被两个分组同时记录，与渲染布局取同一取舍：以先出现的分组为准
 * @returns 会话 id 到所属分组的映射
 */
function groupsOf(groups: readonly Group[]): Map<string, { id: string; name: string }> {
  const bySession = new Map<string, { id: string; name: string }>()
  for (const group of groups) {
    for (const id of group.sessionIds) {
      if (!bySession.has(id)) bySession.set(id, { id: group.id, name: group.name })
    }
  }
  return bySession
}

/**
 * 在会话列表里按标题搜索
 *
 * 候选与渲染列表同源：归档、子代理来源与空闲的空白会话都不进结果，可见性规则因此只有一处（`data/sessions.ts`）
 * 无所属工作区的会话按官方的回退名渲染，但它本身没有工作区标题可匹配
 * @param query - 调用方输入；首尾空白忽略
 * @param limit - 结果条数上限
 * @returns 命中的结果页；查询为空时没有结果
 */
export function searchSessions(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  groups: Readonly<Record<string, readonly Group[]>>,
  archivedSessionIds: readonly string[],
  query: string,
  limit: number,
): SessionSearchResult {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return { matches: [], hasMore: false }

  const rowsByWorkspace = groupSessionsByWorkspace(sessions, workspaces, archivedSessionIds)
  const matches: SearchMatch[] = []

  for (const workspace of workspaces) {
    const workspaceId = String(workspace.workspaceId)
    const account = { id: workspaceId, title: workspace.title }
    const groupOf = groupsOf(groups[workspaceId] ?? [])
    for (const row of rowsByWorkspace.get(workspaceId) ?? []) {
      // 空白行是「准备开始一个新会话」的占位，没有可搜的标题
      if (row.blank) continue
      if (!matchesQuery(row, workspace.title, normalized)) continue
      const group = groupOf.get(row.id)
      matches.push(group === undefined ? { row, workspace: account } : { row, workspace: account, group })
    }
  }

  for (const row of straySessions(sessions, workspaces, archivedSessionIds)) {
    if (row.blank) continue
    if (!matchesQuery(row, undefined, normalized)) continue
    matches.push({ row })
  }

  matches.sort(byRecency)
  return { matches: matches.slice(0, limit), hasMore: matches.length > limit }
}
