/**
 * 一个工作区标题行
 *
 * 行内操作与官方工作区行同形：`...` 打开管理菜单（新建分组 / 重命名 / 删除），
 * `+` 直接在该工作区新建会话。静止时显示文件夹（开/闭随展开态），悬停时让位
 * 给三角箭头，两个槽常驻同一 16px 列，因此切换时标题不位移
 *
 * 「新建分组」不像「新建会话」那样高频，因此不占行内位置，收进菜单。未分组桶
 * 没有工作区归属，管理回调都不传，行尾操作位整体不渲染
 *
 * 悬停后浮出官方 `HoverCard`：卡片里是工作区名、目录路径（home 缩写）与绝对创建
 * 时刻，整卡可点即复制完整路径。未分组桶不是真实工作区（没有目录与创建时刻），
 * 官方在那里同样不给卡片，因此 `hover` 缺省即整卡不渲染
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  HoverCard,
  IconFolderClose16,
  IconFolderOpen16,
  IconTriangleRightFill14,
} from '../runtime.ts'
import {
  ROW_MENU,
  VIRTUAL_WORKSPACE_ITEM,
  VIRTUAL_WORKSPACE_PREFIX,
  WORKSPACE_MENU,
  buildRowContextMenuItems,
  buildWorkspaceMenuItems,
} from '../menus.tsx'
import type { VirtualWorkspaceMenuInput } from '../menus.tsx'
import { RowActions } from './RowActions.tsx'
import { WorkspaceHoverContent } from './HoverCards.tsx'
import { useRowContextMenu } from './RowContextMenu.tsx'
import { handleRowKeyDown } from './rowKeyboard.ts'
import type { OfficialHoverLabels } from '../official.ts'

/** 工作区标题行的文案与无障碍标签 */
export interface WorkspaceRowLabels {
  /** 工作区「更多操作」按钮的无障碍标签，取工作区名 */
  actions: (name: string) => string
  /** 新建会话按钮的无障碍标签，取工作区名 */
  newSession: (name: string) => string
  /** 菜单里的「新建会话」项 */
  newSessionItem: string
  /** 菜单里的「新建分组」项 */
  newGroup: string
  /** 菜单里的「重命名工作区」项 */
  rename: string
  /** 菜单里的「删除工作区」项 */
  delete: string
}

/** 工作区悬停卡片要显示的正文 */
export interface WorkspaceHoverData {
  /** 工作区名 */
  label: string
  /** 已按宿主 home 缩写的目录路径 */
  path: string
  /** 绝对创建时刻文案 */
  created: string
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
  /**
   * 工作区分组选中项：`create-virtual-workspace` / `ungroup-workspace` / `vw:<id>`
   *
   * 与其它回调平级；缺省表示该行不提供工作区分组入口（未分组桶的工作区行）
   */
  onSelectVirtualWorkspace?: ((id: string) => void) | undefined
  /** 悬停卡片正文；缺省表示该行不挂卡片（未分组桶） */
  hover?: WorkspaceHoverData | undefined
  /** 悬停卡片可复制的内容，取完整目录路径；缺省表示卡片只读 */
  hoverCopy?: string | undefined
  /** 悬停卡片的文案 */
  hoverLabels?: OfficialHoverLabels | undefined
  /**
   * 该行「移动工作区分组」一级项及其子菜单的选项集
   *
   * 与 `labels` 分开传：文案对所有行相同，归属却逐行不同
   */
  virtualWorkspace?: VirtualWorkspaceMenuInput | undefined
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
  onSelectVirtualWorkspace,
  hover,
  hoverCopy,
  hoverLabels,
  virtualWorkspace,
  labels,
}: WorkspaceRowProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const manageable = onNewGroup !== undefined || onRename !== undefined || onDelete !== undefined

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它：两个入口的条目集合不同（右键多一项
   * 「新建会话」），但 id 相同者必须落到同一件事上，否则同一个动作在两个
   * 入口下会各走一套
   */
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === ROW_MENU.newSession) onCreateSession?.()
    else if (id === WORKSPACE_MENU.newGroup) onNewGroup?.()
    else if (id === WORKSPACE_MENU.rename) onRename?.()
    else if (id === WORKSPACE_MENU.delete) onDelete?.()
    else if (
      id === VIRTUAL_WORKSPACE_ITEM.create ||
      id === VIRTUAL_WORKSPACE_ITEM.ungroup ||
      id.startsWith(VIRTUAL_WORKSPACE_PREFIX)
    ) {
      onSelectVirtualWorkspace?.(id)
    }
  }

  const menuItems = manageable
    ? buildWorkspaceMenuItems({
        newGroupLabel: labels.newGroup,
        renameLabel: labels.rename,
        deleteLabel: labels.delete,
        // 没有移入入口的行（未分组桶）不出现这一项，否则是个点不动的死入口
        virtualWorkspaceGrouping: onSelectVirtualWorkspace === undefined ? undefined : virtualWorkspace,
      })
    : undefined

  // 没有新建入口时「新建会话」项不出现，右键菜单因此就是 `...` 菜单本身
  const contextMenu = useRowContextMenu({
    items:
      menuItems === undefined
        ? undefined
        : buildRowContextMenuItems(
            menuItems,
            onCreateSession === undefined ? undefined : labels.newSessionItem,
          ),
    onSelect: select,
  })

  const row = (
    <div
      className={'wg-workspace-head' + (menuOpen ? ' wg-row-menu-open' : '')}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => handleRowKeyDown(event, onToggle)}
      onContextMenu={contextMenu.onContextMenu}
    >
      {contextMenu.menu}
      <span className={`wg-slot wg-folder${folderActive ? ' wg-folder-active' : ''}`}>
        {collapsed ? <IconFolderClose16 /> : <IconFolderOpen16 />}
      </span>
      <span className="wg-slot wg-chevron">
        <IconTriangleRightFill14 className={`wg-arrow${collapsed ? '' : ' wg-arrow-open'}`} />
      </span>
      <span className="wg-workspace-title">{title}</span>
      <RowActions
        menuOpen={menuOpen}
        onMenuOpen={setMenuOpen}
        onMenuSelect={select}
        menuItems={menuItems}
        actionsLabel={labels.actions(title)}
        create={
          onCreateSession === undefined
            ? undefined
            : { label: labels.newSession(title), onCreate: onCreateSession }
        }
      />
    </div>
  )

  // 没有正文（未分组桶）或拿不到官方文案时不挂浮层：卡片里那几行文案与复制反馈
  // 都属官方语言包，缺了它们只会浮出一个空壳
  if (hover === undefined || hoverLabels === undefined) return row

  return (
    <HoverCard
      anchor={row}
      content={
        <WorkspaceHoverContent label={hover.label} path={hover.path} created={hover.created} />
      }
      // 两种面板开着时都不挂卡片：行内 `...` 菜单与行右键菜单
      disabled={menuOpen || contextMenu.open}
      // 复制的是完整路径而不是卡片里那份缩写：缩写只是排版，用户要的是能直接用的路径
      copyText={hoverCopy}
      copyLabel={hoverLabels.copy}
      copiedLabel={hoverLabels.copied}
    />
  )
}
