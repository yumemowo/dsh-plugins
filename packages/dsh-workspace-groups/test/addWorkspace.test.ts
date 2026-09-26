import { describe, expect, it } from 'vitest'
import * as React from 'react'
import {
  DIRECTORY_FLOW_SLOT,
  directoryFlowOccupant,
  resolveOccupant,
} from '../src/client/directoryFlow.ts'
import { AddWorkspaceControl } from '../src/client/views/AddWorkspaceControl.tsx'
import type { AddWorkspaceActions, DirectoryFlowOwner } from '../src/client/actions.ts'
import { officialAddLabels } from '../src/client/official.ts'
import { regionTranslate, workspaceTranslate } from './locale-stub.ts'

/**
 * 组件渲染冒烟
 *
 * node 环境没有 react-dom，这里用一个最小 dispatcher 直接调用函数组件
 * 状态按 hook 序号跨次渲染保留，因此失败路径可以在 await 之后重新渲染一次
 * 断言错误框真的开了
 */
const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

/**
 * 造一个跨次渲染保留状态的 dispatcher
 *
 * 每次渲染把游标归零，`useState` 按序号读写同一份状态表，setter 只改状态表
 * 需要看新状态时由调用方自己再渲染一次
 */
function statefulDispatcher(): { current: unknown; states: unknown[] } {
  const states: unknown[] = []
  let cursor = 0
  const dispatcher = {
    useState: (initial: unknown) => {
      const index = cursor
      cursor += 1
      if (!(index in states)) {
        states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      return [
        states[index],
        (value: unknown) => {
          states[index] = value
        },
      ]
    },
    useCallback: (fn: unknown) => fn,
    useEffect: () => {},
    useRef: (initial: unknown) => ({ current: initial }),
    useMemo: (fn: () => unknown) => fn(),
  }
  return {
    get current() {
      cursor = 0
      return dispatcher
    },
    states,
  }
}

/** 一次渲染收集到的东西 */
interface Rendered {
  /** 宿主元素的 props，按出现顺序 */
  host: Record<string, unknown>[]
  /** 形如 Modal 的元素（有 title 与 footer），stub 把它渲染成 null 之后就拿不到了 */
  modals: Record<string, unknown>[]
  /** 传给占用者的 owner 会话，占用者被真正调用后才有值 */
  owner: DirectoryFlowOwner | undefined
}

/**
 * 渲染一棵树
 *
 * 函数组件被直接调用（走 dispatcher），Modal 形状的元素在调用前先收下来
 * 因为测试替身把它渲染成 null，调用之后就再也读不到 title / footer
 */
function renderTree(node: unknown, dispatcher: unknown, out: Rendered): void {
  const prev = internals.ReactCurrentDispatcher.current
  internals.ReactCurrentDispatcher.current = dispatcher
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') return
    if (Array.isArray(n)) {
      for (const child of n) walk(child)
      return
    }
    if (!React.isValidElement(n)) return
    const el = n as React.ReactElement & { type: unknown; props: Record<string, unknown> }
    if (typeof el.type === 'function') {
      // Modal 形状：有标题也有页脚，且没有 children 数组式的菜单条目
      if (el.props['title'] !== undefined && el.props['footer'] !== undefined) {
        out.modals.push(el.props)
      }
      walk((el.type as (p: unknown) => unknown)(el.props))
      return
    }
    out.host.push(el.props)
    walk(el.props['children'])
  }
  try {
    walk(node)
  } finally {
    internals.ReactCurrentDispatcher.current = prev
  }
}

/** 造一份服务面替身，并记录采纳流程的调用 */
function face(overrides: Partial<AddWorkspaceActions> = {}): {
  actions: AddWorkspaceActions
  created: string[]
  started: string[]
} {
  const created: string[] = []
  const started: string[] = []
  return {
    created,
    started,
    actions: {
      createWorkspace: async (path: string) => {
        created.push(path)
        return { workspaceId: `w-${path}` }
      },
      startSession: (workspaceId: string) => started.push(workspaceId),
      occupant: () => ({
        component: ((props: DirectoryFlowOwner) => {
          capturedOwner = props
          return null
        }) as never,
        inject: () => ({}),
      }),
      labels: officialAddLabels(workspaceTranslate()),
      ...overrides,
    },
  }
}

/** 最近一次渲染时占用者收到的 owner 会话 */
let capturedOwner: DirectoryFlowOwner | undefined

/** 最近一次渲染时占用者收到的完整 props（含 inject 面） */
let seenProps: Record<string, unknown> | undefined

