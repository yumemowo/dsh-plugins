// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import {
  officialAddLabels,
  officialSessionLabels,
  timeLabel,
} from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'

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
    a: { id: 'a', displayTitle: '修复登录超时', running: false, blank: false, updatedAt: 1_000 },
    orphan: { id: 'orphan', displayTitle: 'Orphan', running: false, blank: false, updatedAt: 1_000 },
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
      select({ items: workspaces, archivedSessionIds: [] })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'orphan'], byId, current: undefined, phase: 'ready' })) as never,
    useSessionPendingInteraction: ((select: (s: unknown) => unknown) =>
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
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    searchResultLimit: 20,
    t: regionTranslate(),
    tWorkspace: workspaceTranslate(),
    tSidebar: sidebarTranslate(),
    official: () => ({
      renameSession: async () => {},
      forkSession: () => {},
      archiveSession: async () => {},
      labels: officialSessionLabels(workspaceTranslate()),
      relativeTime: (updatedAt: number, now: number) =>
        timeLabel(updatedAt, now, workspaceTranslate()),
    }),
    addWorkspace: () => ({
      createWorkspace: async (path: string) => ({ workspaceId: `w-${path}` }),
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
  const input = container.querySelector('.wg-search-input') as HTMLInputElement
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
    ;(container.querySelector('.wg-search') as HTMLElement).click()
  })
}

describe('search in a real DOM', () => {
  it('collapses the title and the header actions while the input expands', async () => {
    const { container } = await mount()

    // 初始：标题与右侧入口都在，输入框收起
    expect(container.querySelector('.wg-header-title')?.className).not.toContain(
      'wg-header-title-hidden',
    )
    expect(container.querySelector('.wg-header-actions')?.className).not.toContain(
      'wg-header-actions-hidden',
    )

    await expandSearch(container)

    // 展开：标题向左让位、入口组向右让位，槽位与框体同时拉开
    // 让位发生在整个标题块上（两行一起收），因此查的是它而不是其中某一行
    expect(container.querySelector('.wg-header-title')?.className).toContain(
      'wg-header-title-hidden',
    )
    expect(container.querySelector('.wg-header-actions')?.className).toContain(
      'wg-header-actions-hidden',
    )
    expect(container.querySelector('.wg-search-slot')?.className).toContain(
      'wg-search-slot-expanded',
    )
    expect(container.querySelector('.wg-search')?.className).toContain('wg-search-expanded')
    // 清除按钮只在展开时出现，且带着官方的无障碍标签
    const clear = container.querySelector('.wg-search-clear')
    expect(clear?.getAttribute('aria-label')).toBe('清除搜索')
  })

  it('replaces the tree with result rows that carry the group in the path', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '修复')

    const rows = container.querySelectorAll('.wg-search-result')
    expect(rows).toHaveLength(1)
    // 「工作区/分组」：本包在官方的工作区名之后补上分组，两段各是一档色阶
    expect(container.querySelector('.wg-search-result-workspace')?.textContent).toBe('W1')
    expect(container.querySelector('.wg-search-result-group')?.textContent).toBe('/前端')
    expect(container.querySelector('.wg-search-result-meta')?.textContent).toBe('W1/前端')
    // 结果框进的是 tree，无障碍标签取官方的结果区文案
    expect(container.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('搜索结果')
    // 常规列表整段让位：工作区行与底部说明都不渲染
    expect(container.querySelector('.wg-workspace')).toBeNull()
    expect(container.querySelector('.wg-note')).toBeNull()
  })

  it('gives both panels the fade-in class so each switch replays it', async () => {
    const { container } = await mount()

    // 常规列表与搜索结果各是一个面板，两者都带 wg-panel
    // 切换内容体时 React 换掉整个节点
    // 动画因此重放（官方三种内容体共用 .treeBody 同理）
    const treePanel = container.querySelector('.wg-list')
    expect(treePanel?.className).toContain('wg-panel')

    await expandSearch(container)
    await type(container, '修复')

    const searchPanel = container.querySelector('.wg-list')
    expect(searchPanel?.className).toContain('wg-panel')
    // 关键：必须是另一个节点。若 React 原地复用同一个节点，动画不会重放
    // 淡入只在首次挂载时发生一次——这正是要防的退化
    expect(searchPanel).not.toBe(treePanel)
    expect(container.querySelector('.wg-search-results')).not.toBeNull()
  })

  it('keeps the two path segments adjacent, with nothing between them', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '修复')

    // 第二行那个容器带 6px gap（官方给「工作区名 / 摘录」用的）
    // 路径两段若直接做它的子项，那 6px 会插进「工作区」与「分组」之间
    // 把一条连续的路径读成两截。因此这里断言两段的从属结构：它们同属一个中间层
    // 外层 gap 够不到两者之间，那条 gap 的取值本身由 styles.test.ts 从 CSS
    // 文本上钉住
    const meta = container.querySelector('.wg-search-result-meta') as HTMLElement
    const path = container.querySelector('.wg-search-result-path') as HTMLElement
    const workspace = container.querySelector('.wg-search-result-workspace') as HTMLElement
    const group = container.querySelector('.wg-search-result-group') as HTMLElement

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
    expect(container.querySelector('.wg-search-result-workspace')?.textContent).toBe('未分组')
  })

  it('shows the no-match empty state and never a dangling tree body', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '不存在的词')

    expect(container.querySelectorAll('.wg-search-result')).toHaveLength(0)
    expect(container.querySelector('.wg-empty')?.textContent).toBe('无匹配会话')
  })

  it('leaves search and restores the tree when Escape is pressed', async () => {
    const { container } = await mount()
    await expandSearch(container)
    await type(container, '修复')
    expect(container.querySelectorAll('.wg-search-result')).toHaveLength(1)

    const input = container.querySelector('.wg-search-input') as HTMLInputElement
    await act(async () => {
      input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    // 回到常规列表，输入框也收起
    expect(container.querySelector('.wg-workspace')).not.toBeNull()
    expect((container.querySelector('.wg-search-input') as HTMLInputElement).value).toBe('')
    expect(container.querySelector('.wg-search')?.className).not.toContain('wg-search-expanded')
  })

  it('focuses the input once expanded, and takes it out of the tab order when collapsed', async () => {
    const { container } = await mount()

    // 收起态不可聚焦，Tab 不该停在这里
    expect((container.querySelector('.wg-search-input') as HTMLInputElement).tabIndex).toBe(-1)

    await expandSearch(container)

    expect((container.querySelector('.wg-search-input') as HTMLInputElement).tabIndex).toBe(0)
    expect(document.activeElement).toBe(container.querySelector('.wg-search-input'))
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
      const row = container.querySelector('.wg-search-result') as HTMLElement
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
      expect((container.querySelector('.wg-search-input') as HTMLInputElement).value).toBe('')
      // 被揭示的正是那条会话所在的行（标题为它的 displayTitle，行里还有时间）
      expect(scrolled.length).toBe(1)
      expect(scrolled[0]?.querySelector('.wg-row-title')?.textContent).toBe('修复登录超时')
    } finally {
      Element.prototype.scrollIntoView = originalScroll
    }
  })

  it('offers only the rail entry in the narrow rail, with no input to focus', async () => {
    const { container } = await mount(false)

    // 窄栏只放入口：输入框在宽栏的 header 里
    expect(container.querySelector('.wg-search-input')).toBeNull()
    expect(
      container.querySelector('.wg-search-button')?.getAttribute('aria-label'),
    ).toBe('搜索会话')
  })
})
