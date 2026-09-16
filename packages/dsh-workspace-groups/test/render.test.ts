import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { GroupSection } from '../src/client/components/GroupSection.tsx'
import { WorkspaceGroupsRegion } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { regionTranslate, translateWith, workspaceTranslate } from './locale-stub.ts'

/**
 * 区域组件的渲染冒烟
 *
 * node 环境没有 react-dom，这里用一个最小 dispatcher 直接调用函数组件，
 * 验证渲染期不抛错、关键结构（工作区菜单、隐式「未分组」区段、行尾菜单
 * 数量）符合预期。类型检查看不到 hook 调用次序与结构分支这类问题
 *
 * 测试替身把 Menu 渲染成 null，因此按 props 形状识别菜单元素而不下钻
 */
const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const dispatcher = {
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (fn: () => unknown) => fn(),
}

/**
 * 会真正跑 effect 与保留状态的 dispatcher
 *
 * 基础的 {@link dispatcher} 把 `useState` 的 setter 与 `useEffect` 都做成空
 * 操作，够用于「渲染一次看结构」的断言；需要界面先经过一次异步加载（例如
 * 分组元数据要先 `loadGroups` 落地才会出现分组行）时就用这一份。
 *
 * 状态按**组件类型**分桶、游标在每次调用组件前归零，与 React 的「hook 按
 * 调用顺序、游标按组件实例归零」一致：否则父组件与子组件会共用同一批槽位，
 * 状态在第二次渲染时串位。同一类型的多个实例因此共用一份状态——本测试里的
 * 行组件都停在初始态（菜单未开、无改名草稿），这个简化不影响断言
 */
