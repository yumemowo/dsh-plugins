/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 node 测试替身
 *
 * node 环境不渲染组件，测试只断言菜单条目数据、图标引用与注册行为
 * 因此这里的组件一律返回 null、图标返回一个可断言的标记元素
 *
 * 例外是 HoverCard：它那层包装会改变 DOM 结构，样式里有对应的选择器
 * 因此替身照真原语套一同样的盒
 *
 * 图标名与官方导出表一致：字形名不带尺寸后缀，线宽由 `Regular` / `Medium` 变体承担
 * 本包一律取 `Regular`
 */
import { createElement } from 'react'

const nullComponent = () => null

export const Menu = nullComponent
export const Button = nullComponent
export const Modal = nullComponent
export const Input = nullComponent

/** 状态点替身：把状态原样暴露成可断言的文本 */
export const StateDot = ({ state }) => `StateDot:${state}`

/**
 * 开关替身：照真原语渲染同一个可断言的控件
 *
 * 真原语是一个 `role="switch"` 的按钮，`aria-checked` 同时决定外观与读屏状态
 * 这里照抄那一层，jsdom 用例才能断言「开关是否打开」而不是去猜某个内部结构
 * 真原语的滑块 span 没有语义，替身不渲染它
 */
export const Switch = ({ checked, onChange, label, disabled = false, title, className }) =>
  createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': String(checked),
    'aria-label': label,
    title,
    disabled,
    className,
    onClick: () => onChange(!checked),
  })

/** 图标替身：返回元素名，测试据此断言渲染了哪个官方图标 */
const icon = (name) => () => name

export const IconFolderCloseRegular = icon('IconFolderCloseRegular')
export const IconFolderOpenRegular = icon('IconFolderOpenRegular')
export const IconFlatListOutlineRegular = icon('IconFlatListOutlineRegular')
export const IconTriangleRightFillRegular = icon('IconTriangleRightFillRegular')
export const IconEllipsisOutlineRegular = icon('IconEllipsisOutlineRegular')
export const IconPlusOutlineRegular = icon('IconPlusOutlineRegular')
export const IconNewChatOutlineRegular = icon('IconNewChatOutlineRegular')
export const IconEditOutlineRegular = icon('IconEditOutlineRegular')
export const IconTrashOutlineRegular = icon('IconTrashOutlineRegular')
export const IconPanelLeftOutlineRegular = icon('IconPanelLeftOutlineRegular')
export const IconBranchOutlineRegular = icon('IconBranchOutlineRegular')
export const IconArchiveOutlineRegular = icon('IconArchiveOutlineRegular')
export const IconChevronRightOutlineRegular = icon('IconChevronRightOutlineRegular')
export const IconChevronDownOutlineRegular = icon('IconChevronDownOutlineRegular')
export const IconCheckOutlineRegular = icon('IconCheckOutlineRegular')
export const IconPinOutlineRegular = icon('IconPinOutlineRegular')
export const IconPinFillRegular = icon('IconPinFillRegular')
export const IconWorkspaceTreeOutlineRegular = icon('IconWorkspaceTreeOutlineRegular')

/**
 * 相对时间替身：分桶规则与本包 `official.ts` 的契约一致，文案由调用方决定
 * 这里只需覆盖断言用到的分桶
 */
export const relativeTime = (from, to) => {
  const delta = Math.max(0, to - from)
  const minute = 60_000
  if (delta < minute) return { unit: 'now', n: 0 }
  if (delta < 60 * minute) return { unit: 'minutes', n: Math.floor(delta / minute) }
  if (delta < 24 * 60 * minute) return { unit: 'hours', n: Math.floor(delta / (60 * minute)) }
  return { unit: 'days', n: Math.floor(delta / (24 * 60 * minute)) }
}

/** 悬停提示替身：只渲染子节点，label 另行断言 */
export const Tooltip = ({ children }) => children

/**
 * 悬停卡片替身：只渲染锚点那一半，外面套一层行内盒
 *
 * 卡片正文是 portal 到 body 的浮层
 * node 环境没有 body，也不该让它混进被断言的结构里
 * 测试改为从卡片元素的 `content` prop 上直接读正文（见 render.test.ts 的 `cards` 分桶）
 *
 * 那一层盒与真原语一致（根节点是个 display:block 的 span）：
 * 它会让行不再是列表容器的直接子项，样式里的层级缩进选择器必须为此多写一档
 * 替身不套这层的话，这条结构差异在 jsdom 冒烟里就看不见了
 */
export const HoverCard = ({ anchor }) =>
  createElement('span', { 'data-wg-hover-anchor': '' }, anchor)

export const IconProjectAddOutlineRegular = icon('IconProjectAddOutlineRegular')
export const IconSearchOutlineRegular = icon('IconSearchOutlineRegular')
export const IconSlidersTwoOutlineRegular = icon('IconSlidersTwoOutlineRegular')
export const IconCloseFillRegular = icon('IconCloseFillRegular')

export default {
  Menu,
  Button,
  Modal,
  Input,
  StateDot,
  Switch,
  Tooltip,
  HoverCard,
  relativeTime,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconFlatListOutlineRegular,
  IconTriangleRightFillRegular,
  IconEllipsisOutlineRegular,
  IconPlusOutlineRegular,
  IconNewChatOutlineRegular,
  IconEditOutlineRegular,
  IconTrashOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconBranchOutlineRegular,
  IconArchiveOutlineRegular,
  IconChevronRightOutlineRegular,
  IconChevronDownOutlineRegular,
  IconCheckOutlineRegular,
  IconPinOutlineRegular,
  IconPinFillRegular,
  IconWorkspaceTreeOutlineRegular,
  IconProjectAddOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconCloseFillRegular,
}
