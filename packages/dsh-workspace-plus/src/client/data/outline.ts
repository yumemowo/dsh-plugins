/**
 * 一份扁平的行序列：界面上从上到下每占一行，这里就有一条
 *
 * 容器与行一起进序列：题头行（工作区分组、会话分组、工作区）、会话行、溢出按钮与空态都在其中
 *
 * 它是布局的下游而不是替代：`layout.ts` 答「哪些分组成员是谁」
 * 这一层答「此刻界面上从上到下是什么」，比布局多要两样：三层折叠态与每段露出额度
 *
 * 不碰 React、不碰 DOM，也不记几何：一行多高由样式表按内容决定，这一层只说顺序与露面
 */
import { collapseSessionRows, sessionScopeKey } from './collapse.ts'
import type { SessionScopeRef } from './collapse.ts'
import { nearestAncestorAnyScope } from './nest.ts'
import type { ContainerNode } from './nest.ts'
import { looseZoneKeyOf, zoneKeysOf } from './zones.ts'
import type { NodeRef } from './zones.ts'
import type { RootLayout, SessionRow, WorkspaceLayout } from './types.ts'

// ── 行 ──

/**
 * 一行的种类
 *
 * `overflow` 是那条「展开其余 n 个会话」的按钮，`empty` 是工作区体内的空态
 * 两者都占竖直高度，因此与行同样进序列
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
  container: ContainerNode
  /** 这一行挂在哪个工作区名下；根节点那一层与「未分组」桶为空串 */
  workspaceId: string
  /**
   * 工作区行嵌在哪个工作区体内；顶层工作区与别的种类为空串
   *
   * 容器回答不了这件事：父工作区与子工作区同处一个容器（子工作区渲染在父工作区体内，
   * 但那一片属于同一个容器），因此嵌在谁里面要单独记一格
   */
  parentId?: string | undefined
  /** 缩进层级，与 `nest` 的 `levelOf` 同值 */
  depth: number
  /**
   * 此刻是否真的露面
   *
   * 收起的工作区里那些行仍在文档里（撑开体靠内容常驻才能收回），因此它们留在序列里、但为 false
   * {@link visibleRows} 按这一格分档
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
   * 这一行是哪个分组的头
   *
   * `virtualHead` 是工作区分组，`groupHead` 是会话分组；别的种类为 undefined
   */
  groupId?: string | undefined
  /**
   * `virtualHead` 那一组名下的全部工作区 id，含被嵌套的那些
   *
   * 归属与容器不是一回事：一个工作区被放进某个会话分组后容器变了，它仍属于原来这个工作区分组
   */
  members?: readonly string[] | undefined
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

// ── 输入 ──

/**
 * 造 outline 要的全部输入
 *
 * 布局由调用方给现成的：这一层不重算「谁在哪个分组里」，只决定顺序、露面与高度
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
    readonly root: ContainerNode
    virtualOf: (groupId: string) => ContainerNode
    groupOf: (workspaceId: string, groupId: string) => ContainerNode
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
  /** 区域键的写法，由调用方交出：这一层不拼键，只把键记在行上 */
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
 * 把一份布局收成一条扁平的行序列，顺序即界面上的顺序
 *
 * 根节点的分组段在前，其后是未归组的工作区，末尾「未分组」桶排在全部工作区之后
 * 一个工作区体内先是子工作区（递归），再是各会话分组，最后是未归组会话
 * @param input - 见 {@link OutlineInput}
 * @returns 从上到下的全部行
 */
