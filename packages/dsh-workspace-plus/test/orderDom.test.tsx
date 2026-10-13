// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { storeViewModeProps, viewModeStoreStub } from './viewMode-stub.ts'

/**
 * 分组排序拖拽的真实 DOM
 *
 * 落点算错、标记画错、把一次相邻空操作也写盘，界面上都不会报错
 * 只表现为「拖过去没反应」或「松手后顺序跳了一下」
 * 因此逐条断言的是交给宿主的排序方法收到了什么实参、落点标记画在哪个元素上
 *
 * jsdom 不实现 `DataTransfer`（用例里用最小替身），也不做布局（`getBoundingClientRect()` 恒为全零）
 * 因此命中事件目标向上找标记元素，前后半则由用例显式替身参照行的矩形带，否则全零矩形下的上下半不可控
 */

/** 一个工作区里的会话分组 */
const SESSION_GROUPS = ['group-a', 'group-b', 'group-c']

/** 根节点上的工作区分组，最后一个空着：空分组照样可以排序 */
const WORKSPACE_GROUPS = ['wg-1', 'wg-2', 'wg-3']

/** 分组「group-a」里的会话，用来验证拖会话落到分组头上仍读作归组 */
const SESSION_IDS = ['session-1']

/** 给事件挂一份最小的 dataTransfer，手势层只对它写载荷前缀 */
function transferable(event: Event): Event {
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

/**
 * 派发一个原生拖放事件
 *
 * 目标元素就是命中的起点：命中层从它向上找带标记的区域
 * @param y - 指针纵坐标，前后半由它决定
 */
function fire(target: Element, type: string, y = 0): void {
  act(() => {
    const event = transferable(new Event(type, { bubbles: true }))
    Object.defineProperty(event, 'clientX', { value: 0 })
    Object.defineProperty(event, 'clientY', { value: y })
    target.dispatchEvent(event)
  })
}

/**
 * 给一个元素替身一条矩形带
 *
 * 全零矩形下 `nearestRow` 的距离恒为 0、`halfOf` 恒判上半，前后半因此不可控
 * 让带落在指针上方（`top` 为负）即读作下半，落在下方（`top` 为正）即读作上半
 * @param element - 要替身的参照行
 * @param above - 真表示这条带在指针上方，于是落点读作下半
 */
function band(element: HTMLElement, above: boolean): void {
  element.getBoundingClientRect = (): DOMRect =>
    ({
      top: above ? -20 : 20,
      bottom: above ? -10 : 30,
      height: 10,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: above ? -20 : 20,
      toJSON: () => ({}),
    }) as DOMRect
}

/** 等一次提交落地：排序方法回的是一个 Promise */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** 区域 props，记录收到的两种排序调用与会话归组调用 */
function props(orders: string[][], moves: string[][]): WorkspaceGroupsProps {
  const created = new Date(2026, 0, 1).toISOString()
  const workspaceState = {
    items: [
      {
        workspaceId: 'ws-1',
        path: '/tmp/ws-1',
        title: 'ws-1',
        sessionIds: SESSION_IDS,
        createdAt: created,
        updatedAt: created,
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: [],
    phase: 'ready',
  }
  const sessionState = {
    ids: SESSION_IDS,
    byId: Object.fromEntries(
      SESSION_IDS.map((id) => [
        id,
        { id, displayTitle: `会话 ${id}`, running: false, blank: false, retainedBy: {}, updatedAt: 1 },
      ]),
    ),
    phase: 'ready',
  }
  const stored = snapshot({
    byWorkspace: {
      'ws-1': SESSION_GROUPS.map((id) => ({
        id,
        name: `分组 ${id}`,
        sessionIds: id === 'group-a' ? SESSION_IDS : [],
      })),
    },
    workspaceGroups: WORKSPACE_GROUPS.map((id) => ({
      id,
      name: `工作区分组 ${id}`,
      workspaceIds: id === 'wg-1' ? ['ws-1'] : [],
    })),
  })
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
    loadGroups: async () => stored,
    onReady: () => () => {},
    createGroup: async () => stored,
    renameGroup: async () => stored,
    deleteGroup: async () => stored,
    moveSession: async (workspaceId: string, sessionId: string, groupId: string) => {
      moves.push([workspaceId, sessionId, groupId])
      return stored
    },
    moveGroupBefore: async (
      workspaceId: string,
      groupId: string,
      beforeGroupId: string | undefined,
    ) => {
      // 缺席的锚点在数组里补成空串：`toEqual` 比不出数组元素的「缺席」
      orders.push(['group', workspaceId, groupId, beforeGroupId ?? ''])
      return stored
    },
    moveVirtualWorkspaceBefore: async (groupId: string, beforeGroupId: string | undefined) => {
      orders.push(['virtual', groupId, beforeGroupId ?? ''])
      return stored
    },
    createVirtualWorkspace: async () => stored,
    renameVirtualWorkspace: async () => stored,
    deleteVirtualWorkspace: async () => stored,
    moveWorkspace: async () => stored,
    nestWorkspaces: async () => stored,
    unnestWorkspaces: async () => stored,
    setNested: async () => stored,
    forgetWorkspace: async () => stored,
    focusEntry: async () => stored,
    togglePinned: async () => stored,
    setSessionPinned: async () => {},
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
  }
}

/** 挂载区域并交出容器与收到的两类调用 */
async function mount(): Promise<{
  container: HTMLElement
  root: ReturnType<typeof createRoot>
  orders: string[][]
  moves: string[][]
}> {
  const orders: string[][] = []
  const moves: string[][] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(orders, moves)))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root, orders, moves }
}

