/**
 * 容器行行尾的操作位：`...` 管理菜单加可选的新建会话按钮
 *
 * 工作区行与分组行共用同一份布局与显隐语义（`.rowActions` 的 12px 间距、`.rowAction` 的悬停显隐）
 * 差异只在菜单条目与两个无障碍文案，因此收在这里而不是各写一遍
 *
 * 菜单开合状态由持有行的组件持有，本组件只把它转成锚点按钮上的 `aria-expanded`
 * 样式据此把展开期间的操作位留住（见 `rows.module.css` 的 `.rowAction` 显隐规则）
 */
import type { ReactElement } from 'react'
import {
  IconEllipsisOutlineRegular,
  IconNewChatOutlineRegular,
  Menu,
} from '../runtime.ts'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from './components/IconButton.tsx'
import rowsStyles from './components/rows.module.css'
import menusStyles from '../menus.module.css'

export interface RowActionsProps {
  menuOpen: boolean
  onMenuOpen: (open: boolean) => void
  /** 菜单选中项 id，由调用方分派 */
  onMenuSelect: (id: string) => void
  /** 管理菜单条目，缺省表示该行没有管理操作 */
  menuItems?: readonly MenuItem[] | undefined
  /** `...` 按钮的无障碍标签 */
  actionsLabel: string
  /** 新建会话入口，缺省表示该行不提供新建 */
  create?: { label: string; onCreate: () => void } | undefined
}

export function RowActions({
  menuOpen,
  onMenuOpen,
  onMenuSelect,
  menuItems,
  actionsLabel,
  create,
}: RowActionsProps): ReactElement | null {
  // 两类操作都没有时整个操作位不渲染，不留占位
  if (menuItems === undefined && create === undefined) return null

  return (
    <span className={rowsStyles.rowActions}>
      {menuItems && (
        <Menu
          open={menuOpen}
          onClose={() => onMenuOpen(false)}
          onSelect={onMenuSelect}
          // portal 进 document.body：本区域的列表容器 overflow 裁剪会把就近渲染的菜单裁掉
          // 二级面板的方向由宿主挂的 body 标记控制（见 index.ts），这里不感知宿主差异
          portal
          closeOnPointerLeave
          // 面板被 portal 出去后不在本包的 DOM 子树里，官方为此留了这一个样式钩子
          // 本包借它修二级面板的底色（见 `menus.module.css` 的 `.menuList`）
          listClassName={menusStyles.menuList}
          anchor={
            <button
              type="button"
              className={rowsStyles.rowAction}
              aria-label={actionsLabel}
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation()
                onMenuOpen(!menuOpen)
              }}
            >
              <IconEllipsisOutlineRegular />
            </button>
          }
          items={menuItems}
        />
      )}
      {create && (
        <IconButton
          ariaLabel={create.label}
          // 取官方工作区行新建会话按钮的字形，与本包行内那枚按钮一致
          // 同一个动作的行内与菜单两处因此共用同一枚图标
          icon={<IconNewChatOutlineRegular />}
          onClick={create.onCreate}
        />
      )}
    </span>
  )
}
