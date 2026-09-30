import { describe, expect, it } from 'vitest'
import {
  COMPARE_TAB_ID,
  COMPARE_TAB_KIND,
  registerCompareTab,
} from '../src/client/compare.tsx'
import type { RegionActions } from '../src/client/actions.ts'
import { sidebarTranslate, translateFor, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { createViewModeStore } from '../src/client/store/viewMode.ts'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { Context } from '@deepseek-ai/cordis'

/** 造一份最小可用的注入动作 */
function actions(): RegionActions {
  return {
    openSession: () => {},
    startSession: async () => '',
    onReady: () => () => {},
    loadGroups: async () => snapshot(),
    createGroup: async () => snapshot(),
    renameGroup: async () => snapshot(),
    deleteGroup: async () => snapshot(),
    moveSession: async () => snapshot(),
    createVirtualWorkspace: async () => snapshot(),
    renameVirtualWorkspace: async () => snapshot(),
    deleteVirtualWorkspace: async () => snapshot(),
    moveWorkspace: async () => snapshot(),
    nestWorkspaces: async () => snapshot(),
    unnestWorkspaces: async () => snapshot(),
    setNested: async () => snapshot(),
    forgetWorkspace: async () => snapshot(),
    focusEntry: async () => snapshot(),
    togglePinned: async () => snapshot(),
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    searchResultLimit: 20,
    tWorkspace: workspaceTranslate(),
    tSidebar: sidebarTranslate(),
  }
}

/**
 * 造一个语言服务替身
 *
 * `bind` 按命名空间给翻译函数：本包命名空间给真实字典
 * 官方 `workspace` 命名空间给官方键名的替身
 */
function fakeLocale() {
  const bound = new Map<string, unknown>()
  return {
    service: {
      getSnapshot: () => ({ active: 'zh', locales: [], revision: 1 }),
      subscribe: () => () => {},
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

/**
 * 造一个记录原生右侧栏注册的替身
 *
 * `types` 收下类型定义（阶段一），`bodies` 收下按键控的 tab 体（阶段二），`opened` 收下自动打开的那一次
 */
function fakeSidebarRight(options: { present?: boolean } = {}) {
  const types: {
    id: string
    kind: string
    priority?: string
    title: (address: string) => string
    guide?: readonly {
      id: string
      order: number
      title: () => string
      description?: () => string
    }[]
  }[] = []
  const opened: string[] = []
  const present = options.present ?? true
  return {
    types,
    opened,
    service: present
      ? {
          register: (definition: (typeof types)[number]) => {
            types.push(definition)
            return () => {}
          },
        }
      : undefined,
    right: {
      openTab: (kind: string) => opened.push(kind),
    },
  }
}

/** 造一个把注入依赖立即视为就绪的客户端 context */
function fakeContext(
  options: {
    sidebarRightTabs?: unknown
    sidebarRight?: unknown
    bodies?: unknown[]
  } = {},
): Context {
  const services: Record<string, unknown> = {
    sidebarRightTabs: options.sidebarRightTabs,
    sidebarRight: options.sidebarRight,
    remote: { $host: { home: '/home/user' } },
    slots: {
      inject: (_key: string, callback: () => unknown) => callback(),
      register: (entry: unknown) => {
        options.bodies?.push(entry)
        return () => {}
      },
      entriesOfSlot: () => [],
      subscribe: () => () => {},
    },
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
    slots: services['slots'],
  } as unknown as Context
}

/** 注册一次对照 tab，返回可观察的替身 */
function register(options: { present?: boolean } = {}) {
  const sidebar = fakeSidebarRight(options)
  const locale = fakeLocale()
  const bodies: unknown[] = []
  registerCompareTab(
    fakeContext({
      sidebarRightTabs: sidebar.service,
      sidebarRight: sidebar.right,
      bodies,
    }),
    actions(),
    locale.service,
    createViewModeStore(),
  )
  return { sidebar, locale, bodies }
}

describe('registerCompareTab', () => {
  it('registers the compare type under its own id and kind', () => {
    const { sidebar } = register()

    expect(sidebar.types.map((tab) => tab.id)).toEqual([COMPARE_TAB_ID])
    expect(sidebar.types[0]?.kind).toBe(COMPARE_TAB_KIND)
  })

  it('registers the body into the keyed tab seat under the same id', () => {
    // 两段式注册的关联就是这一格：座位按键控，键必须是类型定义里的 `id`
    const { bodies } = register()

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ name: 'sidebar.right.pane.tab', key: COMPARE_TAB_ID })
  })

  it('opens the registered kind in the right sidebar', () => {
    const { sidebar } = register()

    expect(sidebar.opened).toEqual([COMPARE_TAB_KIND])
  })

  it('claims the extension band so it outranks nothing and needs no builtin slot', () => {
    const { sidebar } = register()

    expect(sidebar.types[0]?.priority).toBe('extension')
  })

  it('reads its copy through thunks so a language switch needs no re-registration', () => {
    const { sidebar } = register()

    const tab = sidebar.types[0]
    // 标题与说明都是 thunk：每次取用时现读当前语言
    expect(typeof tab?.title).toBe('function')
    expect(tab?.guide?.[0]?.description).toBeTypeOf('function')
  })

  it('resolves the tab title and description from their own namespaces', () => {
    const { sidebar } = register()

    const tab = sidebar.types[0]
    // 标题与区域标题同键（官方 workspace 命名空间），说明是本包自有的对照 tab 专属键
    expect(tab?.title('')).toBe('工作区')
    expect(tab?.guide?.[0]?.description?.()).toBe(
      '分组区域的对照视图（左侧为官方工作区列表）',
    )
  })

  it('offers the type on the guide page so it can be opened by hand', () => {
    const { sidebar } = register()

    expect(sidebar.types[0]?.guide?.map((entry) => entry.id)).toEqual([COMPARE_TAB_KIND])
  })

  it('skips the type registration when the native right sidebar is absent', () => {
    const sidebar = fakeSidebarRight({ present: false })
    const locale = fakeLocale()
    const bodies: unknown[] = []

    // 没装 ui-sidebar-right 时不该抛错，宿主半边与存储照常工作
    expect(() =>
      registerCompareTab(
        fakeContext({ sidebarRightTabs: undefined, sidebarRight: sidebar.right, bodies }),
        actions(),
        locale.service,
        createViewModeStore(),
      ),
    ).not.toThrow()
    expect(sidebar.types).toEqual([])
  })

  it('registers the body even when the type registry is absent', () => {
    // 座位与类型注册是两条独立的 effect，类型缺失只让 tab 打不开
    // 体仍按声明注册着，等 registry 到位时不必重来一遍
    const sidebar = fakeSidebarRight({ present: false })
    const locale = fakeLocale()
    const bodies: unknown[] = []

    registerCompareTab(
      fakeContext({ sidebarRightTabs: undefined, sidebarRight: sidebar.right, bodies }),
      actions(),
      locale.service,
      createViewModeStore(),
    )

    expect(bodies).toHaveLength(1)
  })
})
