import { describe, expect, it } from 'vitest'
import { COMPARE_MODE, apply } from '../src/client/index.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { RegionActions } from '../src/client/actions.ts'

/**
 * 对照模式下 `apply` 把左侧 `sidebar.workspaces` 交还官方 ui-workspace，改去注册
 * 右侧栏 tab，因此不往插槽里注册区域组件。下面依赖插槽注册的用例据此跳过
 * 而不是在两种模式下都硬跑——它们在对照模式下没有可断言的对象
 */
const REGION_REGISTRATIONS = COMPARE_MODE ? 0 : 1

/**
 * 插槽登记里属于区域本身的那一条
 *
 * 对照模式下 apply 不注册区域，但仍会为对照 tab 的体登记一次座位
 * 因此不能直接数 `register` 的调用次数，只数 `sidebar.workspaces` 那一条
 */
function regionRegistrations(registered: readonly unknown[]): unknown[] {
  return registered.filter(
    (entry) => (entry as { name?: string }).name === 'sidebar.workspaces',
  )
}

/**
 * 浏览器半边挂载期的生命周期
 *
 * 重点是 remote 命名空间的挂载与卸载必须成对：`$mount` 的 effect 挂在网关
 * 那一侧的 context 上，不是本包 fiber，因此本包必须自己保管并调用它的卸载
 * 函数。丢掉它的话，热重载（改插件代码后客户端会重新走一遍 apply）会在第二次
 * 挂载时撞上「方法已挂载」而整体失效——分组读不出、一切写操作都抛错
 */

/** 造一个记录 effect 的客户端 context，并按需交出 `$mount` 的行为 */
function fakeContext(options: { mount?: () => Promise<() => Promise<void>> } = {}) {
  const effects: (() => unknown)[] = []
  const disposers: (() => unknown)[] = []
  const warnings: unknown[][] = []
  const registered: unknown[] = []
  const opened: unknown[] = []
  const connectionListeners: (() => void)[] = []
  const services: Record<string, unknown> = {
    sessions: {
      list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'ready' }) },
    },
    workspaces: {},
    locale: {
      register: () => () => {},
      bind: () => () => '',
      getSnapshot: () => ({ revision: 0 }),
      subscribe: () => () => {},
    },
    remote: {
      $mount: options.mount ?? (async () => async () => {}),
    },
    'remote.workspaceGroups': { list: async () => ({ ok: true, value: { byWorkspace: {} } }) },
    // 对照模式下 apply 经 ctx.inject 等 sidebarRightTabs，并从这里自动打开一次
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { openTab: () => {} },
    slots: {
      // `slot.register` / `slot.inject` 都返回反注册函数，与真实渲染器一致
      inject: (_key: string, callback: () => unknown) => {
        const dispose = callback()
        return () => {
          if (typeof dispose === 'function') (dispose as () => void)()
        }
      },
      register: (entry: unknown) => {
        registered.push(entry)
        return () => {}
      },
      entriesOfSlot: () => [],
      subscribe: () => () => {},
    },
  }
  const ctx = {
    get: (name: string) => services[name],
    // apply 订阅 connection/reset 以在连接建立（含重连）后重拉，缺了它 apply 直接 TypeError
    on: (event: string, listener: () => void) => {
      if (event === 'connection/reset') connectionListeners.push(listener)
      return () => {}
    },
    // 对照模式下 apply 会调 registerCompareTab，它经 ctx.inject 等 sidebarRightTabs
    // 这里给一个立即视为就绪的替身，缺了它会在注册前就 TypeError
    inject: (_deps: string[], callback: (injected: { get: (name: string) => unknown }) => unknown) => {
      const dispose = callback({ get: (name: string) => services[name] })
      return {
        dispose: async () => {
          void dispose
        },
      }
    },
    effect: (body: () => unknown) => {
      effects.push(body)
      const dispose = body()
      if (typeof dispose === 'function') disposers.push(dispose as () => unknown)
      return () => {}
    },
    logger: {
      warn: (...args: unknown[]) => {
        warnings.push(args)
      },
      info: () => {},
    },
    slots: services['slots'],
    remote: services['remote'],
  }
  return {
    ctx: ctx as unknown as Context,
    effects,
    disposers,
    warnings,
    registered,
    opened,
    /** 触发一次连接建立信号 */
    emitConnectionReset: () => {
      for (const listener of [...connectionListeners]) listener()
    },
    /** 跑一遍 apply 登记的全部 effect，并按逆序执行它们的收尾 */
    teardown: () => {
      for (const dispose of [...disposers].reverse()) dispose()
    },
  }
}

