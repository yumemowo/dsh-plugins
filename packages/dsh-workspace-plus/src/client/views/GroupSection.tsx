/**
 * 一个分组：可折叠的分组头（箭头、名称、会话数、`...` 菜单与 `+`）加组内会话行
 *
 * 分组头的行尾操作与工作区行同形，`...` 打开管理菜单（重命名 / 删除分组），`+` 在该分组新建会话
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
import { handleRowKeyDown } from './components/rowKeyboard.ts'
import { useLocale } from '../hooks/useLocale.ts'
import { useDnd, useOrderRow } from '../hooks/useDnd.ts'
import { groupHeadKey, sessionGroupKey } from '../data/dnd.ts'
import type { GroupSection as GroupSectionData } from '../data/types.ts'
import type { OrderDragging } from '../data/dnd.ts'
import styles from './components/rows.module.css'
import clsx from 'clsx'

export interface GroupSectionProps {
  section: GroupSectionData
  /** 本分组所在的工作区，区域键要按它定位 */
  workspaceId: string
  expanded: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 在该分组新建会话，缺省表示该行不提供新建入口 */
  onCreateSession?: (() => void) | undefined
  /**
   * 同工作区分组的排序接线
   *
   * 缺省表示这一片不参与分组排序，分组头因此只接会话归组的落点、不可拖起
   */
  orderDragging?: OrderDragging | undefined
  /** 已渲染好的组内会话行 */
  children: ReactNode
  /** 把一个子工作区渲染成一个完整的工作区块 */
  renderChildWorkspace: (workspaceId: string) => ReactNode
}

export function GroupSection({
  section,
  workspaceId,
  expanded,
  onToggle,
  onRename,
  onDelete,
  onCreateSession,
  orderDragging,
  children,
  renderChildWorkspace,
}: GroupSectionProps): ReactElement {
  const { labels } = useLocale()
  const { dndZoneProps } = useDnd()
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * 分组头的拖拽接线
   *
   * 头既是排序的落点区域，也是别的分组换算前后半时用的参照行，因此两格都摊在头上
   * 排序的落点只落在头上，组内会话与撑开体都不参与，展开的组体因此不是排序目标
   *
   * 这个 hook 无条件调用，没有排序接线时它只交回区域属性、不给出拖拽属性
   */
  const order = useOrderRow(
    groupHeadKey(workspaceId, section.id),
    section.id,
    // 每次渲染新建的闭包，取最新那份计划这件事由 hook 内部按引用兜住
    orderDragging === undefined ? undefined : () => orderDragging.buildDragPlan(section.id),
  )

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它，右键多一项「新建会话」
   * 但 id 相同者必须落到同一件事上
   */
  const childIds = section.children ?? []
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === ROW_MENU.newSession) onCreateSession?.()
    else if (id === GROUP_MENU.rename) onRename()
    else if (id === GROUP_MENU.delete) onDelete()
  }

  const menuItems = buildGroupMenuItems({
    // 菜单项用通用动词，只有对话框标题才点明对象（见 RegionDialogs）
    renameLabel: labels.rename,
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
    <div className={styles.group} {...dndZoneProps(sessionGroupKey(workspaceId, section.id))}>
      <div
        className={clsx(styles.groupHead, order.dragging && styles.rowDragging)}
        {...order.zone}
        {...order.rowAttribute}
        {...order.drag}
        data-wg-dragging={order.dragging ? '' : undefined}
        // 参与所在撑开体的逐个淡入，序号由撑开体按文档序下发
        data-wg-stagger=""
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
        onContextMenu={contextMenu.onContextMenu}
      >
        {contextMenu.menu}
        {/* 药丸：底色、圆角与悬停都在它身上，外层的带只承担与上一行之间的那点间距 */}
        <span className={styles.headSurface}>
          <span className={styles.slot}>
            <IconTriangleRightFillRegular className={clsx(styles.arrow, expanded && styles.arrowOpen)} />
          </span>
          <span className={styles.groupLabel}>{section.label}</span>
          {/* 会话数自己成格贴在行右，与 session 行的 time 同格同形，空分组不显示
              只算会话，放进来的子工作区另用层级表达，混进同一个数会看不出组里是什么 */}
          {section.sessions.length <= 0 ? null : (
            <span className={styles.groupCount}>{section.sessions.length}</span>
          )}
          {/* 操作位收进 session 行同一套可收放槽位，静止时不占宽，上面的会话数因此贴到行右，悬停/菜单展开/键盘聚焦时槽位展开，会话数隐去 */}
          <span className={styles.rowActionSlot}>
            <RowActions
              menuOpen={menuOpen}
              onMenuOpen={setMenuOpen}
              onMenuSelect={select}
              menuItems={menuItems}
              actionsLabel={labels.groupActions(section.label)}
              create={
                onCreateSession && { label: labels.newSessionInGroup(section.label), onCreate: onCreateSession }
              }
            />
          </span>
        </span>
      </div>
      {/* 空分组既没有会话也没有子工作区，整块撑开体都不渲染 */}
      {section.sessions.length <= 0 && childIds.length <= 0 ? null : (
        // 组内同样是「子工作区 → 会话」，先文件夹后文件，与父工作区体内同一顺序
        <ExpandableBody open={expanded}>
          <div className={styles.groupBody}>
            {childIds.length === 0 ? null : (
              <div className={styles.nest}>{childIds.map(renderChildWorkspace)}</div>
            )}
            {section.sessions.length <= 0 ? null : (
              // 组内会话行不带区域键：整块分组那一格接得住归组，落在行上会一路走到它
              <div className={styles.sessions}>{children}</div>
            )}
          </div>
        </ExpandableBody>
      )}
    </div>
  )
}
