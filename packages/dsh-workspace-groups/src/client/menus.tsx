/**
 * 行内「更多操作」菜单的条目构造
 *
 * 只产出菜单数据（id、文案、图标、禁用与危险标记），不关心菜单如何渲染与
 * 开合：渲染由 `Menu` 原语负责，开合状态由持有锚点的行组件负责
 */
import {
  IconArchiveOutline20,
  IconBranchOutline16,
  IconEditOutline16,
  IconNewChatOutline16,
  IconPlusOutline16,
  IconTrashOutline16,
} from './runtime.ts'
import type { MenuActionItem, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconVirtualWorkspace16 } from './icons.tsx'
import type { OfficialSessionLabels } from './official.ts'
import type { GroupSection, VirtualWorkspaceSection } from './data/types.ts'

/** 会话「更多操作」菜单里分组项的选项集 */
export interface GroupMenuInput {
  /** 按工作区视图顺序排列的全部分组（未过滤） */
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id；空串表示未归组 */
  currentGroupId: string
  /** 「分组」一级项文案 */
  groupLabel: string
  /** 「取消分组」文案 */
  ungroupLabel: string
}

/**
 * 会话菜单的构造输入：两段都可缺省
 *
 * `grouping` 缺省表示该行没有分组可归（「未分组」桶）；`official` 缺省表示
 * 宿主未提供官方会话操作。两段都缺时菜单为空——调用方此时应当直接渲染
 * `SessionRowView` 而不挂菜单
 */
export interface SessionMenuInput {
  grouping?: GroupMenuInput | undefined
  official?: OfficialSessionLabels | undefined
}

/**
 * 构造会话「更多操作」菜单里的分组一级项
 *
 * 二级子菜单保持传入（即工作区视图）的分组顺序，并剔除当前会话所在的
 * 分组——把自己移动到自己是无意义的操作。没有任何可选项时该项禁用
 * @param input - 分组选项集
 * @returns 可放进 Menu items 的分组项；分组不存在时也返回占位项以稳定菜单维度
 */
export function buildGroupMenuItem(input: GroupMenuInput): MenuActionItem {
  const candidates = input.sections
    .filter((section) => section.id !== input.currentGroupId)
    .map((section) => ({ id: `group:${section.id}`, label: section.label }))
  return {
    id: 'group',
    label: input.groupLabel,
    disabled: candidates.length === 0,
    submenu: candidates,
  }
}

/**
 * 构造会话「更多操作」菜单的完整条目
 *
 * 排列依次是官方三项（重命名 / 分叉 / 归档）、一条分隔线、以及本包自有的
 * 分组项（其下「取消分组」仅当会话已归组）。官方三项在前：它们作用于会话
 * 本身，分组项是叠加在此之上的归类操作；分隔线把「官方能力」与「本包扩展」
 * 分成两段，避免两类操作混成一个列表
 *
 * 官方三项的文案与图标都取自官方 `ui-workspace`（见 `official.ts`）；宿主
 * 未提供官方服务时整体省略，只留分组项，不留点不动的死按钮。反之「未分组」
 * 桶里的会话没有分组上下文，只留官方三项。分隔线只在两段都存在时才画
 * @param input - 两段构造输入
 * @returns Menu items 列表
 */
export function buildSessionMenuItems(input: SessionMenuInput): readonly MenuItem[] {
  const items: MenuItem[] = []
  const { grouping, official } = input

  if (official !== undefined) {
    items.push(
      { id: 'rename', label: official.rename, icon: <IconEditOutline16 /> },
      { id: 'fork', label: official.fork, icon: <IconBranchOutline16 /> },
      { id: 'archive', label: official.archive, icon: <IconArchiveOutline20 size={16} /> },
    )
  }

  if (official !== undefined && grouping !== undefined) {
    items.push({ type: 'separator', id: 'separator' })
  }

  if (grouping !== undefined) {
    items.push(buildGroupMenuItem(grouping))
    if (grouping.currentGroupId !== '') {
      items.push({ id: 'ungroup', label: grouping.ungroupLabel })
    }
  }
  return items
}

/** 会话分组菜单条目 id；与 `GroupSection` 的分派一一对应 */
export const GROUP_MENU = {
  rename: 'rename',
  delete: 'delete',
} as const

/** 工作区分组菜单条目 id；与 `VirtualWorkspaceSection` 的分派一一对应 */
export const VIRTUAL_WORKSPACE_MENU = {
  rename: 'rename',
  delete: 'delete',
} as const

/** 分组行「更多操作」菜单的条目文案 */
export interface GroupRowMenuInput {
  /** 「重命名分组」项文案 */
  renameLabel: string
  /** 「删除分组」项文案 */
  deleteLabel: string
}

