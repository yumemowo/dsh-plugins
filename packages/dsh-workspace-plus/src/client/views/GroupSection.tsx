/**
 * 一个分组：可折叠的分组头（箭头、名称、会话数、`...` 菜单与 `+`）加组内会话行
 *
 * 分组头的行尾操作与工作区行同形，`...` 打开管理菜单（重命名 / 复制分组 ID / 删除分组），`+` 在该分组新建会话
 * 分组没有折叠用的文件夹槽，也不像工作区行那样悬停时换图标，因此图标列只有箭头一个
 *
 * 「未分组」在工作区内部不是分组——未归组的会话由区域组件直接平铺，不经过这里
 */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { IconTriangleRightFillRegular } from '../runtime.ts'
import { GROUP_MENU, ROW_MENU, buildGroupMenuItems, buildRowContextMenuItems } from '../menus.tsx'
import { ExpandableBody } from './components/ExpandableBody.tsx'
import { RowActions } from './RowActions.tsx'
import { useRowContextMenu } from './components/RowContextMenu.tsx'
import { RowHeadShell } from './components/RowHeadShell.tsx'
import { useLocale } from '../hooks/useLocale.ts'
import type { CopyNoticeHandle } from '../copyNotice.ts'

import { useDnd, useOrderRow } from '../hooks/useDnd.ts'
import {
  groupHeadKey,
  regionProps,
  sessionGroupRegionKey,
  sessionGroupZoneKey,
} from '../data/dnd/protocol.ts'
import type { OutlineRow } from '../data/outline.ts'
import type { OrderDragging } from '../data/dnd/protocol.ts'
import styles from './components/rows.module.css'
import clsx from 'clsx'

export interface GroupSectionProps {
  /** 本分组的 header 行：分组 id、名字与会话数都写在它身上 */
  head: OutlineRow
  /** 本分组所在的工作区，区域键要按它定位 */
  workspaceId: string
  /** 组体内有没有东西（会话或子工作区），都没有时整块撑开体不渲染 */
  hasBody: boolean
  expanded: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 在该分组新建会话，缺省表示该行不提供新建入口 */
  onCreateSession?: (() => void) | undefined
  /** 把分组 id 写进剪贴板 */
  copyId: CopyNoticeHandle['copy']
  /**
   * 同工作区分组的排序接线
   *
   * 缺省表示这一片不参与分组排序，分组头因此只接会话归组的落点、不可拖起
   */
  orderDragging?: OrderDragging | undefined
  /** 已渲染好的组内行：子工作区在前，其后是会话 */
  children: ReactNode
}

export function GroupSection({
  head,
  workspaceId,
  hasBody,
  expanded,
  onToggle,
  onRename,
  onDelete,
  onCreateSession,
  copyId,
  orderDragging,
  children,
}: GroupSectionProps): ReactElement {
  const { labels } = useLocale()
  const { dndZoneProps } = useDnd()
  const [menuOpen, setMenuOpen] = useState(false)
  const groupId = head.groupId ?? ''
  const label = head.label ?? ''
  const count = head.count ?? 0

  /**
   * 分组头的拖拽接线
   *
   * 头既是排序的落点区域，也是别的分组换算前后半时用的参照行，因此两格都摊在头上
   * 排序的落点只落在头上，组内会话与撑开体都不参与，展开的组体因此不是排序目标
   *
   * 这个 hook 无条件调用，没有排序接线时它只交回区域属性、不给出拖拽属性
   */
  const order = useOrderRow(
    groupHeadKey(workspaceId, groupId),
    groupId,
    // 每次渲染新建的闭包，取最新那份计划这件事由 hook 内部按引用兜住
    orderDragging === undefined ? undefined : () => orderDragging.buildDragPlan(groupId),
  )

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它，右键多一项「新建会话」
   * 但 id 相同者必须落到同一件事上
   */
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === ROW_MENU.newSession) onCreateSession?.()
    else if (id === GROUP_MENU.rename) onRename()
    else if (id === GROUP_MENU.copyId) copyId(groupId, labels.groupIdCopied)
    else if (id === GROUP_MENU.delete) onDelete()
  }

  const menuItems = buildGroupMenuItems({
    // 菜单项用通用动词，只有对话框标题才点明对象（见 RegionDialogs）
    renameLabel: labels.rename,
    copyIdLabel: labels.copyGroupId,
    deleteLabel: labels.deleteGroup,
  })

  const contextMenu = useRowContextMenu({
    items: buildRowContextMenuItems(
      menuItems,
      onCreateSession === undefined ? undefined : labels.newSessionItem,
    ),
    onSelect: select,
  })

  return (
    <div
      className={styles.group}
      {...dndZoneProps(sessionGroupZoneKey(workspaceId, groupId))}
      {...regionProps(sessionGroupRegionKey(workspaceId, groupId))}
    >
      <RowHeadShell
        className={styles.groupHead}
        expanded={expanded}
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
          <span className={styles.slot}>
            <IconTriangleRightFillRegular className={clsx(styles.arrow, expanded && styles.arrowOpen)} />
          </span>
          <span className={styles.groupLabel}>{label}</span>
          {/* 会话数自己成格贴在行右，与 session 行的 time 同格同形，空分组不显示
              只算会话，放进来的子工作区另用层级表达，混进同一个数会看不出组里是什么 */}
          {count <= 0 ? null : <span className={styles.groupCount}>{count}</span>}
          {/* 操作位收进 session 行同一套可收放槽位：静止时不占宽，上面的会话数因此贴到行右
              悬停、菜单展开与键盘聚焦这三档下槽位展开，会话数隐去 */}
          <span className={styles.rowActionSlot}>
            <RowActions
              menuOpen={menuOpen}
              onMenuOpen={setMenuOpen}
              onMenuSelect={select}
              menuItems={menuItems}
              actionsLabel={labels.groupActions(label)}
              create={
                onCreateSession && { label: labels.newSessionInGroup(label), onCreate: onCreateSession }
              }
            />
          </span>
        </span>
      </RowHeadShell>
      {/* 空分组既没有会话也没有子工作区，整块撑开体都不渲染 */}
      {hasBody ? (
        // 组内同样是「子工作区 -> 会话」，先文件夹后文件，与父工作区体内同一顺序
        <ExpandableBody open={expanded}>
          <div className={styles.groupBody}>{children}</div>
        </ExpandableBody>
      ) : null}
    </div>
  )
}
