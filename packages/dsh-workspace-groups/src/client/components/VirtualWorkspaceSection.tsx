/**
 * 一个工作区分组：根节点上的一层容器，把若干工作区打包在一起
 *
 * 它是「工作区一级」的容器，与会话分组（`GroupSection`）是两个层级的不同概念：
 * 这里装的是工作区，且只出现在列表最外层，不会落在某个工作区内部
 *
 * 行结构与会话分组头刻意同形（同一 `.wg-group-head` 基类、同样的行尾操作位与可收放槽位）
 * 只在两处不同：缩进按根节点取 8px 而不是 24px，且没有 `+`
 * 分组里要放的是工作区，而新建工作区的入口在区域 header（`workspace.add`）
 */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { IconTriangleRightFill14 } from '../runtime.ts'
import { IconVirtualFolder16 } from '../icons.tsx'
import {
  VIRTUAL_WORKSPACE_MENU,
  buildRowContextMenuItems,
  buildVirtualWorkspaceMenuItems,
} from '../menus.tsx'
import { CollapsibleBody } from './CollapsibleBody.tsx'
import { RowActions } from './RowActions.tsx'
import { useRowContextMenu } from './RowContextMenu.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { VirtualWorkspaceSection as VirtualWorkspaceSectionData } from '../data/types.ts'

export interface VirtualWorkspaceSectionProps {
  section: VirtualWorkspaceSectionData
  collapsed: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 已渲染好的组内工作区区块 */
  children: ReactNode
  /** 组内没有任何工作区时的占位文案 */
  emptyLabel: string
  /** 分组行操作位的文案 */
  labels: {
    /** `...` 按钮的无障碍标签，取分组名 */
    actions: (name: string) => string
    /** 「重命名工作区分组」菜单项 */
    rename: string
    /** 「删除工作区分组」菜单项 */
    delete: string
  }
}

export function VirtualWorkspaceSection({
  section,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  children,
  emptyLabel,
  labels,
}: VirtualWorkspaceSectionProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它：两个入口的条目集合相同，同一个 id 必须落到同一件事上
   */
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === VIRTUAL_WORKSPACE_MENU.rename) onRename()
    else if (id === VIRTUAL_WORKSPACE_MENU.delete) onDelete()
  }

  const menuItems = buildVirtualWorkspaceMenuItems({
    renameLabel: labels.rename,
    deleteLabel: labels.delete,
  })

  // 这一层没有行内 `+`（新建工作区在区域 header），因此右键菜单就是 `...` 菜单本身
  const contextMenu = useRowContextMenu({
    items: buildRowContextMenuItems(menuItems),
    onSelect: select,
  })

  return (
    <div className="wg-virtual-workspace">
      <div
        className={
          'wg-group-head wg-virtual-workspace-head' + (menuOpen ? ' wg-row-menu-open' : '')
        }
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
        onContextMenu={contextMenu.onContextMenu}
      >
        {contextMenu.menu}
        {/* 文件夹槽与箭头槽常驻同一个 16px 列，与工作区行同一套：静止时显示文件夹、悬停换成箭头，因此切换不会让标题位移
            这里的文件夹走虚线：工作区分组形状上像一个工作区，但本身不是一个真实工作区 */}
        <span className="wg-slot wg-folder">
          <IconVirtualFolder16 />
        </span>
        <span className="wg-slot wg-chevron">
          <IconTriangleRightFill14 className={`wg-arrow${collapsed ? '' : ' wg-arrow-open'}`} />
        </span>
        <span className="wg-virtual-workspace-label">{section.label}</span>
        {/* 工作区数自己成格贴在行右，与会话分组的会话数、session 行的时间同格同形
            空分组不显示 */}
        {section.workspaceIds.length <= 0 ? null : (
          <span className="wg-group-count">{section.workspaceIds.length}</span>
        )}
        {/* 操作位收进 session 行同一套可收放槽位：静止时不占宽，上面的工作区数因此贴到行右；悬停/菜单展开/键盘聚焦时槽位展开，工作区数隐去 */}
        <span className="wg-row-action-slot">
          <RowActions
            menuOpen={menuOpen}
            onMenuOpen={setMenuOpen}
            onMenuSelect={select}
            menuItems={menuItems}
            actionsLabel={labels.actions(section.label)}
          />
        </span>
      </div>
      {/* 空分组照样有内容要露：占位文案落在折叠体里，因此「建完分组还没移入
          工作区」时用户看得到它，而不是一个点下去什么都没发生的分组头 */}
      <CollapsibleBody open={!collapsed}>
        <div className="wg-virtual-workspace-body">
          {section.workspaceIds.length <= 0 ? (
            <div className="wg-empty" data-wg-stagger="">
              {emptyLabel}
            </div>
          ) : (
            children
          )}
        </div>
      </CollapsibleBody>
    </div>
  )
}
