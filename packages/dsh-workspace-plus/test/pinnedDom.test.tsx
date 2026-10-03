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
    }: {
      items?: { id: string; label?: React.ReactNode; disabled?: boolean }[]
      onSelect?: (id: string) => void
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
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
    store.setPinSectionCollapsed(true)
    const { container, root } = await mount({ ...storeViewModeProps(store) })

    expect(container.querySelector('.pinnedSection')).not.toBeNull()
    expect(container.querySelector('.pinScroll')).toBeNull()
    // 收起后行尾提示改为只报总数
    expect(container.querySelector('.pinHeadHint')?.textContent).toBe('2 条')
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

  it('keeps the reserved height while the section is hovered open', async () => {
    // 浮出态里预览区是绝对定位、脱离流，段必须自己常驻住静止高度
    // 高度只由那个预览区撑着的话，指针一进入整段就塌成「段头 + 分隔」，下方内容整体上移
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const section = container.querySelector<HTMLElement>('.pinnedSection')

    // 静止态：常驻高度由段自己撑着（三项之和由样式表算，这里只认变量已下发）
    expect(section?.style.getPropertyValue('--wg-pin-rest')).toBe('168px')
    expect(section?.style.getPropertyValue('--wg-pin-head')).toBe('30px')

    await act(async () => {
      section?.querySelector('.pinScroll')?.dispatchEvent(
        // React 的 onPointerEnter 由 root 上的 pointerover/pointerout 合成而来
        // 必须派发 pointerover：React 收不到 pointerenter
        new PointerEvent('pointerover', { bubbles: true }),
      )
    })

    // 浮出后 DOM 里换成全部 7 行，但段本身与那三个变量都没变，高度因此不变
    expect(pinnedRows(container)).toHaveLength(7)
    expect(section?.style.getPropertyValue('--wg-pin-rest')).toBe('168px')
    await act(async () => root.unmount())
  })

  it('does not open on hover while nothing is left over', async () => {
    // 2 条置顶、可见 5 条：没有行被裁掉，浮出只是把一个等高的盒子重新定位一遍
    const { container, root } = await mount()
    const scroll = container.querySelector<HTMLElement>('.pinScroll')

    await act(async () => {
      // 必须派发 pointerover：React 收不到 pointerenter
      scroll?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })

    expect(container.querySelector('.pinScroll')?.className).not.toContain('pinScrollOpen')
    expect(pinnedRows(container)).toHaveLength(2)
    await act(async () => root.unmount())
  })

  it('opens on hover once rows are actually cut off', async () => {
    const { container, root } = await mount({
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })
    const scroll = container.querySelector<HTMLElement>('.pinScroll')

    // 标记是静态的：它只说明「这一行超出静止可见条数」，怎么收起来交给样式表
    expect(scroll?.querySelectorAll('[data-wg-clipped]')).toHaveLength(2)

    await act(async () => {
      // React 的 onPointerEnter 由 root 上的 pointerover/pointerout 合成而来
      // 必须派发 pointerover：React 收不到 pointerenter
      scroll?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })

    // 展开靠这一个类：样式表里收起可见性的规则挂在 `.pinScroll:not(.pinScrollOpen)` 上
    // 类一加，被裁掉的行自然回到可见
    expect(container.querySelector('.pinScroll')?.className).toContain('pinScrollOpen')
    expect(container.querySelectorAll('.pinScroll [data-wg-clipped]')).toHaveLength(2)
    await act(async () => root.unmount())
  })

  it('allows scrolling in place in scroll mode', async () => {
    const store = viewModeStoreStub()
    store.setPinOverflow('scroll')
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      // 7 条置顶、可见 5 条：区内滚动靠的是超出裁剪高度的那些行，因此全部都要在 DOM 里
      useWorkspaces: workspaceSource({ pinned: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
    })

    // scroll 模式不套 expand 那两个类，靠样式表里那条 data 属性规则允许滚动
    expect(container.querySelector('.pinnedSection')?.className).not.toContain('pinExpand')
    expect(container.querySelector('.pinScroll')?.className).not.toContain('pinScrollClipped')
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
    store.setPinScope('inline')
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
    store.setPinScope('inline')
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
    store.setPinScope('inline')
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
