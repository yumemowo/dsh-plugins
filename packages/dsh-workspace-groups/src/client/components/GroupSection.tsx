/**
 * 一个分组：可折叠的分组头（箭头、名称、会话数、`...` 菜单与 `+`）加组内会话行
 *
 * 分组头的行尾操作与工作区行同形：`...` 打开管理菜单（重命名 / 删除分组），`+` 在该分组新建会话
 * 分组没有折叠用的文件夹槽，也不像工作区行那样悬停时换图标，因此图标列只有箭头一个
 *
 * 「未分组」在工作区内部不是分组——未归组的会话由区域组件直接平铺，不经过这里
 */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { IconTriangleRightFill14 } from '../runtime.ts'
import { GROUP_MENU, ROW_MENU, buildGroupMenuItems, buildRowContextMenuItems } from '../menus.tsx'
import { CollapsibleBody } from './CollapsibleBody.tsx'
import { RowActions } from './RowActions.tsx'
import { useRowContextMenu } from './RowContextMenu.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { GroupSection as GroupSectionData } from '../data/types.ts'

export interface GroupSectionProps {
  section: GroupSectionData
  collapsed: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 在该分组新建会话，缺省表示该行不提供新建入口 */
  onCreateSession?: (() => void) | undefined
  /** 已渲染好的组内会话行 */
  children: ReactNode
  /** 组内会话那一段的小标题，只在组里同时有子工作区时才渲染 */
  sessionsLabel: string
  /** 把一个子工作区渲染成一个完整的工作区块 */
  renderChildWorkspace: (workspaceId: string) => ReactNode
  /** 分组行操作位的文案 */
  labels: {
    /** `...` 按钮的无障碍标签，取分组名 */
    actions: (name: string) => string
    /** 「新建会话」菜单项 */
    newSessionItem: string
    /** 「重命名分组」菜单项 */
    rename: string
    /** 「删除分组」菜单项 */
    delete: string
    /** `+` 按钮的无障碍标签，取分组名 */
    newSession: (name: string) => string
  }
}

export function GroupSection({
  section,
  collapsed,
  onToggle,
  onRename,
  onDelete,
  onCreateSession,
  children,
  sessionsLabel,
  renderChildWorkspace,
  labels,
}: GroupSectionProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它：右键多一项「新建会话」，但 id 相同者
   * 必须落到同一件事上
   */
  const childIds = section.children ?? []
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === ROW_MENU.newSession) onCreateSession?.()
    else if (id === GROUP_MENU.rename) onRename()
    else if (id === GROUP_MENU.delete) onDelete()
  }

  const menuItems = buildGroupMenuItems({
    renameLabel: labels.rename,
    deleteLabel: labels.delete,
  })

  const contextMenu = useRowContextMenu({
    items: buildRowContextMenuItems(
      menuItems,
      onCreateSession === undefined ? undefined : labels.newSessionItem,
    ),
    onSelect: select,
  })

  return (
    <div className="wg-group">
      <div
        className={'wg-group-head' + (menuOpen ? ' wg-row-menu-open' : '')}
        // 参与所在折叠体的逐个淡入，序号由折叠体按文档序下发
        data-wg-stagger=""
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
        onContextMenu={contextMenu.onContextMenu}
      >
        {contextMenu.menu}
        <span className="wg-slot">
          <IconTriangleRightFill14 className={`wg-arrow${collapsed ? '' : ' wg-arrow-open'}`} />
        </span>
        <span className="wg-group-label">{section.label}</span>
        {/* 会话数自己成格贴在行右，与 session 行的 time 同格同形；空分组不显示
            只算会话，放进来的子工作区另用层级表达，混进同一个数会看不出组里是什么 */}
        {section.sessions.length <= 0 ? null : (
          <span className="wg-group-count">{section.sessions.length}</span>
        )}
        {/* 操作位收进 session 行同一套可收放槽位，静止时不占宽，上面的会话数因此贴到行右；悬停/菜单展开/键盘聚焦时槽位展开，会话数隐去 */}
        <span className="wg-row-action-slot">
          <RowActions
            menuOpen={menuOpen}
            onMenuOpen={setMenuOpen}
            onMenuSelect={select}
            menuItems={menuItems}
            actionsLabel={labels.actions(section.label)}
            create={
              onCreateSession === undefined
                ? undefined
                : { label: labels.newSession(section.label), onCreate: onCreateSession }
            }
          />
        </span>
      </div>
      {/* 空分组既没有会话也没有子工作区，整块折叠体都不渲染 */}
      {section.sessions.length <= 0 && childIds.length <= 0 ? null : (
        // 组内同样是「子工作区 → 会话」，先文件夹后文件，与父工作区体内同一顺序
        <CollapsibleBody open={!collapsed}>
          <div className="wg-group-body">
            {childIds.length === 0 ? null : (
              <div className="wg-nest">{childIds.map(renderChildWorkspace)}</div>
            )}
            {section.sessions.length <= 0 ? null : (
              <div className="wg-sessions">
                {/* 组里同时有子工作区时，两者的行文字左缘落在同一条竖线上
                    加一个小标题并拉开间距，否则读不出哪几行是会话 */}
                {childIds.length > 0 ? (
                  <div className="wg-sessions-title" data-wg-stagger="">
                    {sessionsLabel}
                  </div>
                ) : null}
                {children}
              </div>
            )}
          </div>
        </CollapsibleBody>
      )}
    </div>
  )
}
