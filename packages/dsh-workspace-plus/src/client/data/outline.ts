/**
 * 一份扁平的行序列：界面上从上到下每占一行，这里就有一条
 *
 * 今天「谁排在第几行」这件事没有一处拥有完整答案：渲染层靠 `map` 套 `map` 现场展开
 * （根节点的分组段 → 工作区 → 子工作区递归 → 会话分组 → 会话行），拖拽层靠树按节点现算关系。
 * 两条链各自只知道自己那一层，谁也不知道自己在整条序列里排第几。
 *
 * 这一份就是那个答案。它同时收容器与行：题头行（工作区分组、会话分组、工作区）与会话行都在其中，
 * 因为界面上的竖直高度由它们一起构成——虚拟化要的正是「每行的身份与高度」。
 *
 * 它是布局的下游而不是替代：`layout.ts` 答「哪些分组成员是谁」，这一层答
 * 「此刻界面上从上到下是什么」。后者多要三样：三层折叠态、每段露出额度、以及行的几何。
 *
 * 不碰 React、不碰 DOM：高度按样式表里那几个常量算，样式表仍由它自己决定外观
 */
import { collapseSessionRows, sessionScopeKey } from './collapse.ts'
import type { SessionScopeRef } from './collapse.ts'
import type { RootLayout, SessionRow, WorkspaceLayout } from './types.ts'

// ── 行 ──

/**
 * 一行的种类
 *
 * `overflow` 是那条「展开其余 n 个会话」的按钮：它占竖直高度，因此也是一行
 * `empty` 是工作区体内一条内容都没有时的空态，同样占高度
 */
export type OutlineRowKind =
  | 'virtualHead'
  | 'groupHead'
  | 'workspaceHead'
  | 'strayHead'
  | 'session'
  | 'overflow'
  | 'empty'

/** 界面上的一行 */
export interface OutlineRow {
  /** 全局唯一，供 React 的 key 与调试日志用 */
  key: string
  kind: OutlineRowKind
  /**
   * 这一行属于哪一片
   *
   * 沿用 `nest` 的容器身份（同一次推导内同一容器恒交回同一实例），因此可以直接当 Map 的键
   */
  container: ContainerKey
  /** 这一行挂在哪个工作区名下；根节点那一层与「未分组」桶为空串 */
  workspaceId: string
  /** 缩进层级，与 `nest` 的 `levelOf` 同值 */
  depth: number
  /** 这一行竖直占多少像素，含它自己带着的那点上间距 */
  height: number
  /** 其中属于上间距的那一份：段内 2、顶层两个工作区之间 4、列表首项 0 */
  lead: number
  /**
   * 此刻是否真的露面
   *
   * 收起的工作区里那些行仍在文档里（撑开体靠内容常驻才能收回），因此它们在序列里、但为 false
   * 虚拟化要的正是这一格：不露面的行不占高度
   */
  visible: boolean
  /** 这一行在 DOM 上占的那几格区域键 */
  zoneKeys: readonly string[]
  /** 落点单位标识，没有独立单位时为 undefined */
  regionKey: string | undefined
  /** 会话行与溢出按钮服务的那一段，别的种类为 undefined */
  scope?: SessionScopeRef | undefined
  /** 会话行的会话 id，别的种类为 undefined */
  sessionId?: string | undefined
  /**
   * 会话行本身
   *
   * 渲染层因此不必再拿 id 回查一遍：序列里已经握着那一行，`sessionId` 只是它的键
   */
  row?: SessionRow | undefined
  /** 溢出按钮代言的条数，除 `overflow` 那一行之外都为 0 */
  hiddenCount: number
  /** 这一行所在的那一段此刻是否展开到全部；只有 `overflow` 那一行带这一格 */
  scopeExpanded: boolean
}

/**
 * 容器在这一层里的形状
 *
 * 与 `nest` 的 `ContainerNode` 同形，另起一个名字只为让这一层的读者不必回头认嵌套推导的类型
 */
export type ContainerKey =
  | { kind: 'root' }
  | { kind: 'virtual'; groupId: string }
  | { kind: 'group'; workspaceId: string; groupId: string }

// ── 高度 ──

/** 会话行药丸高度，与 `components/rows.module.css` 的 `.rowSurface` 同值 */
export const ROW_HEIGHT = 32

/** 题头行药丸高度，与 `.headSurface` 同值 */
export const HEAD_HEIGHT = 34

/** 溢出按钮高度，与 `.sessionOverflow` 同值 */
export const OVERFLOW_HEIGHT = 28

/** 段内上间距，与 `.expandClip` 下发的 `--wg-row-lead` 同值 */
export const LEAD_IN_SCOPE = 2

/** 顶层两个工作区之间的上间距，与 `.workspace + .workspace` 同值 */
export const LEAD_BETWEEN_WORKSPACES = 4

// ── 输入 ──

/**
 * 造 outline 要的全部输入
 *
 * 布局由调用方给现成的：这一层不重算「谁在哪个分组里」，只决定「按什么顺序、露不露面、多高」
 */
