/**
 * 容器行行尾的操作位：`...` 管理菜单加可选的 `+` 新建会话
 *
 * 工作区行与分组行共用同一份布局与显隐语义（`.wg-row-actions` 的 12px 间距、`.wg-row-action` 的悬停显隐）
 * 差异只在菜单条目与两个无障碍文案，因此收在这里而不是各写一遍
 *
 * 菜单开合状态由持有行的组件持有：行组件要给行加上 `wg-row-menu-open`
 * 该标记同时负责「菜单开着时锚点按钮不消失」（见 `styles.ts`）
 */
import type { ReactElement } from 'react'
import { IconEllipsisOutline16, IconPlusOutline16, Menu } from '../runtime.ts'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from './IconButton.tsx'

export interface RowActionsProps {
  menuOpen: boolean
  onMenuOpen: (open: boolean) => void
  /** 菜单选中项 id；由调用方分派 */
  onMenuSelect: (id: string) => void
  /** 管理菜单条目；缺省表示该行没有管理操作 */
  menuItems?: readonly MenuItem[] | undefined
  /** `...` 按钮的无障碍标签 */
  actionsLabel: string
  /** 新建会话入口；缺省表示该行不提供新建 */
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
    <span className="wg-row-actions">
      {menuItems === undefined ? null : (
        <Menu
          open={menuOpen}
          onClose={() => onMenuOpen(false)}
          onSelect={onMenuSelect}
          // portal 进 document.body：本区域的列表容器 overflow 裁剪会把就近渲染的菜单裁掉
          // 二级面板的方向由宿主挂的 body 标记控制（见 index.ts），这里不感知宿主差异
          portal
          closeOnPointerLeave
          anchor={
            <button
              type="button"
              className="wg-row-action"
              aria-label={actionsLabel}
              onClick={(event) => {
                event.stopPropagation()
                onMenuOpen(!menuOpen)
              }}
            >
              <IconEllipsisOutline16 />
            </button>
          }
          items={menuItems}
        />
      )}
      {create === undefined ? null : (
        <IconButton
          ariaLabel={create.label}
          icon={<IconPlusOutline16 />}
          onClick={create.onCreate}
        />
      )}
    </span>
  )
}
