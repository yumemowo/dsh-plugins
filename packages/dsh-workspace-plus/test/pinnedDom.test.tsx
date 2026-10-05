// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
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
 * 置顶区的真实 DOM
 *
 * 「常驻在滚动区之外」「无置顶项时整块不渲染」「溢出时只渲染前 N 条」这几条都只能按真实 DOM 断言
 * 元素树里看不出一个节点在不在 `.list` 里，而这几条写错时界面只是「位置不对」或「行数不对」，不会有任何报错
 *
 * 选择器直接写源文件的类名：`vitest.config.ts` 的 `classNameStrategy: 'non-scoped'` 让类名在测试里不哈希
 */

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    Menu: ({
      items,
      onSelect,
      anchor,
    }: {
      items?: { id: string; label?: React.ReactNode; disabled?: boolean }[]
      onSelect?: (id: string) => void
      anchor?: React.ReactNode
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
        // 真原语把锚点按钮渲染在面板旁，这里照做：行尾那枚 `...` 因此留在文档里可点
        anchor,
        (items ?? []).map((item) =>
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              'data-wg-test-item': item.id,
              // 真原语把 `disabled` 原样交给按钮，禁用的项点不动
              disabled: item.disabled === true,
              onClick: () => onSelect?.(item.id),
            },
            item.label as React.ReactNode,
          ),
        ),
      ),
  }
})

/**
 * 快照替身
 *
 * 必须建在模块级
 * `useWorkspaces` / `useSessions` 的选择器每次渲染都会被调用，每次新建对象或数组会让
 * `useSyncExternalStore` 判定为快照变过，渲染因此无限循环
 */
const CREATED = new Date(2026, 0, 1, 0, 0).toISOString()

/** 造一份会话摘要 */
function summary(id: string, updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    displayTitle: `会话 ${id}`,
    running: false,
    blank: false,
    retainedBy: {},
    updatedAt,
    ...extra,
  }
}

const ALL_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'sub']

const SUMMARIES: Record<string, unknown> = {
  a: summary('a', 1_000),
  b: summary('b', 2_000),
  c: summary('c', 3_000),
  d: summary('d', 4_000),
  e: summary('e', 5_000),
  f: summary('f', 6_000),
  g: summary('g', 7_000),
  // 子代理来源：列表与置顶区都不该显示它
  sub: summary('sub', 8_000, { origin: 'subagent' }),
  // 三条不属于任何工作区的会话，供末尾「未分组」桶的用例使用
  // 列表序 u1,u2,u3 与时间倒序 u3,u2,u1 刻意相反，置顶优先与按时间排因此可区分
  u1: summary('u1', 1_000),
  u2: summary('u2', 5_000),
  u3: summary('u3', 9_000),
}

/**
 * 工作区快照的选择器，快照建在工厂内、每次返回同一份引用
 *
 * `ungrouped` 里的 id 不划给任何工作区，它们因此落进末尾的「未分组」桶
 */
function workspaceSource(options: {
  pinned: readonly string[]
  archived?: readonly string[]
  ungrouped?: readonly string[]
}): WorkspaceGroupsProps['useWorkspaces'] {
  const owned = ALL_IDS.filter((id) => !(options.ungrouped ?? []).includes(id))
  const state = {
    items: [
      {
        workspaceId: 'w1',
        path: '/tmp/w1',
        title: 'W1',
        sessionIds: owned,
        createdAt: CREATED,
        updatedAt: CREATED,
      },
    ],
    archivedSessionIds: options.archived ?? [],
    pinnedSessionIds: options.pinned,
    phase: 'ready',
  }
  return ((select: (s: unknown) => unknown) => select(state)) as never
}

/** 会话快照的选择器，`current` 那一格落成会话自己的保留计数 */
function sessionSource(options: {
  current?: string
  ids?: readonly string[]
}): WorkspaceGroupsProps['useSessions'] {
  const ids = options.ids ?? ALL_IDS
  const byId: Record<string, unknown> = {}
  for (const id of ids) {
    byId[id] = {
      ...(SUMMARIES[id] as object),
      retainedBy: id === options.current ? { mainView: 1 } : {},
    }
  }
  const state = { ids, byId, phase: 'ready' }
  return ((select: (s: unknown) => unknown) => select(state)) as never
}

