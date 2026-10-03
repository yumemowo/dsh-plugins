/**
 * 置顶集合到置顶区各行的投影
 *
 * 官方 `pinnedSessionIds` 是注册表全局的集合，不保证每一个仍出现在当前可见列表里
 * （会话可能已归档、可能是子代理来源），因此投影时必须滤掉不可见的那些
 * 判据复用 `sessions.ts` 里既有的可见性规则，不另写一套
 *
 * 顺序直接沿用官方集合的顺序（最近置顶在最前），不自己再排
 * 这一层没有 React 依赖，置顶区按可见条数切片，就地置顶按名次做稳定分区
 */
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { isSessionVisible, toSessionRow } from './sessions.ts'
import type { SessionRow } from './types.ts'

/** 置顶区里的一行 */
export interface PinnedEntry {
  /** 会话 id */
  id: string
  /**
   * 显示标题
   *
   * 空白会话为空串，由渲染期套语言包的固定名，与列表里的会话行同一取舍
   */
  title: string
  blank: boolean
  /** 所属工作区 id，用于悬停卡片与来源提示 */
  workspaceId: string | undefined
  /** 该会话当前是否就是被打开的那一条 */
  current: boolean
  /** 该行的状态位，由渲染期取该行自己的推导结果 */
  row: SessionRow
}

/**
 * 把置顶集合投影成置顶区的行
 *
 * 官方集合的每个 id 都要在会话快照里找得到，且要过一遍可见性判据
 * 
 * 归档的、子代理来源的、非当前的空白会话都要滤掉
 * @param pinnedSessionIds - 官方快照里的置顶集合，最近置顶在最前
 * @param sessions - 会话快照，用于取标题、状态与可见性
 * @param archivedSessionIds - 注册表全局的归档集合
 * @param workspaceOf - 会话 id → 所属工作区 id，无所属的会话不在其中
 * @param currentSessionId - 当前打开的会话 id
 * @param statuses - 统一状态快照，缺省时只有摘要里的运行态可用
 * @returns 可见的置顶行，顺序与传入的置顶集合一致
 */
export function pinnedEntries(
  pinnedSessionIds: readonly string[],
  sessions: SessionListState,
  archivedSessionIds: readonly string[],
  workspaceOf: ReadonlyMap<string, string>,
  currentSessionId: string | undefined,
  statuses: SessionStatusSnapshot = new Map(),
): PinnedEntry[] {
  const archived = new Set(archivedSessionIds.map(String))
  const entries: PinnedEntry[] = []
  for (const id of pinnedSessionIds) {
    const key = String(id)
    const summary = sessions.byId[key as never] as SessionSummary | undefined
    if (summary === undefined || !isSessionVisible(summary, currentSessionId, archived))
      continue
    const row = toSessionRow(sessions, statuses, summary)
    entries.push({
      id: key,
      title: row.title,
      blank: row.blank,
      workspaceId: workspaceOf.get(key),
      current: key === currentSessionId,
      row,
    })
  }
  return entries
}

/**
 * 把置顶集合收成「会话 id → 名次」的索引，供就地置顶的比较器使用
 *
 * 名次只是集合里的位置，因此最近置顶的名次最小、排最前
 * 只收可见的置顶项：不可见的那几条不会渲染，占着名次只会让别的行排得更后
 * @param entries - {@link pinnedEntries} 的结果
 * @returns 会话 id 到名次的索引
 */
export function pinRanks(entries: readonly PinnedEntry[]): ReadonlyMap<string, number> {
  const ranks = new Map<string, number>()
  entries.forEach((entry, index) => ranks.set(entry.id, index))
  return ranks
}

/**
 * 把已置顶的行提到最前，其余行维持原序
 *
 * 末尾的「未分组」区段用它，而不是 {@link compareSessionRowsWithPins}，那一段的成员不属于任何工作区
 * 既有的「保持会话列表原序」是该区段的行为，整段重排会连未置顶的行一起改动。这里只做一次稳定分区
 *
 * 不依赖 `Array.prototype.sort` 的稳定性来表达「其余维持原序」
 * 分区是显式写出来的，读的人不必知道引擎的排序是否稳定
 * @param rows - 待排的行，顺序即列表原序
 * @param pins - 会话 id 到置顶名次的索引，空表时原样返回
 * @returns 置顶行在前（按名次）、其余按原序的新数组
 */
export function frontPinnedRows(
  rows: readonly SessionRow[],
  pins: ReadonlyMap<string, number>,
): SessionRow[] {
  if (rows.length === 0) return []
  const pinned: SessionRow[] = []
  const rest: SessionRow[] = []
  for (const row of rows) (pins.has(row.id) ? pinned : rest).push(row)
  if (pinned.length === 0) return [...rows]
  // 置顶内部按名次排，最近置顶的在最前
  pinned.sort((a, b) => (pins.get(a.id) ?? 0) - (pins.get(b.id) ?? 0))
  return [...pinned, ...rest]
}
