/**
 * 行内「更多操作」菜单的条目构造
 *
 * 只产出菜单数据（id、文案、图标、禁用与危险标记），不关心菜单如何渲染与开合
 * 渲染由 `Menu` 原语负责，开合状态由持有锚点的行组件负责
 *
 * 条目 id 一律是字符串（官方原语的契约），选中回调据此分派
 * 需要表达「对哪个对象的什么操作」时，把标识拼进字符串，由本模块解析回来:
 *   - `pg:` 已做到构造与解析各只一处（`buildParentGroupMenuItem` / `parseParentGroupId`）
 *   - `vw:` 目前只有构造在这里，解析由消费侧按前缀切分，改动时两处都要看
 */
import {
  IconArchiveOutlineRegular,
  IconBranchOutlineRegular,
  IconChevronRightOutlineRegular,
  IconEditOutlineRegular,
  IconNewChatOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconPlusOutlineRegular,
  IconTrashOutlineRegular,
} from './runtime.ts'
import type { ReactNode } from 'react'
import type { MenuActionItem, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconVirtualWorkspace16 } from './icons.tsx'
import type { OfficialSessionLabels } from './official.ts'
import type { GroupSection, VirtualWorkspaceSection } from './data/types.ts'
import styles from './menus.module.css'

/**
 * 给带二级菜单的一级项补一个行尾箭头
 *
 * 官方 `Menu` 的项只有「前导图标 → 文案 → 尾部选中标记」三个槽，没有表达「悬停展开二级菜单」的槽位
 * 只给 `aria-haspopup` / `aria-expanded` 这类无障碍信号，箭头因此塞进 `label` 里
 * 由 `.menuLabel` 两端对齐推到行尾
 *
 * 子菜单为空时不加，原语只在 `submenu` 非空时才把该项当作拥有子菜单的项（展开、键盘进入、`aria-haspopup` 都按这个判断）
 * 加了箭头就是在指一个展不开的菜单
 * @param entries - 该项的二级子菜单
 * @returns 有子菜单时是两端对齐的行，否则原样返回文案
 */
function submenuParentLabel(label: string, entries: readonly MenuActionItem[]): ReactNode {
  if (entries.length === 0) return label
  return (
    <span className={styles.menuLabel}>
      <span className={styles.menuLabelText}>{label}</span>
      <IconChevronRightOutlineRegular className={styles.menuArrow} />
    </span>
  )
}

/** 会话「更多操作」菜单里分组项的选项集 */
export interface GroupMenuInput {
  /** 按工作区视图顺序排列的全部分组（未过滤） */
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id，空串表示未归组 */
  currentGroupId: string
  /** 「移动到…」一级项文案，省略号表示点下去还要选一个目标 */
  groupLabel: string
  /** 「取消分组」文案 */
  ungroupLabel: string
}

/**
 * 会话菜单里置顶项的输入
 *
 * 该项与其余官方项同属官方操作块，缺省表示该行不提供置顶入口
 */
export interface SessionPinMenuInput {
  /** 该行是否已置顶，决定文案与字形取哪一态 */
  pinned: boolean
  /** 是否还能新增置顶，未置顶且已达上限时该项禁用 */
  canPin: boolean
}

/**
 * 会话菜单的构造输入：三段都可缺省
 *
 * `grouping` 缺省表示该行没有分组可归（「未分组」桶），`official` 缺省表示宿主未提供官方会话操作
 * 三段都缺时菜单为空，`SessionRowItem` 据此连锚点按钮与右键面板一起不挂
 */
export interface SessionMenuInput {
  grouping?: GroupMenuInput | undefined
  official?: OfficialSessionLabels | undefined
  pin?: SessionPinMenuInput | undefined
}

/**
 * 构造会话「更多操作」菜单里的分组一级项
 *
 * 二级子菜单保持传入（即工作区视图）的分组顺序，并剔除当前会话所在的分组——把自己移动到自己是无意义的操作
 * 没有任何可选项时该项禁用
 * @returns 可放进 Menu items 的分组项，分组不存在时也返回占位项以稳定菜单维度
 */
export function buildGroupMenuItem(input: GroupMenuInput): MenuActionItem {
  const candidates = input.sections
    .filter((section) => section.id !== input.currentGroupId)
    .map((section) => ({ id: `group:${section.id}`, label: section.label }))
  return {
    id: 'group',
    label: submenuParentLabel(input.groupLabel, candidates),
    disabled: candidates.length === 0,
    submenu: candidates,
  }
}

