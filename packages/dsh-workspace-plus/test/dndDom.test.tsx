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
 * 会话归组拖拽的真实 DOM
 *
 * 落点算错、标记画错、提交两次，界面上都不会报错，只表现为「拖过去放不进那个分组」「松手后放进了两处」，
 * 因此逐条断言的是交给宿主的 `moveSession` 调用与落点标记画在哪个元素上
 *
 * jsdom 不实现 `DataTransfer`（用例里用最小替身），也不做布局（`getBoundingClientRect()` 恒为全零），
 * `elementFromPoint` 与 `setPointerCapture` 同样缺席，因此命中走事件目标向上找标记元素，
 * 用例只需把事件派发到目标元素上，不必给定确切坐标
 */

/** 未归组那一段的会话 */
const LOOSE_IDS = ['session-1', 'session-2']

/** 分组「group-a」里的会话，两条以便验证「拖到组内某一行上」与「拖到别处」的区别 */
const GROUP_A_IDS = ['session-3', 'session-5']

/** 分组「group-b」里的会话 */
const GROUP_B_IDS = ['session-4']

const ALL_IDS = [...LOOSE_IDS, ...GROUP_A_IDS, ...GROUP_B_IDS]

/** 造一份会话摘要 */
function summary(id: string): Record<string, unknown> {
  return {
    id,
    displayTitle: `会话 ${id}`,
    running: false,
    blank: false,
    retainedBy: {},
    updatedAt: Date.now() - ALL_IDS.indexOf(id) * 1000,
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
 * @param y - 指针纵坐标，缺省 0，段内换位要按它算参照行的前后半
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

/** 等一次提交落地：`moveSession` 回的是一个 Promise */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** 工作区快照，模块级建好、每次返回同一份引用 */
function workspaceState(): Record<string, unknown> {
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
    pinnedSessionIds: [],
    phase: 'ready',
  }
}

/** 会话快照，同上 */
function sessionState(): Record<string, unknown> {
  const byId: Record<string, unknown> = {}
  for (const id of ALL_IDS) byId[id] = summary(id)
  return { ids: ALL_IDS, byId, phase: 'ready' }
}

const SNAPSHOT = snapshot({
  byWorkspace: {
    'ws-1': [
      { id: 'group-a', name: '分组甲', sessionIds: GROUP_A_IDS },
      { id: 'group-b', name: '分组乙', sessionIds: GROUP_B_IDS },
    ],
  },
})

/**
 * 区域 props
 * @param moves - 收到的 `moveSession` 调用，逐条记下三个实参
 * @param orders - 收到的分组排序调用，逐条记下实参，缺省表示这一处不关心排序
 * @param slots - 收到的手动顺序写入，逐条记下段键与整份顺序，缺省表示这一处不关心接管
 */
function props(
  moves: string[][],
  orders: string[][] = [],
  slots: [string, readonly string[]][] = [],
): WorkspaceGroupsProps {
  const state = workspaceState()
  const sessions = sessionState()
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
    loadGroups: async () => SNAPSHOT,
    onReady: () => () => {},
    createGroup: async () => SNAPSHOT,
    renameGroup: async () => SNAPSHOT,
    deleteGroup: async () => SNAPSHOT,
    moveSession: async (workspaceId: string, sessionId: string, groupId: string) => {
      moves.push([workspaceId, sessionId, groupId])
      return SNAPSHOT
    },
    setSegmentOrder: async (key: string, order: readonly string[]) => {
      slots.push([key, order])
      return SNAPSHOT
    },
    moveGroupBefore: async (
      workspaceId: string,
      groupId: string,
      beforeGroupId: string | undefined,
    ) => {
      // 缺席的锚点在数组里补成空串：`toEqual` 比不出数组元素的「缺席」
      orders.push([workspaceId, groupId, beforeGroupId ?? ''])
      return SNAPSHOT
    },
    moveVirtualWorkspaceBefore: async (groupId: string, beforeGroupId: string | undefined) => {
      orders.push(['', groupId, beforeGroupId ?? ''])
      return SNAPSHOT
    },
    createVirtualWorkspace: async () => SNAPSHOT,
    renameVirtualWorkspace: async () => SNAPSHOT,
    deleteVirtualWorkspace: async () => SNAPSHOT,
    moveWorkspaceBefore: async () => SNAPSHOT,
    moveWorkspace: async () => SNAPSHOT,
    nestWorkspaces: async () => SNAPSHOT,
    unnestWorkspaces: async () => SNAPSHOT,
    setNested: async () => SNAPSHOT,
    forgetWorkspace: async () => SNAPSHOT,
    focusEntry: async () => SNAPSHOT,
    togglePinned: async () => SNAPSHOT,
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

/** 挂载区域并交出容器与收到的移动调用 */
async function mount(): Promise<{
  container: HTMLElement
  root: ReturnType<typeof createRoot>
  moves: string[][]
  orders: string[][]
  slots: [string, readonly string[]][]
}> {
  const moves: string[][] = []
  const orders: string[][] = []
  const slots: [string, readonly string[]][] = []
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(moves, orders, slots)))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root, moves, orders, slots }
}

