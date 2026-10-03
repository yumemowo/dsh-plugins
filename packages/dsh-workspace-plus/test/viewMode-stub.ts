import { useSyncExternalStore } from 'react'
import type { IndicatorStyle, ViewMode } from '../src/client/data/types.ts'
import { sessionGroupKey } from '../src/client/store/viewMode.ts'
import type {
  PinOverflow,
  PinScope,
  SessionGroupRef,
  ViewModeActions,
  ViewModeState,
} from '../src/client/store/viewMode.ts'

/**
 * 区域组件所需要的那份 store 座位替身
 *
 * 真实的 `useStore` 由渲染器在渲染期绑定（读走选择器、写走 actions），node 测试里没有渲染器
 * 这里交出一对同形的读数与写入口：读数是纯函数，写入口把新值记进下面那个可变格
 * 需要断言「选中之后列表变了」的用例可以传入自己的记录回调
 * @param mode - 初始展示方式，缺省「按工作区」
 * @param onChange - 每次写入时回调，用于断言写下去的值
 * @returns `WorkspaceGroupsProps` 里 `useStore` 与 `actions` 两格
 */
export function viewModeProps(
  mode: ViewMode = 'workspace',
  onChange?: (mode: ViewMode) => void,
  indicator: IndicatorStyle = 'icon',
): {
  useStore: <S>(selector: (state: ViewModeState) => S) => S
  actions: ViewModeActions
} {
  let state: ViewModeState = { mode, indicator, expansion: {} }
  return {
    useStore: (selector) => selector(state),
    actions: {
      setMode: (next: ViewMode) => {
        state = { ...state, mode: next }
        onChange?.(next)
      },
      setIndicator: (next: IndicatorStyle) => {
        state = { ...state, indicator: next }
      },
      setPinOverflow: (next: PinOverflow) => {
        state = { ...state, pinOverflow: next }
      },
      setPinScope: (next: PinScope) => {
        state = { ...state, pinScope: next }
      },
      setPinSectionCollapsed: (collapsed: boolean) => {
        state = { ...state, pinSectionCollapsed: collapsed }
      },
      setWorkspaceExpanded: (key: string, expanded: boolean) => {
        state = { ...state, expansion: { ...state.expansion, workspace: { ...state.expansion?.workspace, [key]: expanded } } }
      },
      setVirtualWorkspaceExpanded: (key: string, expanded: boolean) => {
        state = {
          ...state,
          expansion: { ...state.expansion, virtualWorkspace: { ...state.expansion?.virtualWorkspace, [key]: expanded } },
        }
      },
      setSessionGroupExpanded: (ref: SessionGroupRef, expanded: boolean) => {
        const key = sessionGroupKey(ref)
        state = { ...state, expansion: { ...state.expansion, group: { ...state.expansion?.group, [key]: expanded } } }
      },
      retainWorkspaceKeys: (keys: readonly string[]) => {
        const current = state.expansion?.workspace ?? {}
        const retained = new Set(keys)
        state = {
          ...state,
          expansion: {
            ...state.expansion,
            workspace: Object.fromEntries(
              Object.entries(current).filter(([key]) => retained.has(key)),
            ),
          },
        }
      },
    } as ViewModeActions,
  }
}

/** 一个可订阅的展示方式存储，形状与官方 store 座位背后的实例一致 */
export interface ViewModeStoreStub {
  getSnapshot: () => ViewModeState
  subscribe: (listener: () => void) => () => void
  set: (mode: ViewMode) => void
  setIndicator: (style: IndicatorStyle) => void
  /** 写入置顶区的三个本地偏好，用于验证「改了之后界面真的换了」 */
  setPinOverflow: (overflow: PinOverflow) => void
  setPinScope: (scope: PinScope) => void
  setPinSectionCollapsed: (collapsed: boolean) => void
  /** 写入某一层的显式展开选择，用于验证「点开之后写盘」 */
  setWorkspaceExpanded: (key: string, expanded: boolean) => void
  setVirtualWorkspaceExpanded: (key: string, expanded: boolean) => void
  setSessionGroupExpanded: (ref: SessionGroupRef, expanded: boolean) => void
  /** 摘掉工作区层里失效的键，用于验证清理 */
  retainWorkspaceKeys: (keys: readonly string[]) => void
}