/** 让 apply 期间发起的那次挂载落地 */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('client half remote mount', () => {
  it('releases the previous mount so a reload can mount again', async () => {
    const unmounts: number[] = []
    let mounts = 0
    const mount = async (): Promise<() => Promise<void>> => {
      mounts += 1
      const id = mounts
      return async () => {
        unmounts.push(id)
      }
    }

    // 第一次加载：挂载一次
    const first = fakeContext({ mount })
    apply(first.ctx)
    await settle()
    expect(mounts).toBe(1)
    expect(regionRegistrations(first.registered)).toHaveLength(REGION_REGISTRATIONS)

    // 热重载：本包 fiber 卸载。`$mount` 的卸载函数必须被调用，否则第二次
    // 挂载会撞上「方法已挂载」——那正是分组功能整体失效的那条路径
    first.teardown()
    await settle()
    expect(unmounts).toEqual([1])

    // 重载后的第二次加载：有了上面的卸载，这次才挂得上
    const second = fakeContext({ mount })
    apply(second.ctx)
    await settle()
    expect(mounts).toBe(2)
    expect(regionRegistrations(second.registered)).toHaveLength(REGION_REGISTRATIONS)
  })

  it('releases a mount that only lands after the plugin was unloaded', async () => {
    const unmounts: string[] = []
    let resolveMount: ((dispose: () => Promise<void>) => void) | undefined
    const mount = (): Promise<() => Promise<void>> =>
      new Promise((resolve) => {
        resolveMount = resolve
      })

    const harness = fakeContext({ mount })
    apply(harness.ctx)

    // 卸载先于挂载落地：这时还没有卸载函数可调，因此落地那一刻必须当场退回
    harness.teardown()
    resolveMount?.(async () => {
      unmounts.push('late')
    })
    await settle()

    expect(unmounts).toEqual(['late'])
  })

  it('reports a failed mount instead of dropping an unhandled rejection', async () => {
    const failure = new Error('client api: method is already mounted')
    const harness = fakeContext({
      mount: async () => {
        throw failure
      },
    })

    apply(harness.ctx)
    await settle()

    // 挂载失败要留下可查的痕迹：界面只表现为分组不可用，不接住这次 rejection
    // 的话日志里什么都没有
    expect(harness.warnings.flat()).toContain(failure)
  })
})

describe.skipIf(COMPARE_MODE)('client half region registration', () => {
  it('registers as the renderer of sidebar.workspaces below the official priority', () => {
    const harness = fakeContext()
    apply(harness.ctx)

    // single 插槽：数值更低者渲染，官方用默认 0，因此必须用 -1 接替
    expect(harness.registered).toEqual([
      expect.objectContaining({ name: 'sidebar.workspaces', priority: -1 }),
    ])
  })
})

