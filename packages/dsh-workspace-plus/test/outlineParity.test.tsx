// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { buildOutline } from '../src/client/data/outline.ts'
import type { OutlineRow } from '../src/client/data/outline.ts'
import { buildLayout, buildRootLayout } from '../src/client/data/layout.ts'
import { deriveNesting } from '../src/client/data/nest.ts'
import { compareSessionRows } from '../src/client/data/sessions.ts'
import type { SessionRow, WorkspaceLayout } from '../src/client/data/types.ts'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { storeViewModeProps, viewModeStoreStub } from './viewMode-stub.ts'

/**
 * outline 与真实渲染的对拍
 *
 * 同一份快照下，outline 里会话行的先后必须与 DOM 里行的先后一致，题头行的条数也要一致
 * 顺序错了界面会错位而类型看不出来，只能靠这条对拍兜
 *
 * 价值在渲染改吃 outline 之前：那之后两边同源，对拍就退化成自证
 */

const CREATED = new Date(2026, 0, 1).toISOString()

/**
 * 用例启动那一刻，会话时间戳都以它为基准
 *
 * 折叠判据里有「最近用过」这条窗口，写死绝对时刻会让用例随时间流逝换一套结果
 */
const NOW = Date.now()
const HOUR = 60 * 60 * 1000

/** 一个按 cwd 分层的工作区集合：ws-1 是父工作区，ws-c1 是落进它体内的子工作区 */
const WORKSPACE_IDS = ['ws-1', 'ws-c1', 'ws-2']

const PATHS: Record<string, string> = {
  'ws-1': '/repo',
  'ws-c1': '/repo/pkg',
  'ws-2': '/other',
}

/** 每个工作区名下的会话 id，顺序即注册表序 */
const SESSION_IDS: Record<string, string[]> = {
  'ws-1': ['a0', 'a1', 'a2'],
  'ws-c1': ['c0'],
  'ws-2': ['b0'],
}

/** 不属于任何工作区的会话，落进末尾的「未分组」桶 */
const STRAY = ['u0']

/** ws-1 体内那个会话分组，收着 a0 */
const GROUP_ID = 'g1'

/** 根节点上的工作区分组，收着 ws-1 与 ws-2 */
const VIRTUAL_ID = 'vg-1'

/**
 * 一条会话摘要，字段与宿主交回的同形
 * @param id - 会话 id
 * @param ageHours - 距今多少小时没被用过，取值都在折叠窗口之内
 */
function summary(id: string, ageHours: number): Record<string, unknown> {
  return {
    id,
    displayTitle: '会话 ' + id,
    running: false,
    blank: false,
    retainedBy: {},
    updatedAt: NOW - ageHours * HOUR,
  }
}

/** 全部会话摘要，按 id 索引 */
const SUMMARIES: Record<string, unknown> = Object.fromEntries(
  [...Object.values(SESSION_IDS).flat(), ...STRAY].map((id, index) => [id, summary(id, index + 1)]),
)

afterEach(() => {
  document.body.replaceChildren()
})

/**
 * 工作区快照的选择器
 *
 * 快照建在工厂内、每次返回同一份引用：选择器每次渲染都会被调用，每次新建对象会让订阅者判定为变过
 */
function workspaceSource(): WorkspaceGroupsProps['useWorkspaces'] {
  const state = {
    items: WORKSPACE_IDS.map((workspaceId) => ({
      workspaceId,
      path: PATHS[workspaceId],
      title: workspaceId,
      sessionIds: SESSION_IDS[workspaceId] ?? [],
      createdAt: CREATED,
      updatedAt: CREATED,
    })),
    archivedSessionIds: [],
    pinnedSessionIds: [],
    phase: 'ready',
  }
  return ((select: (s: unknown) => unknown) => select(state)) as never
}

/** 会话快照的选择器，含末尾「未分组」桶里那几条 */
function sessionSource(): WorkspaceGroupsProps['useSessions'] {
  const ids = [...Object.values(SESSION_IDS).flat(), ...STRAY]
  const state = { ids, byId: SUMMARIES, phase: 'ready' }
  return ((select: (s: unknown) => unknown) => select(state)) as never
}

/** 一份分组元数据：一个会话分组在 ws-1 体内，一个工作区分组收着 ws-1 与 ws-2 */
function storedSnapshot(): ReturnType<typeof snapshot> {
  return snapshot({
    byWorkspace: { 'ws-1': [{ id: GROUP_ID, name: '分组甲', sessionIds: ['a0'] }] },
    workspaceGroups: [{ id: VIRTUAL_ID, name: '工作区分组甲', workspaceIds: ['ws-1', 'ws-2'] }],
  })
}

/** 区域的注入面 */
function props(): WorkspaceGroupsProps {
  const stored = storedSnapshot()
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: workspaceSource(),
    useSessions: sessionSource(),
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () => stored,
    onReady: () => () => {},
    createGroup: async () => stored,
    renameGroup: async () => stored,
    deleteGroup: async () => stored,
    moveSession: async () => stored,
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
    // 顺序位与换位的四个写入面：这份夹具只验行序，不碰拖拽提交
    setSegmentOrder: async () => stored,
    moveGroupBefore: async () => stored,
    moveVirtualWorkspaceBefore: async () => stored,
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
      createWorkspace: async (path: string) => ({ workspaceId: 'ws-' + path, title: path }),
      startSession: () => {},
      occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
      labels: officialAddLabels(workspaceTranslate()),
    }),
  }
}

/** 挂载区域并等分组元数据落地 */
async function mount(): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props()))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root }
}

