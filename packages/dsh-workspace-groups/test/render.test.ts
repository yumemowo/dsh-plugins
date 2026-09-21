import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { GroupSection } from '../src/client/components/GroupSection.tsx'
import { SessionRowMenu } from '../src/client/components/SessionRowMenu.tsx'
import { WorkspaceSection } from '../src/client/components/WorkspaceSection.tsx'
import type { WorkspaceSectionProps } from '../src/client/components/WorkspaceSection.tsx'
import { WorkspaceGroupsRegion } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import {
  officialAddLabels,
  officialHoverLabels,
  officialSessionLabels,
  timeLabel,
} from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, translateWith, workspaceTranslate } from './locale-stub.ts'
import { menuLabelArrow, menuLabelText } from './menu-label.ts'
import { snapshot } from './snapshot-stub.ts'

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
  useLayoutEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (fn: () => unknown) => fn(),
  // 上下文在渲染期读取，返回值按提供者追不下去也用不到：断言只关心结构
  useContext: (context: { _currentValue?: unknown }) => context._currentValue,
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
        // 别的组件上，按当前位置写会写错组件的槽位。
        // 函数式更新与 React 同义（取旧值算新值），否则 `setX(v => !v)` 会把那个
        // 函数本身存成状态
        (value: unknown) => {
          owner[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(owner[index]) : value
        },
      ]
    },
    useCallback: (fn: unknown) => fn,
    useEffect: (effect: () => void) => {
      effects.push(effect)
    },
    useLayoutEffect: (effect: () => void) => {
      effects.push(effect)
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useMemo: (fn: () => unknown) => fn(),
    useContext: (context: { _currentValue?: unknown }) => context._currentValue,
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
    /** 文本框元素，按文档序；搜索的受控输入在这里 */
    inputs?: unknown[]
    containers?: unknown[]
    slots?: unknown[]
    counts?: unknown[]
    order?: string[]
    /** 折叠体元素，按文档序 */
    collapses?: unknown[]
    /** 会话行元素，按文档序 */
    rows?: unknown[]
    /** 行右键菜单元素，按文档序；与 `menus` 分开收，见下方识别条件 */
    contextMenus?: unknown[]
    /** 挂了右键处理的行元素，按文档序（工作区行头、分组行头、会话行） */
    hosts?: unknown[]
    /** 搜索结果第二行（路径）的元信息元素，按文档序 */
    metas?: unknown[]
    /** 悬停卡片元素，按文档序；正文从它的 `content` prop 上读 */
    cards?: unknown[]
    /** 官方 Modal 元素（如命名框）；标题从它的 props 上读 */
    modals?: unknown[]
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
    // memo 包出来的组件其 type 是对象而不是函数，函数体挂在 type.type 上。
    // 替身没有 React 的比对逻辑，这里取内层函数直接调用即可——本测试关心结构，
    // 不关心某次渲染是否被 memo 挡下
    const memoized = el.type as { type?: unknown } | undefined
    const type =
      typeof el.type === 'function'
        ? el.type
        : memoized !== null && typeof memoized === 'object' && typeof memoized.type === 'function'
          ? memoized.type
          : el.type
    if (typeof type === 'function') {
      // 官方 Modal 的替身也渲染成 null，但它的 props 上是调用方真正给的标题与页脚；
      // 按形状（open + title + onClose）认出来，命名框的标题因此可断言
      if (
        el.props['open'] !== undefined &&
        el.props['title'] !== undefined &&
        el.props['onClose'] !== undefined
      ) {
        out.modals?.push(el)
      }
      // 测试替身把 Menu 渲染成 null，因此按 props 形状识别，而不是函数名。
      // 右键菜单与按钮菜单都是 Menu，靠锚点区分：右键那一份锚点在指针处，按
      // 契约传 anchor={null} 并由 getAnchorRect 定位，两者因此不会混进同一个桶
      if (Array.isArray(el.props.items) && el.props.anchor !== undefined) {
        if (el.props.anchor === null) out.contextMenus?.push(el)
        else out.menus.push(el)
        return
      }
      // 悬停卡片的替身只渲染锚点那一半，正文留在 props 上。收下卡片后仍要走进
      // 锚点：行本身与行上的菜单都在里面，否则这些结构会整段读不到
      if (
        el.props.content !== undefined &&
        el.props.content !== null &&
        el.props.anchor !== undefined
      ) {
        out.cards?.push(el)
        walk(el.props.anchor)
        return
      }
      const prev = internals.ReactCurrentDispatcher.current
      internals.ReactCurrentDispatcher.current = active
      // enter 按**内层**函数分桶：memo 对象的身份在内层组件每次渲染时都是同一个，
      // 用 type 或内层函数都不影响本测试的状态分桶，但保持一致更直白
      const leave = enter?.(type)
      let rendered: unknown
      try {
        rendered = (type as (p: unknown) => unknown)(el.props)
      } finally {
        leave?.()
        internals.ReactCurrentDispatcher.current = prev
      }
      walk(rendered)
      return
    }
    // 行内按钮（如分组行的 `+`）、操作位容器与状态点槽位都是宿主元素，收集起来供断言
    if (el.props['className'] === 'wg-row-actions') out.containers?.push(el)
    // 行了挂右键处理的行：据此断言右键入口确实接在了行本身上
    if (el.props['onContextMenu'] !== undefined) out.hosts?.push(el)
    if (el.props['className'] === 'wg-slot') out.slots?.push(el)
    if (el.props['className'] === 'wg-group-count') out.counts?.push(el)
    if (el.props['className'] === 'wg-search-result-meta') out.metas?.push(el)
    // 会话行与分组头都带淡入标记；这里只收会话行（带 data-wg-stagger 的 wg-row）
    if (
      typeof el.props['className'] === 'string' &&
      (el.props['className'] as string).startsWith('wg-row') &&
      el.props['data-wg-stagger'] === ''
    ) {
      out.rows?.push(el)
    }
    if (
      el.props['className'] === 'wg-collapse' ||
      el.props['className'] === 'wg-collapse wg-collapse-open'
    ) {
      out.collapses?.push(el)
    }
    // 按文档序记下行头各段，用来断言「会话数在标题右侧、操作位左侧」
    const section = el.props['className']
    if (section === 'wg-group-label' || section === 'wg-group-count' || section === 'wg-row-actions') {
      out.order?.push(String(section))
    }
    if (el.type === 'button') out.buttons?.push(el)
    if (el.type === 'input') out.inputs?.push(el)
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
      .map((item) => menuLabelText(item.label))
      .filter((label) => label !== ''),
  )
}

/** 把所有行内操作按钮的锚点元素读出来（工作区行、分组行与会话行的 `...`） */
function actionAnchors(out: { menus: unknown[] }): { props?: Record<string, unknown> }[] {
  return out.menus
    .map((m) => (m as { props: { anchor?: { props?: Record<string, unknown> } } }).props.anchor)
    .filter((anchor): anchor is { props?: Record<string, unknown> } => anchor !== undefined)
}

/**
 * 命名框的标题
 *
 * 官方 `Modal` 的测试替身渲染成 null，但 `NameDialog` 返回的仍是 `Modal` 元素，
 * 标题留在它的 props 上；未打开时返回 undefined
 */
function dialogTitle(out: { modals?: unknown[] }): string | undefined {
  // 「添加工作区」的错误框一直挂着一个 open=false 的 Modal，因此只认真正打开的
  // 那个（本包同一时刻至多一个对话框）
  const open = (out.modals ?? []).filter(
    (m) => (m as { props: { open?: unknown } }).props['open'] === true,
  )
  const title = (open[0] as { props: { title?: unknown } } | undefined)?.props['title']
  return typeof title === 'string' ? title : undefined
}

