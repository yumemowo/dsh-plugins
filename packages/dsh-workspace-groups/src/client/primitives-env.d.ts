/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 ambient 模块声明
 *
 * 该包没有独立安装形态（客户端把它编进基线静态模块表，运行期由模块系统解析）
 * 本文件必须是全局脚本形态（无顶层 import/export），declare module 才是环境声明而不是模块扩充
 *
 * 只声明本包实际用到的导出，props 只列本包会传的字段
 * 图标名与官方导出表一致：字形名不带尺寸后缀，线宽由 `Regular` / `Medium` 变体承担
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactNode } from 'react'

  /** 一级菜单里的普通项，`submenu` 存在时悬停展开二级菜单 */
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

  /** 官方菜单原语：支持分隔线/标签/二级子菜单，样式走 DSH 主题 */
  export const Menu: (props: {
    open: boolean
    anchor: ReactNode
    items: readonly MenuItem[]
    onSelect?: (id: string) => void
    onClose?: () => void
    /** 渲染进 document.body，关闭时菜单相对锚点就近渲染 */
    portal?: boolean
    /** end：列表右缘对齐锚点右缘（贴近窗口右缘时向左展开） */
    align?: 'start' | 'end'
    closeOnPointerLeave?: boolean
    /**
     * 面板的定位矩形，只在 `portal` 下生效
     *
     * 给了就按它定位，而不是去量锚点元素，右键菜单因此能落在指针处
     * 原语只读四条边，返回 null 表示本次没有可用的矩形，面板保持隐藏
     */
    getAnchorRect?: (() => {
      left: number
      top: number
      right: number
      bottom: number
    } | null) | undefined
    /** 挂在原语根节点上的类名，根节点默认是行内盒，行内使用时靠它调整 */
    className?: string
    /**
     * 挂在面板（下拉卡片）上的类名
     *
     * 面板 portal 到 body 后不在使用方的 DOM 子树里，本包样式只认这个类
     */
    listClassName?: string
  }) => ReactNode

  /** 通用按钮，variant 决定填充、悬停与边框 */
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

  /** 悬停提示，`disabled` 为真时不显示 */
  export const Tooltip: (props: {
    /** 气泡文案，函数形态在气泡可见时才求值 */
    label: string | (() => string)
    side?: 'top' | 'bottom' | 'right'
    delayMs?: number
    disabled?: boolean
    children?: ReactNode
  }) => ReactNode

  /**
   * 悬停详情卡片，指针在锚点上停留一段时间后在它右侧浮出内容
   *
   * 给了 `copyText` 时卡片整体可点即复制，并额外给出一个读屏状态位
   * `copyLabel` 是它的无障碍标签，`copiedLabel` 是复制成功后就地替换显示的反馈
   * 不给 `copyText` 时卡片只读
   */
  export const HoverCard: (props: {
    anchor: ReactNode
    content: ReactNode
    /** 指针停留多久才浮出，原语默认 500ms */
    openDelayMs?: number
    /** 为真时不显示，用于菜单展开等不该再叠一层浮层的时刻 */
    disabled?: boolean
    copyText?: string | undefined
    copyLabel?: string
    copiedLabel?: string
  }) => ReactNode

  /**
   * 开关原语，胶囊轨道 + 圆形滑块，整条控件是一个 `role="switch"` 的按钮
   *
   * 外观只由 `aria-checked` 决定，因此视觉状态与读屏状态不可能不一致
   * `label` 是它的无障碍名，由调用方给（控件只在视觉上挨着旁边的文字，二者没有 DOM 关联）
   * `onChange` 收到的是点击后想要的状态，不是「切换了一次」这个事件
   */
  export const Switch: (props: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
    title?: string
    className?: string
  }) => ReactNode

  /** 居中对话框，页脚按钮由调用方组装 */
  export const Modal: (props: {
    open: boolean
    onClose: () => void
    title: string
    /** 说明句，原语只接受纯文本 */
    description?: string
    /** 关闭按钮的无障碍标签 */
    closeLabel: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    contentClassName?: string
  }) => ReactNode

  /** 单行文本输入，带边框与聚焦态 */
  export const Input: (props: {
    value: string
    onChange?: (event: { currentTarget: { value: string } }) => void
    onKeyDown?: (event: { key: string; preventDefault: () => void }) => void
    /** 输入法组合期间为真，用于让 Enter 不抢组合键 */
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

  /** 16px 图标原语，颜色继承自父级 */
  export type IconComponent = (props: {
    size?: number
    className?: string
  }) => ReactNode

  /**
   * 会话状态点原语：`ongoing` 画追光方阵，其余状态画实心圆点
   *
   * `done` 与 `warning` 的颜色由原语自带的主题规则给出，调用方不设颜色
   */
  export const StateDot: (props: {
    state: 'ongoing' | 'done' | 'warning'
    size?: number
    className?: string
  }) => ReactNode

  /**
   * 相对时间分桶：把时间差归到 `now` / `minutes` / `hours` / `days` / `months` / `years` 之一
   * 并给出数量，文案由调用方的语言包决定
   * @param from - 起点（epoch ms）
   * @param to - 终点（epoch ms），通常是当前时刻
   */
  export const relativeTime: (
    from: number,
    to: number,
  ) => { unit: 'now' | 'minutes' | 'hours' | 'days' | 'months' | 'years'; n: number }

  export const IconFolderCloseRegular: IconComponent
  export const IconFolderOpenRegular: IconComponent
  /** 官方「单列表」（flat）那一项的字形，本包用它标「平铺」这条展示方式 */
  export const IconFlatListOutlineRegular: IconComponent
  export const IconTriangleRightFillRegular: IconComponent
  /** composer slash 菜单给「可深入」候选用的行尾箭头，用来表达此处有二级菜单 */
  export const IconChevronRightOutlineRegular: IconComponent
  /** 下拉箭头，本包用它做菜单里可折叠分区的开合指示与 header 的菜单入口 */
  export const IconChevronDownOutlineRegular: IconComponent
  /** 勾选标记，本包用它标出菜单里当前聚焦的那一条 */
  export const IconCheckOutlineRegular: IconComponent
  export const IconEllipsisOutlineRegular: IconComponent
  export const IconPlusOutlineRegular: IconComponent
  /** 官方 sidebar 与工作区行「新建会话」按钮的图标 */
  export const IconNewChatOutlineRegular: IconComponent
  export const IconEditOutlineRegular: IconComponent
  export const IconTrashOutlineRegular: IconComponent
  export const IconPanelLeftOutlineRegular: IconComponent
  /** 「添加工作区」入口用的图标，与官方 header 同字形 */
  export const IconProjectAddOutlineRegular: IconComponent
  /** 官方 header「搜索」入口的图标 */
  export const IconSearchOutlineRegular: IconComponent
  /** 官方搜索框清除按钮的图标 */
  export const IconCloseFillRegular: IconComponent
  /** 官方 header「视图选项」入口的图标 */
  export const IconSlidersTwoOutlineRegular: IconComponent
  /** 官方会话菜单「分叉」项用的图标 */
  export const IconBranchOutlineRegular: IconComponent
  /** 官方会话菜单「归档 / 取消归档」项用的图标 */
  export const IconArchiveOutlineRegular: IconComponent
  export const IconUnarchiveOutlineRegular: IconComponent
  /** 置顶按钮两态：钉身描边 / 填实 */
  export const IconPinOutlineRegular: IconComponent
  export const IconPinFillRegular: IconComponent
  /** 官方「按工作区树分组」选项的字形，本包用它标出子工作区嵌套开关 */
  export const IconWorkspaceTreeOutlineRegular: IconComponent
}
