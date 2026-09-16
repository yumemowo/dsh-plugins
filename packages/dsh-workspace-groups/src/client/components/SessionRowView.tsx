/**
 * 会话行：状态点位列、标题、最近更新时间与可选的行尾操作位
 *
 * 行首列放官方 `StateDot`：待交互、运行、完成未打开时显示，空闲时留空占位，
 * 因此标题与工作区标题的横向关系始终与官方一致。行尾在操作位之前放官方风格
 * 的相对时间，悬停时让位给操作位（与官方同为 CSS 切换）。`action` 缺省时不
 * 渲染行尾操作位——未分组桶里的会话不属于任何工作区，没有可用的归组操作
 *
 * 纯展示组件：行的选择态、状态位、标题与时间都由调用方算好传进来
 */
import type { ReactElement, ReactNode } from 'react'
import { StateDot } from '../runtime.ts'
import { useStaggerReveal } from './CollapsibleBody.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { SessionStatus } from '../data/status.ts'

export interface SessionRowViewProps {
  /**
   * 行上显示的标题
   *
   * 新建中（空白）会话的存储标题是空串，调用方在这里套语言包的固定名
   *（官方 `session.new`）
   */
  title: string
  selected: boolean
  /** 该行要显示的状态位；空闲时为 undefined，槽位仍占位 */
  status?: SessionStatus | undefined
  /**
   * 行尾相对时间文案；缺省表示不显示（新建中的空白行与「未分组」桶）
   *
   * 官方对空白会话行不显示时间，这里沿用同一取舍
   */
  time?: string | undefined
  /** 菜单展开时行上挂标记：锚点按钮只靠 :hover 显示，菜单还开着时指针一旦
   * 移开按钮就会消失，标记让样式把它留住 */
  menuOpen?: boolean
  /** 行尾操作位；缺省表示该行没有任何可用操作（如未分组桶里的会话） */
  action?: ReactNode
  onOpen: () => void
}

export function SessionRowView({
  title,
  selected,
  status,
  time,
  menuOpen = false,
  action,
  onOpen,
}: SessionRowViewProps): ReactElement {
  // 显隐类必须由渲染产出：命令式挂上去的会被 React 重写 className 时抹掉
  const reveal = useStaggerReveal()

  return (
    <div
      className={
        'wg-row' +
        (selected ? ' wg-row-selected' : '') +
        (menuOpen ? ' wg-row-menu-open' : '') +
        reveal
      }
      // 参与所在折叠体的逐个淡入；序号由折叠体按文档序下发
      data-wg-stagger=""
      role="button"
      tabIndex={0}
      title={title}
      onClick={onOpen}
      onKeyDown={(event) => handleRowKeyDown(event, onOpen)}
    >
      {status === undefined ? (
        <span className="wg-slot" />
      ) : (
        <span className="wg-slot" role="img" aria-label={status.label}>
          <StateDot state={status.state} />
        </span>
      )}
      <span className="wg-row-title">{title}</span>
      {time === undefined ? null : <span className="wg-row-time">{time}</span>}
      {action === undefined ? null : (
        <span className="wg-row-action-slot" onClick={(event) => event.stopPropagation()}>
          {action}
        </span>
      )}
    </div>
  )
}
