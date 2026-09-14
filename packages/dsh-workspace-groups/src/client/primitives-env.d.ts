/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 ambient 模块声明。
 *
 * 该包没有独立安装形态（客户端把它编进基线静态模块表，运行期由模块
 * 系统解析）。本文件必须是全局脚本形态（无顶层 import/export），
 * declare module 才是环境声明而不是模块扩充。
 *
 * 只声明本包实际用到的导出；props 只列本包会传的字段。
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

  /** 通用按钮；variant 决定填充、悬停与边框。 */
  export const Button: (props: {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
    className?: string
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
    autoFocus?: boolean
    type?: 'button' | 'submit' | 'reset'
  }) => ReactNode

  /** 居中对话框；页脚按钮由调用方组装。 */
  export const Modal: (props: {
    open: boolean
    onClose: () => void
    title: ReactNode
    /** 关闭按钮的无障碍标签。 */
    closeLabel: string
    description?: ReactNode
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
  }) => ReactNode

  /** 单行文本输入；带边框与聚焦态。 */
  export const Input: (props: {
    value: string
    onChange?: (event: { currentTarget: { value: string } }) => void
    onKeyDown?: (event: { key: string; preventDefault: () => void }) => void
    /** 输入法组合期间为真，用于让 Enter 不抢组合键。 */
    onCompositionStart?: () => void
    onCompositionEnd?: () => void
    onFocus?: (event: { target: { select: () => void } }) => void
    placeholder?: string
    disabled?: boolean
    autoFocus?: boolean
    'aria-label'?: string
    maxLength?: number
    className?: string
    icon?: ReactNode
  }) => ReactNode

  /** 16px 图标原语；颜色继承自父级。 */
  export type IconComponent = (props: {
    size?: number
    className?: string
  }) => ReactNode

  export const IconFolderClose16: IconComponent
  export const IconFolderOpen16: IconComponent
  export const IconTriangleRightFill14: IconComponent
  export const IconEllipsisOutline16: IconComponent
  export const IconPlusOutline16: IconComponent
  export const IconEditOutline16: IconComponent
  export const IconTrashOutline16: IconComponent
  export const IconNewChatOutline16: IconComponent
  export const IconPanelLeftOutline16: IconComponent
}