export interface OutlineInput {
  /** 根节点那一层：分组段与其成员 */
  rootLayout: RootLayout
  /** 一个工作区体内的分段与子工作区 */
  workspaceLayoutOf: (workspaceId: string) => WorkspaceLayout
  /** 一个工作区的缩进层级 */
  depthOf: (workspaceId: string) => number
  /** 分支容器身份：与 `nest` 的 `containers` 同一个发牌器 */
  containers: {
    readonly root: ContainerKey
    virtualOf: (groupId: string) => ContainerKey
    groupOf: (workspaceId: string, groupId: string) => ContainerKey
  }
  /** 三层折叠态的生效值 */
  expansion: {
    isWorkspaceExpanded: (key: string) => boolean
    isVirtualWorkspaceExpanded: (key: string) => boolean
    isGroupExpanded: (workspaceId: string, groupId: string) => boolean
  }
  /** 各区段是否展开到全部行 */
  isScopeExpanded: (ref: SessionScopeRef) => boolean
  /** 始终展示并占额度的会话 id */
  alwaysVisibleSessionIds: ReadonlySet<string>
  /** 折叠判据的基准时刻 */
  now: number
  /** 末尾「未分组」桶里的会话行，已按该段的比较器排好 */
  stray: readonly SessionRow[]
  /** 真的聚焦在某一片内容上时，「未分组」桶整段隐藏 */
  hideStray: boolean
  /** 会话行的排序比较器，与渲染用的是同一个 */
  compareRows: (a: SessionRow, b: SessionRow) => number
  /** 某段区域键的写法，取自 `protocol.ts` */
  keys: {
    workspaceHead: (workspaceId: string) => string
    workspaceBody: (workspaceId: string) => string
    workspaceRegion: (workspaceId: string) => string
    sessionGroupHead: (workspaceId: string, groupId: string) => string
    sessionGroupZone: (workspaceId: string, groupId: string) => string
    sessionGroupRegion: (workspaceId: string, groupId: string) => string
    virtualHead: (groupId: string) => string
    virtualBody: (groupId: string) => string
    virtualRegion: (groupId: string) => string
    loose: (workspaceId: string) => string
  }
}

// ── 构造 ──

/**
 * 把一份布局收成一条扁平的行序列
 *
 * 顺序即界面上的顺序：根节点的分组段 → 段内工作区 → 工作区体内的子工作区（递归）→ 会话分组 → 未归组会话
 * 「未分组」桶排在全部工作区之后
 * @param input - 见 {@link OutlineInput}
 * @returns 从上到下的全部行
 */
