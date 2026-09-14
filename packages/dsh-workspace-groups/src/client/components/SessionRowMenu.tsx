/**
 * 带归组「更多操作」菜单的会话行。
 *
 * 菜单开合状态收敛在本组件内：行组件在 map 回调里生成，把 useState 留在
 * 行内会让每行无条件多挂一组 hook 状态，独立组件则按需挂载。
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { IconEllipsisOutline16, Menu } from '../runtime.ts'
import { buildSessionMenuItems } from '../menus.tsx'
import { SessionRowView } from './SessionRowView.tsx'
import type { SessionStatus } from '../data/status.ts'
import type { GroupSection, SessionRow } from '../data/types.ts'

/** 会话行菜单用到的三处文案。 */
export interface SessionRowMenuLabels {
  sessionActions: string
  moveToGroup: string
  ungroup: string
}

export interface SessionRowMenuProps {
  row: SessionRow
  selected: boolean
  /** 该行要显示的状态位；空闲时为 undefined。 */
  status?: SessionStatus | undefined
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id；空串表示未归组。 */
  currentGroupId: string
  onOpen: () => void
  /** 菜单选中项：`ungroup` 或 `group:<id>`。 */
  onSelect: (id: string) => void
  labels: SessionRowMenuLabels
}

export function SessionRowMenu({
  row,
  selected,
  status,
  sections,
  currentGroupId,
  onOpen,
  onSelect,
  labels,
}: SessionRowMenuProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <SessionRowView
      row={row}
      selected={selected}
      status={status}
      menuOpen={menuOpen}
      onOpen={onOpen}
      action={
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onSelect={(id: string) => {
            setMenuOpen(false)
            onSelect(id)
          }}
          // portal 进 document.body：本区域的列表容器 overflow 裁剪会把
          // 就近渲染的菜单裁掉。二级面板的方向由宿主挂的 body 标记控制
          //（见 index.ts），这里不感知宿主差异。
          portal
          closeOnPointerLeave
          anchor={
            <button
              type="button"
              className="wg-row-action"
              title={labels.sessionActions}
              aria-label={labels.sessionActions}
              onClick={(event) => {
                event.stopPropagation()
                setMenuOpen((open) => !open)
              }}
            >
              <IconEllipsisOutline16 />
            </button>
          }
          items={buildSessionMenuItems({
            sections,
            currentGroupId,
            label: labels.moveToGroup,
            ungroupLabel: labels.ungroup,
          })}
        />
      }
    />
  )
}