/** 造一个可订阅的存储，用于验证「写入之后界面真的换了」 */
export function viewModeStoreStub(
  mode: ViewMode = 'workspace',
  indicator: IndicatorStyle = 'icon',
): ViewModeStoreStub {
  let state: ViewModeState = { mode, indicator, expansion: {} }
  const listeners = new Set<() => void>()
  /** 换一份状态并通知订阅者，与真引擎的写入同形 */
  const commit = (next: ViewModeState): void => {
    state = next
    for (const listener of [...listeners]) listener()
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next) => commit({ ...state, mode: next }),
    setIndicator: (next) => commit({ ...state, indicator: next }),
    setPinOverflow: (next) => commit({ ...state, pinOverflow: next }),
    setPinScope: (next) => commit({ ...state, pinScope: next }),
    setPinSectionCollapsed: (collapsed) => commit({ ...state, pinSectionCollapsed: collapsed }),
    setWorkspaceExpanded: (key, expanded) =>
      commit({
        ...state,
        expansion: { ...state.expansion, workspace: { ...state.expansion?.workspace, [key]: expanded } },
      }),
    setVirtualWorkspaceExpanded: (key, expanded) =>
      commit({
        ...state,
        expansion: {
          ...state.expansion,
          virtualWorkspace: { ...state.expansion?.virtualWorkspace, [key]: expanded },
        },
      }),
    setSessionGroupExpanded: (ref, expanded) => {
      const key = sessionGroupKey(ref)
      commit({
        ...state,
        expansion: { ...state.expansion, group: { ...state.expansion?.group, [key]: expanded } },
      })
    },
    retainWorkspaceKeys: (keys) => {
      const current = state.expansion?.workspace ?? {}
      const retained = new Set(keys)
      commit({
        ...state,
        expansion: {
          ...state.expansion,
          workspace: Object.fromEntries(
            Object.entries(current).filter(([key]) => retained.has(key)),
          ),
        },
      })
    },
  }
}

/**
 * 把上面那个存储接到区域要的那两格上
 *
 * `useStore` 走 `useSyncExternalStore`，与渲染器给 store 座位绑的那套同源
 * 因此这里的写入会触发重渲染，DOM 用例才能真正断言「切到平铺之后列表变了」
 * @param store - 可订阅的存储
 * @returns `WorkspaceGroupsProps` 里 `useStore` 与 `actions` 两格
 */
export function storeViewModeProps(store: ViewModeStoreStub): {
  useStore: <S>(selector: (state: ViewModeState) => S) => S
  actions: ViewModeActions
} {
  return {
    useStore: (selector) => {
      // 与渲染器给 store 座位绑的那套同源：快照引用未变时不触发重渲染
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
      return selector(state)
    },
    actions: {
      setMode: (next: ViewMode) => store.set(next),
      setIndicator: (next: IndicatorStyle) => store.setIndicator(next),
      setPinOverflow: (next: PinOverflow) => store.setPinOverflow(next),
      setPinScope: (next: PinScope) => store.setPinScope(next),
      setPinSectionCollapsed: (collapsed: boolean) => store.setPinSectionCollapsed(collapsed),
      setWorkspaceExpanded: (key: string, expanded: boolean) =>
        store.setWorkspaceExpanded(key, expanded),
      setVirtualWorkspaceExpanded: (key: string, expanded: boolean) =>
        store.setVirtualWorkspaceExpanded(key, expanded),
      setSessionGroupExpanded: (ref: SessionGroupRef, expanded: boolean) =>
        store.setSessionGroupExpanded(ref, expanded),
      retainWorkspaceKeys: (keys: readonly string[]) => store.retainWorkspaceKeys(keys),
    } as ViewModeActions,
  }
}
