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
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 工作区行拖拽的真实 DOM
 *
 * 四类落点里放错一类时界面不会报错，只表现为「拖过去松手什么都没发生」或「进了另一个容器」
 * 因此逐条断言的是交给宿主的那几次写入，以及命中层真实画下的落点标记
 *
 * jsdom 不实现 `DataTransfer`（用例里用最小替身），也不做布局（`getBoundingClientRect()` 恒为全零）
 * 因此命中走事件目标向上找标记元素，「整块投放」那一档不吃坐标，用例不必替身矩形带
 *
 * 数据一律用 `ws-1` / `group-a` 这类中性样例，不读真实工作区、目录或会话 id
 */

/** 一个工作区分组里的两条工作区，用来验证组内换位 */
const GROUP_MEMBERS = ['ws-1', 'ws-2']

/** 一个祖先工作区，它名下带一个会话分组，供工况 12 落点 */
const PARENT_ID = 'ws-9'

/** 挂在祖先工作区之下的子工作区，工况 12 拖的就是它 */
const CHILD_ID = 'ws-4'

/** 挂在同一祖先之下的第二个子工作区，同层子工作区换位的参照行 */
const SIBLING_CHILD_ID = 'ws-5'

const ALL_WORKSPACES = [...GROUP_MEMBERS, PARENT_ID, CHILD_ID, SIBLING_CHILD_ID]

/**
 * 一条工作区的路径
 *
 * `ws-4` 挂在 `ws-9` 之下，因此它是 `ws-9` 的子工作区；`ws-1` 与 `ws-2` 同层且互不为祖先
 * 这样工况 12 的候选里只有 `ws-9` 那一个分组，而工况 11 的同层名单里是 `ws-1` 与 `ws-2`
 */
const PATH_OF: Record<string, string> = {
  'ws-1': '/repo/one',
  'ws-2': '/repo/two',
  'ws-4': '/repo/nine/four',
  'ws-5': '/repo/nine/five',
  'ws-9': '/repo/nine',
}

/** 给事件挂一份最小的 dataTransfer，手势层只对它写载荷前缀 */
function transferable(event: Event): Event {
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      effectAllowed: '',
      dropEffect: '',
      setData: () => {},
      getData: () => '',
    },
  })
  return event
}

/**
 * 派发一个拖拽事件
 * @param target - 事件目标
 * @param type - 事件类型
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
 * jsdom 不做布局，`getBoundingClientRect()` 恒为零矩形，无坐标的事件因此永远算出「落在下半」
 * 组内换位要靠参照行的前后半定前后，用例得先把行摆到不同的高度上，命中才有确定读数
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

/** 等一次提交落地：宿主写入回的是一份 Promise */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** 收到的那几次写入，逐条记下方法名与实参 */
interface Writes {
  moves: [string, string][]
  /** 换位写入注册表序：被挪的工作区与锚点（undefined 表示挪到末尾） */
  reorders: [string, string | undefined][]
  nests: [string, string, string][]
  unnests: string[][]
  clears: [string, readonly string[]][]
}

/** 工作区列表快照，模块级建好、每次返回同一份引用 */
function workspaceState(): Record<string, unknown> {
  return {
    items: ALL_WORKSPACES.map((workspaceId) => ({
      workspaceId,
      path: PATH_OF[workspaceId],
      title: workspaceId,
      sessionIds: [],
      createdAt: new Date(2026, 0, 1).toISOString(),
      updatedAt: new Date(2026, 0, 1).toISOString(),
    })),
    archivedSessionIds: [],
    pinnedSessionIds: [],
    phase: 'ready',
  }
}