/** 造一份注入面完整的数据 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: workspaceSource({ pinned: ['a', 'b'] }),
    useSessions: sessionSource({}),
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () => snapshot(),
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

/** 置顶区里的会话行 */
function pinnedRows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.pinScroll > .row'))
}

describe('pinned section', () => {
  it('renders nothing at all while no session is pinned', async () => {
    const { container, root } = await mount({ useWorkspaces: workspaceSource({ pinned: [] }) })

    // 段头、分隔线都不出现，那一段空间完整交还给列表
    expect(container.querySelector('.pinnedSection')).toBeNull()
    await act(async () => root.unmount())
  })

  it('keeps the pinned section outside the scrolling list', async () => {
    const { container, root } = await mount()
    const pinned = container.querySelector('.pinnedSection')

    expect(pinned).not.toBeNull()
    // 挂在 `.list` 里就会随列表一起滚走——那正是它要避开的位置
    expect(pinned?.closest('.list')).toBeNull()
    await act(async () => root.unmount())
  })

  it('puts the section header above the rows and reports the total', async () => {
    const { container, root } = await mount()

    expect(container.querySelector('.pinHead')?.textContent).toContain('置顶')
    expect(container.querySelector('.pinHeadHint')?.textContent).toBe('2 条')
    expect(pinnedRows(container)).toHaveLength(2)
    await act(async () => root.unmount())
  })

  it('keeps every row in the document and marks the ones cut off by the resting height', async () => {
    // 7 条置顶、可见 5 条：全部行都在文档里（收回方向的动画要有东西可收）
    // 后 2 条由标记交给样式表收起可见性，行尾报「还有 2 条」
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })

    const rows = pinnedRows(container)
    expect(rows).toHaveLength(7)
    expect(rows.filter((row) => row.hasAttribute('data-wg-clipped'))).toHaveLength(2)
    expect(container.querySelector('.pinHeadHint')?.textContent).toBe('7 条 · 还有 2 条')
    await act(async () => root.unmount())
  })

  it('drops archived and subagent-origin sessions from the pinned set', async () => {
    const { container, root } = await mount({
      // g 已归档、sub 是子代理来源，两者都不该出现在置顶区
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'g', 'sub'], archived: ['g'] }),
    })

    expect(pinnedRows(container)).toHaveLength(2)
    expect(container.querySelector('.pinHeadHint')?.textContent).toBe('2 条')
    await act(async () => root.unmount())
  })

  it('shows only the header row once collapsed', async () => {
    const store = viewModeStoreStub()
    store.setPinned({ sectionExpanded: false })
    const { container, root } = await mount({ ...storeViewModeProps(store) })

    expect(container.querySelector('.pinnedSection')).not.toBeNull()
    expect(container.querySelector('.pinScroll')).toBeNull()
    // 收起后行尾提示改为只报总数
    expect(container.querySelector('.pinHeadHint')?.textContent).toBe('2 条')
    await act(async () => root.unmount())
  })

  it('flips the section open and shut from the header', async () => {
    // 段头是这一块的唯一开合入口，而开合态写在浏览器 store 里：这条路径断了界面上只是「点了没反应」
    const store = viewModeStoreStub()
    const { container, root } = await mount({ ...storeViewModeProps(store) })
    const head = container.querySelector('.pinHead') as HTMLElement

    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.pinScroll')).not.toBeNull()

    await act(async () => head.click())
    expect(head.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.pinScroll')).toBeNull()

    await act(async () => head.click())
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('.pinScroll')).not.toBeNull()
    await act(async () => root.unmount())
  })

  it('hands the stylesheet both heights and the motion rhythm so the popover can animate', async () => {
    // 过渡目标取「全部行叠起来」的实高：内容远矮于视口上限时，可见高度会在过渡前段就走完
    // 时长与缓动取撑开体同一份参数：置顶区不在任何撑开体之内，缺了它们样式表会落到自己的回退值上
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const section = container.querySelector<HTMLElement>('.pinnedSection')

    // 静止 5 条 = 5*32 + 4*2 = 168，全部 7 条 = 7*32 + 6*2 = 236
    expect(section?.style.getPropertyValue('--wg-pin-rest')).toBe('168px')
    expect(section?.style.getPropertyValue('--wg-pin-full')).toBe('236px')
    expect(section?.style.getPropertyValue('--wg-expand-duration')).not.toBe('')
    expect(section?.style.getPropertyValue('--wg-expand-easing')).not.toBe('')
    await act(async () => root.unmount())
  })

  it('keeps the resting area unscrollable in expand mode', async () => {
    const { container, root } = await mount()

    // expand 模式的静止态不可滚：指针一放上去就浮出，滚动在这里没有承载对象
    expect(container.querySelector('.pinnedSection')?.className).toContain('pinExpand')
    expect(container.querySelector('.pinScroll')?.className).toContain('pinScrollClipped')
    await act(async () => root.unmount())
  })

  it('flags the section as expandable only while rows are cut off', async () => {
    // 2 条置顶、可见 5 条：没有行被裁掉，浮出只是把一个等高的盒子重新定位一遍，这一档不接悬停
    const narrow = await mount()
    expect(narrow.container.querySelector('.pinnedSection')?.hasAttribute('data-wg-expandable')).toBe(false)
    await act(async () => narrow.root.unmount())

    // 7 条置顶、可见 5 条：有行被裁掉，闸门打开，样式表那条 `:hover` 规则才开始生效
    const wide = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    expect(wide.container.querySelector('.pinnedSection')?.hasAttribute('data-wg-expandable')).toBe(true)
    // 标记是静态的：它只说明「这一行超出静止可见条数」，怎么收起来交给样式表
    expect(wide.container.querySelectorAll('.pinScroll [data-wg-clipped]')).toHaveLength(2)
    await act(async () => wide.root.unmount())
  })

  it('leaves the popover markup untouched by pointer events', async () => {
    // 浮出交给样式表的 `:hover`：组件里不再有悬停状态，因此指针事件不该改动任何 DOM
    // 这一条挡的是「把悬停记进 state」那类写法——值一旦能被记下来，就能在内容变化后失真，整块会自己浮出
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const section = container.querySelector<HTMLElement>('.pinnedSection')
    const before = section?.outerHTML

    await act(async () => {
      const scroll = section?.querySelector('.pinScroll')
      scroll?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
      scroll?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    })
    expect(section?.outerHTML).toBe(before)

    await act(async () => {
      section?.querySelector('.pinScroll')?.dispatchEvent(
        new PointerEvent('pointerout', { bubbles: true }),
      )
    })
    expect(section?.outerHTML).toBe(before)
    await act(async () => root.unmount())
  })

  it('keeps the resting height variables for both pin counts', async () => {
    // 浮出态里预览区是绝对定位、脱离流，段必须自己常驻住静止高度
    // 高度只由那个预览区撑着的话，指针一进入整段就塌成「段头 + 分隔」，下方内容整体上移
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const section = container.querySelector<HTMLElement>('.pinnedSection')

    // 静止 5 条 = 5*32 + 4*2 = 168，全部 7 条 = 7*32 + 6*2 = 236
    // 两项与段头、分隔都由样式表算进常驻高度，指针在不在上面都不变
    expect(section?.style.getPropertyValue('--wg-pin-rest')).toBe('168px')
    expect(section?.style.getPropertyValue('--wg-pin-full')).toBe('236px')
    expect(section?.style.getPropertyValue('--wg-pin-head')).toBe('30px')
    expect(pinnedRows(container)).toHaveLength(7)
    await act(async () => root.unmount())
  })

  it('allows scrolling in place in scroll mode', async () => {
    const store = viewModeStoreStub()
    store.setPinned({ overflow: 'scroll' })
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      // 7 条置顶、可见 5 条：区内滚动靠的是超出裁剪高度的那些行，因此全部都要在 DOM 里
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })

    // scroll 模式不套 expand 那两个类，靠样式表里那条 data 属性规则允许滚动
    expect(container.querySelector('.pinnedSection')?.className).not.toContain('pinExpand')
    expect(container.querySelector('.pinScroll')?.className).not.toContain('pinScrollClipped')
    // 悬停展开的闸门也不下发：这一档没有浮出可言，它的几条规则只认 expand
    expect(container.querySelector('.pinnedSection')?.hasAttribute('data-wg-expandable')).toBe(false)
    expect(pinnedRows(container)).toHaveLength(7)
    await act(async () => root.unmount())
  })
})

