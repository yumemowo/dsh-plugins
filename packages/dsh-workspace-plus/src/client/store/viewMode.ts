/**
 * 会话列表展示方式、指示器样式与三层折叠态的存储
 *
 * 这些都是浏览器本地偏好而不是分组元数据，因此不进宿主的存储域，也不随快照往返
 * 引擎用官方 `@deepseek-ai/dsh-client-store` 的 `defineStore`，与官方 ui-workspace 的 `groupBy` 同一套
 *
 * 存储键与官方 `dsh.workspace.view.*` 分开：两者是两套独立的界面状态，共用键会互相覆盖
 *
 * 这里是浏览器内持久化状态的唯一去处：插槽的 `store` 座位只接受一个 `StoreDecl`，而 `persist` 整份序列化状态
 * 后续新增的浏览器本地状态因此要并进本文件的状态对象，不能各起一个键
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { IndicatorStyle, ViewMode } from '../data/types.ts'

/**
 * 会话分组在一个工作区体内的坐标
 *
 * 分组 id 只在自己那个工作区内唯一，因此要工作区与分组一起才指得准
 */
export interface SessionGroupRef {
  workspaceId: string
  groupId: string
}

/**
 * 把一个会话分组坐标编码成展开记录的键
 *
 * 编码只此一处：这个格式是持久化身份，散到各调用点后改格式必然漏掉几处，而漏掉的那些等于静默丢掉用户已有的记录
 * @param ref - 会话分组坐标
 */
export function sessionGroupKey(ref: SessionGroupRef): string {
  return `${ref.workspaceId}:${ref.groupId}`
}

/**
 * 「未分组」桶在工作区层里占用的键
 *
 * 那些会话不属于任何工作区，因此没有真实 workspaceId 可用；这个哨兵与任何 id 都不会撞值
 */
export const UNGROUPED_KEY = ''

/**
 * 三层折叠态各自的展开记录
 *
 * 三格都是「用户显式选过的展开态」：键缺席表示用户从未碰过这一层，此时由消费侧按结构现推默认（见 `useExpansionValue`）
 * 因此这里不存任何默认值，只存选择
 *
 * 三格各自可选：持久化引擎读盘时整份替换状态，早于该字段写入的那份 JSON 里没有它
 */
export interface ExpansionState {
  /** 工作区层，键是裸 workspaceId，末尾的「未分组」桶用哨兵空串 */
  workspace?: Record<string, boolean> | undefined
  /** 工作区分组层，键是分组自己的 id */
  virtualWorkspace?: Record<string, boolean> | undefined
  /** 会话分组层，键由 {@link sessionGroupKey} 交出 */
  group?: Record<string, boolean> | undefined
}

/**
 * 一层的空记录，键缺席时由各 `…ExpansionOf` 交出它
 *
 * 必须是模块级单例：消费侧把它交给选择器，每次读取换一个新对象会让每一行都判定为变过
 */
const NO_EXPANSION: Record<string, boolean> = {}

/**
 * 展示方式、指示器样式、置顶区偏好的状态形状，同时是选择器读数的输入
 *
 * 可选格都是「加过的字段」：持久化引擎读盘时整份替换状态，早于该字段写入的那份 JSON 里没有它
 * 引擎不给合并钩子，因此读取处一律走 {@link modeOf} / {@link indicatorOf} 与各 `…Of`，不要直接读字段
 */
export interface ViewModeState {
  mode?: ViewMode | undefined
  indicator?: IndicatorStyle | undefined
  expansion?: ExpansionState | undefined
  pinOverflow?: PinOverflow | undefined
  pinScope?: PinScope | undefined
  pinSectionExpanded?: boolean | undefined
}

/** 展示方式，旧数据缺这一格时按「按工作区」 */
export function modeOf(state: ViewModeState): ViewMode {
  return state.mode ?? 'workspace'
}

/** 指示器样式，旧数据缺这一格时按「图标」 */
export function indicatorOf(state: ViewModeState): IndicatorStyle {
  return state.indicator ?? 'icon'
}

/**
 * 置顶区的溢出给法
 *
 * `expand` 静止时占可见条数的高度，指针移上预览行后整块向下浮出
 * `scroll` 在同一个高度里自行滚动，两者占据的高度完全相同
 */
export type PinOverflow = 'expand' | 'scroll'

/**
 * 置顶会话的显示方式
 *
 * `section` 只在区域顶部那块置顶区里显示
 * `inline` 除此之外还让置顶会话在它自己所在的那一段里排到最前
 */
export type PinScope = 'section' | 'inline'

/** 溢出给法，旧数据缺这一格时按「浮出」 */
export function pinOverflowOf(state: ViewModeState): PinOverflow {
  return state.pinOverflow ?? 'expand'
}

/** 置顶会话显示方式，旧数据缺这一格时按「仅置顶区域」 */
export function pinScopeOf(state: ViewModeState): PinScope {
  return state.pinScope ?? 'section'
}

/**
 * 置顶区的展开态
 *
 * 全局一个布尔，不按工作区分别记；旧数据缺这一格时是展开
 */
export function pinSectionExpandedOf(state: ViewModeState): boolean {
  return state.pinSectionExpanded !== false
}

/** 工作区层的展开记录，旧数据缺这一格时是空表（等于用户一层都没碰过） */
export function workspaceExpansionOf(state: ViewModeState): Record<string, boolean> {
  return state.expansion?.workspace ?? NO_EXPANSION
}

