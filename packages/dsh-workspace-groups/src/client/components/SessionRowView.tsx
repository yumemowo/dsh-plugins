/**
 * 会话行：状态位列、标题与可选的行尾操作位。
 *
 * 官方会话行首列放状态点；本包暂不渲染状态，只保留同宽的占位列，这样标题
 * 与工作区标题的横向关系与官方一致。`action` 缺省时不渲染行尾操作位——
 * 未分组桶里的会话不属于任何工作区，没有可用的归组操作。
 */
import type { ReactElement, ReactNode } from 'react'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { SessionRow } from '../data/types.ts'

export interface SessionRowViewProps {
  row: SessionRow
  selected: boolean
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
      <span className="wg-slot" />
      <span className="wg-row-title">{row.title}</span>
      {action === undefined ? null : (
        <span className="wg-slot" onClick={(event) => event.stopPropagation()}>
          {action}
        </span>
      )}
    </div>
  )
}
