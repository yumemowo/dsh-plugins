/**
 * 一个工作区标题行
 *
 * 行内操作与官方工作区行同形：`...` 打开管理菜单（新建分组 / 重命名 / 删除），
 * `+` 直接在该工作区新建会话。静止时显示文件夹（开/闭随展开态），悬停时让位
 * 给三角箭头，两个槽常驻同一 16px 列，因此切换时标题不位移
 *
 * 「新建分组」不像「新建会话」那样高频，因此不占行内位置，收进菜单。未分组桶
 * 没有工作区归属，管理回调都不传，行尾操作位整体不渲染
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  IconEllipsisOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconPlusOutline16,
  IconTriangleRightFill14,
  Menu,
} from '../runtime.ts'
import { WORKSPACE_MENU, buildWorkspaceMenuItems } from '../menus.tsx'
import { IconButton } from './IconButton.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'

/** 工作区标题行的文案与无障碍标签 */
export interface WorkspaceRowLabels {
  /** 工作区「更多操作」按钮的无障碍标签，取工作区名 */
  actions: (name: string) => string
  /** 新建会话按钮的无障碍标签，取工作区名 */
  newSession: (name: string) => string
  /** 菜单里的「新建分组」项 */
  newGroup: string
  /** 菜单里的「重命名工作区」项 */
  rename: string
  /** 菜单里的「删除工作区」项 */
  delete: string
}

export interface WorkspaceRowProps {
  title: string
  collapsed: boolean
  /** 展开且含当前会话时，文件夹染成强调色（与官方一致） */
  folderActive: boolean
  onToggle: () => void
  /** 缺省表示该行不提供新建会话（未分组桶） */
  onCreateSession?: () => void
  onNewGroup?: () => void
  onRename?: () => void
  onDelete?: () => void
  labels: WorkspaceRowLabels
}

export function WorkspaceRow({
  title,
  collapsed,
  folderActive,
  onToggle,
  onCreateSession,
  onNewGroup,
  onRename,
  onDelete,
  labels,
}: WorkspaceRowProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const manageable = onNewGroup !== undefined || onRename !== undefined || onDelete !== undefined

  return (
    <div
      className={'wg-workspace-head' + (menuOpen ? ' wg-row-menu-open' : '')}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
    >
      <span className={`wg-slot wg-folder${folderActive ? ' wg-folder-active' : ''}`}>
        {collapsed ? <IconFolderClose16 /> : <IconFolderOpen16 />}
      </span>
      <span className="wg-slot wg-chevron">
        <IconTriangleRightFill14 className={`wg-arrow${collapsed ? '' : ' wg-arrow-open'}`} />
      </span>
      <span className="wg-workspace-title">{title}</span>
      {manageable || onCreateSession !== undefined ? (
        <span className="wg-row-actions">
          {manageable ? (
            <Menu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onSelect={(id: string) => {
                setMenuOpen(false)
                if (id === WORKSPACE_MENU.newGroup) onNewGroup?.()
                else if (id === WORKSPACE_MENU.rename) onRename?.()
                else if (id === WORKSPACE_MENU.delete) onDelete?.()
              }}
              portal
              closeOnPointerLeave
              anchor={
                <button
                  type="button"
                  className="wg-row-action"
                  title={labels.actions(title)}
                  aria-label={labels.actions(title)}
                  onClick={(event) => {
                    event.stopPropagation()
                    setMenuOpen((open) => !open)
                  }}
                >
                  <IconEllipsisOutline16 />
                </button>
              }
              items={buildWorkspaceMenuItems({
                newGroupLabel: labels.newGroup,
                renameLabel: labels.rename,
                deleteLabel: labels.delete,
              })}
            />
          ) : null}
          {onCreateSession === undefined ? null : (
            <IconButton
              title={labels.newSession(title)}
              icon={<IconPlusOutline16 />}
              onClick={onCreateSession}
            />
          )}
        </span>
      ) : null}
    </div>
  )
}
