/**
 * 会话行的显示事实：状态位与相对时间
 *
 * 两者都只依赖官方快照、语言包与渲染当刻的时刻，不依赖 React
 * 区域组件只负责把它们绑到快照与文案上
 *
 * 行级 memo 要求这些值内容稳定，因此这里都是纯函数：同样的输入交出同样的结果
 * 推导必须留在渲染行的组件这一层，不能下放进行自身——被 memo 挡下的行不会再重渲染
 * 时间文案那样就会停在第一次算出的值上（见 docs/render-performance.md）
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { RegionLabels } from '../labels.ts'
import type { SessionRow } from './types.ts'
import { rowStatusDot, sessionStatuses } from './status.ts'
import type { SessionStatus } from './status.ts'

/** 一个会话行要呈现的状态：卡片那份逐条列表，以及行首那个点 */
export interface RowStatusView {
  /** 按优先级排列的全部状态，漏出卡片逐条消费 */
  statuses: SessionStatus[]
  /** 行首要显示的那一条，空闲时为 undefined，槽位仍占位 */
  dot: SessionStatus | undefined
}

/**
 * 推导一个会话行当前的状态
 *
 * 待交互种类从官方统一状态快照里按会话 id 取
 * 点与卡片列表取自同一次推导，因此两者不会各说一套
 * @param statuses - 官方统一状态快照，缺省时所有会话都当作没有待交互
 * @returns 行上要用的两条状态
 */
export function statusViewOfRow(
  row: SessionRow,
  statuses: SessionStatusSnapshot | undefined,
  labels: RegionLabels['status'],
): RowStatusView {
  const list = sessionStatuses(
    row,
    statuses?.get(row.id as SessionId)?.pendingInteraction?.kind,
    labels,
  )
  return { statuses: list, dot: rowStatusDot(row, list) }
}

/**
 * 一个会话行的相对时间文案
 *
 * 行尾与悬停卡片共用它，两者的差别只在传进来的 `format`：行上是官方的紧凑形态，卡片上要套「…前」模板
 * 官方对空白（新建中）会话行不显示时间，这里沿用同一取舍
 * @param format - 官方那份相对时间格式化，缺省表示官方服务不在场，此时整列不渲染
 * @returns 相对时间文案，不显示时为 undefined
 */
export function relativeTimeOfRow(
  row: SessionRow,
  format: ((updatedAt: number, now: number) => string) | undefined,
  now: number,
): string | undefined {
  if (row.blank || format === undefined) return undefined
  return format(row.updatedAt, now)
}