/**
 * 打开的命名框里的输入框元素
 *
 * 官方 `Input` 的替身渲染成 null，因此没有宿主 `input` 节点可查；`NameDialog`
 * 返回的 `Modal` 元素把 `Input` 留在自己的 `children` 上，从那里读
 */
function dialogInput(out: { modals?: unknown[] }): { props: Record<string, unknown> } | undefined {
  const open = (out.modals ?? []).filter(
    (m) => (m as { props: { open?: unknown } }).props['open'] === true,
  )
  const children = (open[0] as { props: { children?: unknown } } | undefined)?.props.children
  return flatten(children).find(
    (c) =>
      c !== null &&
      typeof c === 'object' &&
      typeof (c as { props?: Record<string, unknown> }).props?.['aria-label'] === 'string',
  ) as { props: Record<string, unknown> } | undefined
}

/** 把元素树的一层 children（可能嵌套数组、含 null）摊平 */
function flatten(node: unknown): unknown[] {
  if (node === null || node === undefined || typeof node === 'boolean') return []
  if (Array.isArray(node)) return node.flatMap(flatten)
  return [node]
}

/** 打开的命名框页脚里的按钮（取消在前、确认在后） */
function dialogButtons(out: { modals?: unknown[] }): { props: Record<string, unknown> }[] {
  const open = (out.modals ?? []).filter(
    (m) => (m as { props: { open?: unknown } }).props['open'] === true,
  )
  const modal = open[0] as { props: { footer?: { props?: { children?: unknown } } } } | undefined
  const children = modal?.props.footer?.props?.children
  return (Array.isArray(children) ? children : [children]).filter(
    (c): c is { props: Record<string, unknown> } => c !== null && typeof c === 'object',
  )
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
 * 在一条行上触发一次右键
 *
 * 行是宿主元素，处理函数直接挂在它的 props 上；事件按真实 `contextmenu` 的
 * 形状造：带指针坐标，并记录 preventDefault / stopPropagation 是否被调用。
 * 缺省坐标 (0,0) 模拟键盘（菜单键）触发的右键
 * @param row - 行元素（工作区行头、分组行头或会话行）
 * @param at - 指针坐标
 * @returns 这次右键是否拦掉了浏览器默认菜单与冒泡
 */
function fireContextMenu(
  row: unknown,
  at: { clientX: number; clientY: number } = { clientX: 0, clientY: 0 },
): { prevented: boolean; stopped: boolean } {
  const handler = (row as { props: Record<string, unknown> }).props['onContextMenu'] as
    | ((event: unknown) => void)
    | undefined
  if (handler === undefined) return { prevented: false, stopped: false }
  let prevented = false
  let stopped = false
  handler({
    ...at,
    currentTarget: { getBoundingClientRect: () => ({ left: 4, top: 8, right: 40, bottom: 30 }) },
    preventDefault: () => {
      prevented = true
    },
    stopPropagation: () => {
      stopped = true
    },
  })
  return { prevented, stopped }
}

/** 从一张菜单元素上读条目 id；菜单不存在时给空表 */
function menuIdsOf(menu: unknown): string[] {
  if (menu === null || menu === undefined) return []
  return ((menu as { props: { items: { id: string }[] } }).props.items).map((item) => item.id)
}

/** 从菜单元素上读定位矩形；菜单未打开时原语拿到 null，据此保持隐藏 */
function contextMenuAnchorRect(out: { contextMenus?: unknown[] }): unknown {
  const menu = (out.contextMenus ?? [])[0] as
    | { props: { getAnchorRect?: () => unknown } }
    | undefined
  return menu?.props.getAnchorRect?.() ?? null
}

/**
 * 一个会话行的元素；供右键测试直接渲染一行
 *
 * 直接渲染单行而不是整片区域：测试替身按组件类型给状态分桶，同一类型的多个
 * 实例共用一份状态，整片列表里所有会话行会一起"被右键"
 * @param options.official - 是否给官方三项操作；false 时该行完全没有菜单
 * @param options.grouping - 归组上下文；缺省表示该行没有分组可归
 * @param options.groupSections - 可移入的分组；只给 `grouping` 为真时有意义
 */
function sessionRowNode(options: {
  official?: boolean
  grouping?: boolean
  groupSections?: { id: string; label: string; sessions: [] }[]
} = {}): unknown {
  return React.createElement(SessionRowMenu, {
    row: {
      id: 's1',
      title: '会话一',
      blank: false,
      running: false,
      runningSubagentCount: 0,
      completed: false,
      updatedAt: 0,
    },
    title: '会话一',
    selected: false,
    actionsLabel: (name: string) => `会话“${name}”的操作`,
    onOpenSession: () => {},
    t: regionTranslate(),
    ...(options.official === false
      ? {}
      : {
          official: {
            renameSession: async () => {},
            forkSession: () => {},
            archiveSession: async () => {},
            labels: officialSessionLabels(workspaceTranslate()),
            relativeTime: () => '',
          },
        }),
    ...(options.grouping === true
      ? {
          grouping: {
            workspaceId: 'w1',
            sections: options.groupSections ?? [],
            currentGroupId: '',
            groupLabel: '移动到…',
            ungroupLabel: '取消分组',
            onSelectGroup: () => {},
          },
        }
      : {}),
  })
}

/** 一个分组行的元素；供右键测试直接渲染一行 */
function groupRowNode(onCreateSession?: () => void): unknown {
  return React.createElement(GroupSection, {
    section: { id: 'g1', label: '前端', sessions: [] },
    collapsed: false,
    onToggle: () => {},
    onRename: () => {},
    onDelete: () => {},
    ...(onCreateSession === undefined ? {} : { onCreateSession }),
    labels: {
      actions: (name: string) => `分组“${name}”的操作`,
      rename: '重命名',
      delete: '删除分组',
      newSessionItem: '新建会话',
      newSession: (name: string) => `在“${name}”中新建会话`,
    },
    children: null,
  })
}

/**
 * 收集容器行的行尾操作结构
 *
 * 「分组行与工作区行同形」是本包的核心承诺，因此断言落在结构上：两者
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
function renderGroupRow(onCreateSession?: () => void, sessionCount = 0, collapsed = false) {
  const out = {
    menus: [] as unknown[],
    text: [] as string[],
    buttons: [] as unknown[],
    containers: [] as unknown[],
    counts: [] as unknown[],
    order: [] as string[],
    collapses: [] as unknown[],
    contextMenus: [] as unknown[],
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
      collapsed,
      onToggle: () => {},
      onRename: () => {},
      onDelete: () => {},
      ...(onCreateSession === undefined ? {} : { onCreateSession }),
      labels: {
        actions: (name: string) => `分组“${name}”的操作`,
        // 菜单项用官方通用动词，对话框标题才点明对象
        rename: '重命名',
        delete: '删除分组',
        newSessionItem: '新建会话',
        newSession: (name: string) => `在“${name}”中新建会话`,
      },
      children: null,
    }),
    out,
  )
  return out
}

/** 渲染一个工作区区块并返回可断言的折叠结构 */
function renderWorkspaceSection(collapsed: boolean, looseCount = 1) {
  const loose = Array.from({ length: looseCount }, (_, index) => ({
    id: `s${index}`,
    title: `会话 ${index}`,
    blank: false,
    running: false,
    runningSubagentCount: 0,
    completed: false,
    updatedAt: 0,
  }))
  const props: WorkspaceSectionProps = {
    title: 'W1',
    collapsed,
    folderActive: false,
    layout: { groups: [], loose },
    isGroupCollapsed: () => false,
    labels: {
      actions: (name: string) => `工作区“${name}”的操作`,
      newSession: (name: string) => `在“${name}”中新建会话`,
      newSessionItem: '新建会话',
      newGroup: '新建分组',
      rename: '重命名',
      delete: '删除工作区',
    },
    virtualWorkspace: {
      sections: [],
      currentGroupId: '',
      newLabel: '新建工作区分组',
      moveToLabel: '移动到…',
      ungroupLabel: '移出工作区分组',
    },
    onSelectVirtualWorkspace: () => {},
    emptyLabel: '还没有会话',
    groupActionLabels: {
      actions: (name: string) => `分组“${name}”的操作`,
      rename: '重命名',
      delete: '删除分组',
      newSessionItem: '新建会话',
      newSession: (name: string) => `在“${name}”中新建会话`,
    },
    onToggle: () => {},
    onCreateSession: () => {},
    onNewGroup: () => {},
    onRenameWorkspace: () => {},
    onDeleteWorkspace: () => {},
    onToggleGroup: () => {},
    onRenameGroup: () => {},
    onDeleteGroup: () => {},
    onCreateSessionInGroup: () => {},
    renderSession: (row) => React.createElement('span', { key: row.id, className: 'wg-row' }, row.title),
  }
  const out = {
    menus: [] as unknown[],
    text: [] as string[],
    buttons: [] as unknown[],
    containers: [] as unknown[],
    slots: [] as unknown[],
    counts: [] as unknown[],
    order: [] as string[],
    collapses: [] as unknown[],
  }
  render(React.createElement(WorkspaceSection, props), out)
  return out
}

/** 折叠体的展开态：类名里带 wg-collapse-open 即为展开 */
function isOpen(collapse: unknown): boolean {
  const className = (collapse as { props: Record<string, unknown> }).props['className']
  return typeof className === 'string' && className.includes('wg-collapse-open')
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
    /** 搜索结果的条数上限；缺省取官方契约值 20 */
    searchResultLimit?: number
    /** 分组元数据；缺省给一个空组 */
    groups?: Record<string, { id: string; name: string; sessionIds: string[] }[]>
    /** 根节点上的工作区分组；缺省为空 */
    workspaceGroups?: { id: string; name: string; workspaceIds: string[] }[]
    /** 记录 moveWorkspace 的二元调用 */
    workspaceMoves?: [string, string][]
    /** 记录 createVirtualWorkspace 的一元调用 */
    onCreateVirtualWorkspace?: (name: string) => void
    /** 宿主 home；用于断言工作区卡片里的路径缩写 */
    home?: string | undefined
    /** 会话 a 的最近更新时间；用于断言卡片里的相对时间与行尾那份不同 */
    updatedAt?: number
  } = {},
): WorkspaceGroupsProps {
  const byId: Record<string, unknown> = {
    a: {
      id: 'a',
      displayTitle: 'A',
      running: false,
      blank: false,
      updatedAt: options.updatedAt ?? Date.now() - 300_000,
    },
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
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: options.home })) as never,
    openSession: () => {},
    // startReturns 显式给了就用它（undefined 表示导航被取代），否则给一个 id
    startSession: async () =>
      'startReturns' in options ? options.startReturns : 'fresh',
    // 分组元数据：缺省给一个空组；需要断言归组路径的用例用 groups / workspaceGroups 覆盖
    loadGroups: async () =>
      snapshot({
        byWorkspace: options.groups ?? { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
        workspaceGroups: options.workspaceGroups ?? [],
      }),
    onReady: () => () => {},
    createGroup: async () => snapshot(),
    renameGroup: async () => snapshot(),
    deleteGroup: async () => snapshot(),
    moveSession: async (workspaceId: string, sessionId: string, groupId: string) => {
      options.moves?.push([workspaceId, sessionId, groupId])
      return snapshot()
    },
    createVirtualWorkspace: async (name: string) => {
      options.onCreateVirtualWorkspace?.(name)
      // 与宿主一致：新分组追加在末尾，调用方据此取回它的 id
      return snapshot({ workspaceGroups: [{ id: 'wgn', name, workspaceIds: [] }] })
    },
    renameVirtualWorkspace: async () => snapshot(),
    deleteVirtualWorkspace: async () => snapshot(),
    moveWorkspace: async (workspaceId: string, groupId: string) => {
      options.workspaceMoves?.push([workspaceId, groupId])
      return snapshot()
    },
    forgetWorkspace: async () => snapshot(),
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    // 结果条数上限来自官方会话控制器的线上契约值
    searchResultLimit: options.searchResultLimit ?? 20,
    t: regionTranslate(),
    tWorkspace: workspaceTranslate(),
    tSidebar: sidebarTranslate(),
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
    expect(menuItems(out)).toContainEqual([
      'new-group',
      'rename',
      'move-virtual-workspace',
      'delete',
    ])
  })

  /**
   * 渲染一次带工作区分组的区域
   *
   * 分组元数据要等 `loadGroups` 落地才出现，因此先跑一遍 effect 再渲染
   */
  async function renderRoot(workspaceGroups: { id: string; name: string; workspaceIds: string[] }[]) {
    const harness = renderingDispatcher()
    const args = props(true, { workspaceGroups })
    const first = { menus: [] as unknown[], text: [] as string[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    const out = {
      menus: [] as unknown[],
      text: [] as string[],
      counts: [] as unknown[],
      hosts: [] as unknown[],
    }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)
    return out
  }

  /** 一类行元素；`className` 按前缀匹配（菜单展开的那条会多挂一个标记类） */
  function hostRows(out: { hosts?: unknown[] }, className: string): unknown[] {
    return (out.hosts ?? []).filter((row) =>
      String((row as { props: Record<string, unknown> }).props['className']).startsWith(className),
    )
  }

  it('lays every workspace out flat when no workspace group exists', async () => {
    const flat = await renderRoot([])

    // 没有用户分组时根节点不生成任何区段头，工作区行仍照常渲染一次
    expect(hostRows(flat, 'wg-group-head wg-virtual-workspace-head')).toHaveLength(0)
    expect(hostRows(flat, 'wg-workspace-head').length).toBeGreaterThan(0)
  })

  it('keeps a workspace inside its group and lists the rest after it', async () => {
    const out = await renderRoot([{ id: 'wg1', name: '前端', workspaceIds: ['w1'] }])

    // 分组行在根节点上，缩进由一个专门的类承担而不是复用会话分组那档
    expect(hostRows(out, 'wg-group-head wg-virtual-workspace-head')).toHaveLength(1)
    expect(out.text).toContain('前端')
  })

  it('renders an empty workspace group with its placeholder', async () => {
    const out = await renderRoot([{ id: 'wg1', name: '空组', workspaceIds: [] }])

    // 刚建完分组还没移入工作区是通常状态，空分组必须露出来而不是静默消失
    expect(out.text).toContain('空组')
    expect(out.text).toContain('这个工作区分组里还没有工作区')
    expect((out.counts ?? []).length).toBe(0)
  })

  it('shows the workspace count on a non-empty workspace group row', async () => {
    const out = await renderRoot([{ id: 'wg1', name: '前端', workspaceIds: ['w1'] }])

    const counts = (out.counts ?? []) as { props: { children?: unknown } }[]
    // 分组行上的工作区数取真实数量：w1 在快照里存在，因此计 1
    expect(counts.map((c) => c.props.children)).toContain(1)
  })

  it('routes the virtual-workspace submenu entries to the move action', async () => {
    const moves: [string, string][] = []
    const harness = renderingDispatcher()
    const args = props(true, {
      workspaceGroups: [{ id: 'wg1', name: '前端', workspaceIds: [] }],
      workspaceMoves: moves,
    })
    const first = { menus: [] as unknown[], text: [] as string[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    const out = { menus: [] as unknown[], text: [] as string[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    // 工作区行菜单里的一级项把候选分组放在自己的 submenu 上
    const workspaceMenu = out.menus.find(
      (m) => menuItems({ menus: [m] })[0]?.includes('move-virtual-workspace') === true,
    ) as
      | {
          props: {
            items: { id: string; submenu?: { id: string }[] }[]
            onSelect: (id: string) => void
          }
        }
      | undefined
    expect(workspaceMenu).toBeDefined()
    const entry = workspaceMenu?.props.items.find((item) => item.id === 'move-virtual-workspace')
    expect(entry?.submenu?.map((s) => s.id)).toEqual(['create-virtual-workspace', 'vw:wg1'])

    // 选中子菜单里的分组项要落到「把该工作区移入那个分组」上
    workspaceMenu?.props.onSelect('vw:wg1')
    await Promise.resolve()
    expect(moves).toEqual([['w1', 'wg1']])
  })

  it('ungroups a workspace from the top-level entry, below move-to', async () => {
    const moves: [string, string][] = []
    const harness = renderingDispatcher()
    const args = props(true, {
      workspaceGroups: [{ id: 'wg1', name: '前端', workspaceIds: ['w1'] }],
      workspaceMoves: moves,
    })
    const first = { menus: [] as unknown[], text: [] as string[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    const out = { menus: [] as unknown[], text: [] as string[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    // 已归组的行上，「移出」是「移动到…」下方的一级项，不在那条子菜单里
    const workspaceMenu = out.menus.find(
      (m) => menuItems({ menus: [m] })[0]?.includes('ungroup-workspace') === true,
    ) as
      | { props: { items: { id: string; submenu?: { id: string }[] }[]; onSelect: (id: string) => void } }
      | undefined
    const ids = workspaceMenu?.props.items.map((item) => item.id) ?? []
    expect(ids.indexOf('ungroup-workspace')).toBe(ids.indexOf('move-virtual-workspace') + 1)
    const moveTo = workspaceMenu?.props.items.find(
      (item) => item.id === 'move-virtual-workspace',
    )
    // 子菜单只负责「移入哪个分组」，不再混进「移出」
    expect(moveTo?.submenu?.map((s) => s.id)).toEqual(['create-virtual-workspace'])

    // 空串是「移出所有分组」在客户端选择器上的表示，宿主侧对应 null
    workspaceMenu?.props.onSelect('ungroup-workspace')
    await Promise.resolve()
    expect(moves).toEqual([['w1', '']])
  })

  it('gives the workspace group row its own rename and delete menu', async () => {
    const out = await renderRoot([{ id: 'wg1', name: '前端', workspaceIds: ['w1'] }])

    expect(menuItems(out)).toContainEqual(['rename', 'delete'])
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
    expect(menuItems(out)).toContainEqual([
      'new-group',
      'rename',
      'move-virtual-workspace',
      'delete',
    ])
    expect(menuItems(out)).toContainEqual(['rename', 'fork', 'archive', 'separator', 'group'])
  })

  it('uses the generic rename verb in the workspace row menu, like official does', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 官方工作区菜单项就是 label: t("rename")；rename.workspace.title 只作对话框
    // 标题。这里断言菜单里显示的是通用动词，而不是「重命名工作区」。
    const workspaceMenu = out.menus.find(
      (m) =>
        menuItems({ menus: [m] })[0]?.join() ===
        'new-group,rename,move-virtual-workspace,delete',
    )
    expect(workspaceMenu).toBeDefined()
    expect(menuLabels({ menus: [workspaceMenu] })).toEqual([
      '新建分组',
      '重命名',
      '移动到…',
      '删除工作区',
    ])
  })

  it('marks only the entries that really open a submenu with a trailing arrow', () => {
    // 区域里那一行工作区菜单：「移动到…」带二级菜单，其余项不带
    const region = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), region)

    const workspaceMenu = region.menus.find(
      (m) =>
        (
          m as { props: { items: { id?: string }[] } }
        ).props.items.map((item) => item.id).join() ===
        'new-group,rename,move-virtual-workspace,delete',
    )
    const workspaceItems = (
      workspaceMenu as { props: { items: { id?: string; label?: unknown }[] } }
    ).props.items
    expect(
      workspaceItems.filter((item) => menuLabelArrow(item.label) !== undefined).map((i) => i.id),
    ).toEqual(['move-virtual-workspace'])

    // 会话行的「移动到…」项：候选分组非空时带箭头
    const grouped = { menus: [] as unknown[], text: [] as string[] }
    render(
      sessionRowNode({ grouping: true, groupSections: [{ id: 'g1', label: '前端', sessions: [] }] }),
      grouped,
    )
    const groupItems = (
      grouped.menus[0] as { props: { items: { id?: string; label?: unknown }[] } }
    ).props.items
    expect(
      groupItems.filter((item) => menuLabelArrow(item.label) !== undefined).map((i) => i.id),
    ).toEqual(['group'])
  })

  it('keeps the arrow off a submenu parent whose submenu is empty', () => {
    // 会话已在唯一分组里时候选为空，原语不把该项当子菜单父项（不展开、不给
    // aria-haspopup），此时箭头会在指一个展不开的菜单
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(sessionRowNode({ grouping: true }), out)

    const items = (out.menus[0] as { props: { items: { id?: string; label?: unknown }[] } }).props
      .items
    expect(items.every((item) => menuLabelArrow(item.label) === undefined)).toBe(true)
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
    expect(menuItems(withBlank)).toContainEqual([
      'new-group',
      'rename',
      'move-virtual-workspace',
      'delete',
    ])
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

    // 会话数不拼进标题文本，而是自己一格贴在行右——与 session 行的 time 同位置
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

  it('keeps the collapsed group sessions mounted so the body can shrink', () => {
    // 收起靠的是折叠体把轨道收成 0 高，而不是把组内会话卸载掉——卸载了就没有
    // 可收回的内容，收缩动作也就无从播起
    const collapsed = renderGroupRow(() => {}, 2, true)
    const expanded = renderGroupRow(() => {}, 2, false)

    expect((collapsed.collapses ?? []).length).toBe(1)
    expect(isOpen((collapsed.collapses ?? [])[0])).toBe(false)
    expect(isOpen((expanded.collapses ?? [])[0])).toBe(true)
  })

  it('renders no collapse body at all for an empty group', () => {
    // 没有内容就没有可撑开的轨道，连折叠体都不渲染
    const out = renderGroupRow(() => {}, 0, true)

    expect((out.collapses ?? []).length).toBe(0)
  })

  it('keeps the collapsed workspace sessions mounted so the body can shrink', () => {
    const collapsed = renderWorkspaceSection(true)
    const expanded = renderWorkspaceSection(false)

    expect((collapsed.collapses ?? []).length).toBe(1)
    expect(isOpen((collapsed.collapses ?? [])[0])).toBe(false)
    expect(isOpen((expanded.collapses ?? [])[0])).toBe(true)
    // 会话行仍在文档里，收起时只是被轨道裁掉
    expect(collapsed.text).toContain('会话 0')
    expect(expanded.text).toContain('会话 0')
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

    // 行操作（`...` 锚点与 `+`）只留 aria-label，不挂原生 title 提示；
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
    // 一个同级提示，因此不挂
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
    // 会话——那条会话可能是在某个分组里建的，这里必须显式把它移出分组，否则
    // 它仍会留在那个分组里
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

  it('never gates row visibility on a class the renderer could lose', () => {
    // 透明只由「所在折叠体还没展开」这一条结构条件决定，行上不得再出现别的显隐状态：
    // 靠回调补类的那种显隐会在主线程被长任务占住时丢失，且补不回来
    const out = { menus: [] as unknown[], text: [] as string[], rows: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    for (const node of out.rows) {
      const className = String((node as { props: Record<string, unknown> }).props['className'])
      expect(className).not.toContain('wg-reveal')
      expect(className).not.toMatch(/hidden|invisible|opacity/)
    }
    // 行必须仍带着参与逐个淡入的标记，否则整段淡入不会发生
    expect(out.rows.length).toBeGreaterThan(0)
    for (const node of out.rows) {
      expect((node as { props: Record<string, unknown> }).props['data-wg-stagger']).toBe('')
    }
  })

  it('renders the section header with the region title and the add entry', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 标题取官方 section.workspaces；「添加工作区」入口的无障碍标签取 workspace.add
    expect(out.text).toContain('工作区')
    expect(rowButtons(out).map((b) => b.label)).toContain('添加工作区')
  })

  it('counts down the header entries to the one still unimplemented', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 搜索已实现，是可用的入口；只剩视图选项仍是 disabled 占位——位置与字形
    // 对齐官方，但明说不可用，而不是渲染成点下去没反应的死按钮
    const search = (out.buttons ?? []).find(
      (b) => (b as { props: Record<string, unknown> }).props['aria-label'] === '搜索会话',
    )
    const viewOptions = (out.buttons ?? []).find(
      (b) => (b as { props: Record<string, unknown> }).props['aria-label'] === '视图选项',
    )
    expect((search as { props: Record<string, unknown> }).props['disabled']).toBeUndefined()
    expect((viewOptions as { props: Record<string, unknown> }).props['disabled']).toBe(true)
  })

  it('puts the new-virtual-workspace entry in the header', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 一眼可见的入口：工作区分组是根级容器，建它不该只藏在工作区行的菜单里
    expect(rowButtons(out).map((b) => b.label)).toContain('新建工作区分组')
  })

  it('keeps the header entry in the narrow rail', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(false)), out)

    // 窄栏与「添加工作区」并列，折叠侧栏时仍能建组
    expect(rowButtons(out).map((b) => b.label)).toContain('新建工作区分组')
  })

  it('opens the create dialog from the header, not a workspace move', async () => {
    const moves: [string, string][] = []
    const created: string[] = []
    const harness = renderingDispatcher()
    const args = props(true, {
      groups: { w1: [] },
      workspaceMoves: moves,
      onCreateVirtualWorkspace: (name: string) => created.push(name),
    })
    const bucket = () => ({
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      modals: [] as unknown[],
    })
    harness.render(React.createElement(WorkspaceGroupsRegion, args), bucket())
    await harness.flush()
    const out = bucket()
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    rowButtons(out)
      .find((b) => b.label === '新建工作区分组')
      ?.click()
    const after = bucket()
    harness.render(React.createElement(WorkspaceGroupsRegion, args), after)

    // 官方 Modal 的替身渲染成 null，但组件返回的仍是 Modal 元素，标题从 props 上读。
    // header 入口给的是「新建工作区分组」而不是改名框，且此时不去动任何工作区的归属
    expect(dialogTitle(after)).toBe('新建工作区分组')
    expect(moves).toEqual([])

    // 输入名字并确认：header 入口建出的是空分组，不带走任何工作区的归属
    const input = dialogInput(after)
    ;(input?.props['onChange'] as ((e: { currentTarget: { value: string } }) => void) | undefined)?.({
      currentTarget: { value: '前端仓库' },
    })
    const typed = bucket()
    harness.render(React.createElement(WorkspaceGroupsRegion, args), typed)
    // 页脚是「取消、确认」两枚，确认在后且只有它可能被 disabled 置灰
    const primary = dialogButtons(typed).filter((c) => c.props['disabled'] !== true).at(-1)
    ;(primary?.props['onClick'] as (() => void) | undefined)?.()
    await Promise.resolve()

    expect(created).toEqual(['前端仓库'])
    // 全程没有移动任何工作区：这是 header 入口与工作区行菜单那个同名项的区别
    expect(moves).toEqual([])
  })

  it('opens the create dialog from the row menu with the workspace pre-selected', async () => {
    const moves: [string, string][] = []
    const harness = renderingDispatcher()
    const args = props(true, { groups: { w1: [] }, workspaceMoves: moves })
    const bucket = () => ({
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      modals: [] as unknown[],
    })
    harness.render(React.createElement(WorkspaceGroupsRegion, args), bucket())
    await harness.flush()
    const out = bucket()
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    // 工作区行菜单里的「新建工作区分组」：同一段确认（都是新建框），
    // 区别在草稿里带了 workspaceId，确认后会把这个工作区移进新分组
    const menu = out.menus.find(
      (m) => menuItems({ menus: [m] })[0]?.includes('move-virtual-workspace') === true,
    ) as { props: { items: { id: string; submenu?: { id: string }[] }[]; onSelect: (id: string) => void } }
    const entry = menu.props.items.find((item) => item.id === 'move-virtual-workspace')
    expect(entry?.submenu?.map((sub) => sub.id)).toContain('create-virtual-workspace')

    menu.props.onSelect('create-virtual-workspace')
    const after = bucket()
    harness.render(React.createElement(WorkspaceGroupsRegion, args), after)

    expect(dialogTitle(after)).toBe('新建工作区分组')

    // 输入并确认：这次要把发起这次新建的那个工作区一并移进新分组，
    // 与 header 入口（建空分组）是同一动作的两种入口
    const input = dialogInput(after)
    ;(input?.props['onChange'] as ((e: { currentTarget: { value: string } }) => void) | undefined)?.({
      currentTarget: { value: '前端仓库' },
    })
    const typed = bucket()
    harness.render(React.createElement(WorkspaceGroupsRegion, args), typed)
    const primary = dialogButtons(typed).filter((c) => c.props['disabled'] !== true).at(-1)
    ;(primary?.props['onClick'] as (() => void) | undefined)?.()
    await Promise.resolve()
    await Promise.resolve()

    // 新分组由宿主建在末尾，确认后把发起这次新建的工作区移进**那个**新分组：
    // 这就是「建组 + 移入」压成一步，与 header 入口建空分组的分工差别所在
    expect(moves).toEqual([['w1', 'wgn']])
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

/**
 * 悬停详情卡片
 *
 * 与官方 ui-workspace 的两张卡片对齐：工作区那张是「名称 / 目录路径 / 创建时刻」
 * 并复制完整路径，会话那张是「完整标题 / 相对时间 / 逐条状态」并复制标题。
 * 卡片外框与浮出时机属官方 HoverCard 原语，这里只断言本包传下去的内容与开关
 */
describe('hover cards', () => {
  /** 卡片正文里的文本，按文档序；替身不渲染正文，只能从 props 上读 */
  function cardText(card: unknown): string[] {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render((card as { props: Record<string, unknown> }).props['content'], out)
    return out.text
  }

  /** 卡片元素的某个 prop */
  function cardProp(card: unknown, name: string): unknown {
    return (card as { props: Record<string, unknown> }).props[name]
  }

  /** 渲染整个区域并收集卡片 */
  function renderRegion(options: Parameters<typeof props>[1] = {}) {
    const out = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true, options)), out)
    return out
  }

  /**
   * 一张卡片是给哪种行挂的
   *
   * 锚点就是那行本身，因此按行类名认；卡片按文档序发出，工作区行在会话行之前
   */
  function anchorClass(card: unknown): string {
    const anchor = (card as { props: { anchor?: { props?: Record<string, unknown> } } }).props
      .anchor
    return String(anchor?.props?.['className'] ?? '')
  }

  it('hangs one card on the workspace row and one on each session row', () => {
    const out = renderRegion()

    // 一条工作区行 + 一条工作区内的会话行 + 未分组桶里那条会话行
    expect(out.cards).toHaveLength(3)
    expect(out.cards.map(anchorClass).filter((c) => c.startsWith('wg-workspace-head'))).toHaveLength(
      1,
    )
    expect(out.cards.map(anchorClass).filter((c) => c.startsWith('wg-row'))).toHaveLength(2)
  })

  it('reads the workspace card from name, directory path and creation instant', () => {
    const out = renderRegion()
    const card = out.cards.find((c) => anchorClass(c).startsWith('wg-workspace-head'))

    // 创建时刻按**本地**时区渲染（官方卡片用的就是 getHours/getMinutes），因此这里
    // 拿同一个 Date 现算一遍期望值，而不是写死一个只在某个时区成立的钟点
    const created = new Date('2026-01-01T00:00:00.000Z')
    const pad = (v: number) => String(v).padStart(2, '0')
    const clock = `${pad(created.getHours())}:${pad(created.getMinutes())}`

    // 目录路径与创建时刻都按官方那两行给出；工作区名是宿主给的标题
    expect(cardText(card)).toEqual(['W1', '/tmp/w1', `创建于 2026年1月1日 ${clock}`])
  })

  it('abbreviates the home directory in the card path but copies the full one', () => {
    const out = renderRegion({ home: '/tmp' })
    const card = out.cards.find((c) => anchorClass(c).startsWith('wg-workspace-head'))

    // 卡片里显示缩写，复制出去的仍是完整路径：缩写只是排版
    expect(cardText(card)).toContain('~/w1')
    expect(cardProp(card, 'copyText')).toBe('/tmp/w1')
  })

  it('copies the workspace path and the session title through the official labels', () => {
    const out = renderRegion()
    const workspaceCard = out.cards.find((c) => anchorClass(c).startsWith('wg-workspace-head'))
    const sessionCard = out.cards.find((c) => anchorClass(c).startsWith('wg-row'))

    // 复制提示取官方 common 的通用词，成功反馈取官方 hover.copied
    for (const card of [workspaceCard, sessionCard]) {
      expect(cardProp(card, 'copyLabel')).toBe('复制')
      expect(cardProp(card, 'copiedLabel')).toBe('已复制')
    }
    expect(cardProp(sessionCard, 'copyText')).toBe('A')
  })

  it('reads the session card from title, relative time and every status', () => {
    const out = renderRegion()
    const card = out.cards.find((c) => anchorClass(c).startsWith('wg-row'))

    // 空闲会话在行上不画点，卡片里仍按官方列一条「空闲」
    expect(cardText(card)).toContain('A')
    expect(cardText(card)).toContain('空闲')
  })

  it('uses the ago template for the card time, unlike the bare row time', () => {
    const out = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    // 5 分钟前更新的会话：行尾显示「5分钟」，卡片显示「5分钟前」
    render(
      React.createElement(
        WorkspaceGroupsRegion,
        props(true, { updatedAt: Date.now() - 5 * 60_000 }),
      ),
      out,
    )
    const card = out.cards.find((c) => anchorClass(c).startsWith('wg-row'))

    expect(cardText(card)).toContain('5分钟前')
  })

  it('lists the pending interaction on the row that waits for the user', () => {
    const pending = new Map([['orphan', { kind: 'approval' }]])
    const out = renderRegion({ pending })
    // 卡片按文档序发出，两条会话行里第二条是未分组桶里的 Orphan
    const cards = out.cards.filter((c) => anchorClass(c).startsWith('wg-row'))
    const orphanCard = cards[cards.length - 1]

    // 在等审批的那条会话，卡片里要出现审批那一条
    expect(cardText(orphanCard)).toContain('等待审批')
    // 另一条空闲会话不受影响
    expect(cardText(cards[0])).toContain('空闲')
  })

  it('hangs no card at all when the official copy is unavailable', () => {
    const out = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true, { official: false })), out)

    // 官方文案拿不到时浮出来的只是空壳，因此整体不挂
    expect(out.cards).toEqual([])
  })

  it('gives the ungrouped bucket workspace row no card', () => {
    const out = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    // props 里那条 orphan 会话无所属，末尾的隐式「未分组」区段因此出现
    const base = props(true)
    render(React.createElement(WorkspaceGroupsRegion, base), out)

    // 未分组桶不是真实工作区（没有目录与创建时刻），官方在那里同样不给卡片：
    // 工作区行有两行（真实工作区 + 未分组桶），卡片却只有一张
    const workspaceCards = out.cards.filter((c) => anchorClass(c).startsWith('wg-workspace-head'))
    expect(workspaceCards).toHaveLength(1)
    // 那唯一一张挂在真实工作区上：它的正文是 W1 的路径，不是未分组桶
    expect(cardText(workspaceCards[0])).toContain('/tmp/w1')
  })

  it('gives the blank session row a card without a copy affordance', () => {
    const out = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    render(
      React.createElement(WorkspaceGroupsRegion, props(true, { blankCurrent: true })),
      out,
    )
    // 空白行的标题是语言包的固定名，不是会话内容
    const blank = out.cards.find((card) => cardText(card).includes('新会话'))

    expect(blank).toBeDefined()
    expect(cardProp(blank, 'copyText')).toBeUndefined()
    // 同屏的常规会话行仍带着可复制标题，说明上一条断言不是因为整片都没有复制入口
    const named = out.cards.find((card) => cardText(card).includes('A'))
    expect(cardProp(named, 'copyText')).toBe('A')
  })

  it('suppresses the card on a row while either of its panels is open', () => {
    // 单行渲染：测试替身按组件类型给状态分桶，同一类型的多个实例共用一份状态，
    // 整片列表里所有会话行会一起「被右键」，那样断言不出「只有这一行让位」
    const node = React.createElement(SessionRowMenu, {
      row: {
        id: 's1',
        title: '会话一',
        blank: false,
        running: false,
        runningSubagentCount: 0,
        completed: false,
        updatedAt: 0,
      },
      title: '会话一',
      selected: false,
      statuses: [{ state: 'done', label: '空闲' }],
      hoverTime: '5分钟前',
      hoverLabels: officialHoverLabels(workspaceTranslate()),
      actionsLabel: (name: string) => `会话“${name}”的操作`,
      onOpenSession: () => {},
      t: regionTranslate(),
      official: {
        renameSession: async () => {},
        forkSession: () => {},
        archiveSession: async () => {},
        labels: officialSessionLabels(workspaceTranslate()),
        relativeTime: () => '',
      },
    })

    const harness = renderingDispatcher()
    const before = {
      menus: [] as unknown[],
      text: [] as string[],
      cards: [] as unknown[],
      hosts: [] as unknown[],
    }
    harness.render(node, before)

    // 初始态没有面板，卡片启用
    expect(before.cards).toHaveLength(1)
    expect(cardProp(before.cards[0], 'disabled')).toBe(false)

    // 右键开出面板：同一处再浮一张卡片会互相遮挡
    fireContextMenu(before.hosts[0])
    const afterRightClick = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    harness.render(node, afterRightClick)
    expect(cardProp(afterRightClick.cards[0], 'disabled')).toBe(true)
  })

  it('suppresses the card while the row own menu is open', () => {
    // 行内 `...` 菜单是另一处浮在行上的面板，两条路径都要让位
    const node = React.createElement(SessionRowMenu, {
      row: {
        id: 's1',
        title: '会话一',
        blank: false,
        running: false,
        runningSubagentCount: 0,
        completed: false,
        updatedAt: 0,
      },
      title: '会话一',
      selected: false,
      hoverTime: '5分钟前',
      hoverLabels: officialHoverLabels(workspaceTranslate()),
      actionsLabel: (name: string) => `会话“${name}”的操作`,
      onOpenSession: () => {},
      t: regionTranslate(),
      official: {
        renameSession: async () => {},
        forkSession: () => {},
        archiveSession: async () => {},
        labels: officialSessionLabels(workspaceTranslate()),
        relativeTime: () => '',
      },
    })

    const harness = renderingDispatcher()
    const before = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    harness.render(node, before)

    // 菜单锚点是 Menu 原语的 anchor 按钮；点一下即展开
    const anchor = (
      before.menus[0] as { props: { anchor: { props: { onClick: (e: unknown) => void } } } }
    ).props.anchor
    anchor.props.onClick({ stopPropagation: () => {} })

    const after = { menus: [] as unknown[], text: [] as string[], cards: [] as unknown[] }
    harness.render(node, after)
    expect(cardProp(after.cards[0], 'disabled')).toBe(true)
  })
})

/**
 * 搜索
 *
 * 本包只做官方「本地标题匹配」那一段：入口、输入框与结果列表的几何和动效对齐
 * 官方，但不接 Host 内容检索，因此没有摘录，也没有加载与失败两态
 */
describe('search', () => {
  /** 取渲染出来的搜索输入框 */
  function searchInput(out: { inputs?: unknown[] }): {
    value: unknown
    placeholder: unknown
    tabIndex: unknown
    change: (value: string) => void
    keyDown: (key: string) => void
  } {
    const el = (out.inputs ?? [])[0] as { props: Record<string, unknown> }
    return {
      value: el.props['value'],
      placeholder: el.props['placeholder'],
      tabIndex: el.props['tabIndex'],
      change: (value: string) => (el.props['onChange'] as (e: unknown) => void)({ target: { value } }),
      keyDown: (key: string) =>
        (el.props['onKeyDown'] as (e: unknown) => void)({ key, preventDefault: () => {} }),
    }
  }

  /** 取结果行元素 */
  function resultRows(out: { buttons?: unknown[] }): unknown[] {
    return (out.buttons ?? []).filter((b) =>
      String((b as { props: Record<string, unknown> }).props['className']).startsWith(
        'wg-search-result',
      ),
    )
  }

  /** 结果行第二行的路径文案，按文档序；由元信息元素内的各段拼回 */
  function resultPaths(out: { metas?: unknown[] }): string[] {
    return (out.metas ?? []).map((meta) => textOf(meta))
  }

  /** 递归取一个元素子树里的文本；路径被拆成多段着色，只能这样拼回一行 */
  function textOf(node: unknown): string {
    if (node === null || node === undefined || typeof node === 'boolean') return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (!React.isValidElement(node)) return ''
    return textOf((node as { props: Record<string, unknown> }).props['children'])
  }

  it('offers a usable search entry rather than a disabled placeholder', () => {
    const out = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
    }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    const entry = rowButtons(out).find((b) => b.label === '搜索会话')
    expect(entry).toBeDefined()
    expect(out.inputs).toHaveLength(1)
  })

  it('starts with an empty collapsed input that is out of the tab order', () => {
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    const input = searchInput(out)
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('搜索会话…')
    // 收起态的输入框不可见也不该被 Tab 到，tabIndex 因此是 -1
    expect(input.tabIndex).toBe(-1)
  })

  it('filters the list down to title matches once a query is typed', async () => {
    const harness = renderingDispatcher()
    const args = props(true)
    const first = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()

    // 输入一个只命中会话 A 的词：结果区取代常规列表，且只剩那一条
    searchInput(first).change('A')
    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    expect(resultRows(out).length).toBeGreaterThan(0)
    // 常规列表整段让位：工作区行不再渲染，未分组区段同理
    expect(menuItems(out)).toEqual([])
  })

  it('clears the query and leaves search when Escape is pressed', async () => {
    const harness = renderingDispatcher()
    const args = props(true)
    const first = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    searchInput(first).change('A')

    const typing = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), typing)
    searchInput(typing).keyDown('Escape')

    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    expect(searchInput(out).value).toBe('')
    // 回到常规列表：工作区行菜单重新出现
    expect(menuItems(out)).toContainEqual([
      'new-group',
      'rename',
      'move-virtual-workspace',
      'delete',
    ])
  })

  it('shows the no-match empty state instead of an empty result tree', async () => {
    const harness = renderingDispatcher()
    const args = props(true)
    const first = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    searchInput(first).change('不存在的词')

    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    expect(resultRows(out)).toEqual([])
    expect(out.text).toContain('无匹配会话')
  })

  it('names the path as workspace slash group and stops at the workspace when ungrouped', async () => {
    const harness = renderingDispatcher()
    // 会话 a 落在分组 g1 里，Orphan 无所属工作区：两条路径要按各自归属渲染
    const args = props(true, {
      groups: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] },
    })
    const first = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
    }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()

    searchInput(first).change('A')
    const grouped = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
      metas: [] as unknown[],
    }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), grouped)

    // 归组的会话在结果里带上分组：工作区/分组
    expect(resultPaths(grouped)).toContain('W1/前端')

    searchInput(grouped).change('Orphan')
    const stray = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
      metas: [] as unknown[],
    }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), stray)

    // 无所属工作区的会话退回官方的「未分组」，而不是拼出一条空路径
    expect(resultPaths(stray)).toEqual(['未分组'])
  })

  it('splits the path into a workspace part and a group part for two-tone contrast', async () => {
    const harness = renderingDispatcher()
    const args = props(true, {
      groups: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] },
    })
    const first = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
    }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    searchInput(first).change('A')

    const out = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
      metas: [] as unknown[],
    }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    // 两段是各自独立着色的元素，而不是一条已经拼好的字符串——否则分不开色阶
    const meta = out.metas?.[0] as { props: { children: unknown } }
    const classes: string[] = []
    const walk = (node: unknown): void => {
      if (node === null || node === undefined || typeof node === 'boolean') return
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (!React.isValidElement(node)) return
      const el = node as { props: Record<string, unknown> }
      if (typeof el.props['className'] === 'string') classes.push(el.props['className'])
      walk(el.props['children'])
    }
    walk(meta.props.children)

    expect(classes).toContain('wg-search-result-workspace')
    expect(classes).toContain('wg-search-result-group')
    // 分隔符不单独成类：它落在分组那一段里继承同一色阶，避免多出第三个层级
    expect(classes).not.toContain('wg-search-result-separator')
  })

  it('truncates the page at the injected limit and says so', async () => {
    const harness = renderingDispatcher()
    const args = props(true, { searchResultLimit: 1 })
    const first = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), first)
    await harness.flush()
    searchInput(first).change('A')

    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, args), out)

    // 命中两条（A 与 Orphan 都按标题命中）而上限是 1
    expect(resultRows(out)).toHaveLength(1)
    expect(out.text).toContain('仅显示前 1 条结果，请缩小搜索范围。')
  })

  it('opens the matched session and leaves search when a result is clicked', async () => {
    const opened: string[] = []
    const harness = renderingDispatcher()
    const args = props(true)
    const withOpen = { ...args, openSession: (id: string) => opened.push(id) }
    const first = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, withOpen), first)
    await harness.flush()
    searchInput(first).change('Orphan')

    const typing = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, withOpen), typing)
    const row = resultRows(typing)[0] as { props: { onClick: () => void } }
    row.props.onClick()

    const out = { menus: [] as unknown[], text: [] as string[], buttons: [] as unknown[], inputs: [] as unknown[] }
    harness.render(React.createElement(WorkspaceGroupsRegion, withOpen), out)

    // 点结果即打开那条会话，并清掉查询回到常规列表
    expect(opened).toEqual(['orphan'])
    expect(searchInput(out).value).toBe('')
  })

  it('offers the search entry in the narrow rail as well', () => {
    const out = {
      menus: [] as unknown[],
      text: [] as string[],
      buttons: [] as unknown[],
      inputs: [] as unknown[],
    }
    render(React.createElement(WorkspaceGroupsRegion, props(false)), out)

    // 官方 rail 下同样放这个入口；它在窄栏里只是请求展开侧栏
    expect(rowButtons(out).map((b) => b.label)).toContain('搜索会话')
    // 窄栏不渲染输入框：那个框在宽栏的 header 里
    expect(out.inputs).toEqual([])
  })
})

