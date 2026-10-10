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
 * 会话折叠的真实 DOM
 *
 * 「一个展示范围内只露几条」「被收起的那些由溢出按钮展开」只能按真实 DOM 断言
 * 额度算错时界面只是「行数不对」，不会有任何报错
 *
 * 会话的时间戳都相对用例启动那一刻生成：判定窗口是 3 天，写死的绝对时刻会随时间流逝
 * 让用例从「全部最近用过」变成「一条都没用过」
 */

const HOUR = 60 * 60 * 1000

/** 用例启动那一刻，fixture 的会话时间戳都以它为基准 */
const NOW = Date.now()

/**
 * 造一份会话摘要，`ageHours` 决定它算不算「最近用过」
 *
 * 取小时而不是天：判定窗口是 3 天，按天取整会让边缘那几条正好压在窗口线上
 * 用例跑起来的时刻比 `NOW` 晚一点，压线的那条就从「最近用过」翻成「太久没用」
 * @param id - 会话 id
 * @param ageHours - 距今多少小时没被用过
 */
function summary(id: string, ageHours: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    displayTitle: `会话 ${id}`,
    running: false,
    blank: false,
    retainedBy: {},
    updatedAt: NOW - ageHours * HOUR,
    ...extra,
  }
}

/** 造一条明确落在判定窗口之外的会话摘要 */
function staleSummary(id: string, extra: Record<string, unknown> = {}) {
  // 4 天：离 3 天的窗口线还差一天，不会因为用例跑得久一点就翻面
  return summary(id, 4 * 24, extra)
}

/** 工作区里那 8 条会话，都在窗口内：`s0` 最近，`s7` 最旧 */
const WORKSPACE_IDS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7']

/** 会话分组里那 6 条会话，同样都在窗口内 */
const GROUP_IDS = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5']

const ALL_IDS = [...WORKSPACE_IDS, ...GROUP_IDS]

const SUMMARIES: Record<string, unknown> = Object.fromEntries(
  ALL_IDS.map((id, index) => {
    // 两个范围各自从 1 小时前起算，组内那几条与工作区那几条的新旧因此互不相干
    const ageHours = index < WORKSPACE_IDS.length
      ? index + 1
      : index - WORKSPACE_IDS.length + 1
    return [id, summary(id, ageHours)]
  }),
)

/** 一个工作区，会话 id 与时间戳由调用方给定 */
interface OwnedSessions {
  /** 该工作区名下的会话 id，顺序即列表序 */
  owned: readonly string[]
  /**
   * 不属于任何工作区的会话 id，落进末尾的「未分组」桶
   *
   * 会话快照里必须有它们，工作区的 `sessionIds` 里必须没有，隐式桶才会出现
   */
  stray?: readonly string[]
  /** 会话摘要，按 id 索引 */
  byId: Record<string, unknown>
  /** 注册表全局的置顶集合 */
  pinned?: readonly string[]
}

/**
 * 工作区快照的选择器
 *
 * 快照建在工厂内、每次返回同一份引用：选择器每次渲染都会被调用
 * 每次新建对象会让订阅者判定为变过，渲染因此无限循环
 */
