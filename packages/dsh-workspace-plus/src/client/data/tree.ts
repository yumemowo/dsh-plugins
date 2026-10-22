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
   * 键的形状仍由 {@link zoneKeysOf} 一处决定，这里只是把它对全部节点算一遍
   */
  nodesByZone: () => ReadonlyMap<string, TreeNodeRef | TreeContainerRef>
  /**
   * 整棵树的全部节点，从根往下（含虚拟分组）
   *
   * 拖拽构造落点关系时按它遍历：每个节点与来源都可能构成任意一种关系，
   * 因此先做一次低效但正确的全遍历，而不是分门别类去挑「哪些行能当参照」
   */
  allNodes: () => readonly TreeNodeRef[]
}

const ROOT: TreeContainerRef = { kind: 'root' }

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
    containers: { root: ROOT, virtualOf: virtualContainerOf, groupOf: groupContainerOf },
    containerOf,
    membersOf,
    rootsOf,
    siblingsOf,
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
    nodesByZone: () => {
      if (zoneIndex !== undefined) return zoneIndex
      const index = new Map<string, TreeNodeRef | TreeContainerRef>()
      const add = (node: TreeNodeRef | TreeContainerRef): void => {
        for (const key of zoneKeysOf(node)) index.set(key, node)
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

/**
 * 一个节点整块那一格的区域键
 *
 * 每个节点与容器都有这一格，因此它恒有值——根节点那一片的整块格就是 root
 * @param node - 节点或容器
 */
export function bodyKeyOf(node: TreeNodeRef | TreeContainerRef): string {
  switch (node.kind) {
    case 'workspace':
      return `workspaceBody/${node.id}`
    case 'virtual':
      return `virtualWorkspaceBody/${node.id}`
    case 'group':
      return `sessionGroup/${node.workspaceId}/${node.groupId}`
    case 'root':
      return 'root'
  }
}

/**
 * 一个节点标题行那一格的区域键
 *
 * 根节点那一片没有标题行：它罩住整片列表，指针停在它那一层的任何空白上都读作回到根节点。
 * 把它表达成 undefined 而不是让每个调用方各自断言，是为了让「哪一格一定存在」由类型承担
 * @param node - 节点或容器
 * @returns 区域键，根节点那一片没有这一格
 */
export function headKeyOf(node: { kind: 'root' }): undefined
export function headKeyOf(
  node: Exclude<TreeNodeRef | TreeContainerRef, { kind: 'root' }>,
): string
export function headKeyOf(node: TreeNodeRef | TreeContainerRef): string | undefined {
  switch (node.kind) {
    case 'workspace':
      // 标题那一格既是同层换位的参照行，也是「移出会话分组」的落点
      return `workspaceHead/${node.id}`
    case 'virtual':
      // 分组节点自己占标题那一格，组体那一格由渲染层挂在它的撑开体上
      return `virtualWorkspaceHead/${node.id}`
    case 'group':
      return `groupHead/${node.workspaceId}/${node.groupId}`
    case 'root':
      return undefined
  }
}

/**
 * 一个节点在界面上占的全部区域键，标题格在前
 *
 * 根节点那一片只有整块那一格，因此它交回一项
 * @param node - 节点或容器
 */
export function zoneKeysOf(node: TreeNodeRef | TreeContainerRef): readonly string[] {
  const body = bodyKeyOf(node)
  if (node.kind === 'root') return [body]
  return [headKeyOf(node), body]
}

/** 一个工作区体内未归组那一段的区域键 */
export function looseZoneKeyOf(workspaceId: string): string {
  return `loose/${workspaceId}`
}

// ── 落点单位 ──

/**
 * 一个节点的落点单位标识
 *
 * 落点单位是「框与线该套住的整个范围」，它未必等于区域键：同一个区域键在两种关系里
 * 可以是不同的大小——工作区标题行承接「移出分组」时只是那一行，与它谈先后时却是整块工作区。
 * 因此单位另起一套标识，与区域键不共用命名空间。
 *
 * 没有子节点的行不在这里列：它们没有单位标记，自己就是自己的单位
 * @param node - 节点或容器
 * @returns 那一块的标识，根节点那一片没有单独的单位
 */
export function regionKeyOf(node: { kind: 'root' }): undefined
export function regionKeyOf(
  node: Exclude<TreeNodeRef | TreeContainerRef, { kind: 'root' }>,
): string
export function regionKeyOf(node: TreeNodeRef | TreeContainerRef): string | undefined {
  switch (node.kind) {
    case 'workspace':
      return `workspaceBlock/${node.id}`
    case 'virtual':
      return `virtualBlock/${node.id}`
    case 'group':
      return `sessionGroupBlock/${node.workspaceId}/${node.groupId}`
    case 'root':
      return undefined
  }
}