/** 区域 props */
function props(
  writes: Writes,
  options: { workspaceGroups?: { id: string; name: string; workspaceIds: string[] }[]; nesting?: Record<string, { workspaceId: string; groupId: string }>; orderSlots?: Record<string, string[]> } = {},
): WorkspaceGroupsProps {
  const stored = snapshot({
    byWorkspace: { [PARENT_ID]: [{ id: 'group-a', name: '分组甲', sessionIds: [] }] },
    workspaceGroups: options.workspaceGroups ?? [
      { id: 'wg-1', name: '工作区分组甲', workspaceIds: GROUP_MEMBERS },
    ],
    nesting: options.nesting ?? {},
    orderSlots: options.orderSlots ?? {},
  })
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) => select(workspaceState())) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: [], byId: {}, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/repo' })) as never,
    openSession: () => {},
    startSession: async () => undefined,
    loadGroups: async () => stored,
    onReady: () => () => {},
    createGroup: async () => stored,
    renameGroup: async () => stored,
    deleteGroup: async () => stored,
    moveSession: async () => stored,
    setSegmentOrder: async (key: string, order: readonly string[]) => {
      writes.clears.push([key, order])
      return stored
    },
    moveGroupBefore: async () => stored,
    moveVirtualWorkspaceBefore: async () => stored,
    createVirtualWorkspace: async () => stored,
    renameVirtualWorkspace: async () => stored,
    deleteVirtualWorkspace: async () => stored,
    moveWorkspace: async (workspaceId, groupId) => {
      writes.moves.push([workspaceId, groupId])
      return stored
    },
    nestWorkspaces: async (workspaceIds, parentWorkspaceId, groupId) => {
      writes.nests.push([workspaceIds.join(','), parentWorkspaceId, groupId])
      return stored
    },
    unnestWorkspaces: async (workspaceIds) => {
      writes.unnests.push([...workspaceIds])
      return stored
    },
    setNested: async () => stored,
    forgetWorkspace: async () => stored,
    focusEntry: async () => stored,
    togglePinned: async () => stored,
    setSessionPinned: async () => {},
    insertWorkspaceBefore: async (workspaceId: string, beforeWorkspaceId: string | undefined) => {
      writes.reorders.push([workspaceId, beforeWorkspaceId])
    },
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    searchResultLimit: 20,
    t: regionTranslate(),
    tWorkspace: workspaceTranslate(),
    tSidebar: sidebarTranslate(),
    ...viewModeProps(),
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

/** 挂载区域并等分组元数据落地 */
async function mount(
  options: Parameters<typeof props>[1] = {},
): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot>; writes: Writes }> {
  const writes: Writes = { moves: [], reorders: [], nests: [], unnests: [], clears: [] }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(writes, options)))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root, writes }
}

/**
 * 一条工作区行
 * @param container - 挂载容器
 * @param workspaceId - 工作区 id
 */
