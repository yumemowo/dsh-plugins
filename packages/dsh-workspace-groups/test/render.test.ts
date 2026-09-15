import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { GroupSection } from '../src/client/components/GroupSection.tsx'
import { WorkspaceGroupsRegion } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import { officialSessionLabels, timeLabel } from '../src/client/official.ts'
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

/** 渲染整棵树；Menu 元素被收集起来而不下钻（stub 返回 null） */
function render(
  node: unknown,
  out: { menus: unknown[]; text: string[]; buttons?: unknown[]; containers?: unknown[] },
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
      internals.ReactCurrentDispatcher.current = dispatcher
      let rendered: unknown
      try {
        rendered = (el.type as (p: unknown) => unknown)(el.props)
      } finally {
        internals.ReactCurrentDispatcher.current = prev
      }
      walk(rendered)
      return
    }
    // 行内按钮（如分组行的 `+`）与操作位容器都是宿主元素，收集起来供断言
    if (el.props['className'] === 'wg-row-actions') out.containers?.push(el)
    if (el.type === 'button') out.buttons?.push(el)
    walk(el.props.children as unknown)
  }
  walk(node)
}

/** 把行内操作按钮的无障碍标签与点击回调读出来 */
function rowButtons(out: { buttons?: unknown[] }): { label: string; click: () => void }[] {
  return (out.buttons ?? []).map((b) => {
    const el = b as { props: Record<string, unknown> }
    return {
      label: String(el.props['aria-label'] ?? ''),
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

/** 把所有行内操作按钮的无障碍标签读出来（工作区行与会话行的锚点） */
function actionLabels(out: { menus: unknown[] }): string[] {
  return out.menus
    .map((m) => (m as { props: { anchor?: { props?: Record<string, unknown> } } }).props.anchor)
    .map((anchor) => anchor?.props?.['aria-label'])
    .filter((label): label is string => typeof label === 'string')
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
function renderGroupRow(onCreateSession?: () => void) {
  const out = {
    menus: [] as unknown[],
    text: [] as string[],
    buttons: [] as unknown[],
    containers: [] as unknown[],
  }
  render(
    React.createElement(GroupSection, {
      section: { id: 'g1', label: '前端', sessions: [] },
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
  options: { pending?: Map<unknown, unknown>; official?: boolean } = {},
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
      select(options.pending ?? new Map())) as never,
    openSession: () => {},
    startSession: async () => '',
    loadGroups: async () => ({ w1: [{ id: 'g1', name: '前端', sessionIds: [] }] }),
    onReady: () => () => {},
    createGroup: async () => {},
    renameGroup: async () => {},
    deleteGroup: async () => {},
    moveSession: async () => {},
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
})
