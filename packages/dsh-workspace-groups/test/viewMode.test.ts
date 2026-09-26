import { afterEach, describe, expect, it } from 'vitest'
import {
  VIEW_MODE_PERSIST_KEY,
  createViewModeStore,
  sharedViewModeStore,
} from '../src/client/viewMode.ts'

/**
 * 展示方式的存储
 *
 * 这个状态是浏览器本地偏好：初值「按工作区」、写下去即持久化、刷新后读回来
 * 对照模式下区域挂在会话作用域的座位上，因此还要守住「两条路径读的是同一份设置」这一条
 */

afterEach(() => {
  // localStorage 在 node 测试环境里不存在，删掉可能残留的替身
  delete (globalThis as { localStorage?: unknown }).localStorage
})

/** 装一个最小的 localStorage，行为与浏览器的这一部分一致 */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  return entries
}

describe('view mode store', () => {
  it('starts on the grouped view', () => {
    expect(createViewModeStore().create().getSnapshot()).toEqual({ mode: 'workspace' })
  })

  it('persists the picked mode under its own key', () => {
    const entries = installStorage()
    const instance = createViewModeStore().create()

    instance.actions.setMode('flat')

    expect(entries.get(VIEW_MODE_PERSIST_KEY)).toBe(JSON.stringify({ mode: 'flat' }))
  })

  it('reads the persisted mode back on the next instance', () => {
    // 刷新页面后要停在上次选的方式上，否则每次重载都要重选一遍
    installStorage()
    createViewModeStore().create().actions.setMode('flat')

    expect(createViewModeStore().create().getSnapshot()).toEqual({ mode: 'flat' })
  })

  it('keeps the stored key apart from the official workspace view store', () => {
    // 官方 ui-workspace 的 groupBy 存在 dsh.workspace.view.* 下，两者是两套独立的界面状态
    expect(VIEW_MODE_PERSIST_KEY.startsWith('dsh.workspace.view.')).toBe(false)
  })

  it('hands out one instance through the shared handle', () => {
    // 对照模式下座位是会话作用域的，渲染器会按会话反复调 create
    // 共享句柄让那些调用都落回同一个实例，展示方式因此不按会话分开存
    installStorage()
    const handle = sharedViewModeStore(createViewModeStore())
    const first = handle.create()
    const second = handle.create('session-a')

    expect(second).toBe(first)
    first.actions.setMode('flat')
    expect(second.getSnapshot()).toEqual({ mode: 'flat' })
  })

  it('scopes the persist key by session only when the handle allows it', () => {
    // 共享实例建在根作用域上，因此持久化键不带会话后缀
    const entries = installStorage()
    sharedViewModeStore(createViewModeStore()).create('session-a').actions.setMode('flat')

    expect([...entries.keys()]).toEqual([VIEW_MODE_PERSIST_KEY])
  })
})
