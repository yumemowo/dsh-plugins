/**
 * 一个分组：可折叠的分组头（箭头、名称、会话数、改名与删除）加组内会话行。
 *
 * 「未分组」在工作区内部不是分组——未归组的会话由区域组件直接平铺，
 * 不经过这里。
 */
import type { ReactElement, ReactNode } from 'react'
import { IconEditOutline16, IconTrashOutline16, IconTriangleRightFill14 } from '../runtime.ts'
import { IconButton } from './IconButton.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { GroupSection as GroupSectionData } from '../data/types.ts'

export interface GroupSectionProps {
  section: GroupSectionData
  collapsed: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 已渲染好的组内会话行。 */
  children: ReactNode
  /** 分组头两个按钮的文案。 */
  labels: { rename: string; delete: string }
}

export function GroupSection({
  section,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  children,
  labels,
}: GroupSectionProps): ReactElement {
  return (
    <div className="wg-group">
      <div
        className="wg-group-head"
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
      >
        <span className="wg-slot">
          <IconTriangleRightFill14 className={`wg-arrow${collapsed ? '' : ' wg-arrow-open'}`} />
        </span>
        <span className="wg-group-label">
          {section.label} ({section.sessions.length})
        </span>
        <IconButton title={labels.rename} icon={<IconEditOutline16 />} onClick={onRename} />
        <IconButton title={labels.delete} icon={<IconTrashOutline16 />} onClick={onDelete} />
      </div>
      {collapsed ? null : <div className="wg-sessions">{children}</div>}
    </div>
  )
}
