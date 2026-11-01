/**
 * 行序列上的查询表
 *
 * 拖拽要问的都不是「第几行」，而是「这个工作区在哪一片、它上面是谁、同层还有谁」
 * 因此把序列扫一遍装成几份索引。它不引入新事实：每一项都能在行上直接读到
 */
import { nearestAncestorAnyScope } from '../nest.ts'
import type { ContainerNode } from '../nest.ts'
import type { OutlineRow } from '../outline.ts'
import type { NodeRef } from './zones.ts'

/**
 * 拖拽查询用的那几份表
 *
 * 身份由 {@link indexOutline} 按行序列发出，这里只声明各处问得到什么
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
  /** 一个容器里的顶层成员：嵌进同容器内另一个成员的那些不在其中 */
  rootsOf: (container: ContainerNode) => readonly NodeRef[]
  /** 节点所在的那一段兄弟，按界面顺序 */
  siblingsOf: (node: NodeRef) => readonly NodeRef[]
  /** 拖拽认的祖先链，从近到远 */
  dropAncestorsOf: (node: NodeRef) => readonly NodeRef[]
  /** 拖拽认的同层兄弟，按同一条边认 */
  dropSiblingsOf: (node: NodeRef) => readonly NodeRef[]
  /** 工作区落盘的会话分组归属，没有时 undefined */
  bindingOf: (node: NodeRef) => { parentId: string; groupId: string } | undefined
  /**
   * 节点归属哪个虚拟分组，不在任何分组里时为 undefined
   *
   * 这是归属不是容器：被放进会话分组的子工作区容器已经变成那个分组，但它仍属于原来那个工作区分组
   */
  virtualGroupOf: (node: NodeRef) => NodeRef | undefined
  /** 一个工作区名下真实存在的会话分组 id，按界面序 */
  sessionGroupsOf: (node: NodeRef) => readonly string[]
  /** 全部分组节点，数组序即界面序 */
  virtualGroups: readonly NodeRef[]
  /** 序列里出现的全部节点，分组在前、工作区在后 */
  allNodes: () => readonly NodeRef[]
}

/**
 * 把行序列扫成查询表
 *
 * 容器归属、父节点与层级全部写在行上，因此这里只是分桶与建表，不重算任何一件事
 * 序列里没有的位置，索引里也不会有
 *
 * 容器实例直接取行上带着的那一个（它们是调用方交进来的同一批发牌），因此这里不另造容器
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
   * 同一身份恒交回同一实例：拖拽层按引用比较节点（「链上第一个在名单里的」）
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
  /** header 行的键 → 它挂在哪个工作区名下，用来把子工作区还原回父工作区 */
  const workspaceOfHead = new Map<string, string>()
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
      workspaceOfHead.set(row.key, row.workspaceId)
      //  header 行自己挂在哪个工作区名下，那个工作区就是它的父工作区
      // 归属只在这种嵌套成立时才算：被放进会话分组的子工作区，容器就是那个分组本身
      const parentId = workspaceOfHead.get(row.ownerKey)
      if (parentId !== undefined) {
        workspaceParent.set(row.workspaceId, parentId)
        if (row.container.kind === 'group') {
          boundGroupOf.set(row.workspaceId, { parentId, groupId: row.container.groupId })
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
      // 分组 header 也归属于它的宿主工作区：被放进这个分组的子工作区挂在它下面
      // 反推父工作区时因此照样能落到宿主工作区上
      workspaceOfHead.set(row.key, row.workspaceId)
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
   * 有父节点时与父节点名下其余子工作区并列，没有父节点时取所在容器的顶层
   * 放进会话分组不改变这条名单，它改变的是渲染位置，不是界面上的先后
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

  /**
   * 拖拽认的父节点
   *
   * 渲染归属优先：它已经落盘，是用户明确指定过的。没有归属时才退回 cwd 路径上的最近祖先
   * cwd 那一格答的是「可能挪到哪儿」，挪过去之后那个路径祖先才成为真正的父工作区
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
   * 与这个节点同一个父节点的那些兄弟，按同一条边认
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

  return {
    containers,
    containerOf,
    rootsOf,
    siblingsOf,
    dropAncestorsOf,
    dropSiblingsOf,
    bindingOf: (entry) => (entry.kind === 'virtual' ? undefined : boundGroupOf.get(entry.id)),
    virtualGroupOf: (entry) => (entry.kind === 'virtual' ? entry : groupNodeOf(entry.id)),
    sessionGroupsOf: (entry) =>
      entry.kind === 'virtual' ? [] : [...(workspaceGroups.get(entry.id) ?? [])],
    virtualGroups: virtualNodes,
    allNodes: () => [...virtualNodes, ...workspaceNodes],
  }
}
