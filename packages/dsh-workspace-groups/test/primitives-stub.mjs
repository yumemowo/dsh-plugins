/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 node 测试替身
 *
 * node 环境不渲染组件：测试只断言菜单条目数据、图标引用与注册行为，
 * 因此这里的组件一律返回 null、图标返回一个可断言的标记元素
 *
 * 例外是 HoverCard：它那层包装会改变 DOM 结构，样式里有对应的选择器，
 * 因此替身照真原语套一同样的盒
 */
import { createElement } from 'react'

const nullComponent = () => null

export const Menu = nullComponent
export const Button = nullComponent
export const Modal = nullComponent
export const Input = nullComponent

/** 状态点替身：把状态原样暴露成可断言的文本 */
export const StateDot = ({ state }) => `StateDot:${state}`

/** 图标替身：返回元素名，测试据此断言渲染了哪个官方图标 */
const icon = (name) => () => name

export const IconFolderClose16 = icon('IconFolderClose16')
export const IconFolderOpen16 = icon('IconFolderOpen16')
export const IconTriangleRightFill14 = icon('IconTriangleRightFill14')
export const IconEllipsisOutline16 = icon('IconEllipsisOutline16')
export const IconPlusOutline16 = icon('IconPlusOutline16')
export const IconNewChatOutline16 = icon('IconNewChatOutline16')
export const IconEditOutline16 = icon('IconEditOutline16')
export const IconTrashOutline16 = icon('IconTrashOutline16')
export const IconPanelLeftOutline16 = icon('IconPanelLeftOutline16')
export const IconBranchOutline16 = icon('IconBranchOutline16')
export const IconArchiveOutline20 = icon('IconArchiveOutline20')

/**
 * 相对时间替身：分桶规则与本包 `official.ts` 的契约一致，文案由调用方决定。
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
 * 卡片正文是 portal 到 body 的浮层，node 环境既没有 body 也不该让它混进被断言的
 * 结构里；测试改为从卡片元素的 `content` prop 上直接读正文（见 render.test.ts 的
 * `cards` 分桶）
 *
 * 那一层盒与真原语一致（根节点是个 display:block 的 span）：它会让行不再是
 * 列表容器的直接子项，样式里的层级缩进选择器必须为此多写一档。替身不套这层的话，
 * 这条结构差异在 jsdom 冒烟里就看不见了
 */
export const HoverCard = ({ anchor }) =>
  createElement('span', { 'data-wg-hover-anchor': '' }, anchor)

export const IconProjectAddOutline16 = icon('IconProjectAddOutline16')
export const IconSearchOutline16 = icon('IconSearchOutline16')
export const IconPersonalizationOutline16 = icon('IconPersonalizationOutline16')
export const IconCloseFill14 = icon('IconCloseFill14')

export default {
  Menu,
  Button,
  Modal,
  Input,
  StateDot,
  Tooltip,
  HoverCard,
  relativeTime,
  IconFolderClose16,
  IconFolderOpen16,
  IconTriangleRightFill14,
  IconEllipsisOutline16,
  IconPlusOutline16,
  IconNewChatOutline16,
  IconEditOutline16,
  IconTrashOutline16,
  IconPanelLeftOutline16,
  IconBranchOutline16,
  IconArchiveOutline20,
  IconProjectAddOutline16,
  IconSearchOutline16,
  IconPersonalizationOutline16,
  IconCloseFill14,
}
