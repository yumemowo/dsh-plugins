/**
 * 会话快照到渲染行的投影与可见性判定
 *
 * 可见性规则与官方组件一致：子代理来源永久隐藏；已归档的会话隐藏（归档集是
 * 注册表全局的，会话仍留在 `sessionIds` 里以便取消归档时恢复位置）；空白会话
 * 只保留当前选中的那一条，作为「新会话」占位行
 */
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionRow } from './types.ts'

/** 会话是否为子代理来源；侧边栏不展示这些行 */
function isSubagent(summary: SessionSummary): boolean {
  return summary.origin === 'subagent'
}

/**
 * 判定一个会话是否应该出现在侧边栏
 * @param summary - 会话摘要
 * @param current - 当前选中的会话 id
 * @param archived - 注册表全局的归档集合
 * @returns 是否展示
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

/**
 * 沿子代理来源脉络统计每个会话名下的运行中子代理数
 *
 * 子代理行本身在侧边栏隐藏，但它运行时祖先行要亮起运行点，因此这里把它们
 * 逐个归到脉络上的每一个祖先。只有「整条脉络都是子代理」才继续上溯，与
 * 官方一致；`seen` 防的是元数据自相矛盾（父指针成环）时死循环
 * @param byId - 会话摘要表
 * @returns 每个「可能是父级」的会话 id 对应的运行中子代理数
 */
function indexRunningSubagents(
  byId: Record<string, SessionSummary | undefined>,
): Map<string, number> {
  const running = new Map<string, number>()
  for (const descendant of Object.values(byId)) {
    if (descendant === undefined || !isSubagent(descendant) || descendant.running !== true) {
      continue
    }
    const seen = new Set<string>()
    let ancestorId = descendant.parentId === undefined ? undefined : String(descendant.parentId)
    while (ancestorId !== undefined && !seen.has(ancestorId)) {
      seen.add(ancestorId)
      running.set(ancestorId, (running.get(ancestorId) ?? 0) + 1)
      const ancestor = byId[ancestorId]
      ancestorId =
        ancestor !== undefined && isSubagent(ancestor) && ancestor.parentId !== undefined
          ? String(ancestor.parentId)
          : undefined
    }
  }
  return running
}

/** 把一个会话摘要投影成渲染行 */
function toRow(summary: SessionSummary, runningSubagents: Map<string, number>): SessionRow {
  const id = String(summary.id)
  return {
    id,
    title: summary.displayTitle,
    blank: summary.blank === true,
    running: summary.running === true,
    runningSubagentCount: runningSubagents.get(id) ?? 0,
    completed: summary.completed === true,
    updatedAt: summary.updatedAt,
  }
}

/** 可见性过滤的共同输入 */
interface VisibilityInput {
  byId: Record<string, SessionSummary | undefined>
  archived: Set<string>
  current: string | undefined
  /** 每个会话名下的运行中子代理数；供状态位使用 */
  runningSubagents: Map<string, number>
}

/** 从会话列表快照里取出反复使用的派生值 */
function visibilityInput(
  sessions: SessionListState,
  archivedSessionIds: readonly string[],
): VisibilityInput {
  const byId = sessions.byId as Record<string, SessionSummary | undefined>
  return {
    byId,
    archived: new Set(archivedSessionIds.map(String)),
    current: sessions.current === undefined ? undefined : String(sessions.current),
    runningSubagents: indexRunningSubagents(byId),
  }
}

/**
 * 按工作区区号把会话列表切成段落，供每个工作区各自分组
 *
 * 归档、子代理与空白会话按可见性规则过滤，因此归档过的会话不会出现在侧边栏
 * @param sessions - 会话列表快照
 * @param workspaces - 工作区视图，按宿主顺序
 * @param archivedSessionIds - 注册表全局的归档会话集合
 * @returns 每个工作区可见的会话行，保持工作区自身的顺序
 */
export function groupSessionsByWorkspace(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
): Map<string, SessionRow[]> {
  const result = new Map<string, SessionRow[]>()
  const { byId, archived, current, runningSubagents } = visibilityInput(sessions, archivedSessionIds)

  for (const workspace of workspaces) {
    const rows = workspace.sessionIds
      .map(id => byId[String(id)])
      .filter((s): s is SessionSummary =>
        s !== undefined && isSessionVisible(s, current, archived)
      )
      .map(s => toRow(s, runningSubagents))
    result.set(String(workspace.workspaceId), rows)
  }

  return result
}

/**
 * 收集不属于任何工作区的会话行
 *
 * 删除工作区只移除注册，会话记录会原样保留；官方把这些无所属的会话收进
 * 末尾一个隐式的「未分组」区段，这里取同一做法，避免删除工作区后会话在
 * 侧边栏彻底消失
 * @param sessions - 会话列表快照
 * @param workspaces - 全部工作区视图
 * @param archivedSessionIds - 注册表全局的归档会话集合
 * @returns 按会话列表顺序排列的无所属会话行
 */
export function straySessions(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
): SessionRow[] {
  const { byId, archived, current, runningSubagents } = visibilityInput(sessions, archivedSessionIds)

  // 工作区认领过的会话即便不可见（归档等）也不算无所属，否则归档会话会
  // 从工作区里「掉」进未分组桶
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
    rows.push(toRow(summary, runningSubagents))
  }
  return rows
}
