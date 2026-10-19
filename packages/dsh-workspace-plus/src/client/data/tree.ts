/**
 * 工作区列表的统一节点树
 *
 * 真实工作区与虚拟工作区分组放进同一棵树，拖拽层只认这里的节点身份，不再分别认识会话分组、虚拟工作区分组
 * 与工作区体内未归组那一段三套容器
 *
 * 树把用户在界面上的两种动作分开表达，两条关系各答一件事：
 * - {@link WorkspaceTree.containerOf} 回答「放进哪一片」——落点容器
 * - {@link WorkspaceTree.siblingsOf} 回答「排在第几」——同层兄弟
 *
 * 两者不是同一份名单。把一个工作区放进会话分组只改变它渲染在哪一片，它在注册表上仍与父工作区名下其他工作区
 * 排成一列；因此一个节点可以容器属于甲、兄弟属于乙。分成两条关系取，同一格就不会既算排序又算放入
 *
 * 纯数据变换：输入是注册表序、虚拟分组定义与嵌套推导结果，不碰 React、不碰 DOM
 */
import { nearestAncestorAnyScope } from './nest.ts'
import type { Nesting } from './nest.ts'

/** 树上的一个节点：真实工作区或虚拟工作区分组 */
export type TreeNodeRef =
  | { kind: 'workspace'; id: string }
  | { kind: 'virtual'; id: string }

/** 节点落进的那一片 */
export type TreeContainerRef =
  /** 根节点那一层，虚拟分组与平铺工作区同处其中 */
  | { kind: 'root' }
  /** 一个虚拟工作区分组的组体 */
  | { kind: 'virtual'; id: string }
  /** 一个工作区体内某个会话分组的组体 */
  | { kind: 'group'; workspaceId: string; groupId: string }

/**
 * 一段兄弟的排列由谁持有
 *
 * 这是「段顺序合同」在代码里的形态：一段一个顺序持有者，换位写入面由持有者决定
 * - `registry`：官方注册表序，换位写 `insertBefore`
 * - `virtualList`：本包 `virtualWorkspaces[]` 数组序，换位写 `moveVirtualWorkspaceBefore`
 */
export type OrderHolder =
  | { kind: 'registry' }
  | { kind: 'virtualList' }

/**
 * 一个节点此刻能落到哪儿
 *
 * 两类关系分开列，因为它们在界面上是两件事：
 * - `containers` 回答「能放进哪一片」——落到这一片上画框
 * - `rows` 回答「能排到谁的前后」——落到这一行上画线
 *
 * 一条行只会出现在 `rows` 里，不会因为它恰好在某一片里就变成 `containers` 的一项：
 * 行是那一片的成员，不是那一片本身
 */
export interface DropPlaces {
  /** 能收下这个节点的每一片 */
  containers: readonly TreeContainerRef[]
  /** 能作位次参照的那些行 */
  rows: readonly TreeNodeRef[]
}

/** 树的输入 */
export interface TreeInput {
  /** 工作区 id，按宿主给的注册表顺序 */
  workspaceIds: readonly string[]
  /** 虚拟工作区分组定义，数组序即界面序 */
  virtualGroups: readonly { id: string; workspaceIds: readonly string[] }[]
  /** 子工作区嵌套的推导结果 */
  nesting: Nesting
  /** 一个工作区名下真实存在的会话分组 id，按界面序；缺省表示名下没有分组 */
  sessionGroupsOf?: (workspaceId: string) => readonly string[]
  /** workspaceId → cwd；拖拽认祖先要靠它，缺省表示没有任何路径信息 */
  pathOf?: (workspaceId: string) => string | undefined
}

