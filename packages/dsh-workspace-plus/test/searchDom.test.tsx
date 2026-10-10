// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import {
  officialAddLabels,
  officialSessionLabels,
  timeLabel,
} from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { viewModeProps, viewModeStoreStub, storeViewModeProps } from './viewMode-stub.ts'

/**
 * 搜索的真实 DOM 冒烟
 *
 * `render.test.ts` 用自制 dispatcher 直接调用函数组件
 * 看不到样式类是否真的落到节点上、受控输入是否真的驱动重渲染
 * 以及原语替身是否缺导出。这里挂真 `react-dom` 渲染一遍
 * 按 DOM 结构断言这几件只有真实渲染才暴露的事
 *
 * 环境固定为 jsdom（文件头的注释指令），本包其余测试仍跑 node 环境
 */

/** 造一份注入面完整、含一条归组会话与一条无所属会话的数据 */
function props(wide = true): WorkspaceGroupsProps {
  const byId: Record<string, unknown> = {
    a: { id: 'a', displayTitle: '修复登录超时', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
    orphan: { id: 'orphan', displayTitle: 'Orphan', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
  }
  const workspaces = [
    {
      workspaceId: 'w1',
      path: '/tmp/w1',
      title: 'W1',
      sessionIds: ['a'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]
  return {
    wide,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [], phase: 'ready' })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'orphan'], byId, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) =>
      select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: undefined })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () => snapshot({ byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] } }),
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
      createWorkspace: async (path: string) => ({ workspaceId: `w-${path}`, title: path }),
      startSession: () => {},
      occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
      labels: officialAddLabels(workspaceTranslate()),
    }),
  }
}

/** 挂载区域并等分组元数据落地 */
async function mount(wide = true): Promise<{ container: HTMLElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(wide)))
  })
  // loadGroups 的 then 连跑两轮微任务才写完状态表
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container }
}