describe('pinned interaction', () => {
  it('opens a pinned session without changing the focused workspace', async () => {
    const opened: string[] = []
    const focused: unknown[] = []
    const { container, root } = await mount({
      openSession: (id) => opened.push(id),
      focusEntry: async (address) => {
        focused.push(address)
        return snapshot()
      },
    })

    await act(async () => pinnedRows(container)[0]?.click())

    expect(opened).toEqual(['a'])
    // 置顶区是跨工作区的入口，替用户改聚焦范围会把他正在看的列表换掉
    expect(focused).toEqual([])
    await act(async () => root.unmount())
  })

  it('opens the next pinned session once the current one is unpinned', async () => {
    const opened: string[] = []
    const pinned: { id: string; value: boolean }[] = []
    const { container, root } = await mount({
      // `a` 就是当前打开的那一条
      useSessions: sessionSource({ current: 'a' }),
      openSession: (id) => opened.push(id),
      setSessionPinned: async (id, value) => {
        pinned.push({ id, value })
      },
    })

    const button = pinnedRows(container)[0]?.querySelector<HTMLButtonElement>('.rowPin')
    await act(async () => button?.click())

    expect(pinned).toEqual([{ id: 'a', value: false }])
    // 还有其它置顶会话时打开下一条
    expect(opened).toEqual(['b'])
    await act(async () => root.unmount())
  })

  it('returns the focus to all and keeps the session open once the last pin goes away', async () => {
    const opened: string[] = []
    const focused: unknown[] = []
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a'] }),
      useSessions: sessionSource({ current: 'a' }),
      openSession: (id) => opened.push(id),
      focusEntry: async (address) => {
        focused.push(address)
        return snapshot()
      },
    })

    const button = pinnedRows(container)[0]?.querySelector<HTMLButtonElement>('.rowPin')
    await act(async () => button?.click())

    // 一条不剩：把聚焦切回「全部」，并保持当前会话的打开状态（不导航、不关闭）
    expect(focused).toEqual([{ kind: 'all' }])
    expect(opened).toEqual([])
    await act(async () => root.unmount())
  })
})