/** 树对外交出的事实 */
export interface WorkspaceTree {
  /** 根节点的有序条目：先是全部分组，再是平铺在根节点的工作区顶层 */
  entries: readonly TreeNodeRef[]
  /**
   * 容器发牌器
   *
   * 同一个容器恒交回同一实例，因此容器可以直接当 Map 的键、可以用引用比较
   * 与嵌套推导那一层的 `containers` 同一取舍：自行拼一个同形状的对象按引用查不到任何东西
   */
  containers: {
    /** 不在任何虚拟工作区分组里的那一段 */
    readonly root: TreeContainerRef
    /** 某个虚拟工作区分组那一段 */
    virtualOf: (groupId: string) => TreeContainerRef
    /** 某个工作区体内某个会话分组那一段 */
    groupOf: (workspaceId: string, groupId: string) => TreeContainerRef
  }
  /** 节点落进的那一片，节点不在树上时为 undefined */
  containerOf: (node: TreeNodeRef) => TreeContainerRef | undefined
  /** 一个容器里的全部成员，按注册表序 */
  membersOf: (container: TreeContainerRef) => readonly TreeNodeRef[]
  /** 一个容器里的顶层成员：被嵌套进同容器内另一个成员的那些不在其中 */
  rootsOf: (container: TreeContainerRef) => readonly TreeNodeRef[]
  /** 节点所在的那一段兄弟，按注册表序；换位换算读的就是它 */
  siblingsOf: (node: TreeNodeRef) => readonly TreeNodeRef[]
  /** 一段兄弟的排列由谁持有 */
  orderHolderOf: (node: TreeNodeRef) => OrderHolder
  /** 工作区节点在树上的父节点，虚拟分组节点没有父节点 */
  parentOf: (node: TreeNodeRef) => TreeNodeRef | undefined
  /** 工作区节点的祖先链，从近到远（跟着渲染走：跨虚拟分组的两个工作区不算父子） */
  ancestorsOf: (node: TreeNodeRef) => readonly TreeNodeRef[]
  /**
   * 拖拽树上的父节点：手动归属与 cwd 父子收成同一条边
   *
   * 拖拽只关心「它在谁里面」，不关心那条边是用户放的还是路径推出来的
   */
  dropParentOf: (node: TreeNodeRef) => TreeNodeRef | undefined
  /** 拖拽树上的祖先链，从近到远 */
  dropAncestorsOf: (node: TreeNodeRef) => readonly TreeNodeRef[]
  /** 拖拽树上的同层兄弟，按同一条边认 */
  dropSiblingsOf: (node: TreeNodeRef) => readonly TreeNodeRef[]
  /** 工作区节点落盘的会话分组归属，没有时 undefined */
  bindingOf: (node: TreeNodeRef) => { parentId: string; groupId: string } | undefined
  /**
   * 节点归属哪个虚拟分组，不在任何分组里时为 undefined
   *
   * 这是**归属**不是容器：被放进会话分组的子工作区容器已经变成那个分组，但它仍然属于原来那个虚拟分组
   * 「移入一个已经属于的分组」要按这一格挡掉，否则放下去会写一次把成员挪到组末的移动
   */
  virtualGroupOf: (node: TreeNodeRef) => TreeNodeRef | undefined
  /** 一个工作区名下真实存在的会话分组 id，按界面序 */
  sessionGroupsOf: (node: TreeNodeRef) => readonly string[]
  /** 全部分组节点，数组序即界面序 */
  virtualGroups: readonly TreeNodeRef[]
  /** 全部工作区节点，按注册表序 */
  workspaceNodes: readonly TreeNodeRef[]
  /**
   * 区域键 → 节点身份的对照表
   *
   * 适配层用它把 DOM 元素（带区域键）映射回节点身份，检测层因此只认节点。
   * 键的形状仍由 {@link zoneKeyOf} 一处决定，这里只是把它对全部节点算一遍
   */
  nodesByZone: () => ReadonlyMap<string, TreeNodeRef | TreeContainerRef>
  /**
   * 整棵树的全部节点，从根往下（含虚拟分组）
   *
   * 拖拽构造落点关系时按它遍历：每个节点与来源都可能构成任意一种关系，
   * 因此先做一次低效但正确的全遍历，而不是分门别类去挑「哪些行能当参照」
   */
  allNodes: () => readonly TreeNodeRef[]
  /**
   * 一个节点此刻能落到哪儿
   *
   * 这是嵌套与排序两类关系的**唯一出口**：三种来源（cwd 祖先、虚拟分组归属、会话分组归属）
   * 在这一处收成一个答案，解析层因此不再自己推「这个关系的嵌套是从哪来的」
   */
  /**
   * 平铺在根节点那一层的工作区 id，按注册表序
   *
   * 这一层是一条连续的名字序列：它们彼此之间只有先后，没有谁是谁的容器
   */
  rootLooseOrder: () => readonly string[]
}

const ROOT: TreeContainerRef = { kind: 'root' }
const REGISTRY: OrderHolder = { kind: 'registry' }
const VIRTUAL_LIST: OrderHolder = { kind: 'virtualList' }

/**
 * 装配统一节点树
 *
 * 容器的划分沿用嵌套推导的结果：工作区落在哪一片由 {@link Nesting.containerOf} 给出，这里只把它的容器身份
 * 换成树自己的形状，并补上虚拟分组这一族节点
 *
 * 兄弟与容器分开取的原因是两者本来就可以不同源：放进会话分组改变渲染位置，不改变注册表上的先后
 */