/** 一个工作区名下的会话行，与区域组件从快照投影出来的同形 */
function rowsOf(workspaceId: string): SessionRow[] {
  return (SESSION_IDS[workspaceId] ?? []).map((id) => ({
    id,
    title: '会话 ' + id,
    blank: false,
    running: false,
    runningSubagentCount: 0,
    completed: false,
    updatedAt: (SUMMARIES[id] as { updatedAt: number }).updatedAt,
  }))
}

/** 区域列表那一片，置顶区不在其中 */
function listOf(container: HTMLElement): Element | null {
  return container.querySelector('.list')
}

/**
 * 按同一份输入造 outline
 *
 * 布局、嵌套推导与三层折叠态的默认值都照区域组件那几处抄：这一份要复现的是「渲染输入」，而不是另起一套
 * 会话区段的展开态默认是收起，与 useSessionScopes 一致
 */
function outlineRows(): OutlineRow[] {
  const groups = [{ id: VIRTUAL_ID, name: '工作区分组甲', workspaceIds: ['ws-1', 'ws-2'] }]
  const virtualOf = (workspaceId: string): string =>
    workspaceId === 'ws-1' || workspaceId === 'ws-2' ? VIRTUAL_ID : ''
  const nesting = deriveNesting({
    enabled: storedSnapshot().nested,
    workspaceIds: WORKSPACE_IDS,
    pathOf: (workspaceId) => PATHS[workspaceId],
    virtualOf,
    bindingOf: () => undefined,
    groupIdsOf: (workspaceId) => new Set(workspaceId === 'ws-1' ? [GROUP_ID] : []),
  })

  const layouts = new Map<string, WorkspaceLayout>()
  const layoutOf = (workspaceId: string): WorkspaceLayout => {
    const cached = layouts.get(workspaceId)
    if (cached !== undefined) return cached
    const built = buildLayout(
      rowsOf(workspaceId),
      workspaceId === 'ws-1' ? [{ id: GROUP_ID, name: '分组甲', sessionIds: ['a0'] }] : [],
      (groupId) => nesting.groupedChildIdsOf(workspaceId, groupId),
      nesting.looseChildIdsOf(workspaceId),
    )
    layouts.set(workspaceId, built)
    return built
  }

  return buildOutline({
    rootLayout: buildRootLayout(WORKSPACE_IDS, groups, nesting),
    workspaceLayoutOf: layoutOf,
    depthOf: (workspaceId) => nesting.levelOf(workspaceId),
    containers: {
      root: nesting.containers.root,
      virtualOf: nesting.containers.virtualOf,
      groupOf: nesting.containers.groupOf,
    },
    expansion: {
      // 工作区层的默认按结构分层：没有父工作区的展开，子工作区折叠
      isWorkspaceExpanded: (key) => nesting.ancestorsOf(key).length === 0,
      isVirtualWorkspaceExpanded: () => true,
      isGroupExpanded: () => false,
    },
    isScopeExpanded: () => false,
    alwaysVisibleSessionIds: new Set<string>(),
    now: NOW,
    stray: STRAY.map((id) => ({
      id,
      title: '会话 ' + id,
      blank: false,
      running: false,
      runningSubagentCount: 0,
      completed: false,
      updatedAt: (SUMMARIES[id] as { updatedAt: number }).updatedAt,
    })),
    hideStray: false,
    compareRows: compareSessionRows,
    keys: {
      workspaceHead: (id) => 'workspaceHead/' + id,
      workspaceBody: (id) => 'workspaceBody/' + id,
      workspaceRegion: (id) => 'workspaceRegion/' + id,
      sessionGroupHead: (w, g) => 'groupHead/' + w + '/' + g,
      sessionGroupZone: (w, g) => 'sessionGroup/' + w + '/' + g,
      sessionGroupRegion: (w, g) => 'sessionGroupRegion/' + w + '/' + g,
      virtualHead: (id) => 'virtualWorkspaceHead/' + id,
      virtualBody: (id) => 'virtualWorkspaceBody/' + id,
      virtualRegion: (id) => 'virtualRegion/' + id,
      loose: (id) => 'loose/' + id,
    },
  })
}

/** DOM 里会话行的先后，按标题读回会话 id */
function renderedSessionIds(container: HTMLElement): string[] {
  const list = listOf(container)
  if (list === null) throw new Error('区域列表没有渲染')
  return Array.from(list.querySelectorAll('.row .rowTitle')).map((node) =>
    (node.textContent ?? '').replace('会话 ', ''),
  )
}

describe('outline 与渲染对拍', () => {
  it('lists the session rows in the same order as the rendered list', async () => {
    const { container, root } = await mount()

    const fromOutline = outlineRows()
      .filter((row) => row.kind === 'session')
      .map((row) => row.sessionId ?? '')

    // 先守住「真的读到了行」：两边都空时下面那条断言会假通过
    expect(fromOutline.length).toBeGreaterThan(0)
    expect(fromOutline).toEqual(renderedSessionIds(container))

    await act(async () => root.unmount())
  })

  it('counts the same header rows as the rendered list', async () => {
    const { container, root } = await mount()
    const list = listOf(container)
    if (list === null) throw new Error('区域列表没有渲染')

    const fromOutline = outlineRows().filter(
      (row) =>
        row.kind === 'workspaceHead' ||
        row.kind === 'groupHead' ||
        row.kind === 'virtualHead' ||
        row.kind === 'strayHead',
    ).length

    // 四种题头行在 DOM 上落在 .workspaceHead 或 .groupHead 上（工作区分组头两个类都带）
    const fromDom = list.querySelectorAll('.workspaceHead, .groupHead').length

    expect(fromOutline).toBe(fromDom)

    await act(async () => root.unmount())
  })
})