/**
 * 构造会话「更多操作」菜单的完整条目
 *
 * 排列依次是官方操作块（置顶 / 重命名 / 分叉 / 归档）、一条分隔线、以及本包自有的分组项（其下「取消分组」仅当会话已归组）
 * 官方操作块在前：它们作用于会话本身，分组项是叠加在此之上的归类操作
 * 分隔线把「官方能力」与「本包扩展」分成两段，避免两类操作混成一个列表
 *
 * 官方操作块的文案与图标都取自官方 `ui-workspace`（见 `official.ts`）
 * 宿主未提供官方服务时整体省略，只留分组项，不留点不动的死按钮
 * 反之「未分组」桶里的会话没有分组上下文，只留官方操作块
 * 分隔线只在两段都存在时才画
 * @returns Menu items 列表
 */
export function buildSessionMenuItems(input: SessionMenuInput): readonly MenuItem[] {
  const items: MenuItem[] = []
  const { grouping, official, pin } = input

  if (official !== undefined) {
    // 与官方 `PinSessionMenuItem` 同序：置顶在最前
    if (pin !== undefined) {
      items.push({
        id: 'pin',
        label: pin.pinned ? official.unpin : official.pin,
        disabled: !pin.pinned && !pin.canPin,
        icon: pin.pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />,
      })
    }
    items.push(
      { id: 'rename', label: official.rename, icon: <IconEditOutlineRegular /> },
      { id: 'fork', label: official.fork, icon: <IconBranchOutlineRegular /> },
      // 官方会话菜单的归档项传 size=14，照它取同一个值
      { id: 'archive', label: official.archive, icon: <IconArchiveOutlineRegular size={14} /> },
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

/** 会话分组菜单条目 id，与 `GroupSection` 的分派一一对应 */
export const GROUP_MENU = {
  rename: 'rename',
  delete: 'delete',
} as const

/** 工作区分组菜单条目 id，与 `VirtualWorkspaceSection` 的分派一一对应 */
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
 * 与会话分组菜单逐项同形：重命名在前、删除在后、删除带 `danger`
 * 两者都是「重命名 / 解散这个容器」这一件事，只是容器的层级不同
 * @returns Menu items 列表
 */
export function buildVirtualWorkspaceMenuItems(
  input: GroupRowMenuInput,
): readonly MenuItem[] {
  return [
    { id: VIRTUAL_WORKSPACE_MENU.rename, label: input.renameLabel, icon: <IconEditOutlineRegular /> },
    {
      id: VIRTUAL_WORKSPACE_MENU.delete,
      label: input.deleteLabel,
      icon: <IconTrashOutlineRegular />,
      danger: true,
    },
  ]
}

/**
 * 构造分组行「更多操作」菜单的条目
 *
 * 与工作区菜单同形：重命名在前、删除在后，删除项带 `danger` 标记
 * 分组没有建造型菜单项——「新建分组」属于工作区行，分组行的高频建造操作是行内 `+`（在该分组新建会话）
 * @returns Menu items 列表
 */
export function buildGroupMenuItems(input: GroupRowMenuInput): readonly MenuItem[] {
  return [
    { id: GROUP_MENU.rename, label: input.renameLabel, icon: <IconEditOutlineRegular /> },
    { id: GROUP_MENU.delete, label: input.deleteLabel, icon: <IconTrashOutlineRegular />, danger: true },
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
  /** 根节点上的工作区分组选项集，缺省表示该行不提供移入工作区分组的入口 */
  virtualWorkspaceGrouping?: VirtualWorkspaceMenuInput | undefined
  /**
   * 父工作区体内的会话分组选项集，缺省表示该行不提供移入父工作区分组的入口
   *
   * 与 `virtualWorkspaceGrouping` 分开，两者进的是不同层级的容器，只在一处有可选项时另一项不出现
   */
  parentGrouping?: ParentGroupMenuInput | undefined
}

/** 工作区菜单条目 id，与 `WorkspaceRow` 的分派一一对应 */
export const WORKSPACE_MENU = {
  newGroup: 'new-group',
  rename: 'rename',
  delete: 'delete',
} as const

/** 工作区菜单里的分隔线 id，分块方案见 `buildWorkspaceMenuItems` */
export const WORKSPACE_MENU_SEPARATOR = {
  parentGroup: 'separator-parent-group',
  virtualWorkspace: 'separator-virtual-workspace',
  delete: 'separator-delete',
} as const

/**
 * 工作区行菜单里进父工作区分组那一项的选项集
 *
 * 与虚拟工作区分组那一项是两个层级的概念，因此各占一个一级项：
 * 这一项进的是父工作区体内的某个会话分组，那一项进的是根节点的虚拟工作区分组
 * @see WorkspaceMenuInput.virtualWorkspaceGrouping
 */
export interface ParentGroupMenuInput {
  /**
   * 可选的「祖先工作区 + 它的分组」
   *
   * 父工作区可以是任意一个祖先（cwd 路径上更上层的现存工作区），放进谁的分组谁就是父工作区
   * 只有一个祖先时分组名本身就是唯一的坐标，有多个时视图侧会把祖先名并进去
   */
  candidates: readonly {
    /** 父工作区 id */
    parentId: string
    /** 父工作区名，用于在多个祖先之间区分 */
    parentLabel: string
    /** 该父工作区体内的会话分组 */
    groups: readonly { id: string; label: string }[]
  }[]
  /**
   * 该工作区当前所在的父工作区分组，不在任何分组里时缺省
   *
   * 父工作区与分组要一起给：分组 id 只在一个工作区内唯一，单看分组 id 认不出是哪个祖先名下的
   */
  current?:
    | {
        parentId: string
        groupId: string
      }
    | undefined
  /** 「移动到分组…」一级项文案 */
  moveToLabel: string
  /** 「移出分组」一级项文案，未嵌套时该项不出现 */
  ungroupLabel: string
}

/**
 * 某个「祖先工作区 + 分组」是不是该工作区已经在的那一个
 *
 * 按这一对比较而不是只看分组 id：分组 id 只在一个工作区内唯一，另一个祖先名下可能有一个同 id 的分组
 */
function isCurrentParentGroup(
  input: ParentGroupMenuInput,
  parentId: string,
  groupId: string,
): boolean {
  return input.current !== undefined &&
    input.current.parentId === parentId &&
    input.current.groupId === groupId
}

/**
 * 该工作区行有没有可移入的父工作区分组
 *
 * 调用方据此决定「移动到分组…」整项渲染不渲染：没有目标而它当前也不在任何分组里时整项不出现
 */
export function hasMovableParentGroup(input: ParentGroupMenuInput): boolean {
  return input.candidates.some((ancestor) =>
    ancestor.groups.some((group) => !isCurrentParentGroup(input, ancestor.parentId, group.id)),
  )
}

/**
 * 工作区行菜单里的「移动到分组…」一级项
 *
 * 与虚拟工作区分组那一项不同：那一项的子菜单里总有一个「新建」可点，这一项没有可移入的目标时只能禁用
 * 不带图标，`IconVirtualWorkspace16` 是虚拟工作区分组的字形，这一项进的是父工作区体内的会话分组，另一个层级
 * @returns 可放进 Menu items 的一级项
 */
export function buildParentGroupMenuItem(input: ParentGroupMenuInput): MenuActionItem {
  const submenu: MenuActionItem[] = input.candidates.flatMap((ancestor) =>
    ancestor.groups
      .filter((group) => !isCurrentParentGroup(input, ancestor.parentId, group.id))
      .map((group) => ({
        // 形状由 `parseParentGroupId` 解析回来，改这里要一并改它
        id: `${PARENT_GROUP_PREFIX}${ancestor.parentId}:${group.id}`,
        label:
          input.candidates.length === 1
            ? group.label
            : `${ancestor.parentLabel} / ${group.label}`,
      })),
  )
  return {
    id: PARENT_GROUP_ITEM.move,
    label: submenuParentLabel(input.moveToLabel, submenu),
    disabled: submenu.length === 0,
    submenu,
  }
}

/**
 * 工作区行菜单里「移动到…」这一项的选项集
 *
 * 一级项收集建组与全部可移入的分组，二级子菜单因此是「新建 + 移入」两段合一
 * 「移出工作区分组」不在这条子菜单里——它不是「移动」，而是解散当前归属，因此由本菜单作为一级项平级渲染
 * 见 `buildWorkspaceMenuItems`
 */
export interface VirtualWorkspaceMenuInput {
  /** 根节点上的全部分组，按创建顺序 */
  sections: readonly VirtualWorkspaceSection[]
  /** 该工作区当前所属的工作区分组 id，空串表示未归组 */
  currentGroupId: string
  /**
   * 「新建工作区分组」项文案
   *
   * 调用方给的是带省略号的那份，菜单项点下去还要再填一次名字
   * 省略号把这件事说出来（官方 `menu.addWorkspace` 同样带省略号，而 header 的 `workspace.add` 不带）
   */
  newLabel: string
  /** 「移动到…」一级项文案 */
  moveToLabel: string
  /** 「移出工作区分组」一级项文案，未归组时该项不出现 */
  ungroupLabel: string
}

/**
 * 工作区行「移动到…」子菜单里「移入某个工作区分组」的条目 id 前缀，后面跟分组 id
 *
 * 与 `rootEntry.ts` 的 `addressKey()` 为工作区分组交出的字符串字面相同，但互不相干：
 * 这一个只活在菜单打开期间，选中即弃；那一个由 `RootEntryAddress` 派生，供 React 的 `key` 用
 * 改动其中之一不必跟着改另一个
 */
export const VIRTUAL_WORKSPACE_PREFIX = 'vw:'

/**
 * 父工作区体内某个分组的条目 id 前缀，后面跟 `<父工作区 id>:<分组 id>`
 *
 * 两个 id 拼成一个字符串是为了满足官方 Menu 原语的契约：条目只有 `id: string`，
 * 选中回调也是 `(id: string) => void`，本次选择的目标只能编码进字符串
 *
 * 与 `rootEntry.ts` 的 `RootEntryAddress` 是两回事：那里用带 `kind` 标签的对象承载类别
 *
 * 分隔符沿用 `:`：工作区 id 是宿主生成的 UUID，分组 id 由本包生成（`g…`），两者都不含冒号
 * 若将来某一方的 id 可能含冒号，这里要换成不会出现在 id 里的分隔符，否则 `parseParentGroupId` 会切错位
 */
export const PARENT_GROUP_PREFIX = 'pg:'

/** 工作区行进父工作区分组相关条目 id */
export const PARENT_GROUP_ITEM = {
  /** 一级项，打开「移动到分组…」子菜单 */
  move: 'move-to-parent-group',
  /** 一级项，把当前工作区移出它所在的分组 */
  ungroup: 'ungroup-child-workspace',
} as const

/**
 * 解析一个父工作区分组的条目 id
 *
 * 与 {@link buildParentGroupMenuItem} 是一对：构造只那一处、解析只这一处，形状改动不会漏掉半边
 * @returns 父工作区 id 与分组 id，形状不对时为 undefined
 */
export function parseParentGroupId(id: string): { parentId: string; groupId: string } | undefined {
  if (!id.startsWith(PARENT_GROUP_PREFIX)) return undefined
  const rest = id.slice(PARENT_GROUP_PREFIX.length)
  const at = rest.indexOf(':')
  if (at <= 0) return undefined
  return { parentId: rest.slice(0, at), groupId: rest.slice(at + 1) }
}

/** 工作区分组相关菜单项的 id，`create` 在「移动到…」子菜单里，`ungroup` 是一级项 */
export const VIRTUAL_WORKSPACE_ITEM = {
  /** 新建一个工作区分组并把当前工作区放进去 */
  create: 'create-virtual-workspace',
  /** 把当前工作区移出它所在的分组 */
  ungroup: 'ungroup-workspace',
} as const

/**
 * 构造工作区行菜单里的「移动到…」一级项
 *
 * 二级子菜单的顺序固定为「新建 → 各分组」，建造型操作排在最前（与工作区菜单里「新建分组」在前同一取舍）
 * 一级项本身不禁用——即便一个分组都没有，它下面也有「新建」可点
 * @returns 可放进 Menu items 的一级项
 */
export function buildVirtualWorkspaceMenuItem(input: VirtualWorkspaceMenuInput): MenuActionItem {
  // 建组这一项不带图标：它不是一个可以移入的目标，而是这个子菜单里唯一的独立动作
  // 靠省略号（`新建工作区分组…`）与「点下去还要再填一次」表明身份，不带图标也就不会与上面带 `+` 的「新建分组」撞形
  const submenu: MenuActionItem[] = [
    { id: VIRTUAL_WORKSPACE_ITEM.create, label: input.newLabel },
  ]
  const candidates = input.sections
    .filter((section) => section.id !== input.currentGroupId)
    .map((section) => ({ id: `${VIRTUAL_WORKSPACE_PREFIX}${section.id}`, label: section.label }))
  submenu.push(...candidates)
  return {
    id: 'move-virtual-workspace',
    label: submenuParentLabel(input.moveToLabel, submenu),
    icon: <IconVirtualWorkspace16 />,
    disabled: false,
    submenu,
  }
}

/**
 * 构造工作区行菜单里的「移出工作区分组」一级项
 *
 * 只在工作区已归组时调用。不带图标，它是一个移出动作，不是可移入的目标，与上面那些带图标的行项目因此有意区分
 * @returns Menu item
 */
function ungroupWorkspaceItem(label: string): MenuActionItem {
  return { id: VIRTUAL_WORKSPACE_ITEM.ungroup, label }
}

/**
 * 行右键菜单比行内 `...` 菜单多出的条目 id
 *
 * 右键是行内操作位的捷径，两者共用同一批条目与同一段分派
 * 唯一多出来的是「新建会话」——它在行内对应的是 `+` 按钮，不是一个菜单项
 * `+` 仍只以按钮形态存在，右键菜单把它一并列出，使右键能触达该行全部动作
 */
export const ROW_MENU = {
  newSession: 'new-session',
} as const

/**
 * 构造行右键菜单里的「新建会话」项
 *
 * 图标取官方新建会话按钮的 `IconNewChatOutlineRegular`，与本包行内那枚按钮同一个字形
 * 菜单里还有一个「新建分组」带 `+`，两项若都用 `+` 就只能靠文字区分
 * @returns Menu item
 */
function newSessionItem(label: string): MenuActionItem {
  return { id: ROW_MENU.newSession, label, icon: <IconNewChatOutlineRegular /> }
}

/**
 * 构造工作区「更多操作」菜单的条目
 *
 * 顺序是「新建分组 → 重命名 → 移动到分组 → 移出分组 → 移动到… → 移出工作区分组 → 删除」
 * 前两项是建造与自身属性，两组归类操作夹在中间，删除收尾
 *
 * 每个块之间画一条分隔线，两组归类操作进的是两个层级的容器（父工作区体内的会话分组 / 根节点的虚拟工作区分组）
 * 它们的一级项文案又只差一个词，不分开读起来像同一个动作的两条路径
 * 「移出」与它上面那条「移动到」平级、紧跟在下方，仅在已归组时出现，合成一条子菜单会把「离开」藏进「进入」的入口里
 * 删除项带 `danger` 标记，与官方删除工作区一样由菜单原语渲染危险语义
 * @returns Menu items 列表
 */
export function buildWorkspaceMenuItems(input: WorkspaceMenuInput): readonly MenuItem[] {
  const items: MenuItem[] = [
    { id: WORKSPACE_MENU.newGroup, label: input.newGroupLabel, icon: <IconPlusOutlineRegular /> },
    { id: WORKSPACE_MENU.rename, label: input.renameLabel, icon: <IconEditOutlineRegular /> },
  ]
  /** 菜单里是否有归类操作块，没有时删除项前面不该留一条分隔线 */
  let grouping = false
  if (input.parentGrouping !== undefined) {
    grouping = true
    items.push({ type: 'separator', id: WORKSPACE_MENU_SEPARATOR.parentGroup })
    items.push(buildParentGroupMenuItem(input.parentGrouping))
    if (input.parentGrouping.current !== undefined) {
      items.push({ id: PARENT_GROUP_ITEM.ungroup, label: input.parentGrouping.ungroupLabel })
    }
  }
  if (input.virtualWorkspaceGrouping !== undefined) {
    grouping = true
    items.push({ type: 'separator', id: WORKSPACE_MENU_SEPARATOR.virtualWorkspace })
    items.push(buildVirtualWorkspaceMenuItem(input.virtualWorkspaceGrouping))
    if (input.virtualWorkspaceGrouping.currentGroupId !== '') {
      items.push(ungroupWorkspaceItem(input.virtualWorkspaceGrouping.ungroupLabel))
    }
  }
  if (grouping) {
    items.push({ type: 'separator', id: WORKSPACE_MENU_SEPARATOR.delete })
  }
  items.push({
    id: WORKSPACE_MENU.delete,
    label: input.deleteLabel,
    icon: <IconTrashOutlineRegular />,
    danger: true,
  })
  return items
}

/**
 * 把行内菜单条目补成右键菜单条目
 *
 * 右键是行内操作位的捷径，因此条目集合与分派都必须一致，差别只有一条：
 * 「新建会话」在行内是 `+` 按钮，菜单里没有对应项，右键时补在最前——它是该行最高频的建造动作，正因如此才占着行内位置
 *
 * 只在真的有新建入口时补，未分组桶的工作区行没有可建会话的工作区归属，那时补一项就是点不动的死按钮
 * @param newSessionLabel - 「新建会话」项文案，缺省表示该行不提供新建
 * @returns 右键菜单的条目列表
 */
export function buildRowContextMenuItems(
  items: readonly MenuItem[],
  newSessionLabel?: string | undefined,
): readonly MenuItem[] {
  if (newSessionLabel === undefined) return items
  return [newSessionItem(newSessionLabel), ...items]
}