function workspaceRow(container: HTMLElement, workspaceId: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-wg-dnd-row="${workspaceId}"]`,
  )
  if (found === null) throw new Error(`no workspace row for "${workspaceId}"`)
  return found
}

/**
 * 一个带区域键的元素
 * @param container - 挂载容器
 * @param key - 区域键
 */
function zone(container: HTMLElement, key: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-wg-dnd="${key}"]`)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('dragging a workspace row between virtual workspace groups', () => {
  it('moves the workspace into the group it was dropped on', async () => {
    // 工况 10 的入组：拖到另一个分组的头上、或拖到它组体那一大片里，都读作移入
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
        { id: 'wg-2', name: '工作区分组乙', workspaceIds: ['ws-2'] },
      ],
    })

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(zone(container, 'virtualWorkspaceHead/wg-2')!, 'dragover')
    fire(zone(container, 'virtualWorkspaceHead/wg-2')!, 'drop')
    await flush()

    expect(writes.moves).toEqual([['ws-1', 'wg-2']])
    await act(async () => root.unmount())
  })

  it('moves the workspace out of its group when it lands on the root list', async () => {
    // 工况 10 的移出：根节点那一片整片是落点，空串在宿主那一侧表示移出
    const { container, root, writes } = await mount()

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(zone(container, 'root')!, 'dragover')
    fire(zone(container, 'root')!, 'drop')
    await flush()

    expect(writes.moves).toEqual([['ws-1', '']])
    await act(async () => root.unmount())
  })

  it('writes nothing when a workspace lands back on its own group', async () => {
    // 原地投放是构造期缺席：自己那一片根本不进计划，命中层查不到，既不标记也不提交
    const { container, root, writes } = await mount()
    const own = zone(container, 'virtualWorkspaceBody/wg-1')!

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(own, 'dragover')
    fire(own, 'drop')
    await flush()

    expect(writes.moves).toEqual([])
    expect(own.getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
  })

  it('carries the group body and its head as the same drop', async () => {
    // 两格同一档：命中层停在指针下第一个带区域键的元素上，拖到组体空白与拖到组头上要落到同一次写入
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
        { id: 'wg-2', name: '工作区分组乙', workspaceIds: [] },
      ],
    })

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(zone(container, 'virtualWorkspaceBody/wg-2')!, 'dragover')
    fire(zone(container, 'virtualWorkspaceBody/wg-2')!, 'drop')
    await flush()

    expect(writes.moves).toEqual([['ws-1', 'wg-2']])
    await act(async () => root.unmount())
  })

  it('marks one region for a target whose head and body are two zones', async () => {
    // 组头与组体是两格但同一份提交，落脚只有一处，因此只该出现一圈
    // 各画一圈会被读成两个区域，而用户看到的是同一件事
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
        { id: 'wg-2', name: '工作区分组乙', workspaceIds: [] },
      ],
    })
    const head = zone(container, 'virtualWorkspaceHead/wg-2')!
    const body = zone(container, 'virtualWorkspaceBody/wg-2')!

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(head, 'dragover')

    // 标记合并到两格的共同祖先上：两者都不是它，但整块只描一圈
    expect(head.getAttribute('data-wg-drop')).toBeNull()
    expect(body.getAttribute('data-wg-drop')).toBeNull()
    expect(container.querySelectorAll('[data-wg-drop]')).toHaveLength(1)
    await act(async () => root.unmount())
  })
})

describe('dragging a workspace row inside its own virtual workspace group', () => {
  it('writes the anchor of the converted member order', async () => {
    // 工况 11：组内换位落在成员数组上，写入的是「插到谁之前」那一格
    const { container, root, writes } = await mount()
    band(workspaceRow(container, 'ws-1'), 0)
    band(workspaceRow(container, 'ws-2'), 20)

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    // 指针落在 ws-1 的上半，读作插到它之前
    fire(workspaceRow(container, 'ws-1'), 'dragover', 2)
    fire(workspaceRow(container, 'ws-1'), 'drop', 2)
    await flush()

    expect(writes.reorders).toEqual([['ws-2', 'ws-1']])
    await act(async () => root.unmount())
  })

  it('writes nothing when a workspace is dropped on the neighbour it already sits next to', async () => {
    // 相邻位是「拖动发生了、顺序没变」：换算判出逐位相同，盘上因此不留改动
    const { container, root, writes } = await mount()
    band(workspaceRow(container, 'ws-1'), 0)
    band(workspaceRow(container, 'ws-2'), 20)

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    // 指针落在 ws-2 的上半，读作插到它之前——ws-1 本来就在 ws-2 之前，顺序没变
    fire(workspaceRow(container, 'ws-2'), 'dragover', 22)
    fire(workspaceRow(container, 'ws-2'), 'drop', 22)
    await flush()

    expect(writes.reorders).toEqual([])
    await act(async () => root.unmount())
  })

  it('names the workspace as the row it can be dropped against', async () => {
    // 可拖是这一段接排序的前提：少了 `draggable`，拖起事件根本不会派发
    const { container, root } = await mount()

    expect(workspaceRow(container, 'ws-1').getAttribute('draggable')).toBe('true')
    expect(workspaceRow(container, 'ws-2').getAttribute('draggable')).toBe('true')
    // 行自己既是落点区域也是参照行，两格标记都在它身上
    expect(workspaceRow(container, 'ws-1').getAttribute('data-wg-dnd')).toBe('workspaceHead/ws-1')
    await act(async () => root.unmount())
  })
})