describe('pin in the row menu', () => {
  /** 一行上渲染出来的菜单项 id，顺序即渲染顺序；行菜单在文档里出现两次，去重后取集合 */
  function itemIds(row: HTMLElement): string[] {
    return [
      ...new Set(
        Array.from(row.querySelectorAll('[data-wg-test-item]')).map(
          (entry) => entry.getAttribute('data-wg-test-item') ?? '',
        ),
      ),
    ]
  }

  /** 会话行菜单里那一项，按 id 取 */
  function item(row: HTMLElement, id: string): HTMLButtonElement {
    const found = row.querySelector<HTMLButtonElement>(`[data-wg-test-item="${id}"]`)
    if (found === null) throw new Error(`row menu has no "${id}" item`)
    return found
  }

  /** 列表里的会话行，按图钉状态挑（`on` 为真挑已置顶的） */
  function rowWithPin(container: HTMLElement, on: boolean): HTMLElement {
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.workspaceBody .row'))
    const found = rows.find((entry) =>
      on ? entry.querySelector('.rowPinOn') : entry.querySelector('.rowPinOff'),
    )
    if (found === undefined) throw new Error(`no row with pin ${on ? 'on' : 'off'}`)
    return found
  }

  it('puts the pin item first among the official actions', async () => {
    const { container, root } = await mount()

    // 官方 `PinSessionMenuItem` 排在最前，本包照它的次序
    expect(itemIds(rowWithPin(container, false)).slice(0, 4)).toEqual([
      'pin',
      'rename',
      'fork',
      'archive',
    ])
    await act(async () => root.unmount())
  })

  it('switches the menu item to unpin on an already pinned row', async () => {
    const { container, root } = await mount()
    const row = rowWithPin(container, true)

    expect(item(row, 'pin').textContent).toBe('取消置顶')
    await act(async () => root.unmount())
  })

  it('pins the row from the menu the same way the tail button does', async () => {
    const pinned: { id: string; value: boolean }[] = []
    const { container, root } = await mount({
      setSessionPinned: async (id, value) => {
        pinned.push({ id, value })
      },
    })
    const row = rowWithPin(container, false)
    const title = row.querySelector('.rowTitle')?.textContent

    await act(async () => {
      item(row, 'pin').click()
      await Promise.resolve()
    })

    // 点的是哪一行就置顶哪一行，标题与 fixture 的 `会话 <id>` 对得上即可确认
    expect(pinned).toEqual([{ id: String(title).replace('会话 ', ''), value: true }])
    await act(async () => root.unmount())
  })

  it('disables the pin item at the limit while leaving unpinning available', async () => {
    // 上限 2、已置顶 2 条
    const { container, root } = await mount({
      loadGroups: async () => snapshot({ pinnedLimit: 2 }),
    })

    // 上限只拦新增：未置顶行禁用，已置顶的照常可以取消
    expect(item(rowWithPin(container, false), 'pin').disabled).toBe(true)
    expect(item(rowWithPin(container, true), 'pin').disabled).toBe(false)
    await act(async () => root.unmount())
  })
})

