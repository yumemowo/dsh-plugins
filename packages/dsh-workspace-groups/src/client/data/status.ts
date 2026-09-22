/**
 * 会话状态位的推导
 *
 * 取值与优先级照官方 `ui-workspace`：待交互（等待审批 / 计划待审 / 等待回答）压过运行，运行压过完成提醒
 *
 * 同一个会话有两种消费形态，两者都从 {@link sessionStatuses} 出发，因此不会各自漂移
 * 行首那个状态点取第一条、再按「没有要提醒的事就不画点」取舍（见 {@link rowStatusDot}），悬停卡片则逐条列出（空闲也列一条）
 */
import type { SessionStatusLabels } from '../labels.ts'
import type { SessionRow } from './types.ts'

/** 官方状态点原语认识的状态；空闲在行上不画点，卡片里按官方仍列一条 */
export type StatusState = 'ongoing' | 'done' | 'warning'

/** 一个会话行要显示的状态位 */
export interface SessionStatus {
  state: StatusState
  /** 无障碍文案；点本身是纯视觉元素，语义由它承担 */
  label: string
}

/**
 * 待交互种类到状态
 *
 * 只认官方登记的三种：其他插件发布的交互不在侧边栏表意，忽略即不画点
 * @returns 该种类的状态；不认识的种类返回 undefined
 */
function pendingStatus(kind: string, labels: SessionStatusLabels): SessionStatus | undefined {
  switch (kind) {
    case 'approval':
      return { state: 'warning', label: labels.waitingApproval }
    case 'plan-review':
      return { state: 'warning', label: labels.planReview }
    case 'question':
      return { state: 'warning', label: labels.waitingAnswer }
    default:
      return undefined
  }
}

/**
 * 推导一个会话行当前要呈现的全部状态
 *
 * 顺序与官方 `sessionStatuses` 一致：待交互在前，运行中的子代理作为它的补充跟在后面
 * 子代理会话本身不在侧边栏显示，但它们运行时要让祖先行亮起运行点，因此这里同时看本会话的 `running` 与子代理运行数
 *
 * 空闲也返回一条（官方 `status.idle`），因为悬停卡片要把它列出来；行首那个点是否画由 {@link sessionStatus} 决定
 * @param pendingKind - 该会话当前待交互的种类；没有待交互时为空
 * @returns 按优先级排列的状态；第一条是行首要显示的那一条
 */
export function sessionStatuses(
  row: SessionRow,
  pendingKind: string | undefined,
  labels: SessionStatusLabels,
): SessionStatus[] {
  const subagents: SessionStatus | undefined =
    row.runningSubagentCount === 0
      ? undefined
      : { state: 'ongoing', label: labels.subagentsRunning(row.runningSubagentCount) }
  const pending = pendingKind === undefined ? undefined : pendingStatus(pendingKind, labels)

  if (pending !== undefined) return subagents === undefined ? [pending] : [pending, subagents]
  if (row.running) {
    const running: SessionStatus = { state: 'ongoing', label: labels.running }
    return subagents === undefined ? [running] : [running, subagents]
  }
  if (subagents !== undefined) return [subagents]
  if (row.completed) return [{ state: 'done', label: labels.completed }]
  return [{ state: 'done', label: labels.idle }]
}

/**
 * 推导行首那个状态点
 *
 * 空闲不画点（没有要提醒的事），槽位留空因此标题不位移；完成态仍是官方的绿色提醒点，照常画
 * 判据与官方 `SessionNodeItem` 的 `showStatus` 相同
 * @param statuses - 该行当前的全部状态，取自 {@link sessionStatuses}
 * @returns 要显示的状态位；空闲时返回 undefined
 */
export function rowStatusDot(
  row: SessionRow,
  statuses: readonly SessionStatus[],
): SessionStatus | undefined {
  const primary = statuses[0]
  if (primary === undefined) return undefined
  return primary.state !== 'done' || row.completed ? primary : undefined
}

/**
 * 比较两个状态位是否表示同一件事
 *
 * 供行级 memo 的比较器使用：决定显示结果的只有状态与文案这两格
 */
export function sameSessionStatus(
  a: SessionStatus | undefined,
  b: SessionStatus | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.state === b.state && a.label === b.label
}

/**
 * 比较两条状态列表是否表示同一件事
 *
 * 列表每次渲染都是新数组，行级 memo 因此只能按内容比
 */
export function sameSessionStatuses(
  a: readonly SessionStatus[],
  b: readonly SessionStatus[],
): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((status, index) => sameSessionStatus(status, b[index]))
}
