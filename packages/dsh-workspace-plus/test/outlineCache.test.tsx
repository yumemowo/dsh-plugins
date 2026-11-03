// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * 行序列的缓存命中
 *
 * 序列的输入里有一格「渲染当刻的时刻」，它逐毫秒变化
 * 直接把它放进依赖列会让缓存每次重渲染都失效，而界面只表现为长列表卡顿：没有报错，也没有错位
 *
 * 这里把 `buildOutline` 换成计数替身，按「两次重渲染之间它跑了几遍」量缓存有没有命中
 * 探针要能失败：把 `useOutline` 里的 `recentClockAt` 去掉、直接拿渲染当刻的时刻进依赖列，
 * 第一条断言立刻反转
 */

/** `buildOutline` 被调用的次数 */
const builds = { count: 0 }

vi.mock('../src/client/data/outline.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/client/data/outline.ts')>()
  return {
    ...actual,
    buildOutline: (input: Parameters<typeof actual.buildOutline>[0]) => {
      builds.count += 1
      return actual.buildOutline(input)
    },
  }
})

const { WorkspaceGroupsRegion } = await import('../src/client/views/WorkspaceGroupsRegion.tsx')
type RegionProps = Parameters<typeof WorkspaceGroupsRegion>[0]

const { regionProps, summary } = await import('./support/dndDom.ts')
const { snapshot } = await import('./snapshot-stub.ts')

const h = React.createElement

/** 时钟，用例自己推进它 */
let clock = Date.parse('2026-10-02T12:00:00.000Z')

const HOUR = 60 * 60 * 1000

/** 一个工作区里的三条会话，都在折叠窗口内 */
const SESSION_IDS = ['session-1', 'session-2', 'session-3']

/**
 * 两份全局快照
 *
 * 模块级建好、每次渲染返回同一份引用：真宿主的选择器在快照未变时交回的也是同一份，
 * 每渲染新建一份会让下游的派生与 memo 全部失效，量出来的就不是时钟这一条机制
 */
const WORKSPACE_STATE = {
  items: [
    {
      workspaceId: 'ws-1',
      path: '/tmp/ws-1',
      title: 'ws-1',
      sessionIds: SESSION_IDS,
      createdAt: new Date(2026, 0, 1).toISOString(),
      updatedAt: new Date(2026, 0, 1).toISOString(),
    },
  ],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  phase: 'ready',
}

const SESSION_STATE = {
  ids: SESSION_IDS,
  byId: Object.fromEntries(SESSION_IDS.map((id) => [id, summary(id, clock)])),
  phase: 'ready',
}

const STATUSES = new Map()

/** 区域 props，四份读数都是同一份引用 */
function props(): RegionProps {
  return {
    ...regionProps(),
    useWorkspaces: ((select: (s: unknown) => unknown) => select(WORKSPACE_STATE)) as never,
    useSessions: ((select: (s: unknown) => unknown) => select(SESSION_STATE)) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(STATUSES)) as never,
    loadGroups: async () => snapshot(),
  }
}

/** 挂上区域并等第一轮派生落地 */
async function mount(): Promise<{ root: ReturnType<typeof createRoot>; base: RegionProps }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const base = props()
  await act(async () => {
    root.render(h(WorkspaceGroupsRegion, base))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { root, base }
}

beforeEach(() => {
  builds.count = 0
  clock = Date.parse('2026-10-02T12:00:00.000Z')
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('the identity of the outline', () => {
  it('reuses the row sequence while the render clock moves inside one hour', async () => {
    const { root, base } = await mount()

    // 首帧那一轮已经算过，此后每次重渲染都该命中缓存
    const afterFirstRender = builds.count
    expect(afterFirstRender).toBeGreaterThan(0)

    // 两次重渲染各推进 5 秒：渲染当刻的时刻确实变了，判据基准时刻还在同一小时里
    clock += 5_000
    await act(async () => root.render(h(WorkspaceGroupsRegion, base)))
    clock += 5_000
    await act(async () => root.render(h(WorkspaceGroupsRegion, base)))

    expect(builds.count).toBe(afterFirstRender)
    await act(async () => root.unmount())
  })

  it('rebuilds the row sequence once the render clock enters the next hour', async () => {
    const { root, base } = await mount()

    const afterFirstRender = builds.count
    clock += HOUR
    await act(async () => root.render(h(WorkspaceGroupsRegion, base)))

    expect(builds.count).toBe(afterFirstRender + 1)
    await act(async () => root.unmount())
  })
})