function renderingDispatcher(): {
  active: unknown
  flush: () => Promise<void>
  render: (node: unknown, out: Parameters<typeof render>[1]) => void
} {
  const buckets = new Map<unknown, unknown[]>()
  const effects: (() => void)[] = []
  let cursor = 0
  let bucket: unknown[] = []

  const active = {
    useState: (initial: unknown) => {
      const index = cursor
      const owner = bucket
      cursor += 1
      if (!(index in owner)) {
        owner[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      return [
        owner[index],
        // setter 绑定调用时的状态桶：effect 在渲染结束后才跑，那时游标已经在
        // 别的组件上，按当前位置写会写错组件的槽位
        (value: unknown) => {
          owner[index] = value
        },
      ]
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void) => {
      effects.push(effect)
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useMemo: (fn: () => unknown) => fn(),
  }

  /** 切到一个组件的状态桶；返回恢复父组件桶的函数 */
  const enter = (type: unknown): (() => void) => {
    const outer = bucket
    const outerCursor = cursor
    let next = buckets.get(type)
    if (next === undefined) {
      next = []
      buckets.set(type, next)
    }
    bucket = next
    cursor = 0
    return () => {
      bucket = outer
      cursor = outerCursor
    }
  }

  return {
    active,
    /** 跑掉本轮挂上的全部 effect，并等它们的异步续作落地 */
    flush: async () => {
      const pending = effects.splice(0)
      for (const effect of pending) effect()
      // loadGroups 的 then 连跑两轮微任务才写完状态表
      await Promise.resolve()
      await Promise.resolve()
    },
    render: (node, out) => {
      bucket = []
      render(node, out, active, enter)
    },
  }
}

/** 渲染整棵树；Menu 元素被收集起来而不下钻（stub 返回 null） */
function render(
  node: unknown,
  out: {
    menus: unknown[]
    text: string[]
    buttons?: unknown[]
    containers?: unknown[]
    slots?: unknown[]
    counts?: unknown[]
    order?: string[]
  },
  active: unknown = dispatcher,
  enter?: (type: unknown) => () => void,
): void {
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') {
      out.text.push(String(n))
      return
    }
    if (Array.isArray(n)) {
      for (const child of n) walk(child)
      return
    }
    if (!React.isValidElement(n)) return
    const el = n as React.ReactElement & { type: unknown; props: Record<string, unknown> }
    if (typeof el.type === 'function') {
      // 测试替身把 Menu 渲染成 null，因此按 props 形状识别，而不是函数名
      if (Array.isArray(el.props.items) && el.props.anchor !== undefined) {
        out.menus.push(el)
        return
      }
      const prev = internals.ReactCurrentDispatcher.current
      internals.ReactCurrentDispatcher.current = active
      const leave = enter?.(el.type)
      let rendered: unknown
      try {
        rendered = (el.type as (p: unknown) => unknown)(el.props)
      } finally {
        leave?.()
        internals.ReactCurrentDispatcher.current = prev
      }
      walk(rendered)
      return
    }
    // 行内按钮（如分组行的 `+`）、操作位容器与状态点槽位都是宿主元素，收集起来供断言
    if (el.props['className'] === 'wg-row-actions') out.containers?.push(el)
    if (el.props['className'] === 'wg-slot') out.slots?.push(el)
    if (el.props['className'] === 'wg-group-count') out.counts?.push(el)
    // 按文档序记下行头各段，用来断言「会话数在标题右侧、操作位左侧」
    const section = el.props['className']
    if (section === 'wg-group-label' || section === 'wg-group-count' || section === 'wg-row-actions') {
      out.order?.push(String(section))
    }
    if (el.type === 'button') out.buttons?.push(el)
    walk(el.props.children as unknown)
  }
  walk(node)
}

/** 把行内操作按钮的无障碍标签、原生提示与点击回调读出来 */
function rowButtons(
  out: { buttons?: unknown[] },
): { label: string; title: string | undefined; click: () => void }[] {
  return (out.buttons ?? []).map((b) => {
    const el = b as { props: Record<string, unknown> }
    const title = el.props['title']
    return {
      label: String(el.props['aria-label'] ?? ''),
      title: typeof title === 'string' ? title : undefined,
      // 按钮的 onClick 会先 stopPropagation，替身事件给出空实现即可
      click: () => (el.props['onClick'] as (e: unknown) => void)({ stopPropagation: () => {} }),
    }
  })
}

/**
 * 把所有已渲染 Menu 的条目文案读出来。
 *
 * Menu 在测试替身里渲染成 null，锚点按钮与条目都只存在于它的 props 上，
 * 因此文案要从捕获的 Menu 元素里取。
 */
function menuLabels(out: { menus: unknown[] }): string[] {
  return out.menus.flatMap((m) =>
    (m as { props: { items: { label?: unknown }[] } }).props.items
      .map((item) => item.label)
      .filter((label): label is string => typeof label === 'string'),
  )
}

/** 把所有行内操作按钮的锚点元素读出来（工作区行、分组行与会话行的 `...`） */
function actionAnchors(out: { menus: unknown[] }): { props?: Record<string, unknown> }[] {
  return out.menus
    .map((m) => (m as { props: { anchor?: { props?: Record<string, unknown> } } }).props.anchor)
    .filter((anchor): anchor is { props?: Record<string, unknown> } => anchor !== undefined)
}

/** 把所有行内操作按钮的无障碍标签读出来（工作区行与会话行的锚点） */
function actionLabels(out: { menus: unknown[] }): string[] {
  return actionAnchors(out)
    .map((anchor) => anchor.props?.['aria-label'])
    .filter((label): label is string => typeof label === 'string')
}

/** 锚点按钮上的原生 `title` 提示；本包所有行操作只留无障碍标签，不该有 */
function actionTitles(out: { menus: unknown[]; buttons?: unknown[] }): (string | undefined)[] {
  return [
    ...actionAnchors(out).map((anchor) => anchor.props?.['title'] as string | undefined),
    ...rowButtons(out).map((button) => button.title),
  ]
}

/** 状态点槽位上挂的原生 `title` 提示；状态语义由无障碍标签承担，槽位不该有 */
function slotTitles(out: { slots?: unknown[] }): (string | undefined)[] {
  return (out.slots ?? []).map(
    (slot) => (slot as { props: Record<string, unknown> }).props['title'] as string | undefined,
  )
}

/** 把所有已渲染 Menu 的条目 id 读出来 */
function menuItems(out: { menus: unknown[] }): string[][] {
  return out.menus.map((m) =>
    ((m as { props: { items: { id: string }[] } }).props.items).map((item) => item.id),
  )
}

/**
 * 收集容器行的行尾操作结构
 *
 * 「分组行与工作区行同形」是这次改动的核心承诺，因此断言落在结构上：两者
 * 都必须有 `...` 菜单锚点与 `+` 按钮，且都在 `.wg-row-actions` 容器里
 */
function rowActionShape(out: { menus: unknown[]; buttons?: unknown[]; containers?: unknown[] }): {
  menuAnchors: number
  plusButtons: number
  containers: number
} {
  return {
    menuAnchors: out.menus.length,
    plusButtons: rowButtons(out).filter((b) => b.label.includes('新建会话')).length,
    containers: (out.containers ?? []).length,
  }
}

/** 渲染一个分组行并返回可断言的操作结构 */
function renderGroupRow(onCreateSession?: () => void, sessionCount = 0) {
  const out = {
    menus: [] as unknown[],
    text: [] as string[],
    buttons: [] as unknown[],
    containers: [] as unknown[],
    counts: [] as unknown[],
    order: [] as string[],
  }
  render(
    React.createElement(GroupSection, {
      section: {
        id: 'g1',
        label: '前端',
        sessions: Array.from({ length: sessionCount }, (_, index) => ({
          id: `s${index}`,
          title: `会话 ${index}`,
          blank: false,
          running: false,
          runningSubagentCount: 0,
          completed: false,
          updatedAt: 0,
        })),
      },
      collapsed: false,
      onToggle: () => {},
      onRename: () => {},
      onDelete: () => {},
      ...(onCreateSession === undefined ? {} : { onCreateSession }),
      labels: {
        actions: (name: string) => `分组“${name}”的操作`,
        // 菜单项用官方通用动词，对话框标题才点明对象
        rename: '重命名',
        delete: '删除分组',
        newSession: (name: string) => `在“${name}”中新建会话`,
      },
      children: null,
    }),
    out,
  )
  return out
}

function props(
  wide: boolean,
  options: {
    pending?: Map<unknown, unknown>
    official?: boolean
    /** 缺省给官方「添加工作区」服务面；false 用于验证降级路径 */
    add?: boolean
    /** directoryFlow 洞是否被占用；缺省为已占用 */
    flowOccupied?: boolean
    /** 造一条当前选中的空白（新建中）会话；缺省不加 */
    blankCurrent?: boolean
    /** startSession 的返回值；undefined 模拟导航被取代 */
    startReturns?: string | undefined
    /** 记录 moveSession 的三元调用 */
    moves?: [string, string, string][]
  } = {},
): WorkspaceGroupsProps {
  const byId: Record<string, unknown> = {
    a: { id: 'a', displayTitle: 'A', running: false, blank: false, updatedAt: Date.now() - 300_000 },
    orphan: {
      id: 'orphan',
      displayTitle: 'Orphan',
      running: false,
      blank: false,
      updatedAt: Date.now() - 300_000,
    },
  }
  // 空白会话的宿主后备标题是目录名；渲染行必须用语言包的固定名顶掉它
  if (options.blankCurrent === true) {
    byId['blank'] = {
      id: 'blank',
      displayTitle: 'w1',
      running: false,
      blank: true,
      updatedAt: Date.now() - 300_000,
    }
  }
  const sessionIds = options.blankCurrent === true ? ['a', 'blank'] : ['a']
  const workspaces = [
    {
      workspaceId: 'w1',
      path: '/tmp/w1',
      title: 'W1',
      sessionIds,
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
      select({
        ids: [...sessionIds, 'orphan'],
        byId,
        current: options.blankCurrent === true ? 'blank' : undefined,
        phase: 'ready',
      })) as never,
    useSessionPendingInteraction: ((select: (s: unknown) => unknown) =>
      select(options.pending ?? new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) =>
      select(options.flowOccupied ?? true)) as never,
    openSession: () => {},
    // startReturns 显式给了就用它（undefined 表示导航被取代），否则给一个 id
    startSession: async () =>
      'startReturns' in options ? options.startReturns : 'fresh',
    loadGroups: async () => ({ w1: [{ id: 'g1', name: '前端', sessionIds: [] }] }),
    onReady: () => () => {},
    createGroup: async () => {},
    renameGroup: async () => {},
    deleteGroup: async () => {},
    moveSession: async (workspaceId: string, sessionId: string, groupId: string) => {
      options.moves?.push([workspaceId, sessionId, groupId])
    },
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    t: regionTranslate(),
    tWorkspace: workspaceTranslate(),
    // 官方三项操作与相对时间：缺省不给，用于验证降级路径
    ...(options.official === false
      ? {}
      : {
          official: () => ({
            renameSession: async () => {},
            forkSession: () => {},
            archiveSession: async () => {},
            labels: officialSessionLabels(workspaceTranslate()),
            relativeTime: (updatedAt, now) => timeLabel(updatedAt, now, workspaceTranslate()),
          }),
        }),
    ...(options.add === false
      ? {}
      : {
          addWorkspace: () => ({
            createWorkspace: async (path: string) => ({ workspaceId: `w-${path}` }),
            startSession: () => {},
            occupant: () => ({
              component: (() => null) as never,
              inject: () => ({}),
            }),
            labels: officialAddLabels(workspaceTranslate()),
          }),
        }),
  }
}

describe('WorkspaceGroupsRegion render', () => {
  it('renders the wide region without throwing', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    expect(() => render(React.createElement(WorkspaceGroupsRegion, props(true)), out)).not.toThrow()

    // 每个工作区行一个菜单；未分组区段的会话行没有菜单
    expect(menuItems(out)).toContainEqual(['new-group', 'rename', 'delete'])
  })

  it('renders an ungrouped section only when a stray session exists', () => {
    const withStray = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), withStray)
    // 孤会话（无所属工作区）应落在「未分组」区段里
    expect(withStray.text).toContain('未分组')
    expect(withStray.text).toContain('Orphan')

    const none = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(false)), none)
    expect(none.text).not.toContain('未分组')
  })

  it('gives a workspace session row the official actions and the group item', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 工作区行自己的菜单 + 归组会话行的菜单
    expect(menuItems(out)).toContainEqual(['new-group', 'rename', 'delete'])
    expect(menuItems(out)).toContainEqual(['rename', 'fork', 'archive', 'separator', 'group'])
  })

  it('uses the generic rename verb in the workspace row menu, like official does', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 官方工作区菜单项就是 label: t("rename")；rename.workspace.title 只作对话框
    // 标题。这里断言菜单里显示的是通用动词，而不是「重命名工作区」。
    const workspaceMenu = out.menus.find(
      (m) => menuItems({ menus: [m] })[0]?.join() === 'new-group,rename,delete',
    )
    expect(workspaceMenu).toBeDefined()
    expect(menuLabels({ menus: [workspaceMenu] })).toEqual(['新建分组', '重命名', '删除工作区'])
  })

  it('gives the ungrouped row the official actions without a group item', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // stray 会话没有分组可归，但官方三项照常可用
    expect(menuItems(out)).toContainEqual(['rename', 'fork', 'archive'])
  })

  it('names the provisional blank session with the official fixed label', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true, { blankCurrent: true })), out)

    // 空白行显示官方 session.new 的固定名，而不是宿主给的后备标题（目录名 w1）
    expect(out.text).toContain('新会话')
    expect(out.text).not.toContain('w1')
  })

  it('gives the blank session no row menu until it is really started', () => {
    const withBlank = { menus: [] as unknown[], text: [] as string[] }
    render(
      React.createElement(WorkspaceGroupsRegion, props(true, { blankCurrent: true })),
      withBlank,
    )
    const without = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), without)

    // 空白行没有会话可重命名或归档。官方连省略号都不渲染，本包同样收掉：
    // 多出这条占位行后菜单数不变（工作区行、既有会话行、未分组桶各一）
    expect(menuItems(withBlank)).toEqual(menuItems(without))
    expect(menuItems(withBlank)).toContainEqual(['new-group', 'rename', 'delete'])
    expect(menuItems(withBlank)).toContainEqual(['rename', 'fork', 'archive', 'separator', 'group'])
  })

  it('shows the summary title once the session leaves the blank state', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 非空会话直接用宿主投影的显示标题
    expect(out.text).toContain('A')
    expect(out.text).not.toContain('新会话')
  })

  it('shows the group session count as its own trailing element', () => {
    const out = renderGroupRow(() => {}, 3)

    // 会话数不再拼进标题文本，而是自己一格贴在行右——与 session 行的 time 同位置
    expect(out.text).toContain('前端')
    expect(out.text).not.toContain('前端 (3)')
    expect((out.counts ?? []).length).toBe(1)
    const count = (out.counts ?? [])[0] as { props: { children?: unknown } }
    expect(count.props.children).toBe(3)
    // 行头文档序：标题 → 会话数 → 操作位，即会话数落在行的右侧
    expect(out.order).toEqual(['wg-group-label', 'wg-group-count', 'wg-row-actions'])
  })

  it('omits the group session count for an empty group', () => {
    // 空分组的 0 是噪声；行尾留给操作按钮
    const out = renderGroupRow(() => {}, 0)

    expect((out.counts ?? []).length).toBe(0)
    expect(out.text).not.toContain('0')
    expect(out.order).toEqual(['wg-group-label', 'wg-row-actions'])
  })

  it('keeps the group row actions in the same shape as the workspace row', () => {
    const out = renderGroupRow(() => {})

    // 分组行的 `...` 收着删除与重命名，`+` 是行内新建会话——与工作区行同形
    expect(menuItems(out)).toEqual([['rename', 'delete']])
    expect(menuLabels(out)).toEqual(['重命名', '删除分组'])
    expect(actionLabels(out)).toEqual(['分组“前端”的操作'])
    expect(rowButtons(out).map((b) => b.label)).toEqual(['在“前端”中新建会话'])

    // 两者都走同一个操作位容器，布局因此不可能各自漂移
    const group = rowActionShape(out)
    expect(group.containers).toBe(1)
    expect(group.menuAnchors).toBe(1)
    expect(group.plusButtons).toBe(1)
  })

  it('leaves row actions with an accessible label but no native tooltip', () => {
    const region = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), region)
    const group = renderGroupRow(() => {})

    // 行操作（`...` 锚点与 `+`）只留 aria-label，不再挂原生 title 提示；
    // 文案仍要照常投影出来，不能连无障碍标签一起丢
    expect(actionLabels(region).length).toBeGreaterThan(0)
    expect(actionTitles(region).filter((t) => t !== undefined)).toEqual([])
    expect(actionTitles(group).filter((t) => t !== undefined)).toEqual([])
  })

  it('leaves the status slot with an accessible label but no native tooltip', () => {
    const out = { menus: [] as unknown[], text: [] as string[], slots: [] as unknown[] }
    const pending = new Map([['orphan', { kind: 'approval' }]])
    render(React.createElement(WorkspaceGroupsRegion, props(true, { pending })), out)

    // 状态点是纯视觉元素，语义靠槽位的 aria-label 承担；原生 title 会多出
    // 一个同级提示，因此不再挂
    const status = (out.slots as { props: Record<string, unknown> }[]).filter(
      (slot) => slot.props['role'] === 'img',
    )
    expect(status.map((slot) => slot.props['aria-label'])).toContain('等待审批')
    expect(slotTitles(out).filter((t) => t !== undefined)).toEqual([])
  })

  it('drops the plus button but keeps the menu when no create handler is given', () => {
    const out = renderGroupRow()

    expect(rowActionShape(out).containers).toBe(1)
    expect(rowActionShape(out).plusButtons).toBe(0)
    expect(menuItems(out)).toEqual([['rename', 'delete']])
  })

  it('builds the group session through the plus button', () => {
    const created: string[] = []
    const out = renderGroupRow(() => created.push('g1'))

    const plus = rowButtons(out).find((b) => b.label.includes('新建会话'))
    expect(plus).toBeDefined()
    plus?.click()
    expect(created).toEqual(['g1'])
  })

  it('moves a session created from the workspace row out of any group', async () => {
    const moves: [string, string, string][] = []
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(
      React.createElement(
        WorkspaceGroupsRegion,
        props(true, { startReturns: 'fresh', moves }),
      ),
      out,
    )

    // 工作区行的 `+` 指的是「未归组的新会话」。官方会复用该工作区已有的空白
    // 会话——若那条会话先前是在分组里建的，这里必须显式把它移出分组，否则
    // 它的位置会停在上一次创建的地方
    rowButtons(out)
      .find((b) => b.label.includes('W1'))
      ?.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(moves).toEqual([['w1', 'fresh', '']])
  })

  it('moves a session created from a group row into that group', async () => {
    const moves: [string, string, string][] = []
    const harness = renderingDispatcher()
    const args = props(true, { startReturns: 'fresh', moves })

    // 分组行要先等 loadGroups 落地才存在，因此这里跑一遍 effect 再渲染
    const first = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    rowButtons(out)
      .find((b) => b.label.includes('前端'))
      ?.click()
    await Promise.resolve()
    await Promise.resolve()

    // 分组行的 `+` 把会话归入该分组
    expect(moves).toEqual([['w1', 'fresh', 'g1']])
  })

  it('skips the placement when a newer navigation superseded this creation', async () => {
    const moves: [string, string, string][] = []
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(
      React.createElement(
        WorkspaceGroupsRegion,
        props(true, { startReturns: undefined, moves }),
      ),
      out,
    )

    // 被取代的那次新建不打开会话，也就不该再摆它的位置
    rowButtons(out)
      .find((b) => b.label.includes('W1'))
      ?.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(moves).toEqual([])
  })

  it('renders no session menu at all when official services are absent', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true, { official: false })), out)

    // 官方缺失时会话行只剩归组菜单；stray 行两项都没有，因此完全不挂菜单
    expect(menuItems(out)).toContainEqual(['group'])
    expect(menuItems(out)).toHaveLength(2)
  })

  it('renders the relative time on session rows when official services are present', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 行尾时间来自官方格式化（替身固定返回 5分钟）
    expect(out.text).toContain('5分钟')
  })

  it('renders no relative time when official services are absent', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true, { official: false })), out)

    // 时间文案也归官方语言包，缺失时整列不渲染
    expect(out.text).not.toContain('5分钟')
  })

  it('reads the package-owned copy from the seat at render time', () => {
    const first = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), first)

    // 同一个组件、换一个翻译座位重新渲染：自有文案跟着换。inject 结果被
    // 渲染器缓存整个注册周期，因此文案投影必须在渲染期做，不能放进 inject。
    const second = { menus: [] as unknown[], text: [] as string[] }
    render(
      React.createElement(WorkspaceGroupsRegion, {
        ...props(true),
        t: translateWith({ newGroup: 'New group' }) as never,
      }),
      second,
    )

    expect(menuLabels(first)).toContain('新建分组')
    expect(menuLabels(second)).toContain('New group')
    expect(menuLabels(second)).not.toContain('新建分组')
  })

  it('takes the official copy from the official translate function, not our dictionary', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 官方已有的文案由官方命名空间提供：本包自己的座位里没有这些键，
    // 拿不到就只能显示原始键名。
    expect(actionLabels(out)).toContain('工作区“W1”的操作')
    expect(actionLabels(out)).toContain('会话“A”的操作')
    expect(out.text).toContain('未分组')
  })

  it('labels the session row action button with the official aria key', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 会话行的「...」用官方 actions.session.aria，取会话标题；工作区行用
    // actions.workspace.aria，取工作区标题。
    expect(actionLabels(out)).toContain('会话“A”的操作')
    expect(actionLabels(out)).toContain('工作区“W1”的操作')
  })

  it('renders no status dot for idle session rows', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 空闲行不画点，但槽位仍在，标题因此不位移
    expect(out.text.filter((t) => t.startsWith('StateDot:'))).toEqual([])
  })

  it('renders a warning dot for a session awaiting user interaction', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    const pending = new Map([['orphan', { kind: 'approval' }]])
    render(React.createElement(WorkspaceGroupsRegion, props(true, { pending })), out)

    // 待交互压过其他状态：orphan 静置但仍在等用户审批
    expect(out.text).toContain('StateDot:warning')
  })

  it('renders the section header with the region title and the add entry', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 标题取官方 section.workspaces；「添加工作区」入口的无障碍标签取 workspace.add
    expect(out.text).toContain('工作区')
    expect(rowButtons(out).map((b) => b.label)).toContain('添加工作区')
  })

  it('keeps the unimplemented header entries as disabled placeholders', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 搜索与视图选项尚未实现：位置与字形对齐官方，但明说不可用，
    // 而不是渲染成点下去没反应的死按钮
    const search = (out.buttons ?? []).find(
      (b) => (b as { props: Record<string, unknown> }).props['aria-label'] === '搜索会话',
    )
    const viewOptions = (out.buttons ?? []).find(
      (b) => (b as { props: Record<string, unknown> }).props['aria-label'] === '视图选项',
    )
    expect((search as { props: Record<string, unknown> }).props['disabled']).toBe(true)
    expect((viewOptions as { props: Record<string, unknown> }).props['disabled']).toBe(true)
  })

  it('drops the add entry when the directory flow hole is unoccupied', () => {
    const occupied = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), occupied)
    expect(rowButtons(occupied).map((b) => b.label)).toContain('添加工作区')

    // 宿主没装目录选择器时洞是空的，入口整体不渲染，不留点不动的死按钮
    const bare = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(
      React.createElement(WorkspaceGroupsRegion, props(true, { flowOccupied: false })),
      bare,
    )
    expect(rowButtons(bare).map((b) => b.label)).not.toContain('添加工作区')
  })

  it('drops the add entry when the official services are absent', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true, { add: false })), out)

    // 服务面拿不到时同样不渲染入口
    expect(rowButtons(out).map((b) => b.label)).not.toContain('添加工作区')
  })

  it('offers the add entry in the narrow rail as well', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(false)), out)

    // 官方窄栏也放这个入口（36px、label-primary），这里保持一致
    expect(rowButtons(out).map((b) => b.label)).toContain('添加工作区')
  })
})
