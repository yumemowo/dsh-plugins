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
import { RowHeadShell } from './components/RowHeadShell.tsx'
import { useLocale } from '../hooks/useLocale.ts'
import { useOrderRow } from '../hooks/useDnd.ts'
import { regionProps, virtualRegionKey, virtualWorkspaceHeadKey } from '../data/protocol.ts'
import type { OrderDragging } from '../data/protocol.ts'
import type { VirtualWorkspaceSection as VirtualWorkspaceSectionData } from '../data/types.ts'
import styles from './components/rows.module.css'
import clsx from 'clsx'

export interface VirtualWorkspaceSectionProps {
  section: VirtualWorkspaceSectionData
  expanded: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /**
   * 根节点工作区分组的排序接线
   *
   * 缺省表示这一片不参与分组排序，分组头因此不可拖起
   */
  orderDragging?: OrderDragging | undefined
  /**
   * 组体那一格的区域属性
   *
   * 组体是工作区移入本分组的整块落点，缺省表示这一片不接那类拖拽
   * 与分组头那一格同档不同格，拖到头与拖到组体空白都读作移入，但一个计划里两格都要在
   * 分组头自己带区域键，命中层停在指针下第一个带键的元素上，那一格不在计划里时拖到头上就到此为止
   */
  bodyZone?: Record<string, string> | undefined
  /** 已渲染好的组内工作区区块 */
  children: ReactNode
}

export function VirtualWorkspaceSection({
  section,
  expanded,
  onToggle,
  onRename,
  onDelete,
  orderDragging,
  bodyZone,
  children,
}: VirtualWorkspaceSectionProps): ReactElement {
  const { labels } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * 分组头的拖拽接线
   *
   * 根节点那一层的排序落点全在分组头上，未归组的工作区不参与，因此这一层不需要另挂区域
   * 这个 hook 无条件调用，没有排序接线时它只交回区域属性
   */
  const order = useOrderRow(
    virtualWorkspaceHeadKey(section.id),
    section.id,
    // 每次渲染新建的闭包，取最新那份计划这件事由 hook 内部按引用兜住
    orderDragging === undefined ? undefined : () => orderDragging.buildDragPlan(section.id),
  )

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
    // 这一块是分组的整体：组头与组体各占一格区域，指针落在任何一格上框都该套住这里
    <div
      className={styles.virtualWorkspace}
      {...regionProps(virtualRegionKey(section.id))}
    >
      <RowHeadShell
        className={clsx(styles.groupHead, styles.virtualWorkspaceHead)}
        expanded={expanded}
        // 组头不参与逐个淡入：它的撑开体里没有按序下发的容器，淡入序号只发给药丸那一层之外的行
        stagger={false}
        dragging={order.dragging}
        activate={onToggle}
        onContextMenu={contextMenu.onContextMenu}
        menu={contextMenu.menu}
        zone={order.zone}
        rowAttribute={order.rowAttribute}
        drag={order.drag}
      >
        {/* 药丸：底色、圆角与悬停都在它身上，外层的带只承担与上一行之间的那点间距 */}
        <span className={styles.headSurface}>
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
        </span>
      </RowHeadShell>
      {/* 空分组照样有内容要露：占位文案落在撑开体里，因此「建完分组还没移入
          工作区」时用户看得到它，而不是一个点下去什么都没发生的分组头 */}
      <ExpandableBody open={expanded}>
        <div className={styles.virtualWorkspaceBody} {...bodyZone}>
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