/** 工作区分组层的展开记录，同上 */
export function virtualExpansionOf(state: ViewModeState): Record<string, boolean> {
  return state.expansion?.virtualWorkspace ?? NO_EXPANSION
}

/** 会话分组层的展开记录，同上 */
export function sessionGroupExpansionOf(state: ViewModeState): Record<string, boolean> {
  return state.expansion?.group ?? NO_EXPANSION
}

/**
 * 读一个键当前生效的展开态
 *
 * 三态语义的收口：显式选择优先，键缺席时用调用方按结构推出的默认
 * @param record - 该层的展开记录
 * @param key - 该层的键
 * @param fallback - 该键缺席时的默认展开态
 */
export function expandedAt(
  record: Record<string, boolean>,
  key: string,
  fallback: boolean,
): boolean {
  return record[key] ?? fallback
}

/** 引擎按这个键持久化，改名等于丢掉用户已经选过的偏好 */
export const VIEW_MODE_PERSIST_KEY = 'dsh.workspace-plus.view.v1'

/**
 * 造一个展示方式与折叠态的存储句柄
 *
 * 只导出工厂、不导出模块级句柄：句柄的模块级身份会跨插件重载把实例钉住
 */
export function createViewModeStore() {
  return defineStore({
    init: (): ViewModeState => ({
      mode: 'workspace',
      indicator: 'icon',
      // 三格显式落成空表：它们与上面两格不同，读回旧数据时整格缺席是常态，写成空表让首份落盘就带全形状
      expansion: { workspace: {}, virtualWorkspace: {}, group: {} },
      // 置顶区的三项同样显式写下默认值，理由与上一行相同
      pinOverflow: 'expand',
      pinScope: 'section',
      pinSectionExpanded: true,
    }),
    persist: VIEW_MODE_PERSIST_KEY,
    actions: {
      setMode: (draft, mode: ViewMode) => {
        draft.mode = mode
      },
      setIndicator: (draft, indicator: IndicatorStyle) => {
        draft.indicator = indicator
      },
      setPinOverflow: (draft, overflow: PinOverflow) => {
        draft.pinOverflow = overflow
      },
      setPinScope: (draft, scope: PinScope) => {
        draft.pinScope = scope
      },
      setPinSectionExpanded: (draft, expanded: boolean) => {
        draft.pinSectionExpanded = expanded
      },
      /**
       * 记下工作区层的选择
       *
       * 前后两格都要兜底：整份 `expansion` 与它下面这一层都可能缺席（旧数据、或用户还没碰过任何一层）
       * 显式赋值而不是取反：取反要先读出当前生效值，而那一步依赖按结构推出的默认，属于组件层的判断
       */
      setWorkspaceExpanded: (draft, key: string, expanded: boolean) => {
        draft.expansion ??= {}
        draft.expansion.workspace ??= {}
        draft.expansion.workspace[key] = expanded
      },
      setVirtualWorkspaceExpanded: (draft, key: string, expanded: boolean) => {
        draft.expansion ??= {}
        draft.expansion.virtualWorkspace ??= {}
        draft.expansion.virtualWorkspace[key] = expanded
      },
      setSessionGroupExpanded: (draft, ref: SessionGroupRef, expanded: boolean) => {
        draft.expansion ??= {}
        draft.expansion.group ??= {}
        draft.expansion.group[sessionGroupKey(ref)] = expanded
      },
      /**
       * 摘掉工作区层里已经不存在的工作区的展开记录
       *
       * 只收「还该留着」的键集合，与官方 `retainAccountKeys` 同一取舍
       * 一层都没碰过时整格缺席，那时无事可做
       * 摘完没有变化就不写：这次写入会把状态换一份新对象、通知全部订阅者，而清理在每次列表就绪时都会跑
       *
       * 会话分组与工作区分组两层不在这里清：它们没有对应的就绪信号，见 `useExpansionValue` 的调用侧注释
       * @param workspaceKeys - 仍需保留的键，含末尾「未分组」桶的哨兵
       */
      retainWorkspaceKeys: (draft, workspaceKeys: readonly string[]) => {
        const current = draft.expansion?.workspace
        if (current === undefined) return
        const retained = new Set(workspaceKeys)
        const next = Object.fromEntries(
          Object.entries(current).filter(([key]) => retained.has(key)),
        )
        if (Object.keys(next).length === Object.keys(current).length) return
        draft.expansion ??= {}
        draft.expansion.workspace = next
      },
    },
  })
}

export type ViewModeStoreHandle = ReturnType<typeof createViewModeStore>

/** 该句柄的写入口，与组件从 store 座位拿到的 `actions` 是同一批 */
export type ViewModeActions = ReturnType<ViewModeStoreHandle['create']>['actions']

/**
 * 把一个句柄改成「无论何时都交回同一个实例」
 *
 * 对照模式下本区域挂在会话作用域的右侧栏 tab 里，而展示方式不该按会话各存一份
 * 因此把这个实例在挂载期就建好，`create` 恒交回它
 * @param handle - 原句柄
 */
export function sharedViewModeStore(handle: ViewModeStoreHandle): ViewModeStoreHandle {
  const instance = handle.create()
  return { ...handle, create: () => instance }
}
