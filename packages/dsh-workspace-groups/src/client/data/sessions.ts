/**
 * 会话快照到渲染行的投影与可见性判定
 *
 * 可见性规则与官方组件一致：子代理来源永久隐藏
 * 已归档的会话隐藏（归档集是注册表全局的，会话仍留在 `sessionIds` 里以便取消归档时恢复位置）
 * 空白会话只保留当前选中的那一条，作为「新会话」占位行
 *
 * 运行态、完成提醒与运行中子代理数都取自官方统一状态快照（`useSessionStatus`）
 * 它与摘要里那份 `running` 的分工照官方 `sessionNode`，状态快照优先，摘要只作兜底
 */
import type {
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionRow } from './types.ts'

/** 会话是否为子代理来源，侧边栏不展示这些行 */
function isSubagent(summary: SessionSummary): boolean {
  return summary.origin === 'subagent'
}

/**
 * 当前选中的会话
 *
 * 选中事实落在会话自己的保留计数上
 * 官方 `mainSessionId` 读的就是这一格：被主视图保留的那个会话就是当前会话
 * @returns 当前会话 id，没有选中时为 undefined
 */
export function mainSessionId(sessions: SessionListState): string | undefined {
  for (const summary of Object.values(sessions.byId)) {
    if ((summary.retainedBy?.mainView ?? 0) > 0) return String(summary.id)
  }
  return undefined
}

/**
 * 判定一个会话是否应该出现在侧边栏
 * @param archived - 注册表全局的归档集合
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
 * 宿主投影里本包用到的那一格
 *
 * `subagentCatalog` 由官方的子代理插件（`dsh-subagent`）声明并填充，本包不依赖那个包
 * 因此只按结构读这一格，官方改形状时这里读不到就退化为 0，不会把整片列表打挂
 */
interface SubagentCatalogProjection {
  values: {
    subagentCatalog?: readonly { id: unknown }[] | undefined
  }
}

/**
 * 数一个会话名下正在运行的直接子代理
 *
 * 子代理目录挂在宿主投影上，官方 `runningChildCount` 读的就是它
 * 本包照同一口径，直接读父会话自己那份目录，不沿 `parentId` 自建脉络
 * 目录缺失（未加载子代理插件、投影尚未到达）时为 0，与官方一致
 * @param sessions - 会话列表快照，子代理自身的运行态从它的摘要兜底
 * @param statuses - 统一状态快照，优先于摘要里的运行态
 * @param parentId - 父会话 id
 */
function runningChildCount(
  sessions: SessionListState,
  statuses: SessionStatusSnapshot,
  parentId: string,
): number {
  const projection = sessions.projectionsBySession?.[
    parentId as never
  ] as SubagentCatalogProjection | undefined
  const catalog = projection?.values.subagentCatalog
  if (catalog === undefined) return 0
  let count = 0
  for (const child of catalog) {
    const id = child.id as never
    const running = statuses.get(id)?.running ?? sessions.byId[id]?.running
    if (running === true) count += 1
  }
  return count
}

/**
 * 上一次投影的结果，按摘要对象本身缓存
 *
 * 流式期间每次活动只替换发生变化的那条摘要（其余对象保持同一引用），按摘要缓存即可
 * 这样未变的行保持同一身份，供行级 memo 比对
 *
 * 用 WeakMap：摘要被替换后旧条目自动回收，不会随会话数增长而堆积
 */
const rowCache = new WeakMap<SessionSummary, SessionRow>()

/** 一行当前会显示的全部动态事实，缓存比对的就是这几格 */
function rowFacts(
  sessions: SessionListState,
  statuses: SessionStatusSnapshot,
  summary: SessionSummary,
): Pick<SessionRow, 'running' | 'runningSubagentCount' | 'completed'> {
  const status = statuses.get(summary.id)
  return {
    running: status?.running ?? summary.running === true,
    runningSubagentCount: runningChildCount(sessions, statuses, String(summary.id)),
    completed: status?.completionUnread === true,
  }
}

/** 把一个会话摘要投影成渲染行，输入未变时复用上一次的对象 */
function toRow(
  sessions: SessionListState,
  statuses: SessionStatusSnapshot,
  summary: SessionSummary,
): SessionRow {
  const facts = rowFacts(sessions, statuses, summary)
  const cached = rowCache.get(summary)
  // 动态事实可能由别的会话决定，与摘要本身不同步地变化，因此一并比对
  if (
    cached !== undefined &&
    cached.running === facts.running &&
    cached.runningSubagentCount === facts.runningSubagentCount &&
    cached.completed === facts.completed
  ) {
    return cached
  }

  const blank = summary.blank === true
  const row: SessionRow = {
    id: String(summary.id),
    // 空白会话不进搜索、也不显示标题：与官方 `sessionTitle` 一样取空串，由渲染期套语言包的「新会话」固定名
    title: blank ? '' : summary.displayTitle,
    blank,
    ...facts,
    updatedAt: summary.updatedAt,
  }
  rowCache.set(summary, row)
  return row
}

/** 可见性过滤的共同输入 */
interface VisibilityInput {
  byId: Record<string, SessionSummary | undefined>
  archived: Set<string>
  current: string | undefined
}

/** 从会话列表快照里取出反复使用的派生值 */
function visibilityInput(
  sessions: SessionListState,
  archivedSessionIds: readonly string[],
): VisibilityInput {
  return {
    byId: sessions.byId as Record<string, SessionSummary | undefined>,
    archived: new Set(archivedSessionIds.map(String)),
    current: mainSessionId(sessions),
  }
}

/**
 * 按工作区区号把会话列表切成段落，供每个工作区各自分组
 *
 * 归档、子代理与空白会话按可见性规则过滤，因此归档过的会话不会出现在侧边栏
 * @param statuses - 统一状态快照，缺省时只有摘要里的运行态可用，运行中的子代理因此数不出来
 */
export function groupSessionsByWorkspace(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
  statuses: SessionStatusSnapshot = new Map(),
): Map<string, SessionRow[]> {
  const result = new Map<string, SessionRow[]>()
  const { byId, archived, current } = visibilityInput(sessions, archivedSessionIds)

  for (const workspace of workspaces) {
    const rows = workspace.sessionIds
      .map(id => byId[String(id)])
      .filter((s): s is SessionSummary =>
        s !== undefined && isSessionVisible(s, current, archived)
      )
      .map(s => toRow(sessions, statuses, s))
    result.set(String(workspace.workspaceId), rows)
  }

  return result
}

/**
 * 收集不属于任何工作区的会话行
 *
 * 删除工作区只移除注册，会话记录会原样保留，官方把这些无所属的会话收进末尾一个隐式的「未分组」区段
 * 这里取同一做法，避免删除工作区后会话在侧边栏彻底消失
 */
export function straySessions(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
  statuses: SessionStatusSnapshot = new Map(),
): SessionRow[] {
  const { byId, archived, current } = visibilityInput(sessions, archivedSessionIds)

  // 工作区认领过的会话即便不可见（归档等）也不算无所属，否则归档会话会从工作区里「掉」进未分组桶
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
    rows.push(toRow(sessions, statuses, summary))
  }
  return rows
}