describe('menu on a pinned row', () => {
  /** 置顶区第一行行尾那枚 `...` 按钮 */
  function actionButton(container: HTMLElement, index = 0): HTMLButtonElement {
    const found = pinnedRows(container)[index]?.querySelector<HTMLButtonElement>('.rowAction')
    if (found === null || found === undefined) throw new Error('pinned row has no action button')
    return found
  }

  /** 一行上渲染出来的菜单项 id，去重后取集合 */
  function itemIds(row: HTMLElement): string[] {
    return [
      ...new Set(
        Array.from(row.querySelectorAll('[data-wg-test-item]')).map(
          (entry) => entry.getAttribute('data-wg-test-item') ?? '',
        ),
      ),
    ]
  }

  it('puts the action slot and the official items on a pinned row', async () => {
    const { container, root } = await mount()

    // 行尾的操作位与列表里的会话行同形，条目也来自同一段构造
    expect(actionButton(container)).not.toBeNull()
    expect(itemIds(pinnedRows(container)[0] as HTMLElement)).toEqual([
      'pin',
      'rename',
      'fork',
      'archive',
    ])
    await act(async () => root.unmount())
  })

  it('marks the anchor with aria-expanded so the stylesheet can hold it open', async () => {
    // 菜单展开期间那一格样式认锚点按钮自己的 aria-expanded（见 rows.module.css 的 .rowAction 显隐规则）
    // 按钮上少了这个属性，样式就再也留不住锚点，而这在界面上只表现为「展开菜单时省略号消失」，不会有任何报错
    const { container, root } = await mount()
    const button = actionButton(container)

    expect(button.getAttribute('aria-expanded')).toBe('false')
    await act(async () => button.click())
    expect(actionButton(container).getAttribute('aria-expanded')).toBe('true')
    await act(async () => root.unmount())
  })

  it('pins a row from the menu the same way the tail button does', async () => {
    const pinned: { id: string; value: boolean }[] = []
    const { container, root } = await mount({
      setSessionPinned: async (id, value) => {
        pinned.push({ id, value })
      },
    })
    const row = pinnedRows(container)[0] as HTMLElement

    await act(async () => {
      row.querySelector<HTMLButtonElement>('[data-wg-test-item="pin"]')?.click()
    })

    // 置顶区里的行本已置顶，菜单项因此落到取消置顶
    expect(pinned).toEqual([{ id: 'a', value: false }])
    await act(async () => root.unmount())
  })

  it('opens a pinned row with the official fork instead of the row menu', async () => {
    const forked: string[] = []
    const opened: string[] = []
    const { container, root } = await mount({
      openSession: (id) => opened.push(id),
      official: () => ({
        renameSession: async () => {},
        forkSession: (id) => forked.push(id),
        archiveSession: async () => {},
        labels: officialSessionLabels(workspaceTranslate()),
        relativeTime: (updatedAt, now) => timeLabel(updatedAt, now, workspaceTranslate()),
      }),
    })

    await act(async () => {
      pinnedRows(container)[0]?.querySelector<HTMLButtonElement>('[data-wg-test-item="fork"]')?.click()
    })

    expect(forked).toEqual(['a'])
    // 点菜单项不该连带把行打开：面板挂在行内，行本身也可点
    expect(opened).toEqual([])
    await act(async () => root.unmount())
  })

  it('opens the row context menu on a pinned row', async () => {
    const { container, root } = await mount()
    const row = pinnedRows(container)[0] as HTMLElement

    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }))
    })

    // 右键是行尾操作位的捷径，同一批条目因此在右键下也拿得到
    expect(itemIds(row)).toEqual(['pin', 'rename', 'fork', 'archive'])
    await act(async () => root.unmount())
  })

  it('keeps the pinned row free of a hover card', async () => {
    const { container, root } = await mount()

    // 这些行已经钉在一段固定的区里，来源由位置说明，卡片在这里只多一层浮层
    expect(container.querySelector('.pinScroll [data-wg-hover-anchor]')).toBeNull()
    await act(async () => root.unmount())
  })

  it('marks the pinned row while a panel is open so the popover cannot collapse under it', async () => {
    // 两种面板都 portal 到 body：指针移上去时预览区已不在命中链里，`:hover` 当场为假
    // 行上留下这个标记，样式表那条 `:has()` 规则据此把浮出留住
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const row = pinnedRows(container)[0] as HTMLElement
    expect(row.hasAttribute('data-wg-panel-open')).toBe(false)

    await act(async () => actionButton(container).click())
    expect(row.hasAttribute('data-wg-panel-open')).toBe(true)

    await act(async () => {
      row.querySelector<HTMLButtonElement>('[data-wg-test-item="rename"]')?.click()
    })
    expect(row.hasAttribute('data-wg-panel-open')).toBe(false)
    await act(async () => root.unmount())
  })

  it('marks the pinned row from the context menu as well', async () => {
    // 行内 `...` 菜单与右键菜单是两处面板：只标记前者的话，右键唤出的菜单会在指针移上去时被收回
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const row = pinnedRows(container)[0] as HTMLElement

    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }))
    })
    expect(row.hasAttribute('data-wg-panel-open')).toBe(true)
    await act(async () => root.unmount())
  })

  it('renders a plain row while the official service is absent', async () => {
    const { container, root } = await mount({ official: () => undefined })

    // 宿主未加载官方 ui-workspace 时菜单会是空的，那时不留点不动的省略号
    expect(container.querySelector('.pinScroll .rowAction')).toBeNull()
    expect(pinnedRows(container)).toHaveLength(2)
    await act(async () => root.unmount())
  })

  it('leaves a blank pinned session without a menu but keeps its unpin button', async () => {
    // 新建中的空白会话可以置顶，但它只是「准备开始一个新会话」的占位，没有会话可重命名或归档
    const subs = ['blank', 'a']
    const byId: Record<string, unknown> = {
      blank: summary('blank', 1_000, { blank: true, retainedBy: { mainView: 1 } }),
      a: { ...(SUMMARIES['a'] as object), retainedBy: {} },
    }
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['blank', 'a'] }),
      useSessions: ((select: (s: unknown) => unknown) =>
        select({ ids: subs, byId, phase: 'ready' })) as never,
    })

    expect(pinnedRows(container)).toHaveLength(2)
    // 只有这一行没有菜单，同一个区里那条普通会话照常带着操作位
    expect(pinnedRows(container)[0]?.querySelector('.rowAction')).toBeNull()
    expect(pinnedRows(container)[1]?.querySelector('.rowAction')).not.toBeNull()
    // 取消置顶必须仍然可点
    expect(pinnedRows(container)[0]?.querySelector('.rowPinOn')).not.toBeNull()
    await act(async () => root.unmount())
  })
})

