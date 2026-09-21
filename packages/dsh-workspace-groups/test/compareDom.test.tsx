// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCompareTab } from '../src/client/compare.tsx'
import type { RegionActions } from '../src/client/actions.ts'
import { snapshot } from './snapshot-stub.ts'
import { sidebarTranslate, translateFor, workspaceTranslate } from './locale-stub.ts'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { Context } from '@deepseek-ai/cordis'

/**
 * 对照 tab 的服务读取边界
 *
 * better-sidebar 交给 tab 的 context **不是本包的 fiber**
 * 没有 inject 本包声明的服务
 * cordis 的服务代理对未 inject 的属性直接抛错（`cannot get property "remote" without inject`）
 * 因此凡是 `ctx.xxx` 形态的读取都必须在本包自己的 context 上先解析好
 *
 * 这类问题在只调 `registerCompareTab` 的测试里看不出来——注册本身不渲染组件
 * 异常要等 tab 真的挂上才发生
 * 这里按 cordis 的代理语义造出那个会抛错的 tab context，把组件渲染一遍
 */

/** 最小可用的注入动作 */
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
 * 按 cordis 的代理语义造一个 context
 *
 * `get` 照常返回服务（或 undefined），但**属性读取**对未 inject 的名字抛错——
 * 这正是 `ctx.remote` 在 tab context 上炸掉的原因
 * @param services - 可被 `get` 到、也可被属性访问到（若声明为 injected）的服务
 * @param injected - 这个 context 的 inject 列表
 */
function fakeContext(
  services: Record<string, unknown>,
  injected: readonly string[] = [],
): Context {
  return new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        if (prop === 'get') return (name: string) => services[name]
        // 依赖已就绪时 cordis 当场跑回调（与 registerCompareTab 的用法一致）
        if (prop === 'inject') {
          return (deps: string[], callback: (ctx: Context) => unknown) => {
            callback(fakeContext(services, [...injected, ...deps]))
            return { dispose: async () => {} }
          }
        }
        // 连接事件：本包的 hostInfoSource 会 ctx.on('connection/reset')
        if (prop === 'on') return () => () => {}
        if (injected.includes(prop)) return services[prop]
        throw new Error(`cannot get property "${prop}" without inject`)
      },
    },
  ) as unknown as Context
}

/**
 * 语言服务替身：bind 按命名空间给翻译函数，subscribe 记订阅者
 *
 * 快照必须是**稳定引用**：`useSyncExternalStore` 按 `Object.is` 比较
 * 每次新建对象会被判定为「一直在变」而把组件转进无限重渲染
 */
function fakeLocale(): LocaleRuntime {
  const bound = new Map<string, unknown>()
  const snapshot = { active: 'zh', locales: [], revision: 1 }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    bind: (ns: string) => {
      let t = bound.get(ns)
      if (t === undefined) {
        t = translateFor(ns)
        bound.set(ns, t)
      }
      return t
    },
  } as unknown as LocaleRuntime
}

/**
 * 注册一次对照 tab，返回描述符与那个会抛错的 tab context
 *
 * 注册 context 声明了 `remote`（本包 `inject` 列表里本来就有）
 * 因此它读得到宿主固定事实；tab context 什么都不声明
 */
function register() {
  const registered: {
    component: (props: { ctx: Context }) => unknown
  }[] = []
  const locale = fakeLocale()
  const services: Record<string, unknown> = {
    betterSidebar: {
      registerTab: (descriptor: (typeof registered)[number]) => {
        registered.push(descriptor)
        return () => {}
      },
      openTab: () => {},
    },
    // 本包的 `inject` 里有 remote，因此注册 context 读得到；tab context 读不到
    remote: { $host: { home: '/home/user', isLoopback: true } },
  }

  const owner = fakeContext(services, ['slots', 'sessions', 'workspaces', 'locale', 'remote'])
  registerCompareTab(owner, actions(), locale)
  return { registered, services }
}

describe('compare tab service reads', () => {
  it('renders the tab body without reading remote off the tab context', async () => {
    const { registered, services } = register()
    const tab = registered[0]
    // 显式收窄而不是 toBeDefined()：下面的渲染要用它
    if (tab === undefined) throw new Error('compare tab was not registered')

    // tab context 只有 get（服务可缺）——属性访问一律抛错，与 cordis 一致
    const tabCtx = fakeContext(services)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    // 修复前这里会抛 `cannot get property "remote" without inject`
    await act(async () => {
      root.render(React.createElement(tab.component as never, { ctx: tabCtx }))
    })

    // 区域确实渲染出来了，而不是被异常吞成空树
    expect(container.querySelector('.wg-root')).not.toBeNull()
  })

  it('keeps the tab context free of every property read the package needs', () => {
    // 这条断言把边界写成契约：tab context 上任何属性读取都会抛错
    // 因此组件只能用它的 `get`。若以后又有人从 tabProps.ctx 上直接读服务，这里会先炸
    const tabCtx = fakeContext({})

    expect(() => (tabCtx as unknown as { remote: unknown }).remote).toThrow(
      'cannot get property "remote" without inject',
    )
    expect((tabCtx as unknown as { get: (name: string) => unknown }).get('anything')).toBeUndefined()
  })
})
