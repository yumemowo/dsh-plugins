/**
 * 聚焦 / 最近使用 / 置顶三份记录的形状与纯变换
 *
 * 宿主半边与浏览器半边共用：宿主在变更时修剪它们，浏览器半边在渲染菜单时按同一套规则排序
 * 两边因此不可能各写一份「最近使用怎么排」的判断
 */
import { ALL_ENTRIES, normalizeEntryAddress, sameAddress } from './rootEntry.ts'
import type { RootEntryAddress } from './rootEntry.ts'

/** 「聚焦 / 最近使用 / 置顶」三份记录 */
export interface PickerState {
  /** 当前聚焦的条目，`all` 表示「全部」 */
  focused: RootEntryAddress
  /**
   * 聚焦过的条目，最近一次在最前，至多 {@link RECENT_HISTORY_LIMIT} 条
   *
   * 长度与菜单里展示的条数（{@link RECENT_SHOWN}）不是一个数：多出来的部分只用于置顶区排序
   * 因此这里比展示的那几条长，不要按「展示几条就存几条」去读
   *
   * 写入时只记真实条目：`all` 只改 `focused`、不记进来（见 {@link withFocus}）
   * 读取侧仍会滤掉对不上条目的地址，这份记录是外部文件、可能被手改
   */
  recent: RootEntryAddress[]
  /** 被置顶的条目，顺序不在这里维护，渲染时按 {@link PickerState.recent} 排 */
  pinned: RootEntryAddress[]
}

/**
 * 菜单「最近使用」区展示的条数
 *
 * 调大它不会报错，但超出 {@link RECENT_HISTORY_LIMIT} 的部分无从补上
 * 记录里最多就存那么多条，多出的几格会永远空着
 * 例如调到 25 而存储上限是 20，实际只列得出 20 条
 */
export const RECENT_SHOWN = 5

/**
 * 使用历史的存储上限
 *
 * 它比 {@link RECENT_SHOWN} 大：展示只有 5 条，而置顶区的排序要在这 5 条之外仍然分得出先后
 * 否则第 6 次之后用过的条目在置顶区里就彼此「一样近」了
 * 到顶之后每记一次就挤掉最旧的一条，因此它不会无限增长
 */
export const RECENT_HISTORY_LIMIT = 20

/** 三份记录都为空的状态 */
export const EMPTY_PICKER_STATE: PickerState = { focused: ALL_ENTRIES, recent: [], pinned: [] }

/**
 * 把一份来路不明的记录收成完整形状
 *
 * 记录来自持久化文件，也可能来自旧版本的宿主：字段缺失或形状不对时退回空，而不是让界面在读一条坏记录时抛错
 * @param value - 上游给的原值，形状未知
 * @returns 三个字段都在的记录
 */
export function normalizePickerState(value: unknown): PickerState {
  const raw = (value ?? {}) as Partial<PickerState>
  /** 逐条认形状，认不出来的静默丢掉 */
  const addresses = (input: unknown): RootEntryAddress[] =>
    Array.isArray(input)
      ? input.map(normalizeEntryAddress).filter((entry): entry is RootEntryAddress => entry !== undefined)
      : []
  const focused = normalizeEntryAddress(raw.focused) ?? ALL_ENTRIES
  // 置顶去重按值：同一个条目重复出现时，菜单里会渲染成同一行两次，而两行点下去是同一件事
  const pinned: RootEntryAddress[] = []
  for (const entry of addresses(raw.pinned)) {
    if (!pinned.some((seen) => sameAddress(seen, entry))) pinned.push(entry)
  }
  return {
    focused,
    recent: addresses(raw.recent).slice(0, RECENT_HISTORY_LIMIT),
    pinned,
  }
}

/**
 * 记一次聚焦
 *
 * 同一个条目被反复聚焦时只保留一份，并把最新的那次提到最前——最近使用列表因此按「最后一次」而非「第一次」排序
 *
 * `all` 只改聚焦、不进历史：它不对应任何条目，渲染时必然被滤掉
 * 记进来只会占掉一格，存储写满时每次退回「全部」都白挤掉一条真实历史
 * @returns 记好这次聚焦的记录
 */
export function withFocus(state: PickerState, address: RootEntryAddress): PickerState {
  return {
    focused: address,
    recent:
      address.kind === 'all'
        ? state.recent
        : [address, ...state.recent.filter((entry) => !sameAddress(entry, address))].slice(
            0,
            RECENT_HISTORY_LIMIT,
          ),
    pinned: state.pinned,
  }
}

/**
 * 切换一个条目的置顶
 *
 * 置顶与取消置顶是一件事的两种结果，因此落在同一个方法上：菜单里那一格按钮点下去只表达「反过来」，不区分当前是哪种状态
 * @returns 切换后的记录
 */
export function withPinnedToggled(state: PickerState, address: RootEntryAddress): PickerState {
  const pinned = state.pinned.some((entry) => sameAddress(entry, address))
    ? state.pinned.filter((entry) => !sameAddress(entry, address))
    : [...state.pinned, address]
  return { ...state, pinned }
}

/**
 * 摘掉一个条目
 *
 * 删除工作区或解散分组时调用：被删的对象不该留在任何一个列表里
 * 不按现存的 id 全集修剪，因为调用方只知道「被删的是这一个」，其余记录的好坏无从判断
 * @returns 不再提到该条目的记录
 */
export function withoutEntry(state: PickerState, address: RootEntryAddress): PickerState {
  const keep = (entry: RootEntryAddress): boolean => !sameAddress(entry, address)
  return {
    focused: sameAddress(state.focused, address) ? ALL_ENTRIES : state.focused,
    recent: state.recent.filter(keep),
    pinned: state.pinned.filter(keep),
  }
}
