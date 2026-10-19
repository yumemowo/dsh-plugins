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

/** 一个与谁都没有 cwd 关系、平铺在根节点那一层的工作区 */
const MUN_ID = 'ws-8'

const ALL_WORKSPACES = [...GROUP_MEMBERS, PARENT_ID, CHILD_ID, SIBLING_CHILD_ID, MUN_ID]

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
  'ws-8': '/elsewhere/mun',
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
  options: {
    workspaceGroups?: { id: string; name: string; workspaceIds: string[] }[]
    nesting?: Record<string, { workspaceId: string; groupId: string }>
    orderSlots?: Record<string, string[]>
    /**
     * 写入之后宿主要回的那份快照
     *
     * 缺省时全部写回同一份（只验写入的实参）。要验「界面跟着写入走」时给出它：
     * 回的那一份必须反映改动，否则用例分不清「界面没更新」与「宿主没写」
     */
    next?: (workspaceId: string) => ReturnType<typeof snapshot>
    /** 同理，写会话分组归属之后要回的那一份——接收上一笔的结果，模拟宿主逐步累积 */
    nextNest?: (
      previous: ReturnType<typeof snapshot>,
      workspaceIds: readonly string[],
      parentWorkspaceId: string,
      groupId: string,
    ) => ReturnType<typeof snapshot>
  } = {},
): WorkspaceGroupsProps {
  const stored = snapshot({
    byWorkspace: { [PARENT_ID]: [{ id: 'group-a', name: '分组甲', sessionIds: [] }] },
    workspaceGroups: options.workspaceGroups ?? [
      { id: 'wg-1', name: '工作区分组甲', workspaceIds: GROUP_MEMBERS },
    ],
    nesting: options.nesting ?? {},
    orderSlots: options.orderSlots ?? {},
  })
  /** 宿主那份「当前」快照：每一笔写入都基于上一笔的结果累积 */
  let live = stored
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
      if (options.next === undefined) return stored
      live = options.next(workspaceId)
      return live
    },
    nestWorkspaces: async (workspaceIds, parentWorkspaceId, groupId) => {
      writes.nests.push([workspaceIds.join(','), parentWorkspaceId, groupId])
      if (options.nextNest === undefined) return stored
      live = options.nextNest(live, workspaceIds, parentWorkspaceId, groupId)
      return live
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
/**
 * 一条工作区行所在的整块
 *
 * 落点线跨整片画在这一块上，而不是贴着标题那一行：体内有内容时，
 * 只贴标题画会显得线只有半截，与「排在整个工作区之前 / 之后」读出的语义也不一致
 * @param container - 挂载容器
 * @param workspaceId - 工作区 id
 */
function workspaceBlock(container: HTMLElement, workspaceId: string): HTMLElement {
  const row = workspaceRow(container, workspaceId)
  const block = row.closest<HTMLElement>('[data-wg-dnd-region]')
  if (block === null) throw new Error(`no workspace block for "${workspaceId}"`)
  return block
}

function workspaceRow(container: HTMLElement, workspaceId: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-wg-dnd-row="${workspaceId}"]`,
  )
  if (found === null) throw new Error(`no workspace row for "${workspaceId}"`)
  return found
}

/** 当前画着落点标记的元素个数：一处缝只该有一个 */
function countMarked(container: HTMLElement): number {
  return container.querySelectorAll('[data-wg-drop]').length
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

  it('draws a line and moves a nested child workspace onto a root level row', async () => {
    // 用户截图里的那一格：来源是分组里**真正嵌套着**的子工作区，目标是 root 层平铺的一行。
    // 界面上下它们相隔很远，但「移到 root 层那一行的旁边」是合法落点——
    // 落到那一行上同时是「移出分组」与「排到它前后」，两件事都写
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: [PARENT_ID, CHILD_ID] },
      ],
    })
    band(workspaceRow(container, MUN_ID), 0)

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(workspaceRow(container, MUN_ID), 'dragover', 2)

    expect(workspaceBlock(container, MUN_ID).getAttribute('data-wg-drop')).toBe('before')
    fire(workspaceRow(container, MUN_ID), 'drop', 2)
    await flush()
    expect(writes.moves).toEqual([[CHILD_ID, '']])
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
  it('never draws the root region box while lining up two members of a group', async () => {
    // 组内换位只该画线：根节点那一片的「移出分组」落点不该跟着亮起来——
    // 用户拖的是同组内的两个成员，落点语义只有「排到它前后」一件事
    const { container, root } = await mount()
    band(workspaceRow(container, 'ws-1'), 0)
    band(workspaceRow(container, 'ws-2'), 20)

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover', 2)

    const inside = [...container.querySelectorAll('[data-wg-drop="inside"]')]
    expect(inside).toHaveLength(0)
    expect(workspaceBlock(container, 'ws-1').getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })

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

    expect(workspaceBlock(container, 'ws-4').getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })
})

describe('a source whose cwd parent sits inside a group', () => {
  it('narrows the box to the ancestor row instead of the whole group', async () => {
    // 摹拟用户报的那一组：cwd 祖先住在虚拟分组里，来源平铺在根节点那一层
    // 两者不在同一片里，但拖拽认的是路径关系——把来源挪过去之后它们就是真正的父子
    // 祖先那一行比分组深一层，因此框收在这一行，不再套住整组
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: [PARENT_ID, SIBLING_CHILD_ID] },
      ],
    })
    const parentRow = workspaceRow(container, PARENT_ID)

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(parentRow, 'dragover')

    const marked = [...container.querySelectorAll('[data-wg-drop]')]
    const box = marked[0]
    expect(marked).toHaveLength(1)
    // 框落在这一块的整块上，而不是它外面那个分组：
    // 整块含体内的子工作区行，那些行是落点的子集，因此一并圈进来
    expect(box).toBe(parentRow.closest('[data-wg-dnd-region]'))
    expect(box).not.toBe(zone(container, 'virtualWorkspaceBody/wg-1'))
    expect(box?.getAttribute('data-wg-drop')).toBe('inside')
    await act(async () => root.unmount())
  })

  it('shows a box on the ancestor row and a line on the same layer sibling at once', async () => {
    // 用户要的两件事同时成立：范围缩到父工作区那一块（框），
    // 并且与同父工作区的兄弟谈位次（线）——一次检测最多一个框加一条线
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: [PARENT_ID, SIBLING_CHILD_ID] },
      ],
    })
    band(workspaceRow(container, SIBLING_CHILD_ID), 0)

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(workspaceRow(container, SIBLING_CHILD_ID), 'dragover')


    const parentBlock = workspaceRow(container, PARENT_ID).closest('[data-wg-dnd-region]')
    const box = parentBlock?.getAttribute('data-wg-drop')
    const line = workspaceBlock(container, SIBLING_CHILD_ID).getAttribute('data-wg-drop')

    // 用户要的两件事同时成立：范围缩到父工作区那一块（框），并与同层兄弟谈位次（线）
    expect(box).toBe('inside')
    expect(line).toBe('before')
    await act(async () => root.unmount())
  })

  it('also offers an ordering line against the same layer sibling', async () => {
    // 同父工作区的兄弟（ws-5）与来源同层：那一行同时给线
    const { container, root } = await mount()
    band(workspaceRow(container, SIBLING_CHILD_ID), 0)

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(workspaceRow(container, SIBLING_CHILD_ID), 'dragover')

    expect(workspaceBlock(container, SIBLING_CHILD_ID).getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })
})

describe('a root level source beside an unrelated root level sibling', () => {
  it('offers an ordering line against the row it sits next to', async () => {
    // 来源与目标都没有 cwd 祖先，只是恰好并排在根节点那一层——
    // 用户看见它们并排，因此可以互相换位。位次参照不能只按 cwd 认
    const { container, root, writes } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, 'ws-1'), 0)

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover', 2)

    expect(workspaceBlock(container, 'ws-1').getAttribute('data-wg-drop')).toBe('before')
    fire(workspaceRow(container, 'ws-1'), 'drop', 2)
    await flush()
    expect(writes.reorders).toEqual([['ws-2', 'ws-1']])
    await act(async () => root.unmount())
  })

  it('offers an ordering line against a row that merely sits beside it at the root', async () => {
    // 用户截图里的那一格：来源在 root 层，MunNovel 也在 root 层，两者 cwd 毫无关系
    // 它们并排着，因此必须能互相换位——不能只按 cwd 认同层
    const { container, root, writes } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, MUN_ID), 0)

    // ws-1 与 ws-8 都平铺在根节点那一层，cwd 毫无关系
    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(workspaceRow(container, MUN_ID), 'dragover', 2)

    expect(workspaceBlock(container, MUN_ID).getAttribute('data-wg-drop')).toBe('before')
    fire(workspaceRow(container, MUN_ID), 'drop', 2)
    await flush()
    expect(writes.reorders).toEqual([['ws-1', MUN_ID]])
    await act(async () => root.unmount())
  })

  it('draws one line on a whole block for a seam from either side', async () => {
    // 一处缝从上面看是前一条的下半、从下面看是后一条的上半，两处各画一条就成了两条线。
    // 无论指针从哪一侧靠近，读数都必须逐字相同：同一个标记、画在同一个元素上。
    // 而且它必须画在**整块**上——贴着标题那一行画会让线只有半行宽，
    // 读起来像「落点只覆盖那一行」
    const { container, root } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, 'ws-1'), 0)
    band(workspaceRow(container, 'ws-2'), 20)

    fire(workspaceRow(container, MUN_ID), 'dragstart')

    const readings: { mark: string | null; holds: string | null }[] = []
    for (const [rowId, y] of [
      ['ws-1', 8],
      ['ws-2', 22],
    ] as const) {
      fire(workspaceRow(container, rowId), 'dragover', y)
      const marked = [...container.querySelectorAll('[data-wg-drop]')]
      expect(marked).toHaveLength(1)
      // 画的是整块，不是块里的标题行
      expect(marked[0]?.hasAttribute('data-wg-dnd-region')).toBe(true)
      // 线画在整块上，块里那一条标题行就是它指的位次参照
      readings.push({
        mark: marked[0]?.getAttribute('data-wg-drop') ?? null,
        holds: marked[0]?.querySelector('[data-wg-dnd-row]')?.getAttribute('data-wg-dnd-row') ?? null,
      })
    }

    // 从上面靠近也读作「排到 ws-2 之前」：缝只有一处，标记因此只有一个
    expect(readings[0]).toEqual({ mark: 'before', holds: 'ws-2' })
    expect(readings[0]).toEqual(readings[1])
    await act(async () => root.unmount())
  })

  it('reads the spacing a row carries as that row own band', async () => {
    // 行与行之间没有 margin：那点间距挂在后一行带的上内边距里（见 rows.module.css 的行带一节），
    // 相邻两条带因此严丝合缝。指针停在带的上内边距里，命中的就是这一条带本身，
    // 而那段读作「排到它之前」——同一处缝从上面还是从下面靠近都是同一个读数
    const { container, root } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, 'ws-1'), 0, 38)
    band(workspaceRow(container, 'ws-2'), 38, 38)

    fire(workspaceRow(container, MUN_ID), 'dragstart')

    // ws-2 是一条从 38 起的带，它自己承担的那 2px 落在 38..40
    fire(workspaceRow(container, 'ws-2'), 'dragover', 39)
    expect([...container.querySelectorAll('[data-wg-drop]')].map((element) => [
      element.getAttribute('data-wg-drop'),
      element.getAttribute('data-wg-dnd-region'),
    ])).toEqual([['before', 'workspaceBlock/ws-2']])
    await act(async () => root.unmount())
  })

  it('reads the band above the first row as dropping before it', async () => {
    // 段首那一行带着自己那段间距，指针落在里面仍读作「排到第一条之前」：
    // 上面没有哪一条能替它画，这一档因此由它自己给出
    const { container, root } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, 'ws-1'), 20, 38)
    band(workspaceRow(container, 'ws-2'), 58, 38)

    fire(workspaceRow(container, MUN_ID), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover', 21)

    expect([...container.querySelectorAll('[data-wg-drop]')].map((element) => [
      element.getAttribute('data-wg-drop'),
      element.getAttribute('data-wg-dnd-region'),
    ])).toEqual([['before', 'workspaceBlock/ws-1']])
    await act(async () => root.unmount())
  })

  it('keeps the seam off the row it is dragging', async () => {
    // 后一条正是被拖走的那一条时，线不能交给它：那一行画淡着（.rowDragging），
    // 线画上去会跟着一起淡下去，用户看到的是「这条线颜色不对」而不是「这里能放」。
    // 同一处缝因此留在前一条的下缘——位置一样，仍然是同一条线
    const { container, root } = await mount({ workspaceGroups: [] })
    band(workspaceRow(container, 'ws-1'), 0)
    band(workspaceRow(container, 'ws-2'), 20)

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover', 8)

    expect(countMarked(container)).toBe(1)
    expect(workspaceBlock(container, 'ws-1').getAttribute('data-wg-drop')).toBe('after')
    expect(workspaceBlock(container, 'ws-2').getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
  })

  it('puts the box on the group and the line on the member row it points at', async () => {
    // target 是 order 时，它的直接父容器响应 inside——用户指着组内某一行时，
    // 框说「放进这一组」，线说「排到这一条前后」，两件事同时成立
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: ['ws-1', 'ws-2'] },
      ],
    })
    band(workspaceRow(container, 'ws-1'), 0)

    fire(workspaceRow(container, MUN_ID), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover', 2)

    // 行自己只拿线；框落在它所属的那一块分组上
    expect(workspaceBlock(container, 'ws-1').getAttribute('data-wg-drop')).toBe('before')
    const boxes = [...container.querySelectorAll('[data-wg-drop="inside"]')]
    expect(boxes).toHaveLength(1)
    expect((boxes[0] as Element).contains(workspaceRow(container, 'ws-1'))).toBe(true)
    await act(async () => root.unmount())
  })

  it('offers a box on the ancestor row and a line on the neighbour at once', async () => {
    // 来源在 root 层、cwd 父工作区住在分组里，而它旁边还有一条并排的行：
    // 两条关系都要出来——框缩到祖先那一块，线与旁边的行谈位次
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: [PARENT_ID, SIBLING_CHILD_ID] },
      ],
    })
    band(workspaceRow(container, 'ws-1'), 0)

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(workspaceRow(container, PARENT_ID), 'dragover')

    const parentBlock = workspaceRow(container, PARENT_ID).closest('[data-wg-dnd-region]')
    expect(parentBlock?.getAttribute('data-wg-drop')).toBe('inside')
    await act(async () => root.unmount())
  })
})

describe('the real topology the user reported', () => {
  /**
   * 一份结构等价的中性改写：来源平铺在 root 层，目标是它要移进去的那个分组
   *
   * 分组里住着别的成员，且组内还有一个按 cwd 挂在它为子工作区的工作区——
   * 用户截图里正是这个形状，也是「框画不出来」最容易复发的场合
   */
  const TOPOLOGY = {
    workspaceGroups: [
      { id: 'wg-1', name: '分组甲', workspaceIds: ['ws-1', 'ws-2', 'ws-4'] },
    ],
  }

  it('shows a box when the pointer is on the group head', async () => {
    const { container, root } = await mount(TOPOLOGY)

    fire(workspaceRow(container, 'ws-5'), 'dragstart')
    fire(zone(container, 'virtualWorkspaceHead/wg-1')!, 'dragover')

    expect(container.querySelectorAll('[data-wg-drop]')).toHaveLength(1)
    await act(async () => root.unmount())
  })

  it('shows a box when the pointer is on a member row inside the group', async () => {
    // 指针停在组内某个成员行上时，两件事同时成立：
    // 框说「放进这一组」（那一行是这一片的成员），线说「排到这一行前后」
    const { container, root } = await mount(TOPOLOGY)

    fire(workspaceRow(container, 'ws-5'), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover')

    const group = zone(container, 'virtualWorkspaceHead/wg-1')!.closest('[data-wg-dnd-region]')
    expect(group?.getAttribute('data-wg-drop')).toBe('inside')
    const line = workspaceBlock(container, 'ws-1').getAttribute('data-wg-drop')
    expect(line === 'before' || line === 'after').toBe(true)
    await act(async () => root.unmount())
  })
})

describe('a source that sits at the root level', () => {
  it('draws a box on a virtual group it can be moved into', async () => {
    // root 层的工作区可以整个移进别的虚拟分组，那是 inside 关系，必须给框
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
      ],
    })
    // ws-2 平铺在 root 层，不在任何分组里
    const target = zone(container, 'virtualWorkspaceHead/wg-1')!

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(target, 'dragover')

    // 框画在整块分组上（组头与组体共用的那一块），不是只套住组头
    const marked = container.querySelectorAll('[data-wg-drop]')
    expect(marked).toHaveLength(1)
    expect((marked[0] as HTMLElement).getAttribute('data-wg-drop')).toBe('inside')
    expect((marked[0] as HTMLElement).contains(target)).toBe(true)
    fire(target, 'drop')
    await flush()
    expect(writes.moves).toEqual([['ws-2', 'wg-1']])
    await act(async () => root.unmount())
  })

  it('draws the same single box whether the pointer sits on the head or the body', async () => {
    // 组头与组体是同一份关系的两格：指针落在哪一格上，用户看到的都是同一件事
    // 各画一圈会被读成两个区域
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
      ],
    })

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(zone(container, 'virtualWorkspaceHead/wg-1')!, 'dragover')
    const onHead = [...container.querySelectorAll('[data-wg-drop]')].map((e) => e.getAttribute('data-wg-drop'))

    fire(zone(container, 'virtualWorkspaceBody/wg-1')!, 'dragover')
    const onBody = [...container.querySelectorAll('[data-wg-drop]')].map((e) => e.getAttribute('data-wg-drop'))

    expect(onHead).toEqual(['inside'])
    expect(onBody).toEqual(['inside'])
    await act(async () => root.unmount())
  })

  it('draws a box around the whole group body it can be moved into', async () => {
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
      ],
    })
    const body = zone(container, 'virtualWorkspaceBody/wg-1')!

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(body, 'dragover')

    const marked = container.querySelectorAll('[data-wg-drop]')
    expect(marked).toHaveLength(1)
    expect((marked[0] as HTMLElement).getAttribute('data-wg-drop')).toBe('inside')
    await act(async () => root.unmount())
  })
})

describe('the big box of a whole group', () => {
  it('draws one box around the whole group rather than only its head', async () => {
    // 组头与组体是同一份提交的两格，合并后应套住整块分组
    // 合并闸门曾把「组块体内还有工作区行」判成干扰，而分组非空时体内必然有行，
    // 于是圈永远退回组头那一小格——整块放入的框根本画不出来
    // 落点那个分组里必须有工作区：闸门误判正是「体内有行」时发生，空分组测不出来
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
        { id: 'wg-2', name: '工作区分组乙', workspaceIds: ['ws-2', 'ws-5'] },
      ],
    })

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(zone(container, 'virtualWorkspaceHead/wg-2')!, 'dragover')

    const marked = container.querySelectorAll('[data-wg-drop]')
    expect(marked).toHaveLength(1)
    // 画上的那一格必须罩住它的组体，而不只是组头
    const box = marked[0] as HTMLElement
    expect(box.getAttribute('data-wg-drop')).toBe('inside')
    expect(box.contains(zone(container, 'virtualWorkspaceBody/wg-2'))).toBe(true)
    await act(async () => root.unmount())
  })
})

describe('a row that is not a container', () => {
  it('draws the line alone when the row it points at lives in the same group', async () => {
    // 用户截图里的那一格：MunNovel 与 checkin 同在 novel 组，拖 MunNovel 去和 checkin 换位。
    // checkin 的 cwd 父工作区住在别的组里，与这次拖拽毫无关系——
    // 那一块绝不能因为「checkin 有父工作区」就被高亮起来
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: [PARENT_ID, SIBLING_CHILD_ID] },
        { id: 'wg-2', name: '分组乙', workspaceIds: [CHILD_ID, MUN_ID] },
      ],
    })
    band(workspaceRow(container, CHILD_ID), 100, 20)

    fire(workspaceRow(container, MUN_ID), 'dragstart')
    fire(workspaceRow(container, CHILD_ID), 'dragover', 102)

    // 只有一条线：两者已在同一片，排完还在那一片里
    const marked = [...container.querySelectorAll('[data-wg-drop]')]
    expect(marked).toHaveLength(1)
    const line = workspaceBlock(container, CHILD_ID).getAttribute('data-wg-drop')
    expect(line).toBe('before')
    // 无关的那一块（checkin 的 cwd 父工作区所在的分组）一个标记都没有
    const unrelated = zone(container, 'virtualWorkspaceHead/wg-1')!.closest('[data-wg-dnd-region]')
    expect(unrelated?.getAttribute('data-wg-drop')).toBeNull()
    await act(async () => root.unmount())
  })

  it('offers a line on a row of another virtual group it can move into', async () => {
    // 用户截图里的那一格：来源在 dsh plugins 组里，novel 组此刻只有一条成员。
    // 界面上下它们隔得很远，但「移到那一行前后」是合法落点——那也是移进 novel 组的入口
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: ['ws-1', 'ws-2'] },
        // 这一组此刻只有一条成员，且它与来源没有 cwd 关系——正是截图里的 novel 组
        { id: 'wg-2', name: '分组乙', workspaceIds: [MUN_ID] },
      ],
    })
    band(workspaceRow(container, MUN_ID), 100, 20)

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(workspaceRow(container, MUN_ID), 'dragover', 102)

    // 线落在目标那一块上，框落在目标所在的分组上：指着一行说「放这儿」就是这两件事
    expect(workspaceBlock(container, MUN_ID).getAttribute('data-wg-drop')).toBe('before')
    const group = zone(container, 'virtualWorkspaceHead/wg-2')!.closest('[data-wg-dnd-region]')
    expect(group?.getAttribute('data-wg-drop')).toBe('inside')

    fire(workspaceRow(container, MUN_ID), 'drop', 102)
    await flush()
    expect(writes.moves).toEqual([['ws-1', 'wg-2']])
    await act(async () => root.unmount())
  })

  it('never marks a member row as a container, only the slice around it', async () => {
    // 一条工作区行不是容器：落上去时**框**绝不描它自己，框落在它所在的那一片上。
    // 线是另一件事——那一行可以作位次参照，因此它自己会带上 before / after
    const { container, root } = await mount()

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover')

    const marked = [...container.querySelectorAll('[data-wg-drop]')]
    const boxes = marked.filter((element) => element.getAttribute('data-wg-drop') === 'inside')
    expect(boxes).toHaveLength(1)
    // 框套住的那一块把这一行含在内，且不是它自己
    expect(boxes[0]).not.toBe(workspaceRow(container, 'ws-1'))
    expect(boxes[0]?.contains(workspaceRow(container, 'ws-1'))).toBe(true)
    await act(async () => root.unmount())
  })

  it('never draws a box on a row of a group the source cannot enter', async () => {
    // 分属两个虚拟分组的工作区之间既无 cwd 祖先关系，也不该被读成「放进它体内」。
    // 那一行可能作为位次参照（同层兄弟）给线，但绝不能给它描框
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '分组甲', workspaceIds: ['ws-1'] },
        { id: 'wg-2', name: '分组乙', workspaceIds: ['ws-2'] },
      ],
    })

    fire(workspaceRow(container, 'ws-2'), 'dragstart')
    fire(workspaceRow(container, 'ws-1'), 'dragover')

    expect(workspaceRow(container, 'ws-1').getAttribute('data-wg-drop')).not.toBe('inside')
    await act(async () => root.unmount())
  })

  it('draws a line rather than a box on a root-level row', async () => {
    // 根节点那层的平铺行与来源没有祖先关系：来源进不了它体内，只能与它谈先后
    // 因此落上去画线、不画框——框说的是「放进这一片」，线说的是「排在这一行前后」
    const { container, root } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
      ],
    })
    // ws-2 不在任何分组里，因此它平铺在根节点那一层
    const target = workspaceRow(container, 'ws-2')

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    fire(target, 'dragover')

    const marker = workspaceBlock(container, 'ws-2').getAttribute('data-wg-drop')
    expect(['before', 'after']).toContain(marker)
    await act(async () => root.unmount())
  })

  it('moves a workspace into the virtual group of its cwd ancestor', async () => {
    // 来源按 cwd 已经是祖先工作区的子工作区，但它此刻平铺在根节点那一层：
    // 两者不在同一个虚拟分组里，渲染层因此没有把它嵌进去。
    // 落到祖先体内是**真的会改变归属**的一次投放——它把来源移进祖先所在的那一片，
    // 移进去之后 cwd 关系才在界面上成立
    const { container, root, writes } = await mount({
      workspaceGroups: [{ id: 'wg-1', name: '工作区分组甲', workspaceIds: [PARENT_ID] }],
    })
    const body = zone(container, 'workspaceBody/ws-9')!

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(body, 'dragover')
    fire(body, 'drop')
    await flush()

    expect(writes.moves).toEqual([[CHILD_ID, 'wg-1']])
    await act(async () => root.unmount())
  })

  it('never draws an ordering line on the row of an ancestor workspace', async () => {
    // 推导出来的 cwd 父工作区在用户眼里就是容器，与虚拟分组同类
    // 一条行能承接放入，它在这次拖拽里就只能是容器，不能再是同层排序的参照行——
    // 一个工作区不会既被放进某个容器、又与那个容器的行谈先后
    //
    // ws-4 按 cwd 本来就住在 ws-9 体内，落回父工作区是原地投放，因此这一次不写
    // 这里钉住的是读法：那一条行上画不出 before / after 的线
    const { container, root, writes } = await mount()

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    fire(workspaceRow(container, PARENT_ID), 'dragover')
    const parentRow = workspaceRow(container, PARENT_ID)
    const marker = parentRow.getAttribute('data-wg-drop')

    expect(['before', 'after']).not.toContain(marker)
    fire(parentRow, 'drop')
    await flush()
    expect(writes.reorders).toEqual([])
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

  it('moves the workspace into the virtual group that holds the target', async () => {
    // 来源与目标分属两个虚拟分组：一条归属只在两边同处一片时才生效，
    // 因此「拖进那一片里的分组」这一手要先把来源挪过去
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-4'] },
        { id: 'wg-2', name: '工作区分组乙', workspaceIds: ['ws-9'] },
      ],
    })

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    const head = zone(container, 'groupHead/ws-9/group-a')!
    fire(head, 'dragover')
    fire(head, 'drop')
    await flush()

    expect(writes.moves).toEqual([['ws-4', 'wg-2']])
    expect(writes.nests).toEqual([['ws-4', 'ws-9', 'group-a']])
    await act(async () => root.unmount())
  })

  it('moves the workspace out to the root when the target sits at the root', async () => {
    // 目标父工作区不在任何虚拟分组里：进它的分组就等于先回到根节点那一层
    const { container, root, writes } = await mount({
      workspaceGroups: [{ id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-4'] }],
    })

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    const head = zone(container, 'groupHead/ws-9/group-a')!
    fire(head, 'dragover')
    fire(head, 'drop')
    await flush()

    expect(writes.moves).toEqual([['ws-4', '']])
    expect(writes.nests).toEqual([['ws-4', 'ws-9', 'group-a']])
    await act(async () => root.unmount())
  })

  it('shows the new placement after a move that writes only the group', async () => {
    // 写入回的是整份快照，界面按它重渲染。只挪虚拟分组的那一手若拿闭包里那份旧快照
    // 去替换状态，改动其实已落盘，界面却停在原处——读起来像「拖了没反应」
    const { container, root, writes } = await mount({
      workspaceGroups: [
        { id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-1'] },
        { id: 'wg-2', name: '工作区分组乙', workspaceIds: [] },
      ],
      next: (workspaceId) =>
        snapshot({
          byWorkspace: { [PARENT_ID]: [{ id: 'group-a', name: '分组甲', sessionIds: [] }] },
          workspaceGroups: [
            { id: 'wg-1', name: '工作区分组甲', workspaceIds: [] },
            { id: 'wg-2', name: '工作区分组乙', workspaceIds: [workspaceId] },
          ],
        }),
    })

    fire(workspaceRow(container, 'ws-1'), 'dragstart')
    const head = zone(container, 'virtualWorkspaceHead/wg-2')!
    fire(head, 'dragover')
    fire(head, 'drop')
    await flush()

    expect(writes.moves).toEqual([['ws-1', 'wg-2']])
    expect(writes.nests).toEqual([])
    const target = zone(container, 'virtualWorkspaceBody/wg-2')!
    expect(target.contains(workspaceBlock(container, 'ws-1'))).toBe(true)
    await act(async () => root.unmount())
  })

  it('writes no move when both sides already share a virtual group', async () => {
    // 同处一片时不必挪，挪了反而是一次多余写入
    const { container, root, writes } = await mount({
      workspaceGroups: [{ id: 'wg-1', name: '工作区分组甲', workspaceIds: ['ws-4', 'ws-9'] }],
    })

    fire(workspaceRow(container, CHILD_ID), 'dragstart')
    const head = zone(container, 'groupHead/ws-9/group-a')!
    fire(head, 'dragover')
    fire(head, 'drop')
    await flush()

    expect(writes.moves).toEqual([])
    expect(writes.nests).toEqual([['ws-4', 'ws-9', 'group-a']])
    await act(async () => root.unmount())
  })
})
