import { useSyncExternalStore } from 'react'
import type { ViewMode } from '../src/client/data/types.ts'
import type { ViewModeActions, ViewModeState } from '../src/client/viewMode.ts'

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
): {
  useStore: <S>(selector: (state: ViewModeState) => S) => S
  actions: ViewModeActions
} {
  let state: ViewModeState = { mode }
  return {
    useStore: (selector) => selector(state),
    actions: {
      setMode: (next: ViewMode) => {
        state = { mode: next }
        onChange?.(next)
      },
    } as ViewModeActions,
  }
}

/** 一个可订阅的展示方式存储，形状与官方 store 座位背后的实例一致 */
export interface ViewModeStoreStub {
  getSnapshot: () => ViewModeState
  subscribe: (listener: () => void) => () => void
  set: (mode: ViewMode) => void
}

/** 造一个可订阅的存储，用于验证「写入之后界面真的换了」 */
export function viewModeStoreStub(mode: ViewMode = 'workspace'): ViewModeStoreStub {
  let state: ViewModeState = { mode }
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (next) => {
      state = { mode: next }
      for (const listener of [...listeners]) listener()
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
    } as ViewModeActions,
  }
}