function workspaceSource(sessions: OwnedSessions): WorkspaceGroupsProps['useWorkspaces'] {
  const state = {
    items: [
      {
        workspaceId: 'w1',
        path: '/tmp/w1',
        title: 'W1',
        sessionIds: [...sessions.owned],
        createdAt: new Date(2026, 0, 1).toISOString(),
        updatedAt: new Date(2026, 0, 1).toISOString(),
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: sessions.pinned ?? [],
    phase: 'ready',
  }
  return ((select: (s: unknown) => unknown) => select(state)) as never
}

/** 会话快照的选择器，与 {@link workspaceSource} 同一份 id 表 */
function sessionSource(sessions: OwnedSessions): WorkspaceGroupsProps['useSessions'] {
  const state = {
    ids: [...sessions.owned, ...(sessions.stray ?? [])],
    byId: sessions.byId,
    phase: 'ready',
  }
  return ((select: (s: unknown) => unknown) => select(state)) as never
}

/** 本用例两个展示范围都超出额度时的那份会话集合 */
function defaultSessions(): OwnedSessions {
  const byId: Record<string, unknown> = {}
  for (const id of ALL_IDS) byId[id] = SUMMARIES[id]
  return { owned: ALL_IDS, byId }
}

/** 两个展示范围都超出额度时用的注入面：一个工作区的未归组会话 + 它的一个会话分组 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const sessions = defaultSessions()
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: workspaceSource(sessions),
    useSessions: sessionSource(sessions),
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    // 8 条未归组会话都留在工作区里，其中的 g 开头那几条放进一个会话分组
    loadGroups: async () =>
      snapshot({
        byWorkspace: {
          w1: [{ id: 'sg1', name: '会话分组', sessionIds: GROUP_IDS }],
        },
      }),
    onReady: () => () => {},
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
      createWorkspace: async (path: string) => ({ workspaceId: `w-${path}`, title: path }),
      startSession: () => {},
      occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
      labels: officialAddLabels(workspaceTranslate()),
    }),
    ...overrides,
  }
}

/** 挂载区域并等分组元数据落地 */
async function mount(
  overrides: Partial<WorkspaceGroupsProps> = {},
): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(overrides)))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root }
}

afterEach(() => {
  document.body.replaceChildren()
})

/** 一个展示范围的会话行标题，按渲染顺序 */
function titles(scope: Element): string[] {
  return Array.from(scope.querySelectorAll('.row .rowTitle')).map((node) => node.textContent ?? '')
}

/** 未归组那一段（工作区体内没有分组头的那个 `.sessions`） */
function looseScope(container: HTMLElement): Element {
  const scopes = Array.from(container.querySelectorAll('.workspaceBody > .sessions'))
  const found = scopes.find((scope) => scope.querySelector('.row'))
  if (found === undefined) throw new Error('no loose session scope rendered')
  return found
}

/** 会话分组那一段 */
function groupScope(container: HTMLElement): Element {
  const found = container.querySelector('.groupBody > .sessions')
  if (found === null) throw new Error('no session group scope rendered')
  return found
}

/**
 * 末尾「未分组」桶那一段
 *
 * 它落在最后一个工作区块里：那些会话不属于任何工作区，根节点上给它们一个与工作区同形的容器
 */
function strayScope(container: HTMLElement): Element {
  const scopes = container.querySelectorAll('.workspaceBody > .sessions')
  const found = scopes[scopes.length - 1]
  if (found === undefined) throw new Error('no ungrouped scope rendered')
  return found
}

/** 一个展示范围内的溢出按钮，缺省表示该范围没有收起任何行 */
function overflowButton(scope: Element): HTMLButtonElement | null {
  return scope.querySelector<HTMLButtonElement>('.sessionOverflow')
}

