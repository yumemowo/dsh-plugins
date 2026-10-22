// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { band, fire, flush, mountRegion, regionProps, row, summary, zone } from './support/dndDom.ts'
import { snapshot } from './snapshot-stub.ts'

/**
 * 分组排序拖拽的真实 DOM
 *
 * 落点算错、标记画错、把一次相邻空操作也写盘，界面上都不会报错
 * 只表现为「拖过去没反应」或「松手后顺序跳了一下」
 * 因此逐条断言的是交给宿主的排序方法收到了什么实参、落点标记画在哪个元素上
 *
 * jsdom 不实现 `DataTransfer`（用例里用最小替身），也不做布局（`getBoundingClientRect()` 恒为全零）
 * 因此命中事件目标向上找标记元素，前后半则由用例显式替身参照行的矩形带
 *
 * 造事件、造矩形带、挂载区域这些每个 DOM 测试都要的东西在 `./support/dndDom.ts`
 */

/** 一个工作区里的会话分组 */
const SESSION_GROUPS = ['group-a', 'group-b', 'group-c']

/** 根节点上的工作区分组，最后一个空着：空分组照样可以排序 */
const WORKSPACE_GROUPS = ['wg-1', 'wg-2', 'wg-3']

/** 分组「group-a」里的会话，用来验证拖会话落到分组头上仍读作归组 */
const SESSION_IDS = ['session-1']

/** 区域 props，记下收到的两种排序调用与会话归组调用 */
function props(
  orders: string[][],
  moves: string[][],
  newSessionId: string | undefined = undefined,
): ReturnType<typeof regionProps> {
  const created = new Date(2026, 0, 1).toISOString()
  // 三份读数都在这里建好、每次渲染交出同一份引用：否则下游的 memo 与 effect 依赖每渲染都换引用
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
    byId: Object.fromEntries(SESSION_IDS.map((id) => [id, summary(id)])),
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
  return regionProps({
    useWorkspaces: ((select: (s: unknown) => unknown) => select(workspaceState)) as never,
    useSessions: ((select: (s: unknown) => unknown) => select(sessionState)) as never,
    startSession: async () => newSessionId,
    loadGroups: async () => stored,
    createGroup: async () => stored,
    renameGroup: async () => stored,
    deleteGroup: async () => stored,
    moveSession: async (
      workspaceId: string,
      sessionId: string,
      groupId: string,
      beforeSessionId?: string,
    ) => {
      // 缺席的锚点在数组里补成空串：`toEqual` 比不出数组元素的「缺席」
      moves.push([workspaceId, sessionId, groupId, beforeSessionId ?? ''])
      return stored
    },
    setSegmentOrder: async () => stored,
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
    // 这一组用例只验排序，其余写入不换快照
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
  })
}

/** 挂载区域并等分组元数据落地 */
async function mount(
  options: { newSessionId?: string } = {},
): Promise<{
  container: HTMLElement
  root: Awaited<ReturnType<typeof mountRegion>>['root']
  orders: string[][]
  moves: string[][]
}> {
  const orders: string[][] = []
  const moves: string[][] = []
  const { container, root } = await mountRegion(props(orders, moves, options.newSessionId))
  return { container, root, orders, moves }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('dragging a session group head', () => {
  it('marks the anchor head it was dropped on', async () => {
    const { container, root } = await mount()
    const target = zone(container, 'groupHead/ws-1/group-c')
    band(target, 20)

    fire(row(container, 'group-a'), 'dragstart')
    fire(target, 'dragover', 0)

    // 线跨整块画在分组头所在的那一块上，而不是缩到组头那一行：
    // 组头只是这一片的标题行，贴着它画会读成「落点只覆盖那一行」
    const block = target.closest('[data-wg-dnd-region]')
    expect(block?.getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })

  it('draws one line for a seam from either side', async () => {
    // 「排到 group-a 之后」与「排到 group-b 之前」是同一处空白，读数必须逐字相同：
    // 同一个标记、画在同一个元素上，用户看不出自己是从哪一侧靠过来的
    const { container, root } = await mount()
    const above = zone(container, 'groupHead/ws-1/group-a')
    const below = zone(container, 'groupHead/ws-1/group-b')
    band(above, -20)
    band(below, 20)

    fire(row(container, 'group-c'), 'dragstart')

    const readings: { mark: string | null; on: string | null }[] = []
    for (const target of [above, below]) {
      fire(target, 'dragover', 0)
      const marked = [...container.querySelectorAll('[data-wg-drop]')]
      expect(marked).toHaveLength(1)
      readings.push({
        mark: marked[0]?.getAttribute('data-wg-drop') ?? null,
        on: marked[0]?.getAttribute('data-wg-dnd-region') ?? null,
      })
    }

    expect(readings[0]).toEqual({ mark: 'before', on: 'sessionGroupBlock/ws-1/group-b' })
    expect(readings[0]).toEqual(readings[1])
    await act(async () => root.unmount())
  })

  it('commits the anchor of the group it was dropped above', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'groupHead/ws-1/group-c')
    band(target, 20)

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
    band(target, -20)

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
    band(target, 20)

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

    expect(moves).toEqual([['ws-1', 'session-1', 'group-b', '']])
    expect(orders).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('dragging a workspace group head', () => {
  it('marks the anchor head it was dropped on', async () => {
    const { container, root } = await mount()
    const target = zone(container, 'virtualWorkspaceHead/wg-3')
    band(target, 20)

    fire(row(container, 'wg-1'), 'dragstart')
    fire(target, 'dragover', 0)

    // 同上一处：线画在整个虚拟分组那一块上，不缩到组头那一行
    const block = target.closest('[data-wg-dnd-region]')
    expect(block?.getAttribute('data-wg-drop')).toBe('before')
    await act(async () => root.unmount())
  })

  it('commits the anchor of the workspace group it was dropped above', async () => {
    const { container, root, orders } = await mount()
    const target = zone(container, 'virtualWorkspaceHead/wg-3')
    band(target, 20)

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
    band(target, -20)

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
    band(target, 20)

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

describe('placing a newly created session', () => {
  /**
   * 找一个 `+` 新建入口
   * @param container - 挂载容器
   * @param label - 无障碍标签
   */
  function plusButton(container: HTMLElement, label: string): HTMLButtonElement {
    const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (found === null) throw new Error(`no create button for "${label}"`)
    return found
  }

  it('places the new session into the group whose plus was used', async () => {
    // 会话在新段里的位置由默认序决定，因此带的是归属而不是位次
    const { container, root, moves } = await mount({ newSessionId: 'session-9' })

    await act(async () => plusButton(container, '在“分组 group-a”中新建会话').click())
    await flush()

    expect(moves).toEqual([['ws-1', 'session-9', 'group-a', '']])
    await act(async () => root.unmount())
  })

  it('leaves the new session ungrouped when the workspace row created it', async () => {
    // 工作区行的 `+` 归入未归组那一段
    const { container, root, moves } = await mount({ newSessionId: 'session-9' })

    await act(async () => plusButton(container, '在“ws-1”中新建会话').click())
    await flush()

    expect(moves).toEqual([['ws-1', 'session-9', '', '']])
    await act(async () => root.unmount())
  })

  it('skips the placement when a newer navigation superseded this creation', async () => {
    // 被取代的那次新建不打开会话，也就不必再摆它的归属
    const { container, root, moves } = await mount()

    await act(async () => plusButton(container, '在“分组 group-a”中新建会话').click())
    await flush()

    expect(moves).toEqual([])
    await act(async () => root.unmount())
  })
})
