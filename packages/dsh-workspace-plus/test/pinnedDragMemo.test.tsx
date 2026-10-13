// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { SessionRowItemProps } from '../src/client/views/SessionRowItem.tsx'

/**
 * 置顶行拖拽计划的身份稳定性
 *
 * 行级 `memo` 按引用比对 props，而置顶段的顺序每次渲染都是一份新数组
 * 计划构造器若把它列进依赖列，构造器每渲染换一次引用
 * 进到 `SessionRowItem` 的 `dragPlan` 也随之换，整片置顶行的 memo 因此整片失效
 *
 * 拖拽期间零次重渲染是这一层的目标，而拖拽之外的每次活动都会重渲染整片区域
 * 这条代价因此只能靠探针量出来：界面上没有任何可观察的症状
 *
 * 这里把条目组件换成只记录 props 的替身，逐次渲染比对那一格的身份
 */

/**
 * 逐行记下的读数，每轮渲染前清空
 *
 * 同一个会话在置顶区与工作区列表里各渲染一行，两行都会经过这个替身
 * 拿到计划的那一行才是置顶区里的行：列表里的行只从归组上下文取计划，这一格是空的
 */
const seen: { id: string; plan: unknown }[] = []

vi.mock('../src/client/views/SessionRowItem.tsx', () => ({
  SessionRowItem: (props: SessionRowItemProps): React.ReactElement => {
    seen.push({ id: props.row.id, plan: props.dragPlan })
    return React.createElement('div', { 'data-wg-probe': props.row.id })
  },
}))

const { WorkspaceGroupsRegion } = await import('../src/client/views/WorkspaceGroupsRegion.tsx')
type RegionProps = Parameters<typeof WorkspaceGroupsRegion>[0]

const { officialAddLabels, officialSessionLabels, timeLabel } = await import(
  '../src/client/official.ts'
)
const { regionTranslate, sidebarTranslate, workspaceTranslate } = await import('./locale-stub.ts')
const { snapshot } = await import('./snapshot-stub.ts')
const { storeViewModeProps, viewModeStoreStub } = await import('./viewMode-stub.ts')

const h = React.createElement

/** 置顶集合，两条以便顺序本身也有变化余地 */
const PINNED_IDS = ['session-1', 'session-2']

const ALL_IDS = [...PINNED_IDS, 'session-3']

/** 造一份会话摘要 */
function summary(id: string): Record<string, unknown> {
  return {
    id,
    displayTitle: `会话 ${id}`,
    running: false,
    blank: false,
    retainedBy: {},
    updatedAt: 1_000,
  }
}

/** 工作区快照，模块级建好、每次返回同一份引用 */
const WORKSPACES = {
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
  pinnedSessionIds: PINNED_IDS,
  phase: 'ready',
}

/** 会话快照，`current` 那一格落成会话自己的保留计数 */
function sessionState(current?: string): Record<string, unknown> {
  const byId: Record<string, unknown> = {}
  for (const id of ALL_IDS) {
    byId[id] = { ...summary(id), retainedBy: id === current ? { mainView: 1 } : {} }
  }
  return { ids: ALL_IDS, byId, phase: 'ready' }
}

/**
 * 区域 props 里身份稳定的那一部分
 *
 * 生产侧的动作面由插槽的 `inject` 交出，渲染器把它的结果缓存整个注册周期
 * 因此 `setSegmentOrder` 这类入口跨渲染是同一个引用，探针必须照同一份形状搭
 * 每次渲染都新建一份动作面会引入生产里不存在的身份变化，量出来的就不是这条机制
 */
const BASE = {
  wide: true as const,
  expandSidebar: () => {},
  useWorkspaces: ((select: (s: unknown) => unknown) => select(WORKSPACES)) as never,
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
} satisfies Partial<RegionProps>

/** 区域 props，动作面取模块级那一份，只有会话快照按实参现算 */
function props(current?: string): RegionProps {
  return { ...BASE, useSessions: ((select: (s: unknown) => unknown) => select(sessionState(current))) as never }
}

/** 上一轮渲染里置顶行拿到的计划，按会话 id 索引 */
function pinnedPlans(): Map<string, unknown> {
  return new Map(
    seen
      .filter((entry) => typeof entry.plan === 'function' && PINNED_IDS.includes(entry.id))
      .map((entry) => [entry.id, entry.plan]),
  )
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the identity of the pinned drag plan', () => {
  it('keeps the plan builder stable across an unrelated re-render', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => root.render(h(WorkspaceGroupsRegion, props())))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    /** 置顶行那一轮拿到的计划引用，按会话 id 索引 */
    const first = pinnedPlans()
    seen.length = 0

    // 换到另一条当前会话：置顶集合与顺序位都没动，只是会话快照换了一份
    await act(async () => root.render(h(WorkspaceGroupsRegion, props('session-3'))))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const second = pinnedPlans()

    // 两条都真的渲染过，否则下面的比对会因为取到 undefined 而恒真
    expect([...first.keys()].sort()).toEqual([...PINNED_IDS].sort())
    expect([...second.keys()].sort()).toEqual([...PINNED_IDS].sort())
    for (const id of PINNED_IDS) {
      expect(second.get(id)).toBe(first.get(id))
    }
    await act(async () => root.unmount())
  })
})
