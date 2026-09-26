/**
 * 带无障碍标签的 16px 行内按钮
 *
 * 官方行内按钮几何来自 ui-workspace 的 CSS Module
 * primitives 没有等价的 16px 行内按钮，因此保留本地 16px 几何，图标仍取 primitives 导出
 * 显隐由 `.wg-row-action` 统一负责，调用方不需要再传额外类名
 *
 * 点击一律 `stopPropagation`：它总是嵌在一个自己也可点的行里，例如工作区行、分组行、下拉菜单的条目行
 * 不拦住就会连带触发整行的动作
 */
import type { ReactElement } from 'react'

export interface IconButtonProps {
  /** 无障碍标签 */
  ariaLabel: string
  icon: ReactElement
  onClick: () => void
  /**
   * 切换类按钮的按下态，普通按钮不必传
   *
   * 传了就在按钮上声明 `aria-pressed`。样式直接认这个属性把按钮常驻显示——按下态是这条记录当前的状态，不该只在悬停时才读得到
   * 两者同源，不会各说一套
   */
  pressed?: boolean | undefined
  /** 破坏性动作：悬停时用错误色，与行菜单里的删除项同一做法 */
  danger?: boolean | undefined
}

export function IconButton({
  ariaLabel,
  icon,
  onClick,
  pressed,
  danger,
}: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={'wg-row-action' + (danger === true ? ' wg-row-action-danger' : '')}
      aria-label={ariaLabel}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {icon}
    </button>
  )
}