/**
 * 行右键菜单
 *
 * 右键是行内操作位的捷径：条目与分派都必须与 `...` 菜单一致，差别只在入口
 * 与落点。工作区行与分组行还多一项「新建会话」——它在行内对应 `+` 按钮
 */
describe('row context menu', () => {
  /** 一次渲染的收集结果；`hosts` 与 `contextMenus` 由 walk 单独分桶 */
  interface Collected {
    menus: unknown[]
    text: string[]
    buttons: unknown[]
    contextMenus: unknown[]
    hosts: unknown[]
    rows: unknown[]
  }

  function emptyOut(): Collected {
    return {
      menus: [],
      text: [],
      buttons: [],
      contextMenus: [],
      hosts: [],
      rows: [],
    }
  }

  /** 一类行元素；`className` 按前缀匹配（菜单展开的那条会多挂一个标记类） */
  function rowsOf(out: Collected, className: string): unknown[] {
    return out.hosts.filter((row) =>
      String((row as { props: Record<string, unknown> }).props['className']).startsWith(className),
    )
  }

  /** 一行的某个 prop；用于按标题之类的内容挑出具体某一行 */
  function propOf(row: unknown, name: string): unknown {
    return (row as { props: Record<string, unknown> }).props[name]
  }

  /**
   * 一行上显示的标题
   *
   * 标题是行里的一个子节点（`.wg-row-title`），不是行元素自己的 prop
   */
  function rowTitle(row: unknown): string | undefined {
    const children = (row as { props: { children?: unknown } }).props.children
    for (const child of Array.isArray(children) ? children : [children]) {
      const element = child as { props?: { className?: unknown; children?: unknown } } | null
      if (element?.props?.className === 'wg-row-title') return String(element.props.children)
    }
    return undefined
  }

  /** 当下开着的那张右键菜单；未打开或没有菜单时为 undefined */
  function openMenu(out: Collected): unknown {
    return out.contextMenus.find(
      (menu) => (menu as { props: { open: boolean } }).props.open === true,
    )
  }

  /**
   * 渲染 → 在指定行上右键 → 再渲染一次
   *
   * 菜单开合是行的状态，两次渲染之间才会体现出来；`renderingDispatcher` 把
   * 状态按组件类型留桶，因此同一条行在第二次渲染里读回自己刚写下的落点
   * @param node - 待渲染的元素
   * @param className - 要在哪一类行上右键（按类名前缀找第一条）
   * @param at - 指针坐标；缺省模拟键盘触发的右键（浏览器给 (0,0)）
   */
  function rightClick(
    node: unknown,
    className: string,
    at?: { clientX: number; clientY: number },
    pick?: (row: unknown) => boolean,
  ): { before: Collected; after: Collected; flags: { prevented: boolean; stopped: boolean } } {
    const harness = renderingDispatcher()
    const before = emptyOut()
    harness.render(node, before)
    const candidates = rowsOf(before, className)
    const target = pick === undefined ? candidates[0] : candidates.find(pick)
    const flags = fireContextMenu(target, at)
    const after = emptyOut()
    harness.render(node, after)
    return { before, after, flags }
  }

  /** 在区域里右键工作区行 */
  function region() {
    return React.createElement(WorkspaceGroupsRegion, props(true))
  }

  it('attaches a right-click handler to every kind of row', () => {
    // 工作区行与会话行（未分组桶里那条）都有右键入口
    const { before } = rightClick(region(), 'wg-workspace-head')
    expect(rowsOf(before, 'wg-workspace-head').length).toBeGreaterThan(0)
    expect(rowsOf(before, 'wg-row').length).toBeGreaterThan(0)

    // 分组行只在 loadGroups 落地后才出现，因此直接渲染一条
    const group = rightClick(groupRowNode(() => {}), 'wg-group-head')
    expect(rowsOf(group.before, 'wg-group-head')).toHaveLength(1)
  })

  it('opens the menu at the pointer and keeps the browser menu suppressed', () => {
    const { after, flags } = rightClick(region(), 'wg-workspace-head', {
      clientX: 120,
      clientY: 240,
    })

    // 不 preventDefault 就没有自绘面板可言（浏览器会弹出自己的菜单）；
    // 不 stopPropagation 则外层若也认右键会同时开两个
    expect(flags.prevented).toBe(true)
    expect(flags.stopped).toBe(true)

    // 落点即指针处，面板因此贴着鼠标而不是行的某个锚点
    expect(contextMenuAnchorRect({ contextMenus: [openMenu(after)] })).toEqual({
      left: 120,
      top: 240,
      right: 120,
      bottom: 240,
    })
  })

  it('falls back to the row rect when the right click comes from the keyboard', () => {
    // 菜单键触发的 contextmenu 没有指针坐标（浏览器给 (0,0)）：那时菜单该落在
    // 行旁，而不是被丢到窗口左上角
    const { after } = rightClick(region(), 'wg-workspace-head')

    expect(contextMenuAnchorRect({ contextMenus: [openMenu(after)] })).toEqual({
      left: 4,
      top: 8,
      right: 40,
      bottom: 30,
    })
  })

  it('keeps the row menu items and adds only the new-session entry', () => {
    const { after } = rightClick(region(), 'wg-workspace-head')

    // 右键菜单 = 行内 `...` 菜单 + 行内 `+` 那一项
    expect(menuIdsOf(openMenu(after))).toEqual([
      'new-session',
      'new-group',
      'rename',
      'move-virtual-workspace',
      'delete',
    ])
  })

  it('gives the session row the same items as its own menu', () => {
    // 没有归组上下文的会话行（「未分组」桶里的那种）只留官方三项，且没有行内
    // 新建入口可补：右键菜单与它的 `...` 菜单条目集合因此完全相同
    const { after } = rightClick(sessionRowNode(), 'wg-row')

    expect(menuIdsOf(openMenu(after))).toEqual(['rename', 'fork', 'archive'])
  })

  it('leaves a row without a create entry with the plain row menu', () => {
    // 没有新建入口的行（这里用不传 onCreateSession 的分组行）补一项「新建会话」
    // 就是点不动的死按钮，因此右键菜单退化成 `...` 菜单本身
    const { after } = rightClick(groupRowNode(), 'wg-group-head')

    expect(menuIdsOf(openMenu(after))).toEqual(['rename', 'delete'])
  })

  it('routes the new-session entry to the row own create handler', () => {
    const created: string[] = []
    const { after } = rightClick(groupRowNode(() => created.push('g1')), 'wg-group-head')

    // 选中「新建会话」必须落到该行自己的新建入口上，与行内 `+` 是同一件事
    const menu = openMenu(after) as { props: { onSelect: (id: string) => void } }
    menu.props.onSelect('new-session')

    expect(created).toEqual(['g1'])
  })

  it('hangs no right-click handler on a row that has no menu at all', () => {
    // 「未分组」桶里的会话既没有工作区归属（没有归组项）又拿不到官方服务
    //（没有官方三项），菜单条目因此是空的。那时右键保持浏览器默认行为，
    // 而不是弹出空面板
    const out = emptyOut()
    render(React.createElement(WorkspaceGroupsRegion, props(true, { official: false })), out)

    const stray = (out.rows ?? []).find((row) => rowTitle(row) === 'Orphan')
    expect(stray).toBeDefined()
    expect(propOf(stray, 'onContextMenu')).toBeUndefined()
    // 它确实是一条会话行，只是没有入口——不是因为整片列表都没渲染
    expect(rowsOf(out, 'wg-row').length).toBeGreaterThan(0)
  })
})
