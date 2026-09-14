/**
 * 行内「更多操作」菜单的条目构造。
 *
 * 只产出菜单数据（id、文案、图标、禁用与危险标记），不关心菜单如何渲染与
 * 开合：渲染由 `Menu` 原语负责，开合状态由持有锚点的行组件负责。
 */
import { IconEditOutline16, IconPlusOutline16, IconTrashOutline16 } from './runtime.ts'
import type { MenuActionItem, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GroupSection } from './data/types.ts'

/** 会话「更多操作」菜单里分组项的选项集。 */
export interface GroupMenuInput {
  /** 按工作区视图顺序排列的全部分组（未过滤）。 */
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id；空串表示未归组。 */
  currentGroupId: string
  /** 「分组」一级项文案。 */
  label: string
  /** 「取消分组」文案。 */
  ungroupLabel: string
}

/**
 * 构造会话「更多操作」菜单里的分组一级项。
 *
 * 二级子菜单保持传入（即工作区视图）的分组顺序，并剔除当前会话所在的
 * 分组——把自己移动到自己是无意义的操作。没有任何可选项时该项禁用。
 * @param input - 分组选项集。
 * @returns 可放进 Menu items 的分组项；分组不存在时也返回占位项以稳定菜单维度。
 */
export function buildGroupMenuItem(input: GroupMenuInput): MenuActionItem {
  const { sections, currentGroupId, label } = input
  const candidates = sections
    .filter((section) => section.id !== currentGroupId)
    .map((section) => ({ id: `group:${section.id}`, label: section.label }))
  return {
    id: 'group',
    label,
    disabled: candidates.length === 0,
    submenu: candidates,
  }
}

/**
 * 构造会话「更多操作」菜单的完整条目。
 *
 * 一级菜单为：分组（二级展开）、其下的「取消分组」（仅当会话已归组）。
 * 分组没有任何可选项时「分组」仍占位但禁用，菜单结构不因数据为空而跳动。
 * @param input - 分组选项集。
 * @returns Menu items 列表。
 */
export function buildSessionMenuItems(input: GroupMenuInput): readonly MenuItem[] {
  const items: MenuItem[] = [buildGroupMenuItem(input)]
  if (input.currentGroupId !== '') {
    items.push({
      id: 'ungroup',
      label: input.ungroupLabel,
    })
  }
  return items
}

/** 工作区行「更多操作」菜单的条目文案。 */
export interface WorkspaceMenuInput {
  /** 「新建分组」项文案。 */
  newGroupLabel: string
  /** 「重命名工作区」项文案。 */
  renameLabel: string
  /** 「删除工作区」项文案。 */
  deleteLabel: string
}

/** 工作区菜单条目 id；与 `WorkspaceRow` 的分派一一对应。 */
export const WORKSPACE_MENU = {
  newGroup: 'new-group',
  rename: 'rename',
  delete: 'delete',
} as const

/**
 * 构造工作区「更多操作」菜单的条目。
 *
 * 两项官方操作的相对顺序与官方一致（重命名在前、删除在后）；本包自有的
 * 「新建分组」排在最前，它是三项里唯一的建造型操作。删除项带 `danger`
 * 标记，与官方删除工作区一样由菜单原语渲染危险语义。
 * @param input - 三项文案。
 * @returns Menu items 列表。
 */
export function buildWorkspaceMenuItems(input: WorkspaceMenuInput): readonly MenuItem[] {
  return [
    { id: WORKSPACE_MENU.newGroup, label: input.newGroupLabel, icon: <IconPlusOutline16 /> },
    { id: WORKSPACE_MENU.rename, label: input.renameLabel, icon: <IconEditOutline16 /> },
    { id: WORKSPACE_MENU.delete, label: input.deleteLabel, icon: <IconTrashOutline16 />, danger: true },
  ]
}