/** 渲染 AddWorkspaceControl 并把「最近一次」占用者收到的 owner 交出来 */
function renderControl(
  actions: AddWorkspaceActions,
  narrow = false,
): { out: Rendered; dispatcher: { current: unknown; states: unknown[] } } {
  const dispatcher = statefulDispatcher()
  const out: Rendered = { host: [], modals: [], owner: undefined }
  capturedOwner = undefined
  renderTree(
    React.createElement(AddWorkspaceControl, {
      actions,
      narrow,
      t: regionTranslate(),
    }),
    dispatcher.current,
    out,
  )
  out.owner = capturedOwner
  return { out, dispatcher }
}

/** 用同一个 dispatcher 再渲染一次，读失败路径写进状态后的界面 */
function rerender(actions: AddWorkspaceActions, dispatcher: { current: unknown }): Rendered {
  const out: Rendered = { host: [], modals: [], owner: undefined }
  capturedOwner = undefined
  renderTree(
    React.createElement(AddWorkspaceControl, { actions, narrow: false, t: regionTranslate() }),
    dispatcher.current,
    out,
  )
  out.owner = capturedOwner
  return out
}

describe('resolveOccupant', () => {
  it('returns the entry component and defers its inject face to call time', () => {
    const occupant = resolveOccupant([{ component: () => null, inject: () => ({ pick: 'native' }) }])

    expect(occupant?.component).toBeTypeOf('function')
    // inject 面按调用取值：占用者可能在两次渲染之间换过自己的服务读数
    expect(occupant?.inject()).toEqual({ pick: 'native' })
  })

  it('tolerates an occupant that brings no inject face of its own', () => {
    expect(resolveOccupant([{ component: () => null }])?.inject()).toEqual({})
  })

  it('caches one inject face per occupant registration', () => {
    const inject = (): Record<string, unknown> => ({ pick: 'native' })
    const occupant = resolveOccupant([{ component: () => null, inject }])

    // 渲染器对插槽注册项也是整生命周期缓存一次：每次渲染新建一份会让占用者
    // 平白重挂订阅，因此同一个 inject 函数只该被调用一次
    expect(occupant?.inject()).toBe(occupant?.inject())
  })

  it('reports no occupant for an empty hole', () => {
    expect(resolveOccupant([])).toBeUndefined()
  })

  it('ignores a malformed entry rather than rendering a non-component', () => {
    expect(resolveOccupant([{ component: 'not-a-component' }])).toBeUndefined()
  })
})

describe('directoryFlowOccupant', () => {
  /** 造一个只回答 entriesOfSlot 的注册表替身 */
  const slotsWith = (entries: unknown[]) =>
    ({
      entriesOfSlot: (key: string) => (key === DIRECTORY_FLOW_SLOT ? entries : []),
    }) as never

  it('reads the hole the official browser declares', () => {
    const occupant = directoryFlowOccupant(
      slotsWith([{ component: () => null, inject: () => ({ pick: 'os' }) }]),
    )

    expect(occupant?.inject()).toEqual({ pick: 'os' })
  })

  it('reports nothing while the directory picker plugin is absent', () => {
    expect(directoryFlowOccupant(slotsWith([]))).toBeUndefined()
  })
})