describe('client half data-plane retry', () => {
  /** 取回区域注入面，并让 remote 挂载落地 */
  async function injectedFace(
    mount?: () => Promise<() => Promise<void>>,
  ): Promise<{ harness: ReturnType<typeof fakeContext>; actions: RegionActions }> {
    const harness = fakeContext(mount === undefined ? {} : { mount })
    apply(harness.ctx)
    await settle()
    const entry = harness.registered[0] as { inject: () => RegionActions }
    return { harness, actions: entry.inject() }
  }

  it('keeps the ready subscription registered so a later signal can still retry', async () => {
    const { harness, actions } = await injectedFace()

    // 挂载已经完成：订阅落在「remote 已就绪」这条路径上
    let retries = 0
    const dispose = actions.onReady(() => {
      retries += 1
    })
    expect(retries).toBe(1)

    // 连接建立（含 dsh web 重启后的重连）必须还能再通知一次
    harness.emitConnectionReset()
    expect(retries).toBe(2)

    // 反注册之后不再通知
    dispose()
    harness.emitConnectionReset()
    expect(retries).toBe(2)
  })

  it('announces readiness when the mount lands after subscription', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const harness = fakeContext({
      // 挂载故意悬着，模拟「订阅早于 $mount 完成」
      mount: async () => {
        await gate
        return async () => {}
      },
    })
    apply(harness.ctx)

    const entry = harness.registered[0] as { inject: () => RegionActions }
    const actions = entry.inject()
    let retries = 0
    actions.onReady(() => {
      retries += 1
    })
    // 此时 remote 还没挂上，因此只有订阅、没有回调
    expect(retries).toBe(0)

    release?.()
    await settle()
    // 挂载落地时补发一次，早先失败的那次拉取因此有机会重来
    expect(retries).toBe(1)
  })
})

describe.skipIf(COMPARE_MODE)('client half session creation', () => {
  /** 取回区域注入面里那次 `startSession` 的实现 */
  async function startSessionWith(
    uiWorkspace: unknown,
  ): Promise<(workspaceId: string) => Promise<string | undefined>> {
    const harness = fakeContext()
    const services = harness.ctx as unknown as { get: (name: string) => unknown }
    const original = services.get
    ;(services as { get: (name: string) => unknown }).get = (name: string) =>
      name === 'uiWorkspace' ? uiWorkspace : original(name)

    apply(harness.ctx)
    await settle()

    // 注册项带着注入工厂，工厂产出的面里就是 startSession
    const entry = harness.registered[0] as {
      inject: () => { startSession: (id: string) => Promise<string | undefined> }
    }
    return entry.inject().startSession
  }

  it('opens the workspace through the official navigation service', async () => {
    const openedWorkspaces: unknown[] = []
    const uiWorkspace = {
      openWorkspace: async (workspaceId: unknown, beforeOpen?: (id: unknown) => void) => {
        openedWorkspaces.push(workspaceId)
        beforeOpen?.('session-1')
      },
    }

    const startSession = await startSessionWith(uiWorkspace)
    const sessionId = await startSession('w1')

    // 新建整段交给官方 `openWorkspace`：它复用该工作区已有的空白会话、没有才
    // 新建，并自带导航守卫。会话 id 只能从 `beforeOpen` 回调里取
    expect(openedWorkspaces).toEqual(['w1'])
    expect(sessionId).toBe('session-1')
  })

  it('leaves the id undefined when a newer navigation superseded this creation', async () => {
    const uiWorkspace = {
      // 本轮导航已被取代：官方不触发 `beforeOpen`，调用方因此不摆位置
      openWorkspace: async () => {},
    }

    const startSession = await startSessionWith(uiWorkspace)

    expect(await startSession('w1')).toBeUndefined()
  })

  it('selects a session through the official navigation service', async () => {
    const harness = fakeContext()
    const services = harness.ctx as unknown as { get: (name: string) => unknown }
    const original = services.get
    const opened: string[] = []
    ;(services as { get: (name: string) => unknown }).get = (name: string) =>
      name === 'uiWorkspace' ? { openSession: (id: string) => opened.push(id) } : original(name)

    apply(harness.ctx)
    await settle()

    const entry = harness.registered[0] as {
      inject: () => { openSession: (id: string) => void }
    }
    entry.inject().openSession('session-1')

    // 选中会话是导航事实，归官方 uiWorkspace 独占
    expect(opened).toEqual(['session-1'])
  })

  it('fails loud when the official navigation service is absent', async () => {
    const startSession = await startSessionWith(undefined)

    await expect(startSession('w1')).rejects.toThrow('uiWorkspace')
  })
})