describe('collapsed session rows', () => {
  it('shows the most recent five sessions of a scope by default', async () => {
    const { container, root } = await mount()

    // 8 条都在 3 天内用过，上限因此是 5 条
    expect(titles(looseScope(container))).toEqual([
      '会话 s0',
      '会话 s1',
      '会话 s2',
      '会话 s3',
      '会话 s4',
    ])
    await act(async () => root.unmount())
  })

  it('reports the collapsed count on the overflow button', async () => {
    const { container, root } = await mount()

    const button = overflowButton(looseScope(container))
    // 文案取官方 `sessions.expand`，条数是这一档算出来的被收起条数
    expect(button?.textContent).toBe('展开其余 3 个会话')
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    await act(async () => root.unmount())
  })

  it('shows every row and switches the button to collapse once expanded', async () => {
    const { container, root } = await mount()

    await act(async () => overflowButton(looseScope(container))?.click())

    expect(titles(looseScope(container))).toEqual(WORKSPACE_IDS.map((id) => `会话 ${id}`))
    const button = overflowButton(looseScope(container))
    expect(button?.textContent).toBe('收起')
    expect(button?.getAttribute('aria-expanded')).toBe('true')
    await act(async () => root.unmount())
  })

  it('collapses the scope again from the same button', async () => {
    const { container, root } = await mount()

    await act(async () => overflowButton(looseScope(container))?.click())
    await act(async () => overflowButton(looseScope(container))?.click())

    expect(titles(looseScope(container))).toHaveLength(5)
    expect(overflowButton(looseScope(container))?.textContent).toBe('展开其余 3 个会话')
    await act(async () => root.unmount())
  })

  it('keeps the two scopes of one workspace independent', async () => {
    const { container, root } = await mount()

    // 展开工作区那一段，会话分组那一段仍是折叠态
    await act(async () => overflowButton(looseScope(container))?.click())

    expect(titles(looseScope(container))).toHaveLength(8)
    expect(titles(groupScope(container))).toEqual([
      '会话 g0',
      '会话 g1',
      '会话 g2',
      '会话 g3',
      '会话 g4',
    ])
    expect(overflowButton(groupScope(container))?.textContent).toBe('展开其余 1 个会话')
    await act(async () => root.unmount())
  })

  it('puts the overflow button directly inside the scope it belongs to', async () => {
    // 按钮是 .sessions 的直接子项：它靠那层的相邻兄弟规则拿间距，也靠那层的按容器选择器拿缩进
    // 多包一层包装会让两条规则一起失配，界面上只表现为「按钮位置不对」，不会有报错
    const { container, root } = await mount()

    const button = overflowButton(looseScope(container))
    expect(button?.parentElement).toBe(looseScope(container))
    expect(button?.classList.contains('sessionOverflow')).toBe(true)
    await act(async () => root.unmount())
  })

  it('folds the ungrouped bucket by the same rule as a workspace', async () => {
    // 末尾那个隐式容器也是独立的展示范围：会话快照里有、任何工作区都不认领的会话落在那里
    const stray = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5']
    const sessions: OwnedSessions = {
      owned: ['a0', 'a1'],
      stray,
      byId: {
        ...Object.fromEntries(
          ['a0', 'a1'].map((id, index) => [id, summary(id, index + 1)]),
        ),
        ...Object.fromEntries(stray.map((id) => [id, staleSummary(id)])),
      },
    }
    const { container, root } = await mount({
      loadGroups: async () => snapshot(),
      useSessions: sessionSource(sessions),
      useWorkspaces: workspaceSource(sessions),
    })

    // 桶里 6 条都超出窗口，最低露出最近 3 条
    expect(titles(strayScope(container))).toEqual(['会话 u0', '会话 u1', '会话 u2'])
    expect(overflowButton(strayScope(container))?.textContent).toBe('展开其余 3 个会话')
    await act(async () => overflowButton(strayScope(container))?.click())
    expect(titles(strayScope(container))).toHaveLength(6)
    await act(async () => root.unmount())
  })

  it('returns to the collapsed state after the workspace is collapsed and reopened', async () => {
    const { container, root } = await mount()
    const head = container.querySelector<HTMLElement>('.workspaceHead')
    if (head === null) throw new Error('no workspace head rendered')

    await act(async () => overflowButton(looseScope(container))?.click())
    expect(titles(looseScope(container))).toHaveLength(8)

    // 收起再展开工作区：上一轮的「展开其余 N 个」不跟着回来
    await act(async () => head.click())
    await act(async () => head.click())

    expect(titles(looseScope(container))).toHaveLength(5)
    expect(overflowButton(looseScope(container))?.textContent).toBe('展开其余 3 个会话')
    await act(async () => root.unmount())
  })

  it('returns to the collapsed state once its own session group is collapsed', async () => {
    const { container, root } = await mount()
    const groupHead = container.querySelector<HTMLElement>('.groupHead')
    if (groupHead === null) throw new Error('no session group head rendered')

    await act(async () => overflowButton(groupScope(container))?.click())
    expect(titles(groupScope(container))).toHaveLength(6)

    await act(async () => groupHead.click())
    await act(async () => groupHead.click())

    expect(titles(groupScope(container))).toHaveLength(5)
    await act(async () => root.unmount())
  })

  it('renders no overflow button while the scope fits inside the limit', async () => {
    const few = ['f0', 'f1', 'f2', 'f3']
    const sessions: OwnedSessions = {
      owned: few,
      byId: Object.fromEntries(few.map((id, index) => [id, summary(id, index + 1)])),
    }
    const { container, root } = await mount({
      loadGroups: async () => snapshot(),
      useSessions: sessionSource(sessions),
      useWorkspaces: workspaceSource(sessions),
    })

    // 4 条会话，上限 5 条：一条也不多，整条按钮不渲染
    expect(overflowButton(looseScope(container))).toBeNull()
    expect(titles(looseScope(container))).toHaveLength(4)
    await act(async () => root.unmount())
  })

  it('collapses back to the floor while every session is older than the window', async () => {
    const old = ['o0', 'o1', 'o2', 'o3', 'o4']
    const sessions: OwnedSessions = {
      owned: old,
      byId: Object.fromEntries(old.map((id) => [id, staleSummary(id)])),
    }
    const { container, root } = await mount({
      loadGroups: async () => snapshot(),
      useSessions: sessionSource(sessions),
      useWorkspaces: workspaceSource(sessions),
    })

    // 3 天内一条都没用过，最低仍露出最近 3 条
    expect(titles(looseScope(container))).toEqual(['会话 o0', '会话 o1', '会话 o2'])
    expect(overflowButton(looseScope(container))?.textContent).toBe('展开其余 2 个会话')
    await act(async () => root.unmount())
  })

  it('always shows every pinned session while the display mode includes groups', async () => {
    // 7 条置顶：超过 5 条上限时整段置顶照常全部露出
    const pinned = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const sessions: OwnedSessions = {
      owned: pinned,
      byId: Object.fromEntries(pinned.map((id) => [id, staleSummary(id)])),
      pinned,
    }
    const store = viewModeStoreStub()
    store.setPinned({ scope: 'inline' })
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      loadGroups: async () => snapshot(),
      useSessions: sessionSource(sessions),
      useWorkspaces: workspaceSource(sessions),
    })

    expect(titles(looseScope(container))).toEqual(pinned.map((id) => `会话 ${id}`))
    expect(overflowButton(looseScope(container))).toBeNull()
    await act(async () => root.unmount())
  })

  it('falls back to the plain rule while the pinned list is empty in the inline mode', async () => {
    // 就地置顶档下一条都没置顶：容器交出的名单是空集，折叠按普通行算
    // 「空名单」在这里只有一种含义（没有始终展示的行），不再兼任「不在该档」
    const all = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']
    const sessions: OwnedSessions = {
      owned: all,
      byId: Object.fromEntries(all.map((id) => [id, staleSummary(id)])),
    }
    const store = viewModeStoreStub()
    store.setPinned({ scope: 'inline' })
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      loadGroups: async () => snapshot(),
      useSessions: sessionSource(sessions),
      useWorkspaces: workspaceSource(sessions),
    })

    // 一条都没置顶，因此仍按最低 3 条折叠
    expect(titles(looseScope(container))).toEqual(['会话 n0', '会话 n1', '会话 n2'])
    expect(overflowButton(looseScope(container))?.textContent).toBe('展开其余 3 个会话')
    await act(async () => root.unmount())
  })

  it('hides a pinned session while the display mode is pinned-area only', async () => {
    // 「仅置顶区」档下置顶行不享受豁免，仍按普通行折叠；它在上方置顶区照常可见
    const pinned = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']
    const sessions: OwnedSessions = {
      owned: pinned,
      byId: Object.fromEntries(pinned.map((id) => [id, staleSummary(id)])),
      pinned,
    }
    const { container, root } = await mount({
      loadGroups: async () => snapshot(),
      useSessions: sessionSource(sessions),
      useWorkspaces: workspaceSource(sessions),
    })

    expect(titles(looseScope(container))).toEqual(['会话 p0', '会话 p1', '会话 p2'])
    // 被折掉的置顶会话仍在上方置顶区，一条也没丢
    expect(container.querySelectorAll('.pinScroll > .row')).toHaveLength(pinned.length)
    await act(async () => root.unmount())
  })
})