describe('AddWorkspaceControl', () => {
  it('labels the entry with the official header key and no native tooltip', () => {
    const { actions } = face()
    const { out } = renderControl(actions)

    const button = out.host.find((props) => props['aria-label'] === '添加工作区')
    expect(button).toBeDefined()
    // 本包所有入口只留无障碍标签，不挂原生 title
    expect(button?.['title']).toBeUndefined()
  })

  it('passes the occupant its own inject face as props', () => {
    const { actions } = face({
      occupant: () => ({
        component: ((props: Record<string, unknown>) => {
          seenProps = props
          return null
        }) as never,
        inject: () => ({ pick: 'os-chooser' }),
      }),
    })
    renderControl(actions)

    // 占用者的服务面随 props 传播：native 那份靠 pick，browse 那份靠
    // listDirectory / createDirectory。缺了这层它就拿不到任何服务
    expect(seenProps?.['pick']).toBe('os-chooser')
    // owner 会话与 inject 面同时到位
    expect(seenProps?.['open']).toBe(false)
    expect(typeof seenProps?.['onPicked']).toBe('function')
  })

  it('lets the owner conversation win over a colliding inject face key', () => {
    const { actions } = face({
      occupant: () => ({
        component: ((props: Record<string, unknown>) => {
          seenProps = props
          return null
        }) as never,
        // 与 owner 契约同名的键：属于 owner 的那份必须压过 inject 面
        inject: () => ({ open: 'from-inject', onPicked: 'from-inject' }),
      }),
    })
    renderControl(actions)

    expect(seenProps?.['open']).toBe(false)
    expect(seenProps?.['onPicked']).not.toBe('from-inject')
  })

  it('hands the occupant the owner conversation it must answer', () => {
    const { actions } = face()
    const { out } = renderControl(actions)

    // 一次请求与一个结果的契约：open/busy 是 owner 给的，三个回调由占用者调
    expect(out.owner).toBeDefined()
    expect(out.owner?.open).toBe(false)
    expect(out.owner?.busy).toBe(false)
    expect(typeof out.owner?.onPicked).toBe('function')
    expect(typeof out.owner?.onCancel).toBe('function')
    expect(typeof out.owner?.onError).toBe('function')
  })

  it('renders no interaction when the hole has no occupant', () => {
    const { actions } = face({ occupant: () => undefined })
    const { out } = renderControl(actions)

    // 入口按钮仍在，但交互不渲染，区域订阅了占用情况，下一帧会连入口一起收掉
    expect(out.host.some((props) => props['aria-label'] === '添加工作区')).toBe(true)
    expect(out.owner).toBeUndefined()
  })

  it('adopts the picked path and starts a session in the new workspace', async () => {
    const { actions, created, started } = face()
    const { out } = renderControl(actions)

    out.owner?.onPicked('/tmp/picked')
    await Promise.resolve()
    await Promise.resolve()

    // 与官方 onPick 一致：先 createWorkspace 采纳，再在新工作区开会话
    expect(created).toEqual(['/tmp/picked'])
    expect(started).toEqual(['w-/tmp/picked'])
  })

  it('reports the adopted workspace back to the region before starting a session', async () => {
    // 区域据此判断新工作区该不该嵌进父所在的分组，这条回调不接上时那一步会静默地永不发生
    const adopted: [string, string][] = []
    const order: string[] = []
    const { actions } = face({
      onAdopted: (workspaceId, path) => {
        order.push('adopted')
        adopted.push([workspaceId, path])
      },
      startSession: () => order.push('session'),
    })
    const { out } = renderControl(actions)

    out.owner?.onPicked('/tmp/picked')
    await Promise.resolve()
    await Promise.resolve()

    expect(adopted).toEqual([['w-/tmp/picked', '/tmp/picked']])
    // 先回传事实再开会话，对话框与新建会话的导航抢焦点时，先到的那一个才读得到用户意图
    expect(order).toEqual(['adopted', 'session'])
  })

  it('surfaces an adoption failure through the official folder-error dialog', async () => {
    const { actions } = face({
      createWorkspace: async () => {
        throw new Error('该目录不能作为工作区')
      },
    })
    const { dispatcher } = renderControl(actions)
    capturedOwner?.onPicked('/tmp/dupe')
    await Promise.resolve()
    await Promise.resolve()

    const after = rerender(actions, dispatcher)
    const dialog = after.modals.find((props) => props['title'] === '无法打开文件夹')
    expect(dialog).toBeDefined()
    // 对话框里是 wire 错误原文（按策略不翻译）+ 官方的「重新选择」
    expect(JSON.stringify(dialog?.['children'])).toContain('该目录不能作为工作区')
    expect(JSON.stringify(dialog?.['footer'])).toContain('重新选择')
  })

  it('reports a picker failure through the owner error channel', async () => {
    const { actions, created } = face()
    const { dispatcher } = renderControl(actions)

    capturedOwner?.onError('选择器不可用')
    await Promise.resolve()

    const after = rerender(actions, dispatcher)
    const dialog = after.modals.find((props) => props['title'] === '无法打开文件夹')
    expect(JSON.stringify(dialog?.['children'])).toContain('选择器不可用')
    // 交互本身失败不会去采纳任何路径
    expect(created).toEqual([])
  })

  it('closes the flow when the operator cancels', async () => {
    const { actions, created } = face()
    const { dispatcher } = renderControl(actions)

    capturedOwner?.onCancel()
    await Promise.resolve()

    const after = rerender(actions, dispatcher)
    // 取消只是收起请求，不采纳、不弹错（错误框常驻挂载，由 open 控制显隐）
    expect(created).toEqual([])
    expect(after.modals.every((props) => props['open'] === false)).toBe(true)
    expect(after.owner?.open).toBe(false)
  })
})