/**
 * 构造工作区分组行「更多操作」菜单的条目
 *
 * 与会话分组菜单逐项同形（重命名在前、删除在后、删除带 `danger`）：两者都是
 * 「重命名 / 解散这个容器」这一件事，只是容器的层级不同
 * @param input - 两项文案
 * @returns Menu items 列表
 */
export function buildVirtualWorkspaceMenuItems(
  input: GroupRowMenuInput,
): readonly MenuItem[] {
  return [
    { id: VIRTUAL_WORKSPACE_MENU.rename, label: input.renameLabel, icon: <IconEditOutline16 /> },
    {
      id: VIRTUAL_WORKSPACE_MENU.delete,
      label: input.deleteLabel,
      icon: <IconTrashOutline16 />,
      danger: true,
    },
  ]
}

/**
 * 构造分组行「更多操作」菜单的条目
 *
 * 与工作区菜单同形：重命名在前、删除在后，删除项带 `danger` 标记。分组没有
 * 建造型菜单项——「新建分组」属于工作区行，分组行的高频建造操作是行内 `+`
 *（在该分组新建会话）
 * @param input - 两项文案
 * @returns Menu items 列表
 */
export function buildGroupMenuItems(input: GroupRowMenuInput): readonly MenuItem[] {
  return [
    { id: GROUP_MENU.rename, label: input.renameLabel, icon: <IconEditOutline16 /> },
    { id: GROUP_MENU.delete, label: input.deleteLabel, icon: <IconTrashOutline16 />, danger: true },
  ]
}

/** 工作区行「更多操作」菜单的条目文案 */
export interface WorkspaceMenuInput {
  /** 「新建分组」项文案 */
  newGroupLabel: string
  /** 「重命名工作区」项文案 */
  renameLabel: string
  /** 「删除工作区」项文案 */
  deleteLabel: string
  /** 根节点上的工作区分组选项集；缺省表示该行不提供移入工作区分组的入口 */
  virtualWorkspaceGrouping?: VirtualWorkspaceMenuInput | undefined
}

/** 工作区菜单条目 id；与 `WorkspaceRow` 的分派一一对应 */
export const WORKSPACE_MENU = {
  newGroup: 'new-group',
  rename: 'rename',
  delete: 'delete',
} as const

/**
 * 工作区行菜单里「移动到…」这一项的选项集
 *
 * 一级项收集建组与全部可移入的分组，二级子菜单因此是「新建 + 移入」两段合一：
 * 这条动作在界面上的语义就是「把这个工作区放进某个工作区分组，或先建一个再放」，
 * 拆成两个一级项反而要让用户先在脑子里过一遍有没有分组。「移出工作区分组」不在
 * 这条子菜单里——它不是「移动」，而是解散当前归属，因此由本菜单作为一级项平级
 * 渲染（见 `buildWorkspaceMenuItems`）
 */
export interface VirtualWorkspaceMenuInput {
  /** 根节点上的全部分组，按创建顺序 */
  sections: readonly VirtualWorkspaceSection[]
  /** 该工作区当前所属的工作区分组 id；空串表示未归组 */
  currentGroupId: string
  /**
   * 「新建工作区分组」项文案
   *
   * 调用方给的是带省略号的那份：菜单项点下去还要再填一次名字，省略号把这件事
   * 说出来（官方 `menu.addWorkspace` 同样带省略号，而 header 的 `workspace.add`
   * 不带）
   */
  newLabel: string
  /** 「移动到…」一级项文案 */
  moveToLabel: string
  /** 「移出工作区分组」一级项文案；未归组时该项不出现 */
  ungroupLabel: string
}

/** 工作区行「移动到…」子菜单的条目 id 前缀与固定项 */
export const VIRTUAL_WORKSPACE_PREFIX = 'vw:'

/** 工作区分组相关菜单项的 id：`create` 在「移动到…」子菜单里，`ungroup` 是一级项 */
export const VIRTUAL_WORKSPACE_ITEM = {
  /** 新建一个工作区分组并把当前工作区放进去 */
  create: 'create-virtual-workspace',
  /** 把当前工作区移出它所在的分组 */
  ungroup: 'ungroup-workspace',
} as const

/**
 * 构造工作区行菜单里的「移动到…」一级项
 *
 * 二级子菜单的顺序固定为「新建 → 各分组」：建造型操作排在最前（与工作区菜单里
 * 「新建分组」在前同一取舍）。一级项本身不禁用——即便一个分组都没有，它下面
 * 也有「新建」可点
 * @param input - 分组选项集
 * @returns 可放进 Menu items 的一级项
 */
