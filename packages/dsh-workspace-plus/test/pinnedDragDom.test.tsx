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
 * 置顶区排序拖拽的真实 DOM
 *
 * 顺序位写错、写漏、或置顶区与分组内就地置顶段各读一套顺序时，界面上都不会报错
 * 只表现为「拖过去松手又弹回官方顺序」或「置顶区换了先后、分组里那一段没跟着换」
 * 因此逐条断言的是交给宿主的顺序位写入，以及两个表面上真实渲染出来的先后
 *
 * jsdom 不实现 `DataTransfer`（用例里用最小替身），也不做布局（`getBoundingClientRect()` 恒为全零）
 * 因此命中走事件目标向上找标记元素，前后半由用例显式替身参照行的矩形带
 */

/** 置顶集合，两条以便段内换位能真的换出位次 */
const PINNED_IDS = ['session-1', 'session-2']

/** 被放进会话分组的会话，就地置顶段的名次要从这一段的渲染序上读 */
const GROUP_IDS = ['session-1', 'session-2', 'session-3']

/** 全新置顶的一条，用来验证顺序位之外的成员接在后面 */
const LATE_ID = 'session-4'

const ALL_IDS = [...GROUP_IDS, LATE_ID]

/** 造一份会话摘要 */
function summary(id: string): Record<string, unknown> {
  return {
    id,
    displayTitle: `会话 ${id}`,
    running: false,
    blank: false,
    retainedBy: {},
    // 时间序与官方集合顺序刻意相反，两个顺序因此可区分
    updatedAt: 10_000 - ALL_IDS.indexOf(id) * 1_000,
  }
}

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
 * 派发一个拖拽事件
 * @param target - 事件目标
 * @param type - 事件类型
 * @param y - 指针纵坐标，段内换位要按它算参照行的前后半
 */
function fire(target: Element, type: string, y = 0): void {
  act(() => {
    const event = transferable(new Event(type, { bubbles: true }))
    Object.defineProperties(event, {
      clientX: { value: 0 },
      clientY: { value: y },
    })
    target.dispatchEvent(event)
  })
}

/**
 * 给一个元素一条假的矩形带
 *
 * jsdom 不做布局，`getBoundingClientRect()` 恒为零矩形，无坐标的事件因此永远算出「离第一行最近」
 * 段内换位要靠参照行的前后半定前后，用例得先把行摆到不同的高度上，命中才有确定读数
 * @param element - 要摆位置的行
 * @param top - 这一行的上沿纵坐标
 * @param height - 这一行的高度，缺省 10
 */