describe('session row pin', () => {
  it('keeps the action slot left of the pin on every row', async () => {
    const { container, root } = await mount()
    const rows = Array.from(container.querySelectorAll<HTMLElement>('.workspaceBody .row'))

    /** 一行里图钉与操作位的先后 */
    const order = (row: HTMLElement): string[] =>
      Array.from(row.children)
        .map((child) => {
          if (child.classList.contains('rowPin')) return 'pin'
          if (child.classList.contains('rowActionSlot')) return 'action'
          return ''
        })
        .filter((part) => part !== '')

    // 两态都是「操作位在左、图钉在右」：图钉占的是最右那一格，位置与是否置顶无关
    expect(order(rows.find((row) => row.querySelector('.rowPinOn')) as HTMLElement)).toEqual([
      'action',
      'pin',
    ])
    expect(order(rows.find((row) => row.querySelector('.rowPinOff')) as HTMLElement)).toEqual([
      'action',
      'pin',
    ])
    await act(async () => root.unmount())
  })

  it('disables pinning a new session once the limit is reached', async () => {
    // 上限 2、已置顶 2 条：未置顶行的图钉转禁用态，已置顶的仍可取消
    const { container, root } = await mount({
      loadGroups: async () => snapshot({ pinnedLimit: 2 }),
    })

    const rows = Array.from(container.querySelectorAll<HTMLElement>('.workspaceBody .row'))
    const plain = rows
      .find((row) => row.querySelector('.rowPinOff'))
      ?.querySelector<HTMLButtonElement>('.rowPin')
    const on = rows
      .find((row) => row.querySelector('.rowPinOn'))
      ?.querySelector<HTMLButtonElement>('.rowPin')

    expect(plain?.disabled).toBe(true)
    // 上限只拦新增，已置顶的照常可以取消
    expect(on?.disabled).toBe(false)
    await act(async () => root.unmount())
  })
})