/**
 * 一个带区域键的元素
 * @param container - 挂载容器
 * @param key - 区域键
 */
function zone(container: HTMLElement, key: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wg-dnd="${key}"]`)
  if (found === null) throw new Error(`no drop zone for "${key}"`)
  return found
}

/**
 * 一个可作参照行的元素
 * @param container - 挂载容器
 * @param id - 成员 id
 */
function row(container: HTMLElement, id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wg-dnd-row="${id}"]`)
  if (found === null) throw new Error(`no draggable row for "${id}"`)
  return found
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('dragging a session group head', () => {
  it('marks the anchor head it was dropped on', async () => {
    const { container, root } = await mount()
    const target = zone(container, 'groupHead/ws-1/group-c')
    band(target, false)

    fire(row(container, 'group-a'), 'dragstart')
    fire(target, 'dragover', 0)

    // 落点标记画在分组头上：头自己既是区域也是参照行，因此只按它自己的上下半算
    expect(target.getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })

  it('commits the anchor of the group it was dropped above', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'groupHead/ws-1/group-c')
    band(target, false)

    fire(row(container, 'group-a'), 'dragstart')
    fire(target, 'dragover', 0)
    fire(target, 'drop', 0)
    await flush()

    // 拖「group-a」到「group-c」之上，换算出的新顺序里它后面接着「group-c」
    expect(orders).toEqual([['group', 'ws-1', 'group-a', 'group-c']])
    await act(async () => root.unmount())
  })

  it('commits no anchor when it lands at the end of the stretch', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'groupHead/ws-1/group-c')
    band(target, true)

    fire(row(container, 'group-a'), 'dragstart')
    fire(target, 'dragover', 0)
    fire(target, 'drop', 0)
    await flush()

    // 落在末位的下半：新顺序里它身后没有成员，宿主把缺参数读作「挪到末尾」
    expect(orders).toEqual([['group', 'ws-1', 'group-a', '']])
    await act(async () => root.unmount())
  })

  it('reads a drop on the head of the group just below as no move', async () => {
    const { container, root, orders } = await mount()
    // 「group-a」的下一位就是「group-b」，落在它的上半算出来仍是原位
    const target = zone(container, 'groupHead/ws-1/group-b')
    band(target, false)

    fire(row(container, 'group-a'), 'dragstart')
    fire(target, 'dragover', 0)
    fire(target, 'drop', 0)
    await flush()

    // 相邻位是空操作，宿主方法不该被调用，盘上因此不留改动
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })

  it('leaves the dragged head itself out of the plan', async () => {
    const { container, root, orders } = await mount()
    const own = zone(container, 'groupHead/ws-1/group-a')

    fire(row(container, 'group-a'), 'dragstart')
    fire(own, 'dragover', 0)
    fire(own, 'drop', 0)
    await flush()

    // 原地投放是构造期缺席：这一格不在计划里，连标记都不该画
    expect(own.getAttribute('data-wg-drop')).toBeNull()
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })

  it('fades the head while it is being dragged', async () => {
    const { container, root } = await mount()
    const dragged = row(container, 'group-a')

    fire(dragged, 'dragstart')
    expect(dragged.getAttribute('data-wg-dragging')).toBe('')

    fire(dragged, 'dragend')
    expect(dragged.getAttribute('data-wg-dragging')).toBeNull()
    await act(async () => root.unmount())
  })

  it('keeps the session-group container out of the ordering plan', async () => {
    // 会话分组容器那一格罩住整块分组，它不在分组排序计划里，命中到此为止
    const { container, root, orders } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-b')

    fire(row(container, 'group-a'), 'dragstart')
    fire(target, 'dragover', 0)

    expect(target.getAttribute('data-wg-drop')).toBeNull()
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })

  it('still reads a session dropped on a group head as grouping', async () => {
    // 排序给分组头新挂了一格区域键，拖会话落到头上仍要读作「放进这个分组」
    const { container, root, orders, moves } = await mount()
    const head = zone(container, 'groupHead/ws-1/group-b')

    fire(row(container, 'session-1'), 'dragstart')
    fire(head, 'dragover', 0)
    fire(head, 'drop', 0)
    await flush()

    expect(moves).toEqual([['ws-1', 'session-1', 'group-b']])
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('dragging a workspace group head', () => {
  it('marks the anchor head it was dropped on', async () => {
    const { container, root } = await mount()
    const target = zone(container, 'virtualWorkspaceHead/wg-3')
    band(target, false)

    fire(row(container, 'wg-1'), 'dragstart')
    fire(target, 'dragover', 0)

    expect(target.getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })

  it('commits the anchor of the workspace group it was dropped above', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'virtualWorkspaceHead/wg-3')
    band(target, false)

    fire(row(container, 'wg-1'), 'dragstart')
    fire(target, 'dragover', 0)
    fire(target, 'drop', 0)
    await flush()

    expect(orders).toEqual([['virtual', 'wg-1', 'wg-3']])
    await act(async () => root.unmount())
  })

  it('commits no anchor when it lands after the last workspace group', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'virtualWorkspaceHead/wg-3')
    band(target, true)

    fire(row(container, 'wg-2'), 'dragstart')
    fire(target, 'dragover', 0)
    fire(target, 'drop', 0)
    await flush()

    // 「wg-2」挪到末位：新顺序里它身后没有成员，锚点因此缺席
    expect(orders).toEqual([['virtual', 'wg-2', '']])
    await act(async () => root.unmount())
  })

  it('reads a drop on the head of the group just below as no move', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'virtualWorkspaceHead/wg-2')
    band(target, false)

    fire(row(container, 'wg-1'), 'dragstart')
    fire(target, 'dragover', 0)
    fire(target, 'drop', 0)
    await flush()

    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })

  it('leaves the dragged workspace group out of its own plan', async () => {
    const { container, root, orders } = await mount()
    const own = zone(container, 'virtualWorkspaceHead/wg-1')

    fire(row(container, 'wg-1'), 'dragstart')
    fire(own, 'dragover', 0)
    fire(own, 'drop', 0)
    await flush()

    expect(own.getAttribute('data-wg-drop')).toBeNull()
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })

  it('keeps a workspace row out of the workspace group ordering plan', async () => {
    // 工作区行不是工作区分组成员，拖分组头落到它上面不该有落点
    const { container, root, orders } = await mount()
    const workspaceRow = container.querySelector<HTMLElement>('.workspace')

    expect(workspaceRow).not.toBeNull()
    fire(row(container, 'wg-1'), 'dragstart')
    fire(workspaceRow as HTMLElement, 'dragover', 0)

    expect((workspaceRow as HTMLElement).getAttribute('data-wg-drop')).toBeNull()
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })
})
