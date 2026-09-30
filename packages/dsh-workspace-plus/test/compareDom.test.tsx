// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { registerCompareTab } from '../src/client/compare.tsx'
import type { RegionActions } from '../src/client/actions.ts'
import { snapshot } from './snapshot-stub.ts'
import { createViewModeStore } from '../src/client/store/viewMode.ts'
import { viewModeProps } from './viewMode-stub.ts'
import { sidebarTranslate, translateFor, workspaceTranslate } from './locale-stub.ts'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { Context } from '@deepseek-ai/cordis'

/**
 * 对照 tab 的服务读取边界
 *
 * 原生右侧栏把 tab 体当普通插槽渲染：标准 hook 与 `t` 座位由渲染器在渲染期注入
 * 此时 `ctx` 不是本包的 fiber
 * cordis 的服务代理对未 inject 的属性直接抛错（`cannot get property "remote" without inject`）
 * 因此凡是 `ctx.xxx` 形态的读取都必须在本包自己的 context 上先解析好，随 inject 面传进 tab 体
 *
 * 这类问题在只调 `registerCompareTab` 的测试里看不出来——注册本身不渲染组件
 * 异常要等 tab 真的挂上才发生
 * 这里按 cordis 的代理语义造出那个会抛错的 tab 体上下文，把组件渲染一遍
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

/** 语言服务替身 */
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

/** 各标准源的空快照，组件挂得上即可 */
const EMPTY_WORKSPACES = { items: [], archivedSessionIds: [], phase: 'ready' }
const EMPTY_SESSIONS = { ids: [], byId: {}, phase: 'ready' }

const workspacesSelector = (select: (state: never) => unknown): unknown =>
  select(EMPTY_WORKSPACES as never)
const sessionsSelector = (select: (state: never) => unknown): unknown =>
  select(EMPTY_SESSIONS as never)
const emptySelector = (select: (state: never) => unknown): unknown => select({} as never)
const falseSelector = (select: (occupied: boolean) => unknown): unknown => select(false)

/**
 * 注册一次对照 tab，取回那个 tab 体组件与它收到的 inject 面
 *
 * 本包自己的 context 声明了 `remote`，因此注册期读得到宿主固定事实
 * tab 体拿到的只是一个普通函数参数，任何 `ctx.xxx` 属性读取都会炸
 */
function register() {
  const bodies: {
    key: string
    inject?: () => Record<string, unknown>
    component: unknown
  }[] = []
  const services: Record<string, unknown> = {
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { openTab: () => {} },
    remote: { $host: { home: '/home/user' } },
    slots: {
      inject: (_key: string, callback: () => unknown) => callback(),
      // 登记项与它的组件是两个参数：座位按键控找体，体就是第二个参数
      register: (entry: (typeof bodies)[number], component: unknown) => {
        bodies.push({ ...entry, component })
        return () => {}
      },
      entriesOfSlot: () => [],
      subscribe: () => () => {},
    },
  }

  const owner = {
    get: (name: string) => services[name],
    inject: (_deps: string[], callback: (ctx: { get: (name: string) => unknown }) => unknown) => {
      const dispose = callback({ get: (name: string) => services[name] })
      return { dispose: async () => void dispose }
    },
    slots: services['slots'],
  } as unknown as Context

  registerCompareTab(owner, actions(), fakeLocale(), createViewModeStore())
  return { bodies }
}

describe('compare tab service reads', () => {
  it('renders the tab body without reading services off a context', async () => {
    const { bodies } = register()
    const body = bodies[0]
    if (body === undefined) throw new Error('compare tab body was not registered')

    // tab 体拿到的 props 就是 inject 面的产物 + 渲染器补的标准座位
    const injected = body.inject?.() ?? {}
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(body.component as never, {
          ...injected,
          // 渲染器会把 inject 面的 hooks 隔间绑成 use<Name> 选择器，这里照同一形状补上
          t: translateFor('workspacePlus'),
          useWorkspaces: workspacesSelector,
          useSessions: sessionsSelector,
          useSessionStatus: emptySelector,
          useDirectoryFlow: falseSelector,
          useHostInfo: emptySelector,
          ...viewModeProps(),
        }),
      )
    })

    // 区域确实渲染出来了，而不是被异常吞成空树
    expect(container.querySelector('.root')).not.toBeNull()
  })

  it('passes the injected face through unchanged for the region to consume', () => {
    const { bodies } = register()
    const injected = bodies[0]?.inject?.() ?? {}

    // 动作面与展开请求都在 inject 结果里，组件不需要从 ctx 现取
    expect(injected).toMatchObject({ wide: true })
    expect(typeof injected['expandSidebar']).toBe('function')
    expect(typeof injected['openSession']).toBe('function')
  })
})
