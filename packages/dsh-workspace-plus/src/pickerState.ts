/**
 * 聚焦 / 最近使用 / 置顶三份记录的形状与纯变换
 *
 * 宿主半边与浏览器半边共用：宿主在变更时修剪它们，浏览器半边在渲染菜单时按同一套规则排序
 * 两边因此不可能各写一份「最近使用怎么排」的判断
 */
/** 「聚焦 / 最近使用 / 置顶」三份记录 */
export interface PickerState {
  /** 当前聚焦的条目键，空串表示「全部」 */
  focused: string
  /**
   * 聚焦过的条目键，最近一次在最前
   *
   * 存的是完整的使用历史，比菜单里展示的条数长：置顶区的排序按它取次序，只留展示用的那几条会让「最近使用顺序」在置顶项之间无从比较
   */
  recent: string[]
  /** 被置顶的条目键，顺序不在这里维护，渲染时按 {@link PickerState.recent} 排 */
  pinned: string[]
}

/** 菜单「最近使用」区展示的条数 */
export const RECENT_SHOWN = 5

/**
 * 使用历史的存储上限
 *
 * 它比 {@link RECENT_SHOWN} 大：展示只有 5 条，而置顶区的排序要在这 5 条之外仍然分得出先后
 * 否则第 6 次之后用过的条目在置顶区里就彼此「一样近」了
 */
export const RECENT_HISTORY_LIMIT = 20

/** 三份记录都为空的状态 */
export const EMPTY_PICKER_STATE: PickerState = { focused: '', recent: [], pinned: [] }

/**
 * 把一份来路不明的记录收成完整形状
 *
 * 记录来自持久化文件，也可能来自旧版本的宿主：字段缺失或形状不对时退回空，而不是让界面在读一条坏记录时抛错
 * @param value - 上游给的原值，形状未知
 * @returns 三个字段都在的记录
 */
export function normalizePickerState(value: unknown): PickerState {
  const raw = (value ?? {}) as Partial<PickerState>
  const keys = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((key): key is string => typeof key === 'string') : []
  return {
    focused: typeof raw.focused === 'string' ? raw.focused : '',
    recent: keys(raw.recent).slice(0, RECENT_HISTORY_LIMIT),
    // 置顶去重：重复项在菜单里会渲染成同一行两次，而两行点下去是同一件事
    pinned: [...new Set(keys(raw.pinned))],
  }
}

/**
 * 记一次聚焦
 *
 * 同一个条目被反复聚焦时只保留一份，并把最新的那次提到最前——最近使用列表因此按「最后一次」而非「第一次」排序
 * @param key - 条目键（见 `rootEntry.ts`），空串表示「全部」
 * @returns 记好这次聚焦的记录
 */
export function withFocus(state: PickerState, key: string): PickerState {
  return {
    focused: key,
    recent: [key, ...state.recent.filter((entry) => entry !== key)].slice(0, RECENT_HISTORY_LIMIT),
    pinned: state.pinned,
  }
}

/**
 * 切换一个条目的置顶
 *
 * 置顶与取消置顶是一件事的两种结果，因此落在同一个方法上：菜单里那一格按钮点下去只表达「反过来」，不区分当前是哪种状态
 * @param key - 条目键（见 `rootEntry.ts`）
 * @returns 切换后的记录
 */
export function withPinnedToggled(state: PickerState, key: string): PickerState {
  const pinned = state.pinned.includes(key)
    ? state.pinned.filter((entry) => entry !== key)
    : [...state.pinned, key]
  return { ...state, pinned }
}
/**
 * 摘掉一个条目
 *
 * 删除工作区或解散分组时调用：被删的对象不该留在任何一个列表里
 * 不按现存的 id 全集修剪，因为调用方只知道「被删的是这一个」，其余记录的好坏无从判断
 * @param key - 被删除对象的条目键（见 `rootEntry.ts`）
 * @returns 不再提到该条目的记录
 */
export function withoutEntry(state: PickerState, key: string): PickerState {
  const keep = (entry: string): boolean => entry !== key
  return {
    focused: state.focused === key ? '' : state.focused,
    recent: state.recent.filter(keep),
    pinned: state.pinned.filter(keep),
  }
}
