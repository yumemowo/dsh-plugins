/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 node 测试替身。
 *
 * node 环境不渲染组件：测试只断言菜单条目数据、图标引用与注册行为，
 * 因此这里的组件一律返回 null、图标返回一个可断言的标记元素。
 */

const nullComponent = () => null

export const Menu = nullComponent
export const Button = nullComponent
export const Modal = nullComponent
export const Input = nullComponent

/** 图标替身：返回元素名，测试据此断言渲染了哪个官方图标。 */
const icon = (name) => () => name

export const IconFolderClose16 = icon('IconFolderClose16')
export const IconFolderOpen16 = icon('IconFolderOpen16')
export const IconTriangleRightFill14 = icon('IconTriangleRightFill14')
export const IconEllipsisOutline16 = icon('IconEllipsisOutline16')
export const IconPlusOutline16 = icon('IconPlusOutline16')
export const IconEditOutline16 = icon('IconEditOutline16')
export const IconTrashOutline16 = icon('IconTrashOutline16')
export const IconNewChatOutline16 = icon('IconNewChatOutline16')
export const IconPanelLeftOutline16 = icon('IconPanelLeftOutline16')

export default {
  Menu,
  Button,
  Modal,
  Input,
  IconFolderClose16,
  IconFolderOpen16,
  IconTriangleRightFill14,
  IconEllipsisOutline16,
  IconPlusOutline16,
  IconEditOutline16,
  IconTrashOutline16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
}