/** 在受控输入上敲入一段文本，走 React 认的原生事件路径 */
async function type(container: HTMLElement, value: string): Promise<void> {
  const input = container.querySelector('.searchInput') as HTMLInputElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

/** 展开搜索框 */
async function expandSearch(container: HTMLElement): Promise<void> {
  await act(async () => {
    ;(container.querySelector('.search') as HTMLElement).click()
  })
}

describe('search in a real DOM', () => {
  it('folds the title and the header actions away while the input expands', async () => {
    const { container } = await mount()

    // 初始：标题与右侧入口都在，输入框收起
    expect(container.querySelector('.headerTitle')?.className).not.toContain(
      'headerTitleHidden',
    )
    expect(container.querySelector('.headerActions')?.className).not.toContain(
      'headerActionsHidden',
    )

    await expandSearch(container)

    // 展开，标题向左让位、入口组向右让位，槽位与框体同时拉开
    // 让位发生在整个标题块上（两行一起收），因此查的是它而不是其中某一行
    expect(container.querySelector('.headerTitle')?.className).toContain(
      'headerTitleHidden',
    )
    expect(container.querySelector('.headerActions')?.className).toContain(
      'headerActionsHidden',
    )
    expect(container.querySelector('.searchSlot')?.className).toContain(
      'searchSlotExpanded',
    )
    expect(container.querySelector('.search')?.className).toContain('searchExpanded')
    // 清除按钮只在展开时出现，且带着官方的无障碍标签
    const clear = container.querySelector('.searchClear')
    expect(clear?.getAttribute('aria-label')).toBe('清除搜索')
  })

  it('replaces the tree with result rows that carry the group in the path', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '修复')

    const rows = container.querySelectorAll('.searchResult')
    expect(rows).toHaveLength(1)
    // 「工作区/分组」：本包在官方的工作区名之后补上分组，两段各是一档色阶
    expect(container.querySelector('.searchResultWorkspace')?.textContent).toBe('W1')
    expect(container.querySelector('.searchResultGroup')?.textContent).toBe('/前端')
    expect(container.querySelector('.searchResultMeta')?.textContent).toBe('W1/前端')
    // 结果框进的是 tree，无障碍标签取官方的结果区文案
    expect(container.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('搜索结果')
    // 常规列表整段让位：工作区行与底部说明都不渲染
    expect(container.querySelector('.workspace')).toBeNull()
    expect(container.querySelector('.note')).toBeNull()
  })

  it('gives both panels the fade-in class so each switch replays it', async () => {
    const { container } = await mount()

    // 常规列表与搜索结果各是一个面板，两者都带 panel
    // 切换内容体时 React 换掉整个节点
    // 动画因此重放（官方三种内容体共用 .treeBody 同理）
    const treePanel = container.querySelector('.list')
    expect(treePanel?.className).toContain('panel')

    await expandSearch(container)
    await type(container, '修复')

    const searchPanel = container.querySelector('.list')
    expect(searchPanel?.className).toContain('panel')
    // 关键：必须是另一个节点。若 React 原地复用同一个节点，动画不会重放
    // 淡入只在首次挂载时发生一次——这正是要防的退化
    expect(searchPanel).not.toBe(treePanel)
    expect(container.querySelector('.searchResults')).not.toBeNull()
  })

  it('keeps the two path segments adjacent, with nothing between them', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '修复')

    // 第二行那个容器带 6px gap（官方给「工作区名 / 摘录」用的）
    // 路径两段若直接做它的子项，那 6px 会插进「工作区」与「分组」之间
    // 把一条连续的路径读成两截。因此这里断言两段的从属结构：它们同属一个中间层
    // 外层 gap 够不到两者之间，那条 gap 的取值本身由 styles.test.ts 从 CSS 文本上钉住
    const meta = container.querySelector('.searchResultMeta') as HTMLElement
    const path = container.querySelector('.searchResultPath') as HTMLElement
    const workspace = container.querySelector('.searchResultWorkspace') as HTMLElement
    const group = container.querySelector('.searchResultGroup') as HTMLElement

    // 两段都装在同一项里，且那一层没有别的内容——路径因此是一个整体
    expect(path.contains(workspace)).toBe(true)
    expect(path.contains(group)).toBe(true)
    expect(Array.from(meta.children)).toEqual([path])
    expect(Array.from(path.children)).toEqual([workspace, group])
    // 文本是连续的一条路径，没有多余空白
    expect(meta.textContent).toBe('W1/前端')
  })

  it('stops the path at the workspace when the session is not in a group', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, 'Orphan')

    // 无所属工作区的会话退回官方的「未分组」，而不是拼出一条空路径
    expect(container.querySelector('.searchResultWorkspace')?.textContent).toBe('未分组')
  })

  it('shows the no-match empty state and never a dangling tree body', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '不存在的词')

    expect(container.querySelectorAll('.searchResult')).toHaveLength(0)
    expect(container.querySelector('.empty')?.textContent).toBe('无匹配会话')
  })

  it('leaves search and restores the tree when Escape is pressed', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '修复')
    expect(container.querySelectorAll('.searchResult')).toHaveLength(1)

    const input = container.querySelector('.searchInput') as HTMLInputElement
    await act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    // 回到常规列表，输入框也收起
    expect(container.querySelector('.workspace')).not.toBeNull()
    expect((container.querySelector('.searchInput') as HTMLInputElement).value).toBe('')
    expect(container.querySelector('.search')?.className).not.toContain('searchExpanded')
  })

  it('focuses the input once expanded, and takes it out of the tab order when folded', async () => {
    const { container } = await mount()

    // 收起态不可聚焦，Tab 不该停在这里
    expect((container.querySelector('.searchInput') as HTMLInputElement).tabIndex).toBe(-1)

    await expandSearch(container)

    expect((container.querySelector('.searchInput') as HTMLInputElement).tabIndex).toBe(0)
    expect(document.activeElement).toBe(container.querySelector('.searchInput'))
  })

  it('opens the matched session, expands its group and scrolls its row into view', async () => {
    const opened: string[] = []
    const scrolled: Element[] = []
    // jsdom 没有布局引擎，scrollIntoView 也不存在：装一个探针记下被揭示的行
    const originalScroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this)
    }
    try {
      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)
      const base = props()
      await act(async () => {
        root.render(
          React.createElement(WorkspaceGroupsRegion, {
            ...base,
            openSession: (id: string) => opened.push(id),
          }),
        )
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      await expandSearch(container)
      await type(container, '修复')
      const row = container.querySelector('.searchResult') as HTMLElement
      await act(async () => {
        row.click()
      })
      // 揭示 effect 在打开后的提交里跑，等它落地
      await act(async () => {
        await Promise.resolve()
      })

      // 打开的是结果指向的那条会话
      expect(opened).toEqual(['a'])
      // 查询被清掉，结果列表让位给常规列表
      expect((container.querySelector('.searchInput') as HTMLInputElement).value).toBe('')
      // 被揭示的正是那条会话所在的行（标题为它的 displayTitle，行里还有时间）
      expect(scrolled.length).toBe(1)
      expect(scrolled[0]?.querySelector('.rowTitle')?.textContent).toBe('修复登录超时')
    } finally {
      Element.prototype.scrollIntoView = originalScroll
    }
  })

  it('expands a group that is collapsed by default before revealing its session', async () => {
    // 会话分组默认折叠，而揭示的判据是「除非显式展开，否则写展开」
    // 若沿用官方那套「只在显式为 false 时才写」，缺键的默认折叠分组不会被补上，被揭示的行会落在看不见的地方
    const store = viewModeStoreStub()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    // jsdom 没有布局引擎，scrollIntoView 也不存在；本用例只断言写下的记录，装一个空实现即可
    const originalScroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = () => {}
    try {
      await act(async () => {
        root.render(
          React.createElement(WorkspaceGroupsRegion, {
            ...props(),
            ...storeViewModeProps(store),
          }),
        )
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      // 默认折叠：这一层键缺席，生效值是收起
      expect(store.getSnapshot().expansion?.group ?? {}).toEqual({})
      await expandSearch(container)
      await type(container, '修复')
      await act(async () => {
        ;(container.querySelector('.searchResult') as HTMLElement).click()
      })
      await act(async () => {
        await Promise.resolve()
      })

      // 揭示路径显式写下了这一层的展开
      expect(store.getSnapshot().expansion?.group).toEqual({ 'w1:g1': true })
      // 工作区层同样按「除非显式展开，否则写展开」走：键缺席就补一条，判据看的是记录而不是生效值
      expect(store.getSnapshot().expansion?.workspace).toEqual({ w1: true })
    } finally {
      Element.prototype.scrollIntoView = originalScroll
    }
  })

  it('spreads the collapsed session list before revealing a folded session', async () => {
    // 被揭示的那条可能正躺在会话折叠收起的那些行里：不把该范围撑开，那条行根本不进文档
    // 上面那条揭示用例里工作区只有一条会话，永远折不起来，因此测不到这条路
    const listIds = ['old-1', 'old-2', 'old-3', 'old-4', 'target']
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    const byId: Record<string, unknown> = {}
    for (const id of listIds) {
      byId[id] = {
        id,
        displayTitle: id === 'target' ? '被折起来的老会话' : `会话 ${id}`,
        running: false,
        blank: false,
        retainedBy: {},
        updatedAt: Date.parse(stale),
      }
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const originalScroll = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = () => {}
    try {
      await act(async () => {
        root.render(
          React.createElement(WorkspaceGroupsRegion, {
            ...props(),
            loadGroups: async () => snapshot(),
            useSessions: ((select: (s: unknown) => unknown) =>
              select({ ids: listIds, byId, phase: 'ready' })) as never,
            useWorkspaces: ((select: (s: unknown) => unknown) =>
              select({
                items: [
                  {
                    workspaceId: 'w1',
                    path: '/tmp/w1',
                    title: 'W1',
                    sessionIds: listIds,
                    createdAt: stale,
                    updatedAt: stale,
                  },
                ],
                archivedSessionIds: [],
                pinnedSessionIds: [],
                phase: 'ready',
              })) as never,
          }),
        )
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      // 5 条都超出窗口，默认只露最近 3 条，目标不在其中
      const before = Array.from(container.querySelectorAll('.workspaceBody .row .rowTitle')).map(
        (node) => node.textContent ?? '',
      )
      expect(before).not.toContain('被折起来的老会话')

      await expandSearch(container)
      await type(container, '被折起来的老会话')
      await act(async () => {
        ;(container.querySelector('.searchResult') as HTMLElement).click()
      })
      await act(async () => {
        await Promise.resolve()
      })

      // 该范围整体撑开，被揭示的那条行因此真的落在文档里
      const after = Array.from(container.querySelectorAll('.workspaceBody .row .rowTitle')).map(
        (node) => node.textContent ?? '',
      )
      expect(after).toContain('被折起来的老会话')
    } finally {
      Element.prototype.scrollIntoView = originalScroll
    }
  })

  it('offers only the rail entry in the narrow rail, with no input to focus', async () => {
    const { container } = await mount(false)

    // 窄栏只放入口：输入框在宽栏的 header 里
    expect(container.querySelector('.searchInput')).toBeNull()
    expect(
      container.querySelector('.searchButton')?.getAttribute('aria-label'),
    ).toBe('搜索会话')
  })
})
