// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import {
  SessionHoverContent,
  WorkspaceHoverContent,
} from '../src/client/components/HoverCards.tsx'
import {
  officialAddLabels,
  officialSessionLabels,
  timeLabel,
} from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'

/**
 * 悬停卡片的真实 DOM 冒烟
 *
 * `render.test.ts` 用自制 dispatcher 直接调用函数组件，卡片替身只渲染锚点
 * 因此看不到包一层之后行在 DOM 里的实际位置。这里用真 `react-dom` 渲染一遍
 * 断言两件只有真实渲染才暴露的事：卡片确实浮出来了
 * 以及多出来的那层包装没有破坏行的结构（行的定位、层级缩进与淡入标记都还在）
 *
 * 本包其余测试仍跑 node 环境，原语替身见 vitest.config.ts 的 alias
 */

/** 造一份注入面完整的数据，含一条归组会话与一条无所属会话 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const created = new Date(2026, 0, 1, 0, 0).getTime()
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
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(created).toISOString(),
    },
  ]
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [] })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'orphan'], byId, current: undefined, phase: 'ready' })) as never,
    useSessionPendingInteraction: ((select: (s: unknown) => unknown) =>
      select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
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
    ...overrides,
  }
}

/** 挂载区域并等分组元数据落地 */
async function mount(overrides: Partial<WorkspaceGroupsProps> = {}): Promise<HTMLElement> {
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
  return container
}

/**
 * 挂载区域并交出根
 *
 * 翻转标记落在 `document.body` 上，测试之间必须靠卸载把标记收回去
 * 否则前一条用例留下的标记会污染下一条
 * 上面那个只返回容器的 {@link mount} 做不到这一点
 */
async function mountRoot(
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

/**
 * 伪造区域的实测位置与窗口宽度
 *
 * jsdom 不做布局，`getBoundingClientRect` 一律返回全 0
 * `documentElement.clientWidth` 也是 0，翻转判定因此永远不触发
 * 这里给出真实浏览器里会出现的两种几何
 *
 * 区域节点必须从本次挂载的容器里取，同文件其他用例挂载后不收尾
 * 按文档查 `.wg-root` 会拿到先前那次留下的旧节点，而 resize 监听挂在本次这个节点上
 * @param container - 本次挂载的容器
 * @param viewportWidth - 布局视口宽度
 * @param rect - 区域矩形的左右边
 * @returns 被改写的区域根节点
 */
function stubGeometry(
  container: HTMLElement,
  viewportWidth: number,
  rect: { left: number; right: number },
): HTMLElement {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: viewportWidth,
    configurable: true,
  })
  const region = container.querySelector('.wg-root') as HTMLElement
  region.getBoundingClientRect = () =>
    ({
      left: rect.left,
      right: rect.right,
      top: 0,
      bottom: 0,
      width: rect.right - rect.left,
      height: 0,
      x: rect.left,
      y: 0,
    }) as DOMRect
  return region
}

/** 触发一次量测（真实浏览器里由 resize 或侧栏拖动引起） */
async function remeasure(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event('resize'))
  })
}

describe('hover cards in a real DOM', () => {
  it('keeps the wrapped session row reachable and tagged for the stagger fade', async () => {
    const container = await mount()

    // 行现在被 HoverCard 那层包装包着，但它仍要能被选择器找到——层级缩进
    // 引导线与逐个淡入都按行自身的选择器生效
    const rows = container.querySelectorAll('.wg-row')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of Array.from(rows)) {
      expect(row.getAttribute('data-wg-stagger')).toBe('')
      // 行仍是可点、可聚焦的树项
      expect(row.getAttribute('role')).toBe('button')
    }

    // 挂卡片的那一行确实多了一层包装：行不再是 .wg-sessions 的直接子项
    const sessions = container.querySelector('.wg-sessions') as HTMLElement
    const firstRow = sessions.querySelector('.wg-row') as HTMLElement
    expect(firstRow.parentElement).not.toBe(sessions)
    // 包装层是行内盒，不生成 flex 项以外的影响面
    expect(firstRow.parentElement?.tagName).toBe('SPAN')
  })

  it('leaves the workspace row in place inside its section', async () => {
    const container = await mount()

    // 工作区行同样被包了一层，但它必须仍是工作区区块的第一个子项：
    // `.wg-workspace > * + *` 那份 2px 间距靠的就是这个位置
    const workspace = container.querySelector('.wg-workspace') as HTMLElement
    const head = container.querySelector('.wg-workspace-head') as HTMLElement
    expect(head).not.toBeNull()
    expect(workspace.contains(head)).toBe(true)
    expect(head.parentElement).not.toBe(workspace)
    // 折叠体仍在行之后：头一层包装 + 折叠体，顺序没有被打乱
    expect(workspace.children.length).toBe(2)
  })

  it('renders neither card nor wrapper when the official copy is missing', async () => {
    const container = await mount({ official: undefined })

    // 官方文案拿不到时不挂浮层，行因此退回直接子项，结构没有任何包装层
    expect(container.querySelectorAll('.wg-row').length).toBeGreaterThan(0)
    const sessions = container.querySelector('.wg-sessions') as HTMLElement
    for (const row of Array.from(sessions.children)) {
      expect(row.className).toContain('wg-row')
    }
  })

  it('lays out both card bodies with the classes the stylesheet targets', async () => {
    // 卡片正文本身是 portal 到 body 的，挂载时看不到，这里直接渲染两个正文组件
    // 断言样式表依赖的那几个类真的落到了节点上、文本也照常渲染
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(WorkspaceHoverContent, {
          label: 'W1',
          path: '~/src/dsh_plugins',
          created: '创建于 2026年1月1日 00:00',
        }),
      )
    })

    expect(container.querySelector('.wg-hover-content')).not.toBeNull()
    expect(container.querySelector('.wg-hover-title')?.textContent).toBe('W1')
    expect(container.querySelector('.wg-hover-path')?.textContent).toBe('~/src/dsh_plugins')
    expect(container.querySelector('.wg-hover-time')?.textContent).toBe('创建于 2026年1月1日 00:00')

    // 会话卡片多一列状态：每条都是「状态点 + 文案」。状态点替身返回一个字符串
    // 因此这里读到的文本里带它的标记
    const sessionContainer = document.createElement('div')
    document.body.appendChild(sessionContainer)
    const second = createRoot(sessionContainer)
    await act(async () => {
      second.render(
        React.createElement(SessionHoverContent, {
          title: '修复登录超时',
          time: '5分钟前',
          statuses: [
            { state: 'warning', label: '等待审批' },
            { state: 'ongoing', label: '2 个子代理运行中' },
          ],
        }),
      )
    })

    const statuses = sessionContainer.querySelectorAll('.wg-hover-status')
    expect(statuses).toHaveLength(2)
    expect(statuses[0]?.textContent).toContain('等待审批')
    expect(statuses[1]?.textContent).toContain('2 个子代理运行中')
    expect(sessionContainer.querySelector('.wg-hover-time')?.textContent).toBe('5分钟前')
  })
})

