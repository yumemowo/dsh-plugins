/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 ambient 模块声明。
 *
 * 该包没有独立安装形态（客户端把它编进基线静态模块表，运行期由模块
 * 系统解析）。本文件必须是全局脚本形态（无顶层 import/export），
 * declare module 才是环境声明而不是模块扩充。
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactNode } from 'react'

  /** 一级菜单里的普通项；`submenu` 存在时悬停展开二级菜单。 */
  export interface MenuActionItem {
    id: string
    label: ReactNode
    icon?: ReactNode
    disabled?: boolean
    danger?: boolean
    submenu?: readonly MenuActionItem[]
  }

  export interface MenuSeparatorItem {
    type: 'separator'
    id: string
  }

  export interface MenuLabelItem {
    type: 'label'
    id: string
    text: string
  }

  export type MenuItem = MenuActionItem | MenuSeparatorItem | MenuLabelItem

  /** 官方菜单原语：支持分隔线/标签/二级子菜单，样式走 DSH 主题。 */
  export const Menu: (props: {
    open: boolean
    anchor: ReactNode
    items: readonly MenuItem[]
    onSelect?: (id: string) => void
    onClose?: () => void
    /** 渲染进 document.body；关闭时菜单相对锚点就近渲染。 */
    portal?: boolean
    /** end：列表右缘对齐锚点右缘（贴近窗口右缘时向左展开）。 */
    align?: 'start' | 'end'
    closeOnPointerLeave?: boolean
  }) => ReactNode
}