export function buildWorkspaceTree(input: TreeInput): WorkspaceTree {
  const { workspaceIds, virtualGroups, nesting, sessionGroupsOf = () => [], pathOf = () => undefined } = input
  const known = new Set(workspaceIds)
  const groupIds = new Set(virtualGroups.map((group) => group.id))

  /**
   * 节点发牌器
   *
   * 同一个工作区、同一个虚拟分组恒交回同一实例，因此节点可以直接当 Map 的键、可以用引用比较
   * 现造一个内容相同的对象查不到任何东西
   */
  const workspaceNodeCache = new Map<string, TreeNodeRef>()
  const workspaceNode = (id: string): TreeNodeRef => {
    const cached = workspaceNodeCache.get(id)
    if (cached !== undefined) return cached
    const node: TreeNodeRef = { kind: 'workspace', id }
    workspaceNodeCache.set(id, node)
    return node
  }
  const virtualNodeCache = new Map<string, TreeNodeRef>()
  const virtualNode = (id: string): TreeNodeRef => {
    const cached = virtualNodeCache.get(id)
    if (cached !== undefined) return cached
    const node: TreeNodeRef = { kind: 'virtual', id }
    virtualNodeCache.set(id, node)
    return node
  }

  /**
   * 容器发牌器
   *
   * 与会话容器同一取舍：同一个容器只发一个实例，重复请求交回同一个对象
   * 容器的身份由它自己的字段表达，不必另造字符串键
   */
  const virtualContainerCache = new Map<string, TreeContainerRef>()
  const groupContainerCache = new Map<string, TreeContainerRef>()
  const virtualContainerOf = (id: string): TreeContainerRef => {
    const cached = virtualContainerCache.get(id)
    if (cached !== undefined) return cached
    const container: TreeContainerRef = { kind: 'virtual', id }
    virtualContainerCache.set(id, container)
    return container
  }
  const groupContainerOf = (workspaceId: string, groupId: string): TreeContainerRef => {
    // 两个 id 都不是本包能限定字符集的东西，分隔符取一个它们不可能含的字符
    // 这个键只作 Map 的键、从不解析回来，因此不必可读
    const composite = `${workspaceId}\u0000${groupId}`
    const cached = groupContainerCache.get(composite)
    if (cached !== undefined) return cached
    const container: TreeContainerRef = { kind: 'group', workspaceId, groupId }
    groupContainerCache.set(composite, container)
    return container
  }

  /**
   * 一个工作区属于哪个虚拟分组
   *
   * 分组定义里的 `workspaceIds` 当归属集合用：一个工作区被两个分组同时记录时以先出现的为准，
   * 元数据里存在而列表里已没有的工作区静默跳过，界面因此不会因为一条坏记录丢行
   */
  const groupOfMember = new Map<string, string>()
  for (const group of virtualGroups) {
    for (const id of group.workspaceIds) {
      if (!known.has(id) || groupOfMember.has(id)) continue
      groupOfMember.set(id, group.id)
    }
  }

  const containerOf = (node: TreeNodeRef): TreeContainerRef | undefined => {
    if (node.kind === 'virtual') return groupIds.has(node.id) ? ROOT : undefined
    if (!known.has(node.id)) return undefined
    const container = nesting.containerOf(node.id)
    switch (container.kind) {
      case 'root':
        return ROOT
      case 'virtual':
        return virtualContainerOf(container.groupId)
      case 'group':
        return groupContainerOf(container.workspaceId, container.groupId)
    }
  }

  const members = new Map<TreeContainerRef, TreeNodeRef[]>()
  const push = (container: TreeContainerRef, node: TreeNodeRef): void => {
    const list = members.get(container)
    if (list === undefined) members.set(container, [node])
    else list.push(node)
  }
  // 根节点那一层按「分组在前、平铺工作区在后」装配，与根节点条目的单一有序名单同序
  for (const group of virtualGroups) push(ROOT, virtualNode(group.id))
  for (const id of workspaceIds) {
    const node = workspaceNode(id)
    const container = containerOf(node)
    if (container === undefined) continue
    push(container, node)
  }

  const membersOf = (container: TreeContainerRef): readonly TreeNodeRef[] =>
    members.get(container) ?? []

  const parentOf = (node: TreeNodeRef): TreeNodeRef | undefined => {
    if (node.kind === 'virtual') return undefined
    const parent = nesting.parentOf(node.id)
    return parent === '' ? undefined : workspaceNode(parent)
  }

  const rootsCache = new Map<TreeContainerRef, TreeNodeRef[]>()
  const rootsOf = (container: TreeContainerRef): readonly TreeNodeRef[] => {
    const cached = rootsCache.get(container)
    if (cached !== undefined) return cached
    const top: TreeNodeRef[] = []
    for (const node of membersOf(container)) {
      // 父节点落在同一容器里的那些渲染在父节点体内，不是这一层的顶层
      const parent = parentOf(node)
      const parentContainer = parent === undefined ? undefined : containerOf(parent)
      if (parentContainer === undefined || parentContainer !== container) top.push(node)
    }
    rootsCache.set(container, top)
    return top
  }

  const siblingsOf = (node: TreeNodeRef): readonly TreeNodeRef[] => {
    if (node.kind === 'virtual') return virtualGroups.map((group) => virtualNode(group.id))
    if (!known.has(node.id)) return []
    const parent = nesting.parentOf(node.id)
    // 父节点为空时取所在容器的顶层，否则取父节点名下的全部直接子工作区——两者都按注册表序
    const ids =
      parent === ''
        ? nesting.rootsOf(nesting.containerOf(node.id))
        : nesting.childIdsOf(parent)
    return ids.map(workspaceNode)
  }

  /**
   * 拖拽树上的父节点
   *
   * 嵌套有两条来源：**手动放进某个分组**（渲染归属），与 **cwd 路径上的父子关系**。
   * 对用户来说两者没有区别，都只是「这个工作区在谁里面」——因此这里把它们收成一条边，
   * 拖拽构造落点关系时只需沿这条边向上走，不必分别去问两份名单。
   *
   * 手动归属优先：它已经落盘，是用户明确指定过的；没有归属时才退回路径上的最近祖先。
   */
  const dropParentOf = (node: TreeNodeRef): TreeNodeRef | undefined => {
    if (node.kind === 'virtual') return undefined
    // 落盘的归属指向父工作区，分组只决定它落在父工作区体内的哪一段
    const binding = nesting.bindingOf(node.id)
    if (binding !== undefined && known.has(binding.workspaceId)) {
      return workspaceNode(binding.workspaceId)
    }
    const ancestor = nearestAncestorAnyScope(workspaceIds, pathOf, node.id)
    return ancestor === undefined ? undefined : workspaceNode(ancestor)
  }

  /** 拖拽树上的祖先链，从近到远 */
  const dropAncestorsOf = (node: TreeNodeRef): readonly TreeNodeRef[] => {
    const chain: TreeNodeRef[] = []
    const seen = new Set<string>([node.id])
    let current = dropParentOf(node)
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
   * 父节点相同就是同层：手动归属与 cwd 父工作区都算，因为拖拽树上它们本来就是一条边
   */
  const dropSiblingsOf = (node: TreeNodeRef): readonly TreeNodeRef[] => {
    if (node.kind === 'virtual') return []
    const parent = dropParentOf(node)
    const parentId = parent?.id ?? ''
    return workspaceIds
      .filter((id) => (dropParentOf(workspaceNode(id))?.id ?? '') === parentId)
      .map(workspaceNode)
  }

  const orderHolderOf = (node: TreeNodeRef): OrderHolder =>
    node.kind === 'virtual' ? VIRTUAL_LIST : REGISTRY

  const ancestorsOf = (node: TreeNodeRef): readonly TreeNodeRef[] =>
    node.kind === 'virtual' ? [] : nesting.ancestorsOf(node.id).map(workspaceNode)

  const virtualGroupNodes = virtualGroups.map((group) => virtualNode(group.id))
  /** 区域键 → 节点的对照表，第一次问到时算一次 */
  let zoneIndex: Map<string, TreeNodeRef | TreeContainerRef> | undefined

  /** 一个工作区归属哪个虚拟分组，不在任何分组里时为 undefined */
  const groupNodeOf = (id: string): TreeNodeRef | undefined => {
    const groupId = groupOfMember.get(id)
    return groupId === undefined ? undefined : virtualNode(groupId)
  }

  return {
    // 条目名单是渲染层真正要列出来的那些：被嵌套进另一个成员体内的不在其中，否则会在父工作区里外各渲染一次
    entries: rootsOf(ROOT),
    containers: { root: ROOT, virtualOf: virtualContainerOf, groupOf: groupContainerOf },
    containerOf,
    membersOf,
    rootsOf,
    siblingsOf,
    orderHolderOf,
    parentOf,
    ancestorsOf,
    dropParentOf,
    dropAncestorsOf,
    dropSiblingsOf,
    bindingOf: (node) => {
      if (node.kind === 'virtual') return undefined
      const binding = nesting.bindingOf(node.id)
      return binding === undefined
        ? undefined
        : { parentId: binding.workspaceId, groupId: binding.groupId }
    },
    virtualGroupOf: (node) => (node.kind === 'virtual' ? node : groupNodeOf(node.id)),
    sessionGroupsOf: (node) => (node.kind === 'virtual' ? [] : [...sessionGroupsOf(node.id)]),
    virtualGroups: virtualGroupNodes,
    workspaceNodes: workspaceIds.filter((id) => known.has(id)).map(workspaceNode),
    // 先虚拟分组、再按注册表序的全部工作区：顺序只影响遍历先后，不影响判定
    allNodes: () => [...virtualGroupNodes, ...workspaceIds.map(workspaceNode)],
    rootLooseOrder: () =>
      rootsOf(ROOT)
        .filter((entry) => entry.kind === 'workspace')
        .map((entry) => entry.id),
    nodesByZone: () => {
      if (zoneIndex !== undefined) return zoneIndex
      const index = new Map<string, TreeNodeRef | TreeContainerRef>()
      const add = (node: TreeNodeRef | TreeContainerRef): void => {
        for (const part of node.kind === 'root' ? (['body'] as const) : (['head', 'body'] as const)) {
          const key = zoneKeyOf(node, part)
          if (key !== undefined) index.set(key, node)
        }
      }
      add(ROOT)
      for (const virtual of virtualGroupNodes) add(virtual)
      for (const id of workspaceIds) {
        const node = workspaceNode(id)
        add(node)
        // 未归组那一段不是树上的一块（它是工作区体内的一截），但它归那个工作区管：
        // 指针停在上面时读出的身份因此是宿主工作区
        index.set(looseZoneKeyOf(id), node)
        for (const groupId of sessionGroupsOf(id)) add(groupContainerOf(id, groupId))
      }
      zoneIndex = index
      return index
    },
  }
}


// ── 区域键 ──

/** 一个节点上的一格区域 */
export type ZonePart =
  /** 标题行那一格，既是放入落点也是排序参照行 */
  | 'head'
  /** 整块那一格，只接放入 */
  | 'body'

/**
 * 交出一个节点或容器上某一格的区域键
 *
 * 六族键构造器收成这一处：拖拽层只按节点身份要键，不再分别认识会话分组、虚拟分组与未归组段
 * 键的取值就是 DOM 标记上的字符串，形状由这里一处决定
 *
 * @param node - 节点或容器
 * @param part - 要哪一格
 * @returns 区域键，该节点没有这一格时 undefined
 */
export function zoneKeyOf(
  node: TreeNodeRef | TreeContainerRef,
  part: ZonePart,
): string | undefined {
  switch (node.kind) {
    case 'workspace':
      // 标题那一格既是同层换位的参照行，也是「移出会话分组」的落点；
      // 整块那一格是它体内那一片——指针停在体内的子工作区或会话上时仍算这一片
      return part === 'head' ? `workspaceHead/${node.id}` : `workspaceBody/${node.id}`
    case 'virtual':
      // 分组节点自己占标题那一格，组体那一格由渲染层挂在它的撑开体上
      return part === 'head'
        ? `virtualWorkspaceHead/${node.id}`
        : `virtualWorkspaceBody/${node.id}`
    case 'group':
      return part === 'head'
        ? `groupHead/${node.workspaceId}/${node.groupId}`
        : `sessionGroup/${node.workspaceId}/${node.groupId}`
    case 'root':
      // 根节点那一片只有整块那一格：拖到分组结构之外的任何空白上都读作移出虚拟工作区分组
      return part === 'body' ? 'root' : undefined
  }
}

/** 一个工作区体内未归组那一段的区域键 */
export function looseZoneKeyOf(workspaceId: string): string {
  return `loose/${workspaceId}`
}

// ── 落点单位 ──

/**
 * 一格的落点单位标识
 *
 * 落点单位是「框与线该套住的整个范围」，它未必等于区域键：同一个区域键在两种关系里
 * 可以是不同的大小——工作区标题行承接「移出分组」时只是那一行，与它谈先后时却是整块工作区。
 * 因此单位另起一套标识，与区域键不共用命名空间。
 *
 * 没有子节点的行不在这里列：它们没有单位标记，自己就是自己的单位
 * @param node - 节点或容器
 * @param part - 要哪一格
 * @returns 那一格的落点单位标识，该格自成一块时 undefined
 */
export function regionOfKey(
  node: TreeNodeRef | TreeContainerRef,
  part: ZonePart,
): string | undefined {
  switch (node.kind) {
    case 'workspace':
      return part === 'head' ? `workspaceBlock/${node.id}` : undefined
    case 'virtual':
      return part === 'head' ? `virtualBlock/${node.id}` : undefined
    case 'group':
      return `sessionGroupBlock/${node.workspaceId}/${node.groupId}`
    case 'root':
      return undefined
  }
}

// ── 落点关系 ──

/**
 * 一条行能落到哪儿
 *
 * 树在这里交出的是**关系**，不是身份：调用方只看到「有几个能放进去的地方、有几个能排前后的行」，
 * 不必知道那一格是虚拟分组、会话分组还是某个工作区——三种来源的差别在树里面就已经消掉了。
 *
 * 两类关系分开列，因为它们在界面上是两件事：
 * - `inside` 落到这一片上画框
 * - `order` 落到那一行上画线，且这一手同时会把它移出当前所在的那一片（换一片才谈得上新位次）
 */
export type DropRelation =
  | {
      kind: 'inside'
      /** 这一片在界面上占的那几格 */
      zones: readonly string[]
      /**
       * 这一片的落点单位由哪一格代言
       *
       * 一片可以占好几格（一个工作区的标题行与它体内那一格），而框只画在一处。
       * 给出这一项时以它为准；缺省表示落到哪一格就画在那一格自己的落点单位上
       */
      region?: string
      /** 落到这一片时执行的那次写入 */
      commit: () => void
    }
  | {
      kind: 'order'
      /**
       * 这一行在界面上占的那几格
       *
       * 与它谈先后意味着「排在这整片之前或之后」，因此默认是这一片的全部格子，
       * 不只是标题那一行：指针停在它体内的会话上时，指的仍然是「排在这个工作区前 / 后」
       */
      zones: readonly string[]
      /**
       * 线跨哪一格所在的落点单位
       *
       * 给出这一项时线跨整个元素画在它的上下缘，而不是贴着标题那一行画一条短边。
       * 缺省表示落到哪一格就画在那一格自己的落点单位上（「只有一行的块」）
       */
      region?: string
      /**
       * 这一行**之后**那处缝由那一行那一格代言
       *
       * 「排到这一行之后」与「排到下一行之前」是同一处空白，只能画一条线。
       * 给出时命中层把「之后」改读作那一格的「之前」，位置、标记、写入因此是同一件事
       *
       * 缺省表示没有下一条可代言：它是这条序列的最后一条，或者下一条正被拖走
       * （那一处是原地投放，交给一个画淡的元素只会让线跟着淡下去）
       */
      seam?: string
      /** 排到这一行之前 / 之后 */
      place: (side: 'before' | 'after') => void
    }

/**
 * 一个节点此刻的全部落点关系
 *
 * 顺序即优先级：同层兄弟在前（位次是最近的一层关系），其余在后
 * @param tree - 装配好的树
 * @param node - 被拖的节点
 * @param writes - 落到各族写入面时各调哪一个
 */
/**
 * 一条新顺序：把被拖的那个挪到参照行之前 / 之后
 * @param order - 这条序列的全量成员
 * @param movingId - 被拖的成员
 * @param side - 排在参照行之前还是之后
 * @param rowId - 参照行
 * @returns 新顺序，参照行不是这条序列的成员时返回 null
 */
function orderWith(
  order: readonly string[],
  movingId: string,
  side: 'before' | 'after',
  rowId: string,
): string[] | null {
  const rest = order.filter((id) => id !== movingId)
  const at = rest.indexOf(rowId)
  if (at < 0) return null
  const next = [...rest]
  next.splice(side === 'before' ? at : at + 1, 0, movingId)
  return next
}

/**
 * 新顺序里「插到谁之前」那一格
 * @param order - 换算出的新顺序
 * @param movingId - 被拖的成员
 */
function nextIdAfter(order: readonly string[], movingId: string): string | undefined {
  return order[order.indexOf(movingId) + 1]
}

/**
 * 「排到这一行之后」那处缝该由哪一格代言
 *
 * 那一处空白同时是「下一条之前」，因此交给下一条的上缘画，屏幕上就只剩一条线。
 * 下一条是此刻并排的那一行，不是「把被拖的抽走之后」的那一行：后者会让线跳到更远的
 * 一行上去，而用户在屏幕上看到的是紧邻的这一处
 * @param order - 这次换位要在其上算的那份序列
 * @param movingId - 被拖的成员
 * @param targetId - 参照行
 * @returns 下一条的标题格键，无下一条时 undefined
 */
function seamOfOrder(
  order: readonly string[],
  movingId: string,
  targetId: string,
): string | undefined {
  const at = order.indexOf(targetId)
  // 参照行不在这条序列上时这次换位本来就不成立，也就无所谓下一格
  if (at < 0) return undefined
  const next = order[at + 1]
  // 段尾没有下一条；下一条正是被拖走的那一条时那处是原地投放，线交给它只会跟着一起淡掉
  return next === undefined || next === movingId ? undefined : `workspaceHead/${next}`
}

export function dropRelationsOf(
  tree: WorkspaceTree,
  node: TreeNodeRef,
  writes: {
    /** 移入某个虚拟分组，空串表示移出到根节点 */
    moveToGroup: (groupId: string) => void
    /** 同层换位 */
    reorder: (beforeWorkspaceId: string | undefined) => void
    /** 移入某个祖先工作区体内的会话分组 */
    nestInto: (parentId: string, groupId: string) => void
    /** 解除会话分组归属 */
    unnest: () => void
  },
): readonly DropRelation[] {
  if (node.kind !== 'workspace') return []
  const relations: DropRelation[] = []
  const container = tree.containerOf(node)
  const membership = tree.virtualGroupOf(node)
  const bound = tree.bindingOf(node)
  const selfParent = tree.dropAncestorsOf(node)[0]

  /**
   * 这个节点能进去的每一片
   *
   * 与放入关系那几处一一对应：根节点、每个虚拟分组、祖先工作区名下的每个会话分组。
   * 每一片顶层的成员都是它的位次参照——「排到这一片里某一行前后」与「移进这一片」
   * 是同一件事的两半
   */
  const joinableContainers = (): TreeContainerRef[] => {
    const list: TreeContainerRef[] = [tree.containers.root]
    for (const virtual of tree.virtualGroups) {
      if (virtual.kind !== 'virtual') continue
      const holder = tree.containers.virtualOf(virtual.id)
      if (holder !== container) list.push(holder)
    }
    for (const ancestor of tree.dropAncestorsOf(node)) {
      for (const groupId of tree.sessionGroupsOf(ancestor)) {
        list.push(tree.containers.groupOf(ancestor.id, groupId))
      }
    }
    return list
  }

  /**
   * 位次序列：一次换位要在一份真实序列上算
   *
   * 一条关系只能用它自己那条序列，不能把几条并成一份——合并后的顺序不再是任何真实序列，
   * 「落在相邻位上无变化」那种判定会失真
   */
  /**
   * 一条位次关系
   *
   * 只回答「排到这一行前后」。**框不归它管**：框问的是「指针这一点归哪一片」，
   * 由检测器沿树往上走现算——把它塞进这里就等于拿目标行的祖先去回答指针的问题
   * @param order - 这次换位要在其上算的那份序列
   * @param targetId - 参照行
   * @param leavesGroup - 这条序列在 root 层，落上去要先把落盘的会话分组归属摘掉
   */
  const orderRelationOf = (
    order: readonly string[],
    targetId: string,
    leavesGroup = false,
  ): DropRelation => {
    // 位次关系只交出一件事：排到这一行前后。
    //
    // 它**不负责框**。框问的是「指针这一点归哪一片」，那是检测器沿树往上走的活
    // （见 dropSearcher 的 chainOf）；把它塞进位次关系里，就等于用**目标那一行**
    // 的祖先去回答**指针**的问题——目标行有一个 cwd 父工作区、而它与来源毫无关系时，
    // 那一块会被无缘无故高亮起来
    const relation: DropRelation = {
      kind: 'order',
      // 整片都算这一行的检测范围：标题行与它体内的那一格。指针停在体内的会话上时，
      // 读出的仍然是「排在这个工作区之前 / 之后」——那一格属于这一片，与标题行是同一件事
      zones: [`workspaceHead/${targetId}`, `workspaceBody/${targetId}`],
      // 线跨整块工作区画：贴着标题那一行画会在体内有内容时显得只有半截
      region: regionOfKey({ kind: 'workspace', id: targetId }, 'head') as string,
      place: (side) => {
        const next = orderWith(order, node.id, side, targetId)
        if (next === null) return
        // 落盘的会话分组归属不在这条序列上，单独补一笔
        if (leavesGroup && bound !== undefined) writes.unnest()
        // 换完之后位次没变就是原地投放
        if (next.every((id, index) => id === order[index])) return
        writes.reorder(nextIdAfter(next, node.id))
      },
    }
    // 这一处缝交给下一条：标题那一格得说出「下一条」是哪一格
    // 序列不同时下一条也不同，因此在这里按本次换算用的那份序列算
    const seam = seamOfOrder(order, node.id, targetId)
    return seam === undefined ? relation : { ...relation, seam }
  }

  // 全遍历整棵树：任何节点都可能与来源构成某种关系
  for (const other of tree.allNodes()) {
    if (other.id === node.id) continue

    // ── 位次关系 ──
    // 两行能谈先后，当且仅当它们在同一条序列上：此刻并排（注册表序同段），
    // 或者 cwd 上同父（挪过去之后就是同层兄弟）。两条各自用自己的序列换算
    if (other.kind === 'workspace') {
      // 一份序列能谈先后，只要两行在同一条序列上。两种都算：
      // - 此刻并排（渲染在同一片的顶层）
      // - cwd 上同父（挪过去之后就是同层兄弟）
      //
      // 祖先工作区不在其中：它承接的是「放进去」，与它的先后没有意义——
      // 一个工作区不会既被放进某个容器、又与那个容器的行谈先后
      const candidates: { order: readonly string[]; leavesGroup: boolean }[] = [
        { order: tree.siblingsOf(node).map((entry) => entry.id), leavesGroup: false },
        { order: tree.dropSiblingsOf(node).map((entry) => entry.id), leavesGroup: false },
      ]
      // 能进去的每一片，它顶层的那些成员都是位次参照：
      // 「排到这一片里某一行前后」与「移进这一片」是同一件事的两半，
      // 用户在界面上看到的是「把它放到那一行旁边」，不该因为两者此刻不在同一片而少掉那条线
      //
      // 来源此刻所在的那一片除外：组内换位由 siblingsOf 那条已经给出，再列一遍是同一份序列
      for (const holder of joinableContainers()) {
        if (holder === container) continue
        const sequence = tree.rootsOf(holder).map((entry) => entry.id)
        if (sequence.length === 0) continue
        // 换片之后落盘的会话分组归属就不成立了；落在 root 那一层还多一件「退出虚拟分组」，
        // 那一半由根节点那片自己的 inside 关系负责，这里只补归属
        candidates.push({ order: sequence, leavesGroup: bound !== undefined })
      }
      // 祖先工作区不作位次参照：一个工作区既然已经确认自己要作为子工作区出现在
      // 某个容器里，它就不再与那个容器的行谈先后——那一行承接的是「放进去」
      const isAncestorRow = selfParent !== undefined && selfParent.id === other.id
        || tree.dropAncestorsOf(node).some((entry) => entry.id === other.id)
      const matched = isAncestorRow
        ? undefined
        : candidates.find((entry) => entry.order.includes(other.id))
      if (matched !== undefined) {
        relations.push(orderRelationOf(matched.order, other.id, matched.leavesGroup))
        continue
      }
    }

    // ── 放入关系 ──
    // 虚拟分组是容器；祖先工作区是容器；祖先名下的会话分组是容器
    if (other.kind === 'virtual') {
      const target = tree.containers.virtualOf(other.id)
      if (target === container) continue
      const zones = [
        zoneKeyOf(target, 'head') as string,
        zoneKeyOf(target, 'body') as string,
      ]
      // 组头与组体是两格、同一片：框与线都该套住整块分组，单位因此挂在整块容器上
      const region = regionOfKey({ kind: 'virtual', id: other.id }, 'head') as string
      relations.push({ kind: 'inside', zones, region, commit: () => writes.moveToGroup(other.id) })
      continue
    }

    // 祖先工作区：落上去读作「成为它的子工作区」
    const isAncestor = tree.dropAncestorsOf(node).some((entry) => entry.id === other.id)
    if (isAncestor) {
      const ancestorZones = [`workspaceHead/${other.id}`, `workspaceBody/${other.id}`]
      const ancestorRegion = regionOfKey({ kind: 'workspace', id: other.id }, 'head') as string
      // 已经住在它体内：落回它这一行读作回到它的直接管辖
      if (bound !== undefined && bound.parentId === other.id) {
        relations.push({
          kind: 'inside',
          zones: ancestorZones,
          region: ancestorRegion,
          commit: () => writes.unnest(),
        })
        continue
      }
      // 按 cwd 本来就是它的子工作区，且此刻已经嵌在它体内：原地投放，不写
      //
      // 这一条只在两者**已经在同一片里**时成立。跨片的兄弟不在此列——那时界面上并没有嵌进去，
      // 这次投放恰恰是要把来源移进祖先所在的那一片，移进去之后 cwd 关系才在界面上成立
      if (selfParent !== undefined && selfParent.id === other.id && container === tree.containerOf(other)) {
        relations.push({ kind: 'inside', zones: ancestorZones, region: ancestorRegion, commit: () => {} })
        continue
      }
      const target = tree.containerOf(other)
      if (target === undefined) continue
      relations.push({
        kind: 'inside',
        zones: ancestorZones,
        region: ancestorRegion,
        commit: () => {
          if (target.kind === 'group') writes.nestInto(target.workspaceId, target.groupId)
          else writes.moveToGroup(target.kind === 'root' ? '' : target.id)
        },
      })
      continue
    }
  }

  // 祖先工作区名下的会话分组。
  //
  // 这一段**不按 other 走**：它是「来源能落到哪几个分组里」这一件事，与 allNodes 里
  // 有哪些节点无关。放进上面那个循环里会让它只在某个 other 恰好没命中任何关系时才执行，
  // 一旦别的分支 continue 掉，整段就静默失效
  for (const ancestor of tree.dropAncestorsOf(node)) {
    for (const groupId of tree.sessionGroupsOf(ancestor)) {
      if (bound !== undefined && bound.parentId === ancestor.id && bound.groupId === groupId) continue
      const holder = tree.containers.groupOf(ancestor.id, groupId)
      const zones = [zoneKeyOf(holder, 'head') as string, zoneKeyOf(holder, 'body') as string]
      const region = regionOfKey({ kind: 'group', workspaceId: ancestor.id, groupId }, 'head') as string
      relations.push({
        kind: 'inside',
        zones,
        region,
        commit: () => writes.nestInto(ancestor.id, groupId),
      })
    }
  }

  // 回到最外层：在分组里时才成立，且只认**整片列表的空白处**（那一片自己的区域键）。
  // 落在一行上的「移出分组」由检测器沿树往上走得出：那一行归它所在的容器，
  // 容器再往上是根节点，根节点那一片若也接了放入关系，就是这一条
  const rootBodyKey = zoneKeyOf(tree.containers.root, 'body') as string
  if (membership !== undefined) {
    relations.push({
      kind: 'inside',
      zones: [rootBodyKey],
      commit: () => writes.moveToGroup(''),
    })
  }

  // 同一行不能同时是「位次参照」与「放进去」：一行若有 order 关系，
  // 它就不再承接放入——那时它的直接父工作区承接 inside，
  // 因为「能与这一行谈先后」意味着「一定能被放进它所在的那一片」
  const orderZones = new Set(
    relations.filter((entry) => entry.kind === 'order').flatMap((entry) => entry.zones),
  )
  return relations.filter(
    (entry) => entry.kind === 'order' || !entry.zones.some((key) => orderZones.has(key)),
  )
}