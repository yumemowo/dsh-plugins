/**
 * 会话快照到渲染行的投影与可见性判定。
 *
 * 可见性规则与官方组件一致：子代理来源永久隐藏；已归档的会话隐藏（归档集是
 * 注册表全局的，会话仍留在 `sessionIds` 里以便取消归档时恢复位置）；空白会话
 * 只保留当前选中的那一条，作为「新会话」占位行。
 */
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionRow } from './types.ts'

/** 会话是否为子代理来源；侧边栏不展示这些行。 */
function isSubagent(summary: SessionSummary): boolean {
  return summary.origin === 'subagent'
}

/**
 * 判定一个会话是否应该出现在侧边栏。
 * @param summary - 会话摘要。
 * @param current - 当前选中的会话 id。
 * @param archived - 注册表全局的归档集合。
 * @returns 是否展示。
 */
function isSessionVisible(
  summary: SessionSummary,
  current: string | undefined,
  archived: ReadonlySet<string>,
): boolean {
  if (isSubagent(summary)) return false
  if (archived.has(String(summary.id))) return false
  return summary.blank !== true || String(summary.id) === current
}

/** 把一个会话摘要投影成渲染行。 */
function toRow(summary: SessionSummary): SessionRow {
  return {
    id: String(summary.id),
    title: summary.displayTitle,
    blank: summary.blank === true,
    running: summary.running === true,
    completed: summary.completed === true,
    updatedAt: summary.updatedAt,
  }
}

/** 可见性过滤的共同输入。 */
interface VisibilityInput {
  byId: Record<string, SessionSummary | undefined>
  archived: Set<string>
  current: string | undefined
}

/** 从会话列表快照里取出三份反复使用的派生值。 */
function visibilityInput(
  sessions: SessionListState,
  archivedSessionIds: readonly string[],
): VisibilityInput {
  return {
    byId: sessions.byId as Record<string, SessionSummary | undefined>,
    archived: new Set(archivedSessionIds.map(String)),
    current: sessions.current === undefined ? undefined : String(sessions.current),
  }
}

/**
 * 按工作区区号把会话列表切成段落，供每个工作区各自分组。
 *
 * 归档、子代理与空白会话按可见性规则过滤，因此归档过的会话不会出现在侧边栏。
 * @param sessions - 会话列表快照。
 * @param workspaces - 工作区视图，按宿主顺序。
 * @param archivedSessionIds - 注册表全局的归档会话集合。
 * @returns 每个工作区可见的会话行，保持工作区自身的顺序。
 */
export function groupSessionsByWorkspace(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
): Map<string, SessionRow[]> {
  const result = new Map<string, SessionRow[]>()
  const { byId, archived, current } = visibilityInput(sessions, archivedSessionIds)

  for (const workspace of workspaces) {
    const rows = workspace.sessionIds
      .map(id => byId[String(id)])
      .filter((s): s is SessionSummary =>
        s !== undefined && isSessionVisible(s, current, archived)
      )
      .map(s => toRow(s))
    result.set(String(workspace.workspaceId), rows)
  }

  return result
}

/**
 * 收集不属于任何工作区的会话行。
 *
 * 删除工作区只移除注册，会话记录会原样保留；官方把这些无所属的会话收进
 * 末尾一个隐式的「未分组」区段，这里取同一做法，避免删除工作区后会话在
 * 侧边栏彻底消失。
 * @param sessions - 会话列表快照。
 * @param workspaces - 全部工作区视图。
 * @param archivedSessionIds - 注册表全局的归档会话集合。
 * @returns 按会话列表顺序排列的无所属会话行。
 */
export function straySessions(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
): SessionRow[] {
  const { byId, archived, current } = visibilityInput(sessions, archivedSessionIds)

  // 工作区认领过的会话即便不可见（归档等）也不算无所属，否则归档会话会
  // 从工作区里「掉」进未分组桶。
  const accounted = new Set<string>()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) {
      const key = String(id)
      if (byId[key] !== undefined) accounted.add(key)
    }
  }

  const rows: SessionRow[] = []
  for (const id of sessions.ids) {
    const key = String(id)
    const summary = byId[key]
    if (summary === undefined || accounted.has(key)) continue
    if (!isSessionVisible(summary, current, archived)) continue
    rows.push(toRow(summary))
  }
  return rows
}