describe('dragging a workspace row across flat and nested layers', () => {
  it('reorders two workspaces that sit flat on the root with no group at all', async () => {
    // 根节点平铺段的同层名单是根容器的顶层（注册表序），与组内换位落在同一个写入面上
    const { container, root, writes } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, 'ws-1'), 0)
    band(workspaceRow(container, 'ws-2'), 20)

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    // 指针落在 ws-1 的上半，读作插到它之前
    fire(workspaceRow(container, 'ws-1'), 'dragover', 2)
    fire(workspaceRow(container, 'ws-1'), 'drop', 2)
    await flush()

    expect(writes.reorders).toEqual([['ws-2', 'ws-1']])
    await act(async () => root.unmount())
  })

  it('moves a nested child workspace in front of its same-layer sibling', async () => {
    // 嵌套子工作区作来源：同层名单按「父工作区相同」取（ws-9 名下的 ws-4 与 ws-5）
    // 画出的落点线放开后必须真的写——命中与提交读的是同一份名单
    const { container, root, writes } = await mount()
    band(workspaceRow(container, 'ws-4'), 0)
    band(workspaceRow(container, 'ws-5'), 20)

    fire(workspaceRow(container, 'ws-5'), 'dragstart')
    // 指针落在 ws-4 的上半，读作插到它之前
    fire(workspaceRow(container, 'ws-4'), 'dragover', 2)
    fire(workspaceRow(container, 'ws-4'), 'drop', 2)
    await flush()

    expect(writes.reorders).toEqual([['ws-5', 'ws-4']])
    await act(async () => root.unmount())
  })

  it('marks a nested child workspace row as a drop target for its same-layer sibling', async () => {
    // 嵌套子工作区作落点：这一行是同层的合法参照行，命中层不再停在它上面作废
    const { container, root } = await mount()
    band(workspaceRow(container, 'ws-4'), 0)
    band(workspaceRow(container, 'ws-5'), 20)

    fire(workspaceRow(container, 'ws-5'), 'dragstart')
    fire(workspaceRow(container, 'ws-4'), 'dragover', 2)

    expect(workspaceRow(container, 'ws-4').getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })
})

describe('dragging a workspace row into and out of a session group', () => {
  it('nests the workspace into the session group of its ancestor', async () => {
    // 工况 12 的入组：落点是祖先工作区体内的会话分组头
    const { container, root, writes } = await mount()

    fire(workspaceRow(container, 'ws-4'), 'dragstart')
    fire(zone(container, 'groupHead/ws-9/group-a')!, 'dragover')
    fire(zone(container, 'groupHead/ws-9/group-a')!, 'drop')
    await flush()

    expect(writes.nests).toEqual([['ws-4', 'ws-9', 'group-a']])
    await act(async () => root.unmount())
  })

  it('unnests the workspace when it lands on its parent workspace row', async () => {
    // 工况 12 的移出：落点是父工作区那一行，它在来源的上一层
    const { container, root, writes } = await mount({
      nesting: { 'ws-4': { workspaceId: 'ws-9', groupId: 'group-a' } },
    })

    fire(workspaceRow(container, 'ws-4'), 'dragstart')
    fire(workspaceRow(container, 'ws-9'), 'dragover')
    fire(workspaceRow(container, 'ws-9'), 'drop')
    await flush()

    expect(writes.unnests).toEqual([['ws-4']])
    await act(async () => root.unmount())
  })

  it('leaves the session group the workspace already belongs to out of the plan', async () => {
    // 已经在那个分组里时再放一次不改变任何东西，这一格因此不进计划
    const { container, root, writes } = await mount({
      nesting: { 'ws-4': { workspaceId: 'ws-9', groupId: 'group-a' } },
    })

    fire(workspaceRow(container, 'ws-4'), 'dragstart')
    const head = zone(container, 'groupHead/ws-9/group-a')!
    fire(head, 'dragover')
    fire(head, 'drop')
    await flush()

    expect(writes.nests).toEqual([])
    expect(head.getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
  })
})