export function buildVirtualWorkspaceMenuItem(input: VirtualWorkspaceMenuInput): MenuActionItem {
  // 建组这一项**不带图标**：它不是一个可以移入的目标，而是这个子菜单里唯一
  // 的独立动作，靠省略号（`新建工作区分组…`）与「点下去还要再填一次」表明身份。
  // 不带图标也就不会与上面带 `+` 的「新建分组」撞形
  const submenu: MenuActionItem[] = [
    { id: VIRTUAL_WORKSPACE_ITEM.create, label: input.newLabel },
  ]
  const candidates = input.sections
    .filter((section) => section.id !== input.currentGroupId)
    .map((section) => ({ id: `${VIRTUAL_WORKSPACE_PREFIX}${section.id}`, label: section.label }))
  submenu.push(...candidates)
  return {
    id: 'move-virtual-workspace',
    label: input.moveToLabel,
    icon: <IconVirtualWorkspace16 />,
    disabled: false,
    submenu,
  }
}

/**
 * 构造工作区行菜单里的「移出工作区分组」一级项
 *
 * 只在工作区已归组时调用。不带图标：它是一个移出动作，不是可移入的目标，与
 * 上面那些带图标的行项目因此有意区分
 * @param label - 「移出工作区分组」项文案
 * @returns Menu item
 */
function ungroupWorkspaceItem(label: string): MenuActionItem {
  return { id: VIRTUAL_WORKSPACE_ITEM.ungroup, label }
}

/**
 * 行右键菜单比行内 `...` 菜单多出的条目 id
 *
 * 右键是行内操作位的捷径，两者共用同一批条目与同一段分派；唯一多出来的是
 * 「新建会话」——它在行内对应的是 `+` 按钮，不是一个菜单项。`+` 仍只以按钮
 * 形态存在，右键菜单把它一并列出，使右键能触达该行全部动作
 */
export const ROW_MENU = {
  newSession: 'new-session',
} as const

/**
 * 构造行右键菜单里的「新建会话」项
 *
 * 图标取官方 sidebar 新建按钮的 `IconNewChatOutline16`：同一个动作在行内是
 * 官方的 `+`，而本菜单里还有一个「新建分组」也带 `+`，两项都用 `+` 就只能
 * 靠文字区分
 * @param label - 「新建会话」项文案
 * @returns Menu item
 */
function newSessionItem(label: string): MenuActionItem {
  return { id: ROW_MENU.newSession, label, icon: <IconNewChatOutline16 /> }
}

/**
 * 构造工作区「更多操作」菜单的条目
 *
 * 顺序是「新建分组 → 重命名 → 移动到… → 移出工作区分组 → 删除」。前两项是
 * 建造与自身属性，归类操作（移动到 / 移出）夹在中间：它们在概念上是一对
 *（进入某分组 / 离开当前分组），因此相邻；「移出」仅在工作区已归组时出现，
 * 未归组时那一格空着，不占位也不禁用。删除项带 `danger` 标记，与官方删除
 * 工作区一样由菜单原语渲染危险语义
 * @param input - 各段文案与选项集
 * @returns Menu items 列表
 */
export function buildWorkspaceMenuItems(input: WorkspaceMenuInput): readonly MenuItem[] {
  const items: MenuItem[] = [
    { id: WORKSPACE_MENU.newGroup, label: input.newGroupLabel, icon: <IconPlusOutline16 /> },
    { id: WORKSPACE_MENU.rename, label: input.renameLabel, icon: <IconEditOutline16 /> },
  ]
  if (input.virtualWorkspaceGrouping !== undefined) {
    items.push(buildVirtualWorkspaceMenuItem(input.virtualWorkspaceGrouping))
    // 「移出」与「移动到…」平级、紧跟在它下方：两者是一对归类操作，合成一条
    // 子菜单会把「离开」藏进「进入」的入口里。仅已归组时出现
    if (input.virtualWorkspaceGrouping.currentGroupId !== '') {
      items.push(ungroupWorkspaceItem(input.virtualWorkspaceGrouping.ungroupLabel))
    }
  }
  items.push({
    id: WORKSPACE_MENU.delete,
    label: input.deleteLabel,
    icon: <IconTrashOutline16 />,
    danger: true,
  })
  return items
}

/**
 * 把行内菜单条目补成右键菜单条目
 *
 * 右键是行内操作位的捷径，因此条目集合与分派都必须一致；差别只有一条：
 * 「新建会话」在行内是 `+` 按钮，菜单里没有对应项，右键时补在最前——
 * 它是该行最高频的建造动作，正因如此才占着行内位置
 *
 * 只在真的有新建入口时补：未分组桶的工作区行没有可建会话的工作区归属，
 * 那时补一项就是点不动的死按钮
 * @param items - 行内 `...` 菜单的条目
 * @param newSessionLabel - 「新建会话」项文案；缺省表示该行不提供新建
 * @returns 右键菜单的条目列表
 */
export function buildRowContextMenuItems(
  items: readonly MenuItem[],
  newSessionLabel?: string | undefined,
): readonly MenuItem[] {
  if (newSessionLabel === undefined) return items
  return [newSessionItem(newSessionLabel), ...items]
}
