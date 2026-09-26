/**
 * `@deepseek-ai/dsh-client-store` 的 node 测试替身
 *
 * 真包是客户端基线的静态模块表成员，而它的引擎依赖 zustand / immer 未随本仓库安装
 * （`lib/index.js` 顶层 `import 'zustand/vanilla'` 会直接 ERR_MODULE_NOT_FOUND）
 * 因此这里按契约实现测试用到的那一部分：`defineStore` 的 init / persist / actions
 *
 * 行为与真引擎一致的三处：
 * - 每个实例从 `init()` 取初值，因此句柄可以在多处 `create` 而互不共享状态
 * - `persist` 从 localStorage 读回并写回（jsdom 提供 localStorage，node 环境下直接跳过）
 * - `actions` 是纯草稿变换，调用方拿到的是绑好实例的回调
 *
 * 其余的引擎能力（flush 模式、`createSnapshotStore` 的 raf 合帧、immer 冻结）测试用不到
 */

/** 真引擎 `defineStore` 的等价物：spec 进，句柄出 */
export function defineStore(decl) {
  return {
    spec: decl,
    create(scopeKey) {
      const persistKey =
        decl.persist === undefined
          ? undefined
          : scopeKey === undefined
            ? decl.persist
            : `${decl.persist}.${scopeKey}`
      let state = decl.init()
      const listeners = new Set()
      if (persistKey !== undefined && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(persistKey)
          if (raw !== null) state = JSON.parse(raw)
        } catch {
          // 读不回来就退回初值，与真引擎同一取舍
        }
      }
      const write = () => {
        if (persistKey !== undefined && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(persistKey, JSON.stringify(state))
          } catch {
            // 写不进去不影响本次会话内的状态
          }
        }
        for (const listener of [...listeners]) listener()
      }
      const actions = {}
      for (const key of Object.keys(decl.actions)) {
        actions[key] = (...params) => {
          // 纯草稿变换：替身直接把当前状态交给它改，测试里的 action 都是就地赋值
          decl.actions[key](state, ...params)
          write()
        }
      }
      return {
        actions,
        getSnapshot: () => state,
        subscribe: (fn) => {
          listeners.add(fn)
          return () => listeners.delete(fn)
        },
        clearPersisted: () => {
          if (persistKey !== undefined && typeof localStorage !== 'undefined') {
            localStorage.removeItem(persistKey)
          }
        },
      }
    },
  }
}

/** 裸的快照存储，本包未用到，仅为契约完整 */
export function createSnapshotStore(init) {
  let state = init
  const listeners = new Set()
  return {
    getSnapshot: () => state,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    update: (mutator) => {
      mutator(state)
      for (const listener of [...listeners]) listener()
    },
    set: (next) => {
      state = next
      for (const listener of [...listeners]) listener()
    },
  }
}

export const notifySubscribers = (listeners, label, ...args) => {
  for (const listener of [...listeners]) {
    try {
      listener(...args)
    } catch (error) {
      console.error(`${label} subscriber failed:`, error)
    }
  }
}

export const shallowEqual = (a, b) => {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => Object.is(a[key], b[key]))
}

export default { defineStore, createSnapshotStore, notifySubscribers, shallowEqual }
