/**
 * 带无障碍标签的 16px 行内按钮
 *
 * 官方行内按钮几何来自 ui-workspace 的 CSS Module，primitives 没有等价的
 * 16px 行内按钮，因此保留本地 16px 几何，图标仍取 primitives 导出。
 * 显隐由 `.wg-row-action` 统一负责，调用方不需要再传额外类名
 */
import type { ReactElement } from 'react'

export interface IconButtonProps {
  /** 无障碍标签 */
  ariaLabel: string
  icon: ReactElement
  onClick: () => void
}

export function IconButton({ ariaLabel, icon, onClick }: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="wg-row-action"
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {icon}
    </button>
  )
}
