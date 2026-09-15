/**
 * 一个分组：可折叠的分组头（箭头、名称、会话数、`...` 菜单与 `+`）加组内会话行
 *
 * 分组头的行尾操作与工作区行同形：`...` 打开管理菜单（重命名 / 删除分组），
 * `+` 在该分组新建会话。分组没有折叠用的文件夹槽，也不像工作区行那样悬停时
 * 换图标，因此图标列只有箭头一个
 *
 * 「未分组」在工作区内部不是分组——未归组的会话由区域组件直接平铺，
 * 不经过这里
 */
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { IconTriangleRightFill14 } from '../runtime.ts'
import { GROUP_MENU, buildGroupMenuItems } from '../menus.tsx'
import { RowActions } from './RowActions.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { GroupSection as GroupSectionData } from '../data/types.ts'

export interface GroupSectionProps {
  section: GroupSectionData
  collapsed: boolean
  onToggle: () => void
  onRename: () => void
  onDelete: () => void
  /** 在该分组新建会话；缺省表示该行不提供新建入口 */
  onCreateSession?: (() => void) | undefined
  /** 已渲染好的组内会话行 */
  children: ReactNode
  /** 分组行操作位的文案 */
  labels: {
    /** `...` 按钮的无障碍标签，取分组名 */
    actions: (name: string) => string
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
  labels,
}: GroupSectionProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="wg-group">
      <div
        className={'wg-group-head' + (menuOpen ? ' wg-row-menu-open' : '')}
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
      >
        <span className="wg-slot">
          <IconTriangleRightFill14 className={`wg-arrow${collapsed ? '' : ' wg-arrow-open'}`} />
        </span>
        <span className="wg-group-label">{section.label}</span>
        {/* 会话数自己成格贴在行右，与 session 行的 time 同格同形；空分组不显示 */}
        {section.sessions.length <= 0 ? null : (
          <span className="wg-group-count">{section.sessions.length}</span>
        )}
        {/* 操作位收进 session 行同一套可收放槽位：静止时不占宽，上面的会话数
            因此贴到行右；悬停/菜单展开/键盘聚焦时槽位展开，会话数隐去 */}
        <span className="wg-row-action-slot">
          <RowActions
            menuOpen={menuOpen}
            onMenuOpen={setMenuOpen}
            onMenuSelect={(id) => {
              setMenuOpen(false)
              if (id === GROUP_MENU.rename) onRename()
              else if (id === GROUP_MENU.delete) onDelete()
            }}
            menuItems={buildGroupMenuItems({
              renameLabel: labels.rename,
              deleteLabel: labels.delete,
            })}
            actionsLabel={labels.actions(section.label)}
            create={
              onCreateSession === undefined
                ? undefined
                : { label: labels.newSession(section.label), onCreate: onCreateSession }
            }
          />
        </span>
      </div>
      {collapsed || section.sessions.length <= 0 ? null : <div className="wg-sessions">{children}</div>}
    </div>
  )
}