function band(element: HTMLElement, top: number, height = 10): void {
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

/** 等一次提交落地：顺序位写入回的是一个 Promise */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** 工作区快照，模块级建好、每次返回同一份引用 */
function workspaceState(pinned: readonly string[]): Record<string, unknown> {
  return {
    items: [
      {
        workspaceId: 'ws-1',
        path: '/tmp/ws-1',
        title: 'ws-1',
        sessionIds: ALL_IDS,
        createdAt: new Date(2026, 0, 1).toISOString(),
        updatedAt: new Date(2026, 0, 1).toISOString(),
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: pinned,
    phase: 'ready',
  }
}

/** 会话快照，同上 */
function sessionState(): Record<string, unknown> {
  const byId: Record<string, unknown> = {}
  for (const id of ALL_IDS) byId[id] = summary(id)
  return { ids: ALL_IDS, byId, phase: 'ready' }
}

/**
 * 区域 props
 * @param slots - 收到的手动顺序写入，逐条记下段键与整份顺序
 * @param options - 置顶集合与置顶段的顺序位，缺省表示官方集合只有两条、没有手动顺序
 */
function props(
  slots: [string, readonly string[]][],
  options: { pinned?: readonly string[]; orderSlots?: Record<string, string[]> } = {},
): WorkspaceGroupsProps {
  const state = workspaceState(options.pinned ?? PINNED_IDS)
  const sessions = sessionState()
  const stored = snapshot({
    byWorkspace: {
      'ws-1': [{ id: 'group-a', name: '分组甲', sessionIds: GROUP_IDS }],
    },
    orderSlots: options.orderSlots ?? {},
  })
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) => select(state)) as never,
    useSessions: ((select: (s: unknown) => unknown) => select(sessions)) as never,
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
    moveSession: async () => stored,
    setSegmentOrder: async (key: string, order: readonly string[]) => {
      slots.push([key, order])
      return stored
    },
    moveGroupBefore: async () => stored,
    moveVirtualWorkspaceBefore: async () => stored,
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
    // 就地置顶那一档才把名次交给分组内的比较器
    ...storeViewModeProps(inlineScope()),
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

/** 一份「就地置顶」档的 store 句柄 */
function inlineScope() {
  const store = viewModeStoreStub()
  store.setPinned({ scope: 'inline' })
  return store
}

/** 挂载区域并交出容器、收到的顺序位写入与重渲染入口 */
async function mount(
  options: { pinned?: readonly string[]; orderSlots?: Record<string, string[]> } = {},
): Promise<{
  container: HTMLElement
  root: ReturnType<typeof createRoot>
  slots: [string, readonly string[]][]
  /** 带着新的顺序位重渲染，模拟宿主回了整份快照 */
  rerender: (orderSlots: Record<string, string[]>) => Promise<void>
}> {
  const slots: [string, readonly string[]][] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const draw = async (
    next: { pinned?: readonly string[]; orderSlots?: Record<string, string[]> },
  ): Promise<void> => {
    await act(async () => {
      root.render(React.createElement(WorkspaceGroupsRegion, props(slots, next)))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }
  await draw(options)
  return {
    container,
    root,
    slots,
    rerender: (orderSlots) => draw({ ...options, orderSlots }),
  }
}

/**
 * 置顶区里的一个可作参照行的元素
 *
 * 同一个会话在置顶区与工作区列表里各渲染一行，两行都带参照行标记
 * 因此这里限定在 `.pinScroll` 之内，取到的才是置顶段那一行
 * @param container - 挂载容器
 * @param id - 会话 id
 */
function pinnedRow(container: HTMLElement, id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`.pinScroll [data-wg-dnd-row="${id}"]`)
  if (found === null) throw new Error(`no pinned row for "${id}"`)
  return found
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

/** 置顶区里的会话行，按真实渲染的先后 */
function pinnedRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.pinScroll > .row'))
}

/** 一行里渲染出来的会话标题 */
function titleOf(row: HTMLElement): string {
  return row.querySelector('.rowTitle')?.textContent ?? ''
}

/** 置顶区里的会话标题，按真实渲染的先后 */
function pinnedTitles(container: HTMLElement): string[] {
  return pinnedRows(container).map(titleOf)
}

/** 分组内那一段的会话标题，按真实渲染的先后 */
function groupTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.groupBody .row')).map(titleOf)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('dragging a pinned row', () => {
  it('writes the pinned slot with the whole converted order', async () => {
    // 顺序位写整份而不是只交一个锚点：官方集合没有算上顺序位
    // 只交锚点会让接管的那一次与用户当时看见的顺序不一致
    const { container, root, slots } = await mount()
    // 官方集合顺序是 session-1、session-2，两条摆在不同的高度上
    band(pinnedRow(container, 'session-1'), 0)
    band(pinnedRow(container, 'session-2'), 20)

    fire(pinnedRow(container, 'session-2'), 'dragstart')
    // 指针落在 session-1 的上半，读作插到它之前
    fire(pinnedRow(container, 'session-1'), 'dragover', 2)
    fire(pinnedRow(container, 'session-1'), 'drop', 2)
    await flush()

    expect(slots).toEqual([['pinned', ['session-2', 'session-1']]])
    await act(async () => root.unmount())
  })

  it('marks the anchor row it was dropped on', async () => {
    // 落点标记画在参照行自己身上：线要贴着那一行，画在段容器上会跑到整段的上边或下边
    const { container, root } = await mount()
    band(pinnedRow(container, 'session-1'), 0)
    band(pinnedRow(container, 'session-2'), 20)
    const anchor = pinnedRow(container, 'session-1')
    const stretch = zone(container, 'pinned')

    fire(pinnedRow(container, 'session-2'), 'dragstart')
    fire(anchor, 'dragover', 2)

    expect(anchor.getAttribute('data-wg-drop')).toBe('before')
    expect(stretch.getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
  })

  it('writes nothing when a row lands on its own row', async () => {
    // 来源自己那一行仍在计划里，拖到它头上由换算判出顺序没变，因此不写盘
    const { container, root, slots } = await mount()
    band(pinnedRow(container, 'session-1'), 0)

    fire(pinnedRow(container, 'session-1'), 'dragstart')
    fire(pinnedRow(container, 'session-1'), 'dragover', 2)
    fire(pinnedRow(container, 'session-1'), 'drop', 2)
    await flush()

    expect(slots).toEqual([])
    await act(async () => root.unmount())
  })

  it('writes nothing when a row lands on the neighbour it already sits next to', async () => {
    // 相邻位是「拖动发生了、顺序没变」：换算判出逐位相同，盘上因此不留改动
    const { container, root, slots } = await mount()
    band(pinnedRow(container, 'session-1'), 0)
    band(pinnedRow(container, 'session-2'), 20)

    // 官方集合里 session-2 已在 session-1 之后，把它拖到 session-1 之后即回到原位
    fire(pinnedRow(container, 'session-2'), 'dragstart')
    fire(pinnedRow(container, 'session-1'), 'dragover', 8)
    fire(pinnedRow(container, 'session-1'), 'drop', 8)
    await flush()

    expect(slots).toEqual([])
    await act(async () => root.unmount())
  })

  it('leaves the row unstyled as dragged until the drag ends', async () => {
    const { container, root } = await mount()
    const dragged = pinnedRow(container, 'session-1')

    fire(dragged, 'dragstart')
    expect(dragged.hasAttribute('data-wg-dragging')).toBe(true)

    fire(dragged, 'dragend')
    expect(dragged.hasAttribute('data-wg-dragging')).toBe(false)
    await act(async () => root.unmount())
  })

  it('marks every pinned row draggable and names its row id', async () => {
    // 可拖是这一段接排序的前提：少了 `draggable`，拖起事件根本不会派发
    const { container, root } = await mount()

    expect(pinnedRow(container, 'session-1').getAttribute('draggable')).toBe('true')
    expect(pinnedRow(container, 'session-2').getAttribute('draggable')).toBe('true')
    // 整段共用一格区域键，行自己带参照行标记
    expect(zone(container, 'pinned')).not.toBeNull()
    await act(async () => root.unmount())
  })
})

describe('the pinned order both surfaces read', () => {
  it('keeps the official set order while the pinned stretch has no slot', async () => {
    // 旧数据零变化：没有顺序位时置顶区与分组内就地置顶段的先后都与引入这一片之前逐项相同
    const { container, root } = await mount()

    expect(pinnedTitles(container)).toEqual(['会话 session-1', '会话 session-2'])
    // 分组内：置顶段按官方集合的位置在前，其后是未置顶的 session-3
    expect(groupTitles(container)).toEqual([
      '会话 session-1',
      '会话 session-2',
      '会话 session-3',
    ])
    await act(async () => root.unmount())
  })

  it('follows the slot in the pinned area and in the inline pinned stretch alike', async () => {
    // 一份顺序两个消费者：置顶区按它渲染，分组内就地置顶的名次从同一份取，两个表面因此永不打架
    const { container, root } = await mount({ orderSlots: { pinned: ['session-2', 'session-1'] } })

    expect(pinnedTitles(container)).toEqual(['会话 session-2', '会话 session-1'])
    // 名次跟着换：session-2 取得更小的名次，排在 session-1 之前
    expect(groupTitles(container)).toEqual([
      '会话 session-2',
      '会话 session-1',
      '会话 session-3',
    ])
    await act(async () => root.unmount())
  })

  it('appends a newly pinned member after the ones the slot names', async () => {
    // 新置顶的会话不在顺序位里，接在手动排过的那些之后，而不是插到它们中间
    // 也不落回官方集合的最前——那会让用户刚排好的顺序被打断
    const { container, root } = await mount({
      pinned: ['session-4', 'session-1', 'session-2'],
      orderSlots: { pinned: ['session-2', 'session-1'] },
    })

    expect(pinnedTitles(container)).toEqual([
      '会话 session-2',
      '会话 session-1',
      '会话 session-4',
    ])
    await act(async () => root.unmount())
  })

  it('drops a slot id that is no longer pinned', async () => {
    // 取消置顶会在顺序位里留下已经不作数的 id，它不该在界面上占位
    const { container, root } = await mount({
      pinned: ['session-1'],
      orderSlots: { pinned: ['session-2', 'session-1'] },
    })

    expect(pinnedTitles(container)).toEqual(['会话 session-1'])
    await act(async () => root.unmount())
  })

  it('carries a drag through the written slot into both surfaces', async () => {
    // 端到端：拖一次置顶行、把宿主回的整份快照喂回去，两个表面的先后都要跟着换
    // 这一段把「落点换算」「顺序位写入」「reconcile 进渲染」「名次联动」四处串起来
    const { container, root, slots, rerender } = await mount()
    expect(pinnedTitles(container)).toEqual(['会话 session-1', '会话 session-2'])
    expect(groupTitles(container)).toEqual([
      '会话 session-1',
      '会话 session-2',
      '会话 session-3',
    ])

    band(pinnedRow(container, 'session-1'), 0)
    band(pinnedRow(container, 'session-2'), 20)
    fire(pinnedRow(container, 'session-2'), 'dragstart')
    fire(pinnedRow(container, 'session-1'), 'dragover', 2)
    fire(pinnedRow(container, 'session-1'), 'drop', 2)
    await flush()

    // 宿主收到的就是这次拖拽换算出的整份顺序
    expect(slots).toEqual([['pinned', ['session-2', 'session-1']]])
    const [key, order] = slots[0] as [string, readonly string[]]

    // 把宿主回的整份快照喂回去：置顶区与分组内就地置顶段要一起换过来
    await rerender({ [key]: [...order] })

    expect(pinnedTitles(container)).toEqual(['会话 session-2', '会话 session-1'])
    expect(groupTitles(container)).toEqual([
      '会话 session-2',
      '会话 session-1',
      '会话 session-3',
    ])
    await act(async () => root.unmount())
  })
})
