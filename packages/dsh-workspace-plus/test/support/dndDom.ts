/**
 * DOM 测试的共用夹具
 *
 * 五个拖拽方向的 DOM 测试各自起过一套：造事件、造矩形带、挂载区域、按区域键取元素。
 * 这些与用例要验证的东西无关，却会在协议一改时各自失修，因此收在一处
 *
 * 这里的每一件都只做「把 jsdom 缺的那点东西补上」：它不实现原生拖放，
 * 也不猜测组件的行为——事件上挂什么、元素量出多少，都由用例说了算
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as React from 'react'
import { WorkspaceGroupsRegion } from '../../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../../src/client/views/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from '../locale-stub.ts'
import { snapshot } from '../snapshot-stub.ts'
import { storeViewModeProps, viewModeStoreStub } from '../viewMode-stub.ts'

/**
 * 一条会话摘要
 *
 * 字段与宿主交回的会话摘要同形，只保留渲染与排序会用到的那些
 * @param id - 会话 id
 * @param updatedAt - 更新时间，缺省 1000
 * @param extra - 要覆盖的字段
 */
export function summary(
  id: string,
  updatedAt = 1_000,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    displayTitle: `会话 ${id}`,
    running: false,
    blank: false,
    retainedBy: {},
    updatedAt,
    ...extra,
  }
}

/**
 * 拖拽事件上那份 `dataTransfer` 替身
 *
 * jsdom 不实现原生拖放，事件上根本没有这一格；组件读它来认拖拽载荷，因此必须补上
 * @param event - 要补的事件
 */
export function transferable(event: Event): Event {
  const store = new Map<string, string>()
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      effectAllowed: '',
      dropEffect: '',
      setData: (format: string, value: string) => store.set(format, value),
      getData: (format: string) => store.get(format) ?? '',
    },
  })
  return event
}

/** 整场拖拽共用的一份 `dataTransfer`：它的 `dropEffect` 由组件写、用例可读 */
export function sharedTransfer(): {
  effectAllowed: string
  dropEffect: string
  setData: (format: string, value: string) => void
  getData: (format: string) => string
} {
  const store = new Map<string, string>()
  return {
    effectAllowed: 'move',
    dropEffect: 'none',
    setData: (format, value) => store.set(format, value),
    getData: (format) => store.get(format) ?? '',
  }
}

/** 把一份现成的 `dataTransfer` 挂到事件上，供整场拖拽共用 */
export function withTransfer(
  event: Event,
  transfer: { effectAllowed: string; dropEffect: string },
): Event {
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  return event
}

/**
 * 派发一个拖拽事件
 *
 * 指针位置有两个来源：竖直方向用数字给（大多数用例只看上下半），
 * 自动滚动那一类需要完整坐标时给 `{ x, y }`
 *
 * 整场拖拽共用一份 `dataTransfer` 时传第三格：那时组件写下的 `dropEffect` 要能被用例读到
 * @param target - 事件目标
 * @param type - 事件类型
 * @param at - 指针位置，数字表示只给纵坐标
 * @param shared - 整场拖拽共用的载荷，缺省每派发一次新建一份
 */
export function fire(
  target: Element,
  type: string,
  at: number | { x: number; y: number } = 0,
  shared?: { effectAllowed: string; dropEffect: string },
): void {
  const point = typeof at === 'number' ? { x: 0, y: at } : at
  act(() => {
    const raw = new Event(type, { bubbles: true })
    const event = shared === undefined ? transferable(raw) : withTransfer(raw, shared)
    Object.defineProperties(event, {
      clientX: { value: point.x },
      clientY: { value: point.y },
    })
    target.dispatchEvent(event)
  })
}

/** 等一次提交落地：写入方法回的都是 Promise */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/**
 * 给一个元素替身一条矩形带
 *
 * 全零矩形下「离哪一行最近」「落在带的上半还是下半」两个判定都不可控：
 * 距离恒为 0、上下半恒判上半。因此让带落在指针上方（`top` 为负）即读作下半，
 * 落在下方即为上半
 * @param element - 要替身的参照行或区域
 * @param top - 带的上缘
 * @param height - 带的高度
 */
export function band(element: HTMLElement, top: number, height = 10): void {
  element.getBoundingClientRect = (): DOMRect =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect
}

/**
 * 一份注入面完整的区域 props
 *
 * 区域组件有四十来格动作与数据 hook，绝大多数用例只关心其中一两格。
 * 这里给出全部合法的空实现，用例只覆盖自己那几格
 * @param overrides - 要覆盖的格
 */
export function regionProps(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  // 两个快照都建在工厂里、每次渲染返回同一份引用：选择器每次交出新的对象会让下游的
  // memo 与 effect 依赖每渲染都换引用，于是「派生 → 写入 → 重渲染」一路自激
  const workspaceState = { items: [], archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready' }
  const sessionState = { ids: [], byId: {}, phase: 'ready' }
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) => select(workspaceState)) as never,
    useSessions: ((select: (s: unknown) => unknown) => select(sessionState)) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => undefined,
    loadGroups: async () => snapshot(),
    onReady: () => () => {},
    createGroup: async () => snapshot(),
    renameGroup: async () => snapshot(),
    deleteGroup: async () => snapshot(),
    moveSession: async () => snapshot(),
    setSegmentOrder: async () => snapshot(),
    moveGroupBefore: async () => snapshot(),
    moveVirtualWorkspaceBefore: async () => snapshot(),
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
    setSessionPinned: async () => {},
    insertWorkspaceBefore: async () => {},
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    searchResultLimit: 20,
    t: regionTranslate(),
    tWorkspace: workspaceTranslate(),
    tSidebar: sidebarTranslate(),
    ...storeViewModeProps(viewModeStoreStub()),
    official: () => ({
      renameSession: async () => {},
      forkSession: () => {},
      archiveSession: async () => {},
      labels: officialSessionLabels(workspaceTranslate()),
      relativeTime: (updatedAt: number, now: number) =>
        timeLabel(updatedAt, now, workspaceTranslate()),
    }),
    addWorkspace: () => ({
      createWorkspace: async (path: string) => ({ workspaceId: `ws-${path}`, title: path }),
      startSession: () => {},
      occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
      labels: officialAddLabels(workspaceTranslate()),
    }),
    ...overrides,
  }
}

/**
 * 挂载区域并等第一轮派生落地
 * @param props - 区域 props
 */
export async function mountRegion(props: WorkspaceGroupsProps): Promise<{
  container: HTMLElement
  root: ReturnType<typeof createRoot>
}> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props))
  })
  await flush()
  return { container, root }
}

/**
 * 一个区域元素，按区域键取
 * @param container - 挂载容器
 * @param key - 区域键
 */
export function zone(container: HTMLElement, key: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wg-dnd="${key}"]`)
  if (found === null) throw new Error(`no drop zone for "${key}"`)
  return found
}

/**
 * 一行元素，按参照行 id 取
 * @param container - 挂载容器
 * @param id - 参照行 id
 */
export function row(container: HTMLElement, id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wg-dnd-row="${id}"]`)
  if (found === null) throw new Error(`no draggable row for "${id}"`)
  return found
}