/** 会话行的标题顺序，按列表里真实渲染的先后 */
function titles(container: HTMLElement, scope = '.workspaceBody'): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(`${scope} .row .rowTitle`)).map(
    (node) => node.textContent ?? '',
  )
}

describe('in-place pinning', () => {
  it('keeps the plain order while the display mode is pinned-area only', async () => {
    // 默认「仅置顶区域」：各段里仍是「空白最前、其余按最近更新倒序」
    // 因此置顶的 a、b 仍按更新时间落在末尾（b 更近，所以在 a 之前）
    const { container, root } = await mount()

    expect(titles(container)).toEqual([
      '会话 g',
      '会话 f',
      '会话 e',
      '会话 d',
      '会话 c',
      '会话 b',
      '会话 a',
    ])
    await act(async () => root.unmount())
  })

  it('fronts pinned sessions inside their own section when the display mode includes groups', async () => {
    const store = viewModeStoreStub()
    store.setPinned({ scope: 'inline' })
    const { container, root } = await mount({ ...storeViewModeProps(store) })

    // 置顶排到它所在那一段的最前：a、b 按置顶名次在前，其后才是按更新时间的其余会话
    expect(titles(container)).toEqual([
      '会话 a',
      '会话 b',
      '会话 g',
      '会话 f',
      '会话 e',
      '会话 d',
      '会话 c',
    ])
    await act(async () => root.unmount())
  })

  it('fronts pinned sessions in the flat list as well', async () => {
    // 平铺是第三个排序消费点，只改另外两处不会报错，只表现为「平铺里没置顶」
    const store = viewModeStoreStub()
    store.setPinned({ scope: 'inline' })
    store.set('flat')
    const { container, root } = await mount({ ...storeViewModeProps(store) })

    expect(titles(container, '.flatList')).toEqual([
      '会话 a',
      '会话 b',
      '会话 g',
      '会话 f',
      '会话 e',
      '会话 d',
      '会话 c',
    ])
    await act(async () => root.unmount())
  })

  it('fronts pinned sessions inside the ungrouped bucket without reordering the rest', async () => {
    // 末尾「未分组」桶是第四个渲染段，走的不是工作区那条分支
    // 它既有的行为是「保持会话列表原序」，因此这里只把置顶那条提前，其余逐格不动
    const store = viewModeStoreStub()
    store.setPinned({ scope: 'inline' })
    const ungrouped = ['u1', 'u2', 'u3']
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      useWorkspaces: workspaceSource({ pinned: ['u2'], ungrouped }),
      useSessions: sessionSource({ ids: ungrouped }),
    })

    // 列表序 u1,u2,u3；时间倒序 u3,u2,u1。置顶 u2 提前后是 u2,u1,u3——
    // 若整段套用了工作区那个比较器，结果会是 u2,u3,u1
    expect(titles(container)).toEqual(['会话 u2', '会话 u1', '会话 u3'])
    await act(async () => root.unmount())
  })

  it('leaves the ungrouped bucket in list order while the display mode is pinned-area only', async () => {
    const ungrouped = ['u1', 'u2', 'u3']
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['u2'], ungrouped }),
      useSessions: sessionSource({ ids: ungrouped }),
    })

    expect(titles(container)).toEqual(['会话 u1', '会话 u2', '会话 u3'])
    await act(async () => root.unmount())
  })
})