export function buildOutline(input: OutlineInput): OutlineRow[] {
  const rows: OutlineRow[] = []
  const { containers, rootLayout } = input

  const push = (
    row: Omit<OutlineRow, 'height' | 'hiddenCount' | 'scopeExpanded'> & {
      pill: number
      hiddenCount?: number
      scopeExpanded?: boolean
    },
  ): void => {
    const { pill, hiddenCount = 0, scopeExpanded = false, ...rest } = row
    rows.push({ ...rest, hiddenCount, scopeExpanded, height: pill + rest.lead })
  }

  /** 一个工作区区块 */
  const addWorkspace = (workspaceId: string, container: ContainerKey, lead: number): void => {
    const layout = input.workspaceLayoutOf(workspaceId)
    const depth = input.depthOf(workspaceId)
    const open = input.expansion.isWorkspaceExpanded(workspaceId)
    const childIds = layout.children ?? []

    push({
      key: 'workspace/' + workspaceId,
      kind: 'workspaceHead',
      container,
      workspaceId,
      depth,
      pill: HEAD_HEIGHT,
      lead,
      visible: true,
      zoneKeys: [input.keys.workspaceHead(workspaceId), input.keys.workspaceBody(workspaceId)],
      regionKey: input.keys.workspaceRegion(workspaceId),
    })

    // 子工作区排在会话分组之前，与分组内部同一顺序
    for (const childId of childIds) addWorkspace(childId, container, LEAD_IN_SCOPE)

    for (const section of layout.groups) {
      const groupOpen = input.expansion.isGroupExpanded(workspaceId, section.id)
      push({
        key: 'group/' + workspaceId + '/' + section.id,
        kind: 'groupHead',
        container: containers.groupOf(workspaceId, section.id),
        workspaceId,
        depth,
        pill: HEAD_HEIGHT,
        lead: LEAD_IN_SCOPE,
        visible: open,
        zoneKeys: [
          input.keys.sessionGroupHead(workspaceId, section.id),
          input.keys.sessionGroupZone(workspaceId, section.id),
        ],
        regionKey: input.keys.sessionGroupRegion(workspaceId, section.id),
      })
      addSessions(
        { kind: 'group', workspaceId, groupId: section.id },
        section.sessions,
        open && groupOpen,
        containers.groupOf(workspaceId, section.id),
        workspaceId,
        depth,
      )
    }

    addSessions(
      { kind: 'loose', workspaceId },
      layout.loose,
      open,
      container,
      workspaceId,
      depth,
      input.keys.loose(workspaceId),
    )

    if (childIds.length === 0 && layout.groups.length === 0 && layout.loose.length === 0) {
      push({
        key: 'empty/' + workspaceId,
        kind: 'empty',
        container,
        workspaceId,
        depth,
        pill: 0,
        lead: 0,
        visible: open,
        zoneKeys: [],
        regionKey: undefined,
      })
    }
  }

  /**
   * 一段会话行：折叠后的那些，再加一条溢出按钮
   *
   * 收起的那些不渲染，展开时全部渲染
   * @param presorted - 传进来的已经就是最终顺序。末尾「未分组」桶是这一档：
   *   容器交给它的是「置顶提前、其余维持列表原序」之后的结果，
   *   再套一遍工作区那个按时间排的比较器会把前者抹掉
   */
  function addSessions(
    scope: SessionScopeRef,
    all: readonly SessionRow[],
    open: boolean,
    container: ContainerKey,
    workspaceId: string,
    depth: number,
    zoneKey?: string,
    presorted = false,
  ): void {
    const sorted = presorted ? [...all] : [...all].sort(input.compareRows)
    const collapsed = collapseSessionRows(sorted, input.alwaysVisibleSessionIds, input.now)
    const expanded = input.isScopeExpanded(scope)
    const shown = expanded && collapsed.hiddenCount > 0 ? sorted : collapsed.rows
    const prefix = workspaceId + '/' + sessionScopeKey(scope) + '/'
    for (const row of shown) {
      push({
        key: prefix + row.id,
        kind: 'session',
        container,
        workspaceId,
        depth,
        pill: ROW_HEIGHT,
        lead: LEAD_IN_SCOPE,
        visible: open,
        zoneKeys: zoneKey === undefined ? [] : [zoneKey],
        regionKey: undefined,
        scope,
        sessionId: row.id,
        row,
      })
    }
    if (collapsed.hiddenCount > 0) {
      push({
        key: prefix + 'overflow',
        kind: 'overflow',
        container,
        workspaceId,
        depth,
        pill: OVERFLOW_HEIGHT,
        lead: LEAD_IN_SCOPE,
        visible: open,
        zoneKeys: [],
        regionKey: undefined,
        scope,
        hiddenCount: collapsed.hiddenCount,
        scopeExpanded: expanded,
      })
    }
  }

  // 根节点：先各工作区分组段，再平铺的那些
  for (const section of rootLayout.groups) {
    const open = input.expansion.isVirtualWorkspaceExpanded(section.id)
    push({
      key: 'virtual/' + section.id,
      kind: 'virtualHead',
      container: containers.root,
      workspaceId: '',
      depth: 0,
      pill: HEAD_HEIGHT,
      lead: 0,
      visible: true,
      zoneKeys: [input.keys.virtualHead(section.id), input.keys.virtualBody(section.id)],
      regionKey: input.keys.virtualRegion(section.id),
    })
    const before = rows.length
    for (const [index, workspaceId] of section.roots.entries()) {
      addWorkspace(
        workspaceId,
        containers.virtualOf(section.id),
        index === 0 ? LEAD_IN_SCOPE : LEAD_BETWEEN_WORKSPACES,
      )
    }
    if (!open) hideRange(rows, before)
  }
  for (const [index, workspaceId] of rootLayout.loose.entries()) {
    addWorkspace(workspaceId, containers.root, index === 0 ? 0 : LEAD_BETWEEN_WORKSPACES)
  }

  if (!input.hideStray && input.stray.length > 0) {
    push({
      key: 'stray/head',
      kind: 'strayHead',
      container: containers.root,
      workspaceId: '',
      depth: 0,
      pill: HEAD_HEIGHT,
      lead: LEAD_BETWEEN_WORKSPACES,
      visible: true,
      zoneKeys: [],
      regionKey: undefined,
    })
    // 「未分组」桶的次序在容器那一层已经定好（置顶提前、其余维持列表原序），这里不再重排
    addSessions({ kind: 'stray' }, input.stray, true, containers.root, '', 0, undefined, true)
  }

  return rows
}

/** 把一段行标成不露面：分组收起时它的整个子树都不露面 */
function hideRange(rows: OutlineRow[], from: number): void {
  for (let index = from; index < rows.length; index += 1) {
    const row = rows[index]
    if (row !== undefined) rows[index] = { ...row, visible: false }
  }
}

/**
 * 此刻露面的那几条，按界面顺序
 * @param rows - {@link buildOutline} 的结果
 */
export function visibleRows(rows: readonly OutlineRow[]): OutlineRow[] {
  return rows.filter((row) => row.visible)
}


/**
 * 从序列顶部到某一行的高度合计
 *
 * 虚拟化按它定位滚动偏移；它也顺带说明「露面的行才有高度」这条不变量
 * @param rows - {@link buildOutline} 的结果
 * @param key - 目标行的 key
 * @returns 目标行之前的合计高度，找不到时为 undefined
 */
export function offsetOf(rows: readonly OutlineRow[], key: string): number | undefined {
  let total = 0
  for (const row of rows) {
    if (row.key === key) return total
    if (row.visible) total += row.height
  }
  return undefined
}
