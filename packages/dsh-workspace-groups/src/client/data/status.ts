/**
 * 会话状态位的推导
 *
 * 优先级与取值照官方 `ui-workspace`：待交互（等待审批 / 计划待审 / 等待回答）
 * 压过运行，运行压过完成提醒；空闲不画点，槽位留空因此标题不位移
 */
import type { SessionStatusLabels } from '../labels.ts'
import type { SessionRow } from './types.ts'

/** 官方状态点原语认识的状态；空闲没有对应值，因为它不画点 */
export type StatusState = 'ongoing' | 'done' | 'warning'

/** 一个会话行要显示的状态位 */
export interface SessionStatus {
  state: StatusState
  /** 无障碍文案；点本身是纯视觉元素，语义由它承担 */
  label: string
}

/**
 * 待交互种类到文案
 *
 * 只认官方登记的三种：其他插件发布的交互不在侧边栏表意，忽略即不画点
 * @param kind - 待交互的种类
 * @param labels - 状态文案
 * @returns 该种类的文案；不认识的种类返回 undefined
 */
function pendingLabel(kind: string, labels: SessionStatusLabels): string | undefined {
  switch (kind) {
    case 'approval':
      return labels.waitingApproval
    case 'plan-review':
      return labels.planReview
    case 'question':
      return labels.waitingAnswer
    default:
      return undefined
  }
}

/**
 * 推导一个会话行的状态位
 *
 * 子代理会话本身不在侧边栏显示，但它们运行时要让祖先行亮起运行点，因此
 * 这里同时看本会话的 `running` 与子代理运行数
 * @param row - 会话渲染行
 * @param pendingKind - 该会话当前待交互的种类；没有待交互时为空
 * @param labels - 状态文案
 * @returns 要显示的状态位；空闲时返回 undefined
 */
export function sessionStatus(
  row: SessionRow,
  pendingKind: string | undefined,
  labels: SessionStatusLabels,
): SessionStatus | undefined {
  if (pendingKind !== undefined) {
    const label = pendingLabel(pendingKind, labels)
    if (label !== undefined) return { state: 'warning', label }
  }
  if (row.running) return { state: 'ongoing', label: labels.running }
  if (row.runningSubagentCount > 0) {
    return { state: 'ongoing', label: labels.subagentsRunning(row.runningSubagentCount) }
  }
  if (row.completed) return { state: 'done', label: labels.completed }
  return undefined
}