export function buildOutline(input: OutlineInput): OutlineRow[] {
  const rows: OutlineRow[] = []
  const { containers, rootLayout } = input

  const push = (
    row: Omit<OutlineRow, 'hiddenCount' | 'scopeExpanded'> & {
      hiddenCount?: number
      scopeExpanded?: boolean
    },
  ): void => {
    const { hiddenCount = 0, scopeExpanded = false, ...rest } = row
    rows.push({ ...rest, hiddenCount, scopeExpanded })
  }

  /** 一个工作区区块 */
  const addWorkspace = (workspaceId: string, container: ContainerNode, parentId = ''): void => {
    const layout = input.workspaceLayoutOf(workspaceId)
    const depth = input.depthOf(workspaceId)
    const open = input.expansion.isWorkspaceExpanded(workspaceId)
    const childIds = layout.children ?? []

    push({
      key: 'workspace/' + workspaceId,
      kind: 'workspaceHead',
      container,
      workspaceId,
      parentId,
      depth,
      visible: true,
      zoneKeys: [input.keys.workspaceHead(workspaceId), input.keys.workspaceBody(workspaceId)],
      regionKey: input.keys.workspaceRegion(workspaceId),
    })

    // 子工作区排在会话分组之前，与分组内部同一顺序
    for (const childId of childIds) addWorkspace(childId, container, workspaceId)

    for (const section of layout.groups) {
      const groupOpen = input.expansion.isGroupExpanded(workspaceId, section.id)
      push({
        key: 'group/' + workspaceId + '/' + section.id,
        kind: 'groupHead',
        container: containers.groupOf(workspaceId, section.id),
        workspaceId,
        depth,
        visible: open,
        zoneKeys: [
          input.keys.sessionGroupHead(workspaceId, section.id),
          input.keys.sessionGroupZone(workspaceId, section.id),
        ],
        regionKey: input.keys.sessionGroupRegion(workspaceId, section.id),
        groupId: section.id,
      })
      // 被放进这个分组的子工作区排在该组的会话之前，与组内的绘制顺序一致
      // 它们整段住在组体里，因此组收起时不露面
      const bodyFrom = rows.length
      for (const childId of section.children ?? []) {
        addWorkspace(childId, containers.groupOf(workspaceId, section.id), workspaceId)
      }
      addSessions(
        { kind: 'group', workspaceId, groupId: section.id },
        section.sessions,
        open && groupOpen,
        containers.groupOf(workspaceId, section.id),
        workspaceId,
        depth,
      )
      if (!groupOpen) hideRange(rows, bodyFrom)
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
   * @param presorted - 传进来的已经就是最终顺序，不必再排
   *   末尾「未分组」桶是这一档：容器交给它的是「置顶提前、其余维持列表原序」之后的结果
   *   再套一遍工作区那个按时间排的比较器会把置顶提前抹掉
   */
  function addSessions(
    scope: SessionScopeRef,
    all: readonly SessionRow[],
    open: boolean,
    container: ContainerNode,
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
      visible: true,
      zoneKeys: [input.keys.virtualHead(section.id), input.keys.virtualBody(section.id)],
      regionKey: input.keys.virtualRegion(section.id),
      groupId: section.id,
      members: section.workspaceIds,
    })
    const before = rows.length
    for (const workspaceId of section.roots) {
      addWorkspace(workspaceId, containers.virtualOf(section.id))
    }
    if (!open) hideRange(rows, before)
  }
  for (const workspaceId of rootLayout.loose) {
    addWorkspace(workspaceId, containers.root)
  }

  if (!input.hideStray && input.stray.length > 0) {
    push({
      key: 'stray/head',
      kind: 'strayHead',
      container: containers.root,
      workspaceId: '',
      depth: 0,
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

// ── 索引 ──

/**
 * 一行一个身份之后的查询表
 *
 * 拖拽要问的都不是「第几行」，而是「这个工作区在哪一片、它上面是谁、同层还有谁」，
 * 因此把行序列扫一遍装成几份索引。它不引入新事实：每一项都能在行上直接读到
 */
export interface OutlineIndex {
  /** 容器发牌器：交回的就是行上带着的那个实例，因此可以直接当 Map 的键 */
  containers: {
    readonly root: ContainerNode
    virtualOf: (groupId: string) => ContainerNode
    groupOf: (workspaceId: string, groupId: string) => ContainerNode
  }
  /** 节点落进的那一片，节点不在序列里时为 undefined */
  containerOf: (node: NodeRef) => ContainerNode | undefined
  /** 一个容器里的全部成员，按界面顺序 */
  membersOf: (container: ContainerNode) => readonly NodeRef[]
  /** 一个容器里的顶层成员：嵌进同容器内另一个成员的那些不在其中 */
  rootsOf: (container: ContainerNode) => readonly NodeRef[]
  /** 节点所在的那一段兄弟，按界面顺序 */
  siblingsOf: (node: NodeRef) => readonly NodeRef[]
  /** 工作区节点的父节点，虚拟分组节点没有父节点 */
  parentOf: (node: NodeRef) => NodeRef | undefined
  /** 工作区节点的祖先链，从近到远 */
  ancestorsOf: (node: NodeRef) => readonly NodeRef[]
  /**
   * 拖拽认的父节点：渲染归属与 cwd 路径上的祖先收成同一条边
   *
   * 拖拽只关心「它在谁里面」，不关心那条边是用户放的还是路径推出来的
   */
  dropParentOf: (node: NodeRef) => NodeRef | undefined
  /** 拖拽认的祖先链，从近到远 */
  dropAncestorsOf: (node: NodeRef) => readonly NodeRef[]
  /** 拖拽认的同层兄弟，按同一条边认 */
  dropSiblingsOf: (node: NodeRef) => readonly NodeRef[]
  /** 工作区落盘的会话分组归属，没有时 undefined */
  bindingOf: (node: NodeRef) => { parentId: string; groupId: string } | undefined
  /**
   * 节点归属哪个虚拟分组，不在任何分组里时为 undefined
   *
   * 这是**归属**不是容器：被放进会话分组的子工作区容器已经变成那个分组，但它仍属于原来那个工作区分组
   */
  virtualGroupOf: (node: NodeRef) => NodeRef | undefined
  /** 一个工作区名下真实存在的会话分组 id，按界面序 */
  sessionGroupsOf: (node: NodeRef) => readonly string[]
  /** 一个工作区 id 对应的节点身份，序列里没有它时 undefined */
  workspaceNodeOf: (workspaceId: string) => NodeRef | undefined
  /** 全部分组节点，数组序即界面序 */
  virtualGroups: readonly NodeRef[]
  /** 全部工作区节点，按界面序 */
  workspaceNodes: readonly NodeRef[]
  /**
   * 区域键 → 节点身份的对照表
   *
   * 适配层用它把 DOM 元素（带区域键）映射回节点身份，检测层因此只认节点
   */
  nodesByZone: () => ReadonlyMap<string, NodeRef | ContainerNode>
  /** 序列里出现的全部节点，分组在前、工作区在后 */
  allNodes: () => readonly NodeRef[]
}

/**
 * 把行序列扫成查询表
 *
 * 容器归属、父节点与层级全部写在行上，因此这里只是分桶与建表，不重算任何一件事：
 * 序列里没有的位置，索引里也不会有
 *
 * 容器实例直接取行上带着的那一个（它们是调用方交进来的同一批发牌），因此这里不另造容器：
 * 另造一个同形状的对象按引用查不到任何东西
 * @param rows - {@link buildOutline} 的结果
 */
export function indexOutline(
  rows: readonly OutlineRow[],
  options: { pathOf?: (workspaceId: string) => string | undefined } = {},
): OutlineIndex {
  const { pathOf = () => undefined } = options
  /**
   * 节点发牌器
   *
   * 同一身份恒交回同一实例：拖拽层按引用比较节点（「链上第一个在名单里的」），
   * 现造一个内容相同的对象会让比较恒不成立
   */
  const nodes = new Map<string, NodeRef>()
  const node = (kind: 'workspace' | 'virtual', id: string): NodeRef => {
    const key = kind + '/' + id
    const cached = nodes.get(key)
    if (cached !== undefined) return cached
    const entry: NodeRef = { kind, id }
    nodes.set(key, entry)
    return entry
  }

  /** 容器 → 按序列先后登记的成员 */
  const members = new Map<ContainerNode, NodeRef[]>()
  const pushMember = (container: ContainerNode, entry: NodeRef): void => {
    const list = members.get(container)
    if (list === undefined) members.set(container, [entry])
    else list.push(entry)
  }

  const workspaceNodes: NodeRef[] = []
  const workspaceContainer = new Map<string, ContainerNode>()
  const workspaceParent = new Map<string, string>()
  const virtualNodes: NodeRef[] = []
  const virtualMembers = new Map<string, readonly string[]>()
  const virtualContainers = new Map<string, ContainerNode>()
  const groupContainers = new Map<string, Map<string, ContainerNode>>()
  const workspaceGroups = new Map<string, string[]>()
  const boundGroupOf = new Map<string, { parentId: string; groupId: string }>()
  /** 顶层那一片：序列里任取一条根节点容器，没有时现造一个 */
  let rootContainer: ContainerNode | undefined

  /** 记下这份序列用到的容器实例，此后按 id 交回同一个 */
  const rememberContainer = (container: ContainerNode): void => {
    switch (container.kind) {
      case 'root':
        rootContainer ??= container
        return
      case 'virtual':
        virtualContainers.set(container.id, container)
        return
      case 'group': {
        const byGroup = groupContainers.get(container.workspaceId)
        if (byGroup === undefined) {
          groupContainers.set(container.workspaceId, new Map([[container.groupId, container]]))
        } else byGroup.set(container.groupId, container)
      }
    }
  }

  /**
   * 沿序列走一遍
   *
   * 会话行与溢出按钮不产生节点：它们的落点身份是行自己，由命中层按行 id 认
   */
  for (const row of rows) {
    rememberContainer(row.container)
    if (row.kind === 'virtualHead') {
      const groupId = row.groupId ?? ''
      const entry = node('virtual', groupId)
      virtualNodes.push(entry)
      virtualMembers.set(groupId, row.members ?? [])
      pushMember(row.container, entry)
      continue
    }
    if (row.kind === 'workspaceHead') {
      const entry = node('workspace', row.workspaceId)
      workspaceNodes.push(entry)
      workspaceContainer.set(row.workspaceId, row.container)
      if (row.parentId !== undefined && row.parentId !== '') {
        workspaceParent.set(row.workspaceId, row.parentId)
        // 容器是会话分组时那一笔归属才成立；未归组那一段与父工作区同容器，只有父节点关系
        if (row.container.kind === 'group') {
          boundGroupOf.set(row.workspaceId, {
            parentId: row.parentId,
            groupId: row.container.groupId,
          })
        }
      }
      pushMember(row.container, entry)
      continue
    }
    if (row.kind === 'groupHead') {
      const groupId = row.groupId ?? ''
      const holder = workspaceGroups.get(row.workspaceId)
      if (holder === undefined) workspaceGroups.set(row.workspaceId, [groupId])
      else holder.push(groupId)
    }
  }

  const containers = {
    root: rootContainer ?? ({ kind: 'root' } as ContainerNode),
    /** 没见过那个分组时也交回一个稳定实例：它的格子从来没有出现在序列里，因此不会被查回来 */
    virtualOf: (groupId: string): ContainerNode => {
      const cached = virtualContainers.get(groupId)
      if (cached !== undefined) return cached
      const container: ContainerNode = { kind: 'virtual', id: groupId }
      virtualContainers.set(groupId, container)
      return container
    },
    groupOf: (workspaceId: string, groupId: string): ContainerNode => {
      const byGroup = groupContainers.get(workspaceId)
      const cached = byGroup?.get(groupId)
      if (cached !== undefined) return cached
      const container: ContainerNode = { kind: 'group', workspaceId, groupId }
      if (byGroup === undefined) {
        groupContainers.set(workspaceId, new Map([[groupId, container]]))
      } else byGroup.set(groupId, container)
      return container
    },
  }

  const containerOf = (entry: NodeRef): ContainerNode | undefined => {
    if (entry.kind === 'virtual') return virtualMembers.has(entry.id) ? containers.root : undefined
    return workspaceContainer.get(entry.id)
  }

  const membersOf = (container: ContainerNode): readonly NodeRef[] => members.get(container) ?? []

  const parentOf = (entry: NodeRef): NodeRef | undefined => {
    if (entry.kind === 'virtual') return undefined
    const parent = workspaceParent.get(entry.id)
    return parent === undefined ? undefined : node('workspace', parent)
  }

  const rootsCache = new Map<ContainerNode, NodeRef[]>()
  const rootsOf = (container: ContainerNode): readonly NodeRef[] => {
    const cached = rootsCache.get(container)
    if (cached !== undefined) return cached
    const top: NodeRef[] = []
    for (const entry of membersOf(container)) {
      // 父节点落在同一容器里的那些渲染在父节点体内，不是这一层的顶层
      const parent = parentOf(entry)
      const parentContainer = parent === undefined ? undefined : containerOf(parent)
      if (parentContainer === undefined || parentContainer !== container) top.push(entry)
    }
    rootsCache.set(container, top)
    return top
  }

  /** 父工作区 id → 它名下的直接子工作区，按界面顺序 */
  const childrenByParent = new Map<string, string[]>()
  for (const entry of workspaceNodes) {
    const parent = workspaceParent.get(entry.id)
    if (parent === undefined) continue
    const list = childrenByParent.get(parent)
    if (list === undefined) childrenByParent.set(parent, [entry.id])
    else list.push(entry.id)
  }

  /**
   * 同层兄弟
   *
   * 有父节点时与父节点名下其余子工作区并列，没有父节点时取所在容器的顶层。
   * 放进会话分组不改变这条名单——它改变的是渲染位置，不是界面上的先后
   */
  const siblingsOf = (entry: NodeRef): readonly NodeRef[] => {
    if (entry.kind === 'virtual') return virtualNodes
    const container = workspaceContainer.get(entry.id)
    if (container === undefined) return []
    const parent = workspaceParent.get(entry.id)
    const ids =
      parent === undefined
        ? rootsOf(container)
            .filter((each) => each.kind === 'workspace')
            .map((each) => each.id)
        : (childrenByParent.get(parent) ?? [])
    return ids.map((id) => node('workspace', id))
  }

  const ancestorsOf = (entry: NodeRef): readonly NodeRef[] => {
    if (entry.kind === 'virtual') return []
    const chain: NodeRef[] = []
    const seen = new Set<string>([entry.id])
    let current = workspaceParent.get(entry.id)
    while (current !== undefined && !seen.has(current)) {
      seen.add(current)
      chain.push(node('workspace', current))
      current = workspaceParent.get(current)
    }
    return chain
  }

  /**
   * 拖拽认的父节点
   *
   * 渲染归属优先：它已经落盘，是用户明确指定过的。没有归属时才退回 cwd 路径上的最近祖先——
   * 后者答的是「可能挪到哪儿」，挪过去之后那个路径祖先才成为真正的父工作区
   */
  const dropParentOf = (entry: NodeRef): NodeRef | undefined => {
    if (entry.kind === 'virtual') return undefined
    const bound = workspaceParent.get(entry.id)
    if (bound !== undefined) return node('workspace', bound)
    const ancestor = nearestAncestorAnyScope(workspaceIds(), pathOf, entry.id)
    return ancestor === undefined ? undefined : node('workspace', ancestor)
  }

  const dropAncestorsOf = (entry: NodeRef): readonly NodeRef[] => {
    const chain: NodeRef[] = []
    const seen = new Set<string>([entry.id])
    let current = dropParentOf(entry)
    while (current !== undefined && !seen.has(current.id)) {
      seen.add(current.id)
      chain.push(current)
      current = dropParentOf(current)
    }
    return chain
  }

  /**
   * 与这个节点同父的那些兄弟，按同一条边认
   *
   * 父节点相同就是同层：渲染归属与 cwd 父工作区都算，因为拖拽时它们本来就是一条边
   */
  const dropSiblingsOf = (entry: NodeRef): readonly NodeRef[] => {
    if (entry.kind === 'virtual') return []
    const parent = dropParentOf(entry)
    const parentId = parent?.id ?? ''
    return workspaceNodes
      .filter((each) => (dropParentOf(each)?.id ?? '') === parentId)
      .map((each) => each)
  }

  const workspaceIds = (): string[] => workspaceNodes.map((entry) => entry.id)

  /** 一个工作区归属哪个虚拟分组：那一组自己记着成员名单 */
  const groupNodeOf = (id: string): NodeRef | undefined => {
    for (const [groupId, list] of virtualMembers) {
      if (list.includes(id)) return node('virtual', groupId)
    }
    return undefined
  }

  /** 区域键 → 节点，第一次问到时算一次 */
  let zoneIndex: Map<string, NodeRef | ContainerNode> | undefined

  return {
    containers,
    containerOf,
    membersOf,
    rootsOf,
    siblingsOf,
    parentOf,
    ancestorsOf,
    dropParentOf,
    dropAncestorsOf,
    dropSiblingsOf,
    bindingOf: (entry) => (entry.kind === 'virtual' ? undefined : boundGroupOf.get(entry.id)),
    virtualGroupOf: (entry) => (entry.kind === 'virtual' ? entry : groupNodeOf(entry.id)),
    sessionGroupsOf: (entry) =>
      entry.kind === 'virtual' ? [] : [...(workspaceGroups.get(entry.id) ?? [])],
    workspaceNodeOf: (workspaceId) =>
      workspaceContainer.has(workspaceId) ? node('workspace', workspaceId) : undefined,
    virtualGroups: virtualNodes,
    workspaceNodes,
    allNodes: () => [...virtualNodes, ...workspaceNodes],
    nodesByZone: () => {
      if (zoneIndex !== undefined) return zoneIndex
      const built = new Map<string, NodeRef | ContainerNode>()
      const add = (entry: NodeRef | ContainerNode): void => {
        for (const key of zoneKeysOf(entry)) built.set(key, entry)
      }
      add(containers.root)
      for (const entry of virtualNodes) add(entry)
      for (const entry of workspaceNodes) {
        add(entry)
        // 未归组那一段不是独立的一块（它是工作区体内的一截），但它归那个工作区管：
        // 指针停在上面时读出的身份因此是宿主工作区
        built.set(looseZoneKeyOf(entry.id), entry)
        for (const groupId of workspaceGroups.get(entry.id) ?? []) {
          add(containers.groupOf(entry.id, groupId))
        }
      }
      zoneIndex = built
      return built
    },
  }
}