/**
 * 对照模式下的翻转标记
 *
 * 官方卡片固定向右展开且位置是内联样式，区域贴窗口右缘时会整块开到屏幕外
 * 因此由区域量出自己的矩形后在 body 上挂标记与落点，样式据此把卡片翻到左侧
 * 这里跑真 DOM 一遍，钉住「什么时候挂、挂的是什么、卸载后收干净」三件事
 */
describe('flip marker for a region against the right edge', () => {
  const FLIP = 'data-wg-flip'
  const RIGHT_VAR = '--wg-flip-right'

  it('omits the marker while the card still fits on the right', async () => {
    // 产品形态：区域在左侧栏，右边有一整屏，卡片照原语向右展开
    const { container, root } = await mountRoot()
    stubGeometry(container, 1200, { left: 0, right: 260 })
    await remeasure()

    expect(document.body.hasAttribute(FLIP)).toBe(false)
    expect(document.body.style.getPropertyValue(RIGHT_VAR)).toBe('')
    await act(async () => root.unmount())
  })

  it('marks the body and publishes the landing distance for a right-docked region', async () => {
    // 对照模式：区域挂右侧栏、贴着窗口右缘，右边一点空间都没有
    const { container, root } = await mountRoot()
    stubGeometry(container, 1200, { left: 940, right: 1200 })
    await remeasure()

    expect(document.body.hasAttribute(FLIP)).toBe(true)
    // 卡片右缘落在区域左缘左侧一个 8px 间隙处：1200 - 940 + 8
    expect(document.body.style.getPropertyValue(RIGHT_VAR)).toBe('268px')
    await act(async () => root.unmount())
  })

  it('clears both the marker and the distance when the region unmounts', async () => {
    // 标记挂在 body 上，属于区域之外的全局状态：不收回就会影响后续界面
    const { container, root } = await mountRoot()
    stubGeometry(container, 1200, { left: 940, right: 1200 })
    await remeasure()
    expect(document.body.hasAttribute(FLIP)).toBe(true)

    await act(async () => root.unmount())
    expect(document.body.hasAttribute(FLIP)).toBe(false)
    expect(document.body.style.getPropertyValue(RIGHT_VAR)).toBe('')
  })

  it('drops the marker again once the region moves back to a roomy column', async () => {
    // 用户把窗口拉宽（或把右侧栏拖窄）后要能回到向右展开，而不是一直停在翻转态
    const { container, root } = await mountRoot()
    stubGeometry(container, 1200, { left: 940, right: 1200 })
    await remeasure()
    expect(document.body.hasAttribute(FLIP)).toBe(true)

    stubGeometry(container, 1600, { left: 940, right: 1200 })
    await remeasure()
    expect(document.body.hasAttribute(FLIP)).toBe(false)
    expect(document.body.style.getPropertyValue(RIGHT_VAR)).toBe('')
    await act(async () => root.unmount())
  })

  it('tags the card box so the stylesheet can tell our cards from the official ones', async () => {
    // 卡片盒由官方原语渲染、且 portal 到 document.body
    // 官方左侧栏的卡片就在同一个父节点上，样式只能靠本包给卡片打的标记区分
    // 因此正文必须把它打上去
    const container = document.createElement('div')
    document.body.appendChild(container)
    // 照原语的结构预置一层外层盒：正文是卡片的唯一子节点
    const card = document.createElement('div')
    container.appendChild(card)
    const root = createRoot(card)
    await act(async () => {
      root.render(
        React.createElement(WorkspaceHoverContent, {
          label: 'W1',
          path: '~/src',
          created: '创建于 2026年1月1日 00:00',
        }),
      )
    })

    expect(card.getAttribute('data-wg-hover-card')).toBe('')
    await act(async () => root.unmount())
  })
})
