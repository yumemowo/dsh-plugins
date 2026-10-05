/**
 * 一个工作区分组：根节点上的一层容器，把若干工作区打包在一起
 *
 * 它是「工作区一级」的容器，与会话分组（`GroupSection`）是两个层级的不同概念：
 * 这里装的是工作区，且只出现在列表最外层，不会落在某个工作区内部
 *
 * 行结构与会话分组头刻意同形（同一 `.groupHead` 基类、同样的行尾操作位与可收放槽位）
 * 只在两处不同：缩进按根节点取 8px 而不是 24px，且没有 `+`
 * 分组里要放的是工作区，而新建工作区的入口在区域 header（`workspace.add`）
 */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { IconTriangleRightFillRegular } from '../runtime.ts'
import { IconVirtualFolder16 } from '../icons.tsx'
import {
  VIRTUAL_WORKSPACE_MENU,
  buildRowContextMenuItems,
  buildVirtualWorkspaceMenuItems,
} from '../menus.tsx'
import { ExpandableBody } from './components/ExpandableBody.tsx'
import { RowActions } from './RowActions.tsx'
import { useRowContextMenu } from './components/RowContextMenu.tsx'
import { handleRowKeyDown } from './components/rowKeyboard.ts'
import { useLocale } from '../hooks/useLocale.ts'
import type { VirtualWorkspaceSection as VirtualWorkspaceSectionData } from '../data/types.ts'
import styles from './components/rows.module.css'
import clsx from 'clsx'

export interface VirtualWorkspaceSectionProps {
  section: VirtualWorkspaceSectionData
  expanded: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 已渲染好的组内工作区区块 */
  children: ReactNode
}

export function VirtualWorkspaceSection({
  section,
  expanded,
  onToggle,
  onRename,
  onDelete,
  children,
}: VirtualWorkspaceSectionProps): ReactElement {
  const { labels } = useLocale()
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
    // 菜单项用通用动词，只有对话框标题才点明对象（见 RegionDialogs）
    renameLabel: labels.rename,
    deleteLabel: labels.deleteVirtualWorkspace,
  })

  // 这一层没有行内 `+`（新建工作区在区域 header），因此右键菜单就是 `...` 菜单本身
  const contextMenu = useRowContextMenu({
    items: buildRowContextMenuItems(menuItems),
    onSelect: select,
  })

  return (
    <div className={styles.virtualWorkspace}>
      <div
        className={clsx(styles.groupHead, styles.virtualWorkspaceHead)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
        onContextMenu={contextMenu.onContextMenu}
      >
        {contextMenu.menu}
        {/* 文件夹槽与箭头槽常驻同一个 16px 列，与工作区行同一套：静止时显示文件夹、悬停换成箭头，因此切换不会让标题位移
            这里的文件夹走虚线：工作区分组形状上像一个工作区，但本身不是一个真实工作区 */}
        <span className={clsx(styles.slot, styles.folder)}>
          <IconVirtualFolder16 />
        </span>
        <span className={clsx(styles.slot, styles.chevron)}>
          <IconTriangleRightFillRegular className={clsx(styles.arrow, expanded && styles.arrowOpen)} />
        </span>
        <span className={styles.virtualWorkspaceLabel}>{section.label}</span>
        {/* 工作区数自己成格贴在行右，与会话分组的会话数、session 行的时间同格同形
            空分组不显示 */}
        {section.workspaceIds.length > 0 && (
          <span className={styles.groupCount}>{section.workspaceIds.length}</span>
        )}
        {/* 操作位收进 session 行同一套可收放槽位：静止时不占宽，上面的工作区数因此贴到行右，悬停/菜单展开/键盘聚焦时槽位展开，工作区数隐去 */}
        <span className={styles.rowActionSlot}>
          <RowActions
            menuOpen={menuOpen}
            onMenuOpen={setMenuOpen}
            onMenuSelect={select}
            menuItems={menuItems}
            actionsLabel={labels.virtualWorkspaceActions(section.label)}
          />
        </span>
      </div>
      {/* 空分组照样有内容要露：占位文案落在撑开体里，因此「建完分组还没移入
          工作区」时用户看得到它，而不是一个点下去什么都没发生的分组头 */}
      <ExpandableBody open={expanded}>
        <div className={styles.virtualWorkspaceBody}>
          {section.workspaceIds.length <= 0 ? (
            <div className={styles.empty} data-wg-stagger="">
              {labels.virtualWorkspaceEmpty}
            </div>
          ) : (
            children
          )}
        </div>
      </ExpandableBody>
    </div>
  )
}