describe('pin callback freshness', () => {
  it('compares against the session open right now, not the one open at mount', async () => {
    const opened: string[] = []
    const focused: unknown[] = []
    // 三个动作都固定引用，与真实注入面一致（渲染器把 inject 结果缓存整个注册周期）
    // 每次渲染换一份新函数会掩盖「回调依赖没列全」这类陈旧闭包，测不出真问题
    const openSession = (id: string) => opened.push(id)
    const focusEntry = async (address: unknown) => {
      focused.push(address)
      return snapshot()
    }
    const setSessionPinned = async () => {}
    // 置顶集合用同一份源：真实 store 里那个数组只在集合本身变化时才换引用
    // 每次渲染新建一份会让依赖数组每次都判定为变过，把「依赖没列全」这类陈旧闭包掩盖掉
    const pinnedSource = workspaceSource({ pinned: ['a', 'b'] })

    // 挂载时当前会话是 a；随后换到 c（不在置顶集合里），再把 a 取消置顶
    // a 此刻已经不是当前会话了，因此不该替他换会话，也不该改聚焦
    const { container, root } = await mount({
      useWorkspaces: pinnedSource,
      useSessions: sessionSource({ current: 'a' }),
      openSession,
      focusEntry,
      setSessionPinned,
    })

    // 模拟「用户切到 c」：置顶集合与其它输入都没变，只有会话快照换了
    const session = sessionSource({ current: 'c' })
    await act(async () => {
      root.render(
        React.createElement(WorkspaceGroupsRegion, {
          ...props({
            useWorkspaces: pinnedSource,
            useSessions: session,
            openSession,
            focusEntry,
            setSessionPinned,
          }),
        }),
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // 取消 a 的置顶
    const rows = pinnedRows(container)
    const target = rows.find((row) => row.textContent?.includes('会话 a'))
    const button = target?.querySelector<HTMLButtonElement>('.rowPin')
    await act(async () => button?.click())

    expect(opened).toEqual([])
    expect(focused).toEqual([])
    await act(async () => root.unmount())
  })
})