/**
 * 一个区域的元素，按区域键取
 * @param container - 挂载容器
 * @param key - 区域键
 */
function zone(container: HTMLElement, key: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wg-dnd="${key}"]`)
  if (found === null) throw new Error(`no drop zone for "${key}"`)
  return found
}

/** 一行会话的元素，按会话 id 取 */
function row(container: HTMLElement, id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[data-wg-dnd-row="${id}"]`)
  if (found === null) throw new Error(`no draggable row for "${id}"`)
  return found
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('dragging a session into a group', () => {
  it('moves a loose session into the group it was dropped on', async () => {
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-1'), 'dragstart')
    fire(target, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBe('inside')
    fire(target, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-1', 'group-a']])
    await act(async () => root.unmount())
  })

  it('takes a grouped session back out when it lands on the loose stretch', async () => {
    const { container, root, moves } = await mount()
    const target = zone(container, 'loose/ws-1')

    fire(row(container, 'session-3'), 'dragstart')
    fire(target, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBe('inside')
    fire(target, 'drop')
    await flush()

    // 空串的分组 id 就是「移出分组」，与归组菜单走同一个宿主方法
    expect(moves).toEqual([['ws-1', 'session-3', '']])
    await act(async () => root.unmount())
  })

  it('moves a session between two groups', async () => {
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-b')

    fire(row(container, 'session-3'), 'dragstart')
    fire(target, 'dragover')
    fire(target, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-3', 'group-b']])
    await act(async () => root.unmount())
  })

  it('reads a row inside another group as that whole group', async () => {
    // 组内会话行不带区域键，命中的是包着它们的整块分组那一格：落到行上读作归组
    const { container, root, moves } = await mount()
    const block = zone(container, 'sessionGroup/ws-1/group-a')
    const inner = row(container, 'session-3')

    fire(row(container, 'session-1'), 'dragstart')
    fire(inner, 'dragover')

    // 命中层从事件目标向上走，走到整块分组那一格才停，标记因此画在块上
    expect(inner.getAttribute('data-wg-drop')).toBeNull()
    expect(block.getAttribute('data-wg-drop')).toBe('inside')
    fire(inner, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-1', 'group-a']])
    await act(async () => root.unmount())
  })

  it('reads a drop on the group block itself as joining that group', async () => {
    // 块上仍读作整块归组：没有落到某一行上时（分组体留白、空分组），用户要的是归组而不是某个位次
    const { container, root, moves, orders, slots } = await mount()
    const block = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-1'), 'dragstart')
    fire(block, 'dragover')
    expect(block.getAttribute('data-wg-drop')).toBe('inside')
    fire(block, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-1', 'group-a']])
    await act(async () => root.unmount())
    // 归组不动顺序位，也不动分组顺序：这一步要的是归属
    expect(orders).toEqual([])
    expect(slots).toEqual([])
  })
})

describe('the workspace title row as a landing', () => {
  it('takes a grouped session back out when it lands on the title row', async () => {
    // 标题行是目录性质的落点：拖到它上面与拖到未归组段上是同一件事
    const { container, root, moves } = await mount()
    const title = zone(container, 'workspaceHead/ws-1')

    fire(row(container, 'session-3'), 'dragstart')
    fire(title, 'dragover')
    expect(title.getAttribute('data-wg-drop')).toBe('inside')
    fire(title, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-3', '']])
    await act(async () => root.unmount())
  })

  it('leaves an ungrouped session on its own title row with no landing', async () => {
    // 已在未归组段时那是原地投放：整块与标题行两格都不进计划
    const { container, root, moves } = await mount()
    const title = zone(container, 'workspaceHead/ws-1')

    fire(row(container, 'session-1'), 'dragstart')
    fire(title, 'dragover')

    expect(title.getAttribute('data-wg-drop')).toBeNull()
    fire(title, 'drop')
    await flush()

    expect(moves).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('landings that change nothing', () => {
  it('marks and moves nothing when a loose session lands back on the loose stretch', async () => {
    // 原地投放不收进计划：查不到这一格，因此既不标记也不提交
    const { container, root, moves } = await mount()
    const target = zone(container, 'loose/ws-1')

    fire(row(container, 'session-1'), 'dragstart')
    fire(target, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBeNull()
    fire(target, 'drop')
    await flush()

    expect(moves).toEqual([])
    await act(async () => root.unmount())
  })

  it('marks and moves nothing when a grouped session lands back on its own group', async () => {
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-3'), 'dragstart')
    fire(target, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBeNull()
    fire(target, 'drop')
    await flush()

    expect(moves).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('the marker while the pointer moves', () => {
  it('clears the marker once the pointer leaves every zone', async () => {
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-1'), 'dragstart')
    fire(target, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBe('inside')

    // 划到区域之外：标记撤掉，但监听还挂着
    fire(document.body, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
    expect(moves).toEqual([])
  })

  it('still commits when the pointer leaves the zone before releasing', async () => {
    // 用户常见的走法：先把指针挪到目标上确认标记，再放手（放手时指针可能已经偏出那一格）
    // 提交用的是上一次命中算出的落点，因此这一条必须仍然落进那个分组
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-1'), 'dragstart')
    fire(target, 'dragover')
    expect(target.getAttribute('data-wg-drop')).toBe('inside')

    fire(document.body, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-1', 'group-a']])
    await act(async () => root.unmount())
  })

  it('keeps the marker on one zone only as the pointer crosses two of them', async () => {
    const { container, root } = await mount()
    const first = zone(container, 'sessionGroup/ws-1/group-a')
    const second = zone(container, 'sessionGroup/ws-1/group-b')

    fire(row(container, 'session-1'), 'dragstart')
    fire(first, 'dragover')
    expect(first.getAttribute('data-wg-drop')).toBe('inside')

    fire(second, 'dragover')
    // 同一时刻只该有一处落点：前一处要撤掉，否则界面上会同时亮两块
    expect(first.getAttribute('data-wg-drop')).toBeNull()
    expect(second.getAttribute('data-wg-drop')).toBe('inside')
    await act(async () => root.unmount())
  })

  it('clears the marker and the listeners when the drag ends', async () => {
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-1'), 'dragstart')
    fire(target, 'dragover')
    fire(row(container, 'session-1'), 'dragend')

    expect(target.getAttribute('data-wg-drop')).toBeNull()
    // 拖拽结束后手势层已经摘掉监听，再落的 `drop` 什么也不做
    fire(target, 'drop')
    await flush()

    expect(moves).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('a zone this drag does not accept', () => {
  it('leaves a zone outside the plan unmarked and uncommitted', async () => {
    // 这条会话属于未归组段：它自己的那一段不在计划里，而两个分组头都在
    // 反过来，拖「分组甲」里那条会话时，计划里仍没有未归组段之外的第三处可落
    const { container, root, moves } = await mount()
    const own = zone(container, 'loose/ws-1')

    fire(row(container, 'session-1'), 'dragstart')
    fire(own, 'dragover')
    fire(own, 'drop')
    await flush()

    expect(own.getAttribute('data-wg-drop')).toBeNull()
    expect(moves).toEqual([])
    await act(async () => root.unmount())
  })

  it('leaves every zone untouched while no drag is running', async () => {
    const { container, root, moves, slots } = await mount()

    for (const element of Array.from(container.querySelectorAll<HTMLElement>('[data-wg-dnd]'))) {
      expect(element.getAttribute('data-wg-drop')).toBeNull()
      fire(element, 'dragover')
      expect(element.getAttribute('data-wg-drop')).toBeNull()
    }
    await flush()

    expect(moves).toEqual([])
    // 没有计划时命中层连区域都认不出来，顺序位自然也不该被写
    expect(slots).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('committing exactly once', () => {
  it('commits once when drop bubbles twice', async () => {
    // 嵌套区域里内层与外层都会收到同一次冒泡，提交只该发生一次
    const { container, root, moves } = await mount()
    const target = zone(container, 'sessionGroup/ws-1/group-a')

    fire(row(container, 'session-1'), 'dragstart')
    fire(target, 'dragover')
    fire(target, 'drop')
    fire(target, 'drop')
    await flush()

    expect(moves).toEqual([['ws-1', 'session-1', 'group-a']])
    await act(async () => root.unmount())
  })

  it('commits once when two zones of the same drag each get a drop', async () => {
    const { container, root, moves } = await mount()
    const first = zone(container, 'sessionGroup/ws-1/group-a')
    const second = zone(container, 'sessionGroup/ws-1/group-b')

    fire(row(container, 'session-1'), 'dragstart')
    fire(first, 'dragover')
    fire(first, 'drop')
    fire(second, 'dragover')
    fire(second, 'drop')
    await flush()

    // 第一次提交已经结束这场拖拽，第二次落在别处的 `drop` 不该再写一遍
    expect(moves).toEqual([['ws-1', 'session-1', 'group-a']])
    await act(async () => root.unmount())
  })
})

describe('two regions sharing one document', () => {
  it('lets each instance drag on its own without borrowing the other listeners', async () => {
    // 侧边栏与对照 tab 双开：两者共享同一个 `document`
    // 所有权由模块级单例表达——没调过 `beginDrag` 的那个实例监听根本不存在，因此不抢事件
    const movesA: string[][] = []
    const movesB: string[][] = []
    const containerA = document.createElement('div')
    const containerB = document.createElement('div')
    document.body.append(containerA, containerB)
    const rootA = createRoot(containerA)
    const rootB = createRoot(containerB)
    await act(async () => {
      rootA.render(React.createElement(WorkspaceGroupsRegion, props(movesA)))
      rootB.render(React.createElement(WorkspaceGroupsRegion, props(movesB)))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const targetB = zone(containerB, 'sessionGroup/ws-1/group-a')

    // 在 A 里拖起，指针却划过 B 的区域：B 的落点不该亮起来
    fire(row(containerA, 'session-1'), 'dragstart')
    fire(targetB, 'dragover')
    expect(targetB.getAttribute('data-wg-drop')).toBeNull()

    // 同一场拖拽的 `drop` 落在 B 上：A 持有计划，但事件目标不在 A 那一片里，因此什么也不写
    fire(targetB, 'drop')
    await flush()
    expect(movesA).toEqual([])
    expect(movesB).toEqual([])

    // 对照：A 自己那一片上的同一个区域照常接得住，上面那次落空不是「机制整个没跑」
    const targetA = zone(containerA, 'sessionGroup/ws-1/group-a')
    fire(row(containerA, 'session-1'), 'dragstart')
    fire(targetA, 'dragover')
    expect(targetA.getAttribute('data-wg-drop')).toBe('inside')
    fire(targetA, 'drop')
    await flush()
    expect(movesA).toEqual([['ws-1', 'session-1', 'group-a']])
    expect(movesB).toEqual([])

    await act(async () => rootA.unmount())
    await act(async () => rootB.unmount())
  })

  it('keeps each instance away from the other one markers', async () => {
    // 两个实例各自的清理只碰自己画过的元素：清整份文档会把另一边正画着的标记擦掉
    const containerA = document.createElement('div')
    const containerB = document.createElement('div')
    document.body.append(containerA, containerB)
    const rootA = createRoot(containerA)
    const rootB = createRoot(containerB)
    await act(async () => {
      rootA.render(React.createElement(WorkspaceGroupsRegion, props([])))
      rootB.render(React.createElement(WorkspaceGroupsRegion, props([])))
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const targetA = zone(containerA, 'sessionGroup/ws-1/group-a')
    const targetB = zone(containerB, 'sessionGroup/ws-1/group-a')

    // A 拖起并标上，随后 B 拖起并标上：两边的标记各自成立
    fire(row(containerA, 'session-1'), 'dragstart')
    fire(targetA, 'dragover')
    expect(targetA.getAttribute('data-wg-drop')).toBe('inside')

    fire(row(containerB, 'session-1'), 'dragstart')
    fire(targetB, 'dragover')
    expect(targetB.getAttribute('data-wg-drop')).toBe('inside')
    // 后到的 `beginDrag` 覆盖先到的，A 那一场跟着作废，它画的标记一并撤掉
    expect(targetA.getAttribute('data-wg-drop')).toBeNull()

    await act(async () => rootA.unmount())
    await act(async () => rootB.unmount())
  })
})

describe('the markup the mechanism puts on rows and zones', () => {
  it('names the container each session row sits in', async () => {
    const { container, root } = await mount()

    expect(zone(container, 'sessionGroup/ws-1/group-a')).not.toBeNull()
    expect(zone(container, 'sessionGroup/ws-1/group-b')).not.toBeNull()
    expect(zone(container, 'loose/ws-1')).not.toBeNull()
    // 标题行自己带一格：它是目录性质的落点，会话计划里也收它
    expect(zone(container, 'workspaceHead/ws-1')).not.toBeNull()
    // 会话行自身不带区域键：落到行上会一路走到包着它的容器那一格
    expect(row(container, 'session-3').getAttribute('data-wg-dnd')).toBeNull()
    // 区域键在拖拽之外也不变：DOM 完全被动，含义由计划决定
    expect(zone(container, 'sessionGroup/ws-1/group-a').getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
  })

  it('marks a session row draggable and names its row id', async () => {
    const { container, root } = await mount()

    expect(row(container, 'session-1').getAttribute('draggable')).toBe('true')
    expect(row(container, 'session-3').getAttribute('draggable')).toBe('true')
    await act(async () => root.unmount())
  })

  it('carries the payload prefix so another drag implementation can step aside', async () => {
    const { container, root } = await mount()
    const event = transferable(new Event('dragstart', { bubbles: true }))

    act(() => {
      row(container, 'session-1').dispatchEvent(event)
    })

    // 外部插件的监听读这个前缀就知道这是本包的拖拽
    const transferred = event as unknown as { dataTransfer: { getData: (f: string) => string } }
    expect(transferred.dataTransfer.getData('text/plain')).toBe('wg-dnd:session-1')
    fire(row(container, 'session-1'), 'dragend')
    await act(async () => root.unmount())
  })

  it('fades the row being dragged and restores it when the drag ends', async () => {
    const { container, root } = await mount()
    const dragged = row(container, 'session-1')

    expect(dragged.hasAttribute('data-wg-dragging')).toBe(false)
    fire(dragged, 'dragstart')
    expect(row(container, 'session-1').hasAttribute('data-wg-dragging')).toBe(true)
    // 只有被拖的那一行画淡
    expect(row(container, 'session-2').hasAttribute('data-wg-dragging')).toBe(false)

    fire(row(container, 'session-1'), 'dragend')
    expect(row(container, 'session-1').hasAttribute('data-wg-dragging')).toBe(false)
    await act(async () => root.unmount())
  })
})
