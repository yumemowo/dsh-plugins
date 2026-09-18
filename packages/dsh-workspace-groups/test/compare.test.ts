import { describe, expect, it } from 'vitest'
import { COMPARE_TAB_ID, registerCompareTab } from '../src/client/compare.tsx'
import type { RegionActions } from '../src/client/actions.ts'
import { translateFor, workspaceTranslate } from './locale-stub.ts'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { Context } from '@deepseek-ai/cordis'

/** 造一份最小可用的注入动作 */
function actions(): RegionActions {
  return {
    openSession: () => {},
    startSession: async () => '',
    onReady: () => () => {},
    loadGroups: async () => ({}),
    createGroup: async () => ({}),
    renameGroup: async () => ({}),
    deleteGroup: async () => ({}),
    moveSession: async () => ({}),
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    tWorkspace: workspaceTranslate(),
  }
}

/**
 * 造一个语言服务替身
 *
 * `bind` 按命名空间给翻译函数：本包命名空间给真实字典，官方 `workspace`
 * 命名空间给官方键名的替身。`subscribe` 只记录订阅者，供断言订阅路径存在
 */
function fakeLocale() {
  const listeners = new Set<() => void>()
  const snapshot = { active: 'zh', locales: [], revision: 1 }
  const bound = new Map<string, unknown>()
  return {
    listeners,
    service: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      bind: (ns: string) => {
        let t = bound.get(ns)
        if (t === undefined) {
          t = translateFor(ns)
          bound.set(ns, t)
        }
        return t
      },
    } as unknown as LocaleRuntime,
  }
}

/** 造一个记录 tab 注册与打开的 betterSidebar */
function fakeSidebar() {
  const registered: {
    id: string
    title: string | (() => string)
    description?: string | (() => string)
    order?: number
    single?: boolean
    component: (props: { ctx: Context }) => unknown
  }[] = []
  const opened: { type: string; target?: string }[] = []
  return {
    registered,
    opened,
    service: {
      registerTab: (descriptor: (typeof registered)[number]) => {
        registered.push(descriptor)
        return () => {}
      },
      openTab: (seed: { type: string; target?: string }) => {
        opened.push(seed)
      },
    },
  }
}

/** 造一个把注入依赖立即视为就绪的客户端 context */
function fakeContext(options: { betterSidebar?: unknown } = {}): Context {
  const services: Record<string, unknown> = {
    betterSidebar: options.betterSidebar,
  }
  return {
    get: (name: string) => services[name],
    inject: (_deps: string[], callback: (ctx: { get: (name: string) => unknown }) => unknown) => {
      const dispose = callback({ get: (name: string) => services[name] })
      return {
        dispose: async () => {
          void dispose
        },
      }
    },
  } as unknown as Context
}

/** 注册一次对照 tab，返回可观察的替身 */
function register(options: { betterSidebar?: unknown } = {}) {
  const sidebar = fakeSidebar()
  const locale = fakeLocale()
  registerCompareTab(
    fakeContext({ betterSidebar: options.betterSidebar ?? sidebar.service }),
    actions(),
    locale.service,
  )
  return { sidebar, locale }
}

describe('registerCompareTab', () => {
  it('registers the compare tab under its own id', () => {
    const { sidebar } = register()

    expect(sidebar.registered.map((tab) => tab.id)).toEqual([COMPARE_TAB_ID])
  })

  it('opens the registered tab in the right sidebar', () => {
    const { sidebar } = register()

    // 右侧栏是 DSH 原生列；落到 bottom 会变成 better-sidebar 自己的底部面板
    expect(sidebar.opened).toEqual([{ type: COMPARE_TAB_ID, target: 'right' }])
  })

  it('makes the tab single-instance so repeated opens focus the same one', () => {
    const { sidebar } = register()

    expect(sidebar.registered[0]?.single).toBe(true)
  })

  it('reads its copy through thunks so a language switch needs no re-registration', () => {
    const { sidebar } = register()

    const tab = sidebar.registered[0]
    expect(typeof tab?.title).toBe('function')
    expect(typeof tab?.description).toBe('function')
  })

  it('resolves the tab title and description from the package namespace', () => {
    const { sidebar } = register()

    const tab = sidebar.registered[0]
    // 标题与区域标题同键；说明是本包自己的对照 tab 专属键
    expect((tab?.title as () => string)()).toBe('工作区')
    expect((tab?.description as () => string)()).toBe('分组区域的对照视图（左侧为官方工作区列表）')
  })

  it('skips registration when better-sidebar is absent', () => {
    const sidebar = fakeSidebar()
    const locale = fakeLocale()

    // 没装 better-sidebar 时不该抛错，宿主半边与存储照常工作
    expect(() =>
      registerCompareTab(fakeContext(), actions(), locale.service),
    ).not.toThrow()
    expect(sidebar.registered).toEqual([])
  })
})
