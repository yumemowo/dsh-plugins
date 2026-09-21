/**
 * 下拉菜单的条目与分区
 *
 * 纯数据变换：把根节点的布局、工作区视图与三份记录切成菜单的三个分区
 * 菜单组件只负责渲染与开合，条目的取舍与排序都在这里，因此可以脱离 React 断言
 *
 * 菜单只列**根节点单元格**里的两类条目
 * 工作区分组以及没有归入任何分组的独立工作区
 * 
 * 分组内部的工作区不单独列出
 * 聚焦它们与聚焦所属分组看到的是同一片内容
 * 多列一遍只会让菜单长出与列表层级重复的一层
 */
import type { RootLayout } from './types.ts'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { RECENT_SHOWN } from '../../pickerState.ts'
import type { PickerState } from '../../pickerState.ts'
import { rootVirtualKey, rootWorkspaceKey } from '../../rootEntry.ts'

/** 菜单里一个可聚焦的条目 */
export interface PickerEntry {
  /** 条目键（见 `rootEntry.ts`），也是菜单项 id 与聚焦记录里的取值 */
  key: string
  /**
   * 对象自己的 id，不含前缀
   *
   * 与 {@link key} 分开传：改名与删除要把它交给既有的对话框与宿主接口
   * 而那两处收的都是裸 id（分组 id 或工作区 id）
   * 让每个消费方各自去切前缀等于把 `rootEntry.ts` 的编码规则抄到多处
   */
  id: string
  /** 显示名：工作区标题或分组名 */
  label: string
  /** 真实工作区还是工作区分组；决定行首字形 */
  kind: 'workspace' | 'virtual'
}

/**
 * 根节点上的全部可聚焦条目，按列表的展示顺序
 *
 * 顺序与列表一致：先是各工作区分组（分组区的顺序），再是没有归组的独立工作区
 * 「全部」分区因此与用户刚才在列表里看到的那一屏逐行对应
 * @param layout - 根节点布局（分组段 + 未归组的独立工作区）
 * @param workspaceById - 工作区 id → 视图，取标题用
 * @returns 按展示顺序排列的条目
 */
export function rootPickerEntries(
  layout: RootLayout,
  workspaceById: ReadonlyMap<string, WorkspaceView>,
): PickerEntry[] {
  const entries: PickerEntry[] = layout.groups.map((section) => ({
    key: rootVirtualKey(section.id),
    id: section.id,
    label: section.label,
    kind: 'virtual',
  }))
  for (const workspaceId of layout.loose) {
    const workspace = workspaceById.get(workspaceId)
    // 布局只包含快照里存在的工作区，因此这里不会落空；防一手避免类型断言
    if (workspace === undefined) continue
    entries.push({
      key: rootWorkspaceKey(workspaceId),
      id: workspaceId,
      label: workspace.title,
      kind: 'workspace',
    })
  }
  return entries
}

/**
 * 解析一个聚焦键指向的现存条目
 *
 * 记录比列表活得久：工作区被删、分组被解散之后，那个键仍可能躺在三份记录里
 * 聚焦与两处渲染都从这里取「它现在还指着什么」
 * 因此三处对同一条记录的判断不会各说一套——解析不到时一律当作没有聚焦
 * @param entries - 根节点上的全部可聚焦条目
 * @param key - 聚焦记录里的键；空串表示「全部」
 * @returns 该键指向的条目；空串或指向已消失的对象时为 undefined
 */
export function resolveFocus(
  entries: readonly PickerEntry[],
  key: string,
): PickerEntry | undefined {
  if (key === '') return undefined
  return entries.find((entry) => entry.key === key)
}

/** 菜单的三个分区 */
export interface PickerSections {
  /** 最近聚焦过的若干条目，最近一次在最前 */
  recent: PickerEntry[]
  /** 已置顶的条目；顺序按最近使用，从没用过的排在最后 */
  pinned: PickerEntry[]
  /** 全部条目，按列表的展示顺序 */
  all: PickerEntry[]
}

/**
 * 把条目与记录切成菜单的三个分区
 *
 * 最近使用与置顶都可能提到已经消失的条目（记录比列表活得久）
 * 因此两处都要按现存条目过滤，而不是直接把记录渲染出来
 * 「全部」分区不做任何过滤，它本来就来自现存列表
 * @param entries - 根节点上的全部可聚焦条目
 * @param picker - 菜单的三份记录
 * @returns 三个分区；最近使用至多 {@link RECENT_SHOWN} 条
 */
export function pickerSections(
  entries: readonly PickerEntry[],
  picker: PickerState,
): PickerSections {
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))
  const recent = picker.recent
    .map((key) => byKey.get(key))
    .filter((entry): entry is PickerEntry => entry !== undefined)
    .slice(0, RECENT_SHOWN)
  // 置顶按最近使用顺序排：记录里的位置就是「最近一次用到它是多久以前」
  // 没进过记录的排在最后并在彼此之间保持传入顺序（`sort` 在稳定实现下保持原序）
  const rank = new Map(picker.recent.map((key, index) => [key, index]))
  const pinned = picker.pinned
    .map((key) => byKey.get(key))
    .filter((entry): entry is PickerEntry => entry !== undefined)
    .sort(
      (a, b) =>
        (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER),
    )
  return { recent, pinned, all: [...entries] }
}

/**
 * 聚焦生效后的列表切分
 *
 * 三种结果对应两种聚焦对象：聚焦工作区分组时只留组内工作区
 * 且不再重复渲染组头 ——
 * 第二行已经写着组名，根节点那层再出现一次就是同一个名字并排两次
 * 
 * 聚焦独立工作区时只留它自己
 * 没有聚焦、或聚焦的条目已经不在了，都原样返回传入的布局 —— 后者不能退化成空列表
 * 否则第二行写着「全部工作区」而列表整片是空的
 * @param layout - 根节点布局
 * @param entries - 根节点上的全部可聚焦条目
 * @param focused - 当前聚焦的条目键；空串表示「全部」
 * @returns 要渲染的分组段与独立工作区
 */
export function focusedLayout(
  layout: RootLayout,
  entries: readonly PickerEntry[],
  focused: string,
): RootLayout {
  const entry = resolveFocus(entries, focused)
  if (entry === undefined) return layout
  if (entry.kind === 'virtual') {
    const section = layout.groups.find((group) => group.id === entry.id)
    return { groups: [], loose: section?.workspaceIds ?? [] }
  }
  return { groups: [], loose: layout.loose.filter((id) => id === entry.id) }
}
