/**
 * 会话行：状态点位列、标题与可选的行尾操作位。
 *
 * 行首列放官方 `StateDot`：待交互、运行、完成未打开时显示，空闲时留空占位，
 * 因此标题与工作区标题的横向关系始终与官方一致。`action` 缺省时不渲染行尾
 * 操作位——未分组桶里的会话不属于任何工作区，没有可用的归组操作。
 */
import type { ReactElement, ReactNode } from 'react'
import { StateDot } from '../runtime.ts'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { SessionStatus } from '../data/status.ts'
import type { SessionRow } from '../data/types.ts'

export interface SessionRowViewProps {
  row: SessionRow
  selected: boolean
  /** 该行要显示的状态位；空闲时为 undefined，槽位仍占位。 */
  status?: SessionStatus | undefined
  /** 菜单展开时行上挂标记：锚点按钮只靠 :hover 显示，菜单还开着时指针一旦
   * 移开按钮就会消失，标记让样式把它留住。 */
  menuOpen?: boolean
  /** 行尾操作位；缺省表示该行没有任何可用操作（如未分组桶里的会话）。 */
  action?: ReactNode
  onOpen: () => void
}

export function SessionRowView({
  row,
  selected,
  status,
  menuOpen = false,
  action,
  onOpen,
}: SessionRowViewProps): ReactElement {
  return (
    <div
      className={
        'wg-row' + (selected ? ' wg-row-selected' : '') + (menuOpen ? ' wg-row-menu-open' : '')
      }
      role="button"
      tabIndex={0}
      title={row.title}
      onClick={onOpen}
      onKeyDown={(event) => handleRowKeyDown(event, onOpen)}
    >
      {status === undefined ? (
        <span className="wg-slot" />
      ) : (
        <span className="wg-slot" role="img" title={status.label} aria-label={status.label}>
          <StateDot state={status.state} />
        </span>
      )}
      <span className="wg-row-title">{row.title}</span>
      {action === undefined ? null : (
        <span className="wg-slot" onClick={(event) => event.stopPropagation()}>
          {action}
        </span>
      )}
    </div>
  )
}
