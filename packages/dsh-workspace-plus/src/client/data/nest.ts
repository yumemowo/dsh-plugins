/**
 * 子工作区嵌套的推导
 *
 * 纯数据变换：给定工作区列表、它们的 cwd、虚拟工作区归属、落盘的嵌套归属与会话分组定义，算出每个工作区挂在哪个容器的哪个位置
 *
 * 路径关系不落盘，每次从 cwd 现推——cwd 是工作区自己的事实，落盘只会多一份可能与它偏离的副本
 * 真正落盘的只有「被放进某个分组」这一条归属，而它记在子工作区自己的记录上（见宿主 `spec.ts`）
 *
 * 容器用一个节点对象表示，它表达的是「列表里哪一段把这个工作区当作自己的一项」
 * - 不在任何虚拟工作区分组里的那一段
 * - 某个虚拟工作区分组体内
 * - 某个工作区体内某个会话分组
 *
 * 节点在推导内部按身份寻址，同一次推导内同一个容器恒交回同一实例（见 {@link Nesting.containers}）
 * 现造一个内容相同的节点查不到任何东西
 *
 * 一个工作区没有自己的归属时，它就落在父工作区所在的那一段，整棵子树因此自然跟着父工作区走
 * 放进分组时不必逐个后代改写归属。段内再靠 {@link Nesting.childIdsOf} 分出层级
 */

/** 一个工作区被放进某个分组的归属，父工作区与分组一起存，因为分组属于某个工作区 */
export interface NestingBinding {
  /** 父工作区 id */
  workspaceId: string
  /** 父工作区体内那个分组的 id */
  groupId: string
}

/**
 * 列表里一个容器：这一段的成员按它归集
 *
 * 实例只能从 {@link Nesting.containers} 取：节点在推导内部按身份寻址，自行拼一个同形状的对象查不到任何东西
 */
export type ContainerNode =
  | { kind: 'root' }
  | { kind: 'virtual'; groupId: string }
  | { kind: 'group'; workspaceId: string; groupId: string }

/** 推导的输入 */
export interface NestingInput {
  /**
   * 是否按子工作区层级归集
   *
   * 关掉时每个工作区都退回「自己那个容器里的顶层」：同一虚拟工作区分组里平铺，不在任何虚拟分组里的平铺在最外层
   */
  enabled: boolean
  /** 工作区 id，按宿主给的顺序 */
  workspaceIds: readonly string[]
  /** workspaceId → cwd，缺省表示该工作区没有可用路径 */
  pathOf: (workspaceId: string) => string | undefined
  /** workspaceId → 它所属的虚拟工作区分组 id，空串表示不在任何虚拟工作区里 */
  virtualOf: (workspaceId: string) => string
  /** workspaceId → 落盘的嵌套归属，没有时返回 undefined */
  bindingOf: (workspaceId: string) => NestingBinding | undefined
  /** workspaceId → 它名下真实存在的会话分组 id 集合 */
  groupIdsOf: (workspaceId: string) => ReadonlySet<string>
}

/** 推导的结果 */
export interface Nesting {
  /**
   * 容器节点的发牌器
   *
   * 三个入口都只回答「这个容器对应哪个节点」，不回答「谁属于谁」——后者是 {@link Nesting.containerOf} 的方向
   * 参数给的都是**容器自身的身份**：最外层那一段无参；虚拟分组那一个取该分组自己的 id（会话分组的 id 不经过这里，走 `groupOf`）；会话分组那一个取持有它的工作区 id 与该分组的 id
   *
   * 节点在推导内部按身份寻址（{@link Nesting.rootsOf} 的入参就是这里的返回值），因此同一个容器只能用这里交出的实例
   * 自行拼一个同形状的节点按引用查不到任何东西
   */
  containers: {
    /** 不在任何虚拟工作区分组里的那一段，与当前聚焦在谁无关 */
    readonly root: ContainerNode
    /** 某个虚拟工作区分组那一段，未见过的分组也交回一个稳定实例 */
    virtualOf: (groupId: string) => ContainerNode
    /** 某个工作区体内某个会话分组那一段 */
    groupOf: (workspaceId: string, groupId: string) => ContainerNode
  }
  /** workspaceId → 它所属的容器 */
  containerOf: (workspaceId: string) => ContainerNode
  /**
   * 一个容器里的顶层工作区，按传入顺序
   *
   * 这一层只认结构，与界面上当前聚焦在谁无关：`containers.root` 恒指「不在任何虚拟分组里」那一段，不是「当前显示的那一片」
   * 「顶层」也是结构判断——一个工作区的生效父工作区仍落在这个容器里时，它不是这一段的顶层而是排在父工作区体内；父工作区落在别的容器（例如被放进会话分组）时，它才是那一段的顶层
   *
   * 例：`repo`(`/repo`) 与 `pkg`(`/repo/pkg`) 都不在任何虚拟分组里时，两者同属 `containers.root`，而 `rootsOf(root)` 只有 `['repo']`——`pkg` 的父工作区在同段内，因此排在 `repo` 体内
   * 把 `pkg` 放进 `repo` 的分组 `g1` 后，它的容器变成 `groupOf('repo', 'g1')`，父工作区不再同段，于是 `rootsOf(groupOf('repo', 'g1'))` 是 `['pkg']`，而 `rootsOf(root)` 仍是 `['repo']`
   */
  rootsOf: (container: ContainerNode) => readonly string[]
  /**
   * 一个工作区的全部直接子工作区，按传入顺序
   *
   * 子工作区跟着父工作区走，父工作区在哪一段，没有自己归属的子工作区就在同一段
   */
  childIdsOf: (workspaceId: string) => readonly string[]
  /**
   * 一个工作区名下、落进某个分组的直接子工作区
   * @param groupId - 该工作区体内那个分组的 id
   */
  groupedChildIdsOf: (workspaceId: string, groupId: string) => readonly string[]
  /** 一个工作区名下没有落进任何分组的直接子工作区：它们落在它体内未归组那一段 */
  looseChildIdsOf: (workspaceId: string) => readonly string[]
  /** 该工作区当前生效的归属，没有或指向已消失的分组时为 undefined */
  bindingOf: (workspaceId: string) => NestingBinding | undefined
  /**
   * 该工作区的祖先链，从近到远
   *
   * 逐层展开撑开体、以及「移入父工作区分组」的候选祖先都取自它
   */
  ancestorsOf: (workspaceId: string) => readonly string[]
  /**
   * 该工作区的缩进层级：从结构上数它让出了几格
   *
   * 与 {@link ancestorsOf} 的长度不是一回事——两者只在父工作区是纯 cwd 祖先时相等：
   * - 挂在父工作区体内未归组那一段：父工作区的层级 +1
   * - 被放进父工作区体内某个会话分组：父工作区的层级 +2（中间还夹着那个分组头）
   * - 不在任何虚拟分组里的顶层：0
   * - 在虚拟分组里、但组内没有更近的父工作区：1（工作区分组是这条链上的第 0 层）
   *
   * 这必须在 JS 里算，不能交给 CSS 的变量继承：容器偏移要累加
   * 而 `--x: calc(var(--x) + 1)` 是循环引用，浏览器会把它当作无效值整条丢掉
   * 于是偏移变成 0、缩进静默失效
   */
  levelOf: (workspaceId: string) => number
}

/**
 * 把一条 cwd 归一到比较用的形态
 *
 * 分隔符统一成 `/`、去掉末尾多余的斜杠，根目录归一成空串，这样它与任何绝对路径都只差一个前导斜杠
 * Windows 风格的盘符原样保留，不做盘符大小写归一
 */
function normalizePath(path: string): string {
  const unified = path.replace(/\\/g, '/')
  const trimmed = unified.replace(/\/+$/, '')
  // `C:/` 这类「盘符根」也归一成空串，理由同根目录
  return trimmed.replace(/^([A-Za-z]:)$/, '$1/')
}

/**
 * 判定 parent 是否是 child 的祖先目录
 *
 * 在分隔符边界上比较，而不是裸字符串前缀：`/a/bc` 不是 `/a/b` 的后代
 * @returns parent 严格位于 child 之上时为 true
 */
export function isAncestorPath(parent: string, child: string): boolean {
  const outer = normalizePath(parent)
  const inner = normalizePath(child)
  if (inner === '' || outer === inner) return false
  // 根目录（归一成空串）是任何绝对路径的祖先
  if (outer === '') return inner.startsWith('/') || /^[A-Za-z]:\//.test(inner)
  return inner.startsWith(`${outer}/`)
}

/**
 * 一个路径的段数，越深越「近」
 *
 * 祖先判定与「最近的祖先」都按它排序，根目录算 0 段
 */
function depthOf(path: string): number {
  return normalizePath(path)
    .split('/')
    .filter((segment) => segment !== '').length
}

/**
 * 从一批候选里取离目标最近的祖先
 *
 * 「最近」按路径段数最多者算，段数相同时取传入顺序靠前的，让结果稳定
 * 中间层工作区不存在时跨过去挂到更远的祖先——层级因此不会因为少登记一个目录而整段断开
 * @returns 最近的祖先 id，没有祖先时为 undefined
 */
function nearestAncestor(
  targetPath: string,
  candidates: readonly string[],
  pathOf: (workspaceId: string) => string | undefined,
): string | undefined {
  let best: string | undefined
  let bestDepth = -1
  for (const candidate of candidates) {
    const path = pathOf(candidate)
    if (path === undefined || !isAncestorPath(path, targetPath)) continue
    const depth = depthOf(path)
    if (depth > bestDepth) {
      best = candidate
      bestDepth = depth
    }
  }
  return best
}

/**
 * 推导每个工作区的容器归属与容器内的森林
 *
 * 只有父工作区没有归属时，才把子工作区嵌进它体内。这一条把嵌套限定在需求要的那个范围：
 * 「a 不在任何虚拟工作区中、/a/b 也不在任何虚拟工作区中」才把 /a/b 嵌到 a 下
 * 父工作区一旦被放进某个虚拟工作区分组，它的子工作区就不再嵌进它体内——那时两者各自按虚拟工作区
 * 归属平铺，界面上读作两个并列的工作区，而不是一个套一个
 *
 * 一条落盘的归属只有全部条件都成立时才算数，否则退回按 cwd 推导的位置：
 * 父工作区与那个分组都还在、父工作区确实是它的祖先目录、两者同处一个虚拟工作区
 *
 * 这样元数据与真实列表出现偏差时界面只是「少一层嵌套」，不会丢工作区
 */
export function deriveNesting(input: NestingInput): Nesting {
  const { enabled, workspaceIds, pathOf, virtualOf, bindingOf, groupIdsOf } = input
  const known = new Set(workspaceIds)

  /** 每个工作区在 cwd 路径上最近的祖先，与归属无关 */
  const ancestorIndex = new Map<string, string>()
  /** 当前生效的归属 */
  const boundIndex = new Map<string, NestingBinding>()

  /**
   * 两个工作区能不能配成一对父工作区与子工作区
   *
   * 判据是「同处一个虚拟工作区分组，或两者都不在任何虚拟分组里」
   * 把一组同一个项目下的工作区收进一个虚拟分组之后，它们之间的 cwd 层级仍要保留，否则收进去就散成了平铺的一排
   *
   * 跨虚拟分组不成立，分属两个分组的工作区在列表上读作两片互不相干的内容，即使路径上确实是父工作区与子工作区也不连起来
   */
  const inSameScope = (a: string, b: string): boolean => virtualOf(a) === virtualOf(b)

  for (const workspaceId of workspaceIds) {
    // 关掉嵌套时不认路径关系与归属，每个工作区因此都落成自己那个容器里的顶层
    if (!enabled) continue
    const path = pathOf(workspaceId)
    if (path !== undefined) {
      const candidates = workspaceIds.filter(
        (id) => id !== workspaceId && inSameScope(id, workspaceId),
      )
      const nearest = nearestAncestor(path, candidates, pathOf)
      if (nearest !== undefined) ancestorIndex.set(workspaceId, nearest)
    }

    const binding = bindingOf(workspaceId)
    if (binding === undefined || path === undefined) continue
    if (!known.has(binding.workspaceId) || binding.workspaceId === workspaceId) continue
    // 归属必须落在同一个虚拟工作区里，且那个分组现在还真实存在
    if (!inSameScope(binding.workspaceId, workspaceId)) continue
    if (!groupIdsOf(binding.workspaceId).has(binding.groupId)) continue
    // 父工作区必须是路径上的祖先：不成立时这条归属会让树自相矛盾，退回按路径推导
    const parentPath = pathOf(binding.workspaceId)
    if (parentPath === undefined || !isAncestorPath(parentPath, path)) continue
    boundIndex.set(workspaceId, binding)
  }

  /**
   * 一个工作区挂在谁之下
   *
   * 有效归属优先：它指向父工作区，分组只决定落在父工作区体内的哪一段
   * 没有归属时取路径上最近的祖先，因此父工作区与子工作区的关系不必先放进分组就已成立
   * @returns 父工作区 id，没有父工作区时为空串
   */
  const parentOf = (workspaceId: string): string =>
    boundIndex.get(workspaceId)?.workspaceId ?? ancestorIndex.get(workspaceId) ?? ''

  /**
   * 容器节点的发牌器
   *
   * 节点在推导内部按身份寻址，因此同一个容器必须只发一个实例
   * 按 `kind + id` 缓存，重复请求交回同一个对象
   */
  const rootNode: ContainerNode = { kind: 'root' }
  const virtualNodes = new Map<string, ContainerNode>()
  const groupNodes = new Map<string, ContainerNode>()
  const containers = {
    root: rootNode,
    virtualOf: (groupId: string): ContainerNode => {
      const cached = virtualNodes.get(groupId)
      if (cached !== undefined) return cached
      const node: ContainerNode = { kind: 'virtual', groupId }
      virtualNodes.set(groupId, node)
      return node
    },
    groupOf: (workspaceId: string, groupId: string): ContainerNode => {
      // 两个 id 都不是本包能限定字符集的东西，分隔符取一个它们不可能含的字符
      // 这个键只作 Map 的键、从不解析回来，因此不必可读——与 `client/menus.tsx` 里要切分回两个 id 的 `pg:` 取舍相反
      const composite = `${workspaceId}\u0000${groupId}`
      const cached = groupNodes.get(composite)
      if (cached !== undefined) return cached
      const node: ContainerNode = { kind: 'group', workspaceId, groupId }
      groupNodes.set(composite, node)
      return node
    },
  }

  /** 容器节点缓存，同一次推导里每个工作区只算一遍 */
  const containerCache = new Map<string, ContainerNode>()

  /**
   * workspaceId → 它所属的容器，也就是「列表里哪一段把它当作自己的一项」
   *
   * 被放进分组的落在父工作区体内的那个分组里，其余落在父工作区自己所在的那个容器里
   * 后一条是「整棵子树跟着父工作区走」的实现：没有自己归属的后代与父工作区同处一段，放进分组时整片一起过去
   * 因此不需要为每个后代改写归属。最外层再按虚拟工作区归属分，不在任何虚拟工作区里才落 `containers.root`
   *
   * 归属已经校验过父工作区是真实祖先，因此沿父工作区链向上一定收敛，缓存只是不重复走同一条链
   */
  const containerOf = (workspaceId: string): ContainerNode => {
    const cached = containerCache.get(workspaceId)
    if (cached !== undefined) return cached
    let container: ContainerNode
    const parent = parentOf(workspaceId)
    if (parent === '') {
      const virtual = virtualOf(workspaceId)
      container = virtual === '' ? containers.root : containers.virtualOf(virtual)
    } else {
      // 没有自己的归属时与父工作区同一段，有归属时落在父工作区体内那个分组里
      const groupId = boundIndex.get(workspaceId)?.groupId ?? ''
      container =
        groupId === '' ? containerOf(parent) : containers.groupOf(parent, groupId)
    }
    containerCache.set(workspaceId, container)
    return container
  }

  /**
   * 缩进层级：父工作区的层级再加上「从父工作区走到它」让出的格数
   *
   * 父工作区链由已校验的祖先关系给出（每一步都是真实路径祖先），因此递归必然收敛，不需要环检测
   */
  const levelCache = new Map<string, number>()
  const levelOf = (workspaceId: string): number => {
    const cached = levelCache.get(workspaceId)
    if (cached !== undefined) return cached
    const parent = parentOf(workspaceId)
    let level: number
    if (parent === '') {
      // 顶层：在虚拟工作区分组里就比最外层多让一格
      level = virtualOf(workspaceId) === '' ? 0 : 1
    } else {
      // 被放进分组的比纯 cwd 子工作区多让一格——中间那个分组头也占一层
      level = levelOf(parent) + (boundIndex.get(workspaceId) === undefined ? 1 : 2)
    }
    levelCache.set(workspaceId, level)
    return level
  }

  /** 容器节点 → 它的成员（按传入顺序） */
  const members = new Map<ContainerNode, string[]>()
  for (const workspaceId of workspaceIds) {
    const container = containerOf(workspaceId)
    const list = members.get(container)
    if (list === undefined) members.set(container, [workspaceId])
    else list.push(workspaceId)
  }

  const roots = new Map<ContainerNode, string[]>()
  const ancestors = new Map<string, string[]>()
  const levels = new Map<string, number>()
  /** 父工作区 id → 它名下全部直接子工作区，不分段 */
  const childrenByParent = new Map<string, string[]>()
  /** 父工作区 id → 落进各个分组的子工作区 */
  const childrenByGroup = new Map<string, Map<string, string[]>>()
  /**
   * 一个容器里的直接父工作区
   *
   * 父工作区按 {@link containerOf} 的定义本就与子工作区同处一个容器，因此它就是父工作区自己
   * 父工作区不在这个容器里只会出现在元数据自相矛盾时，那时把它当作顶层，不让一行坏记录挂死界面
   */
  const directParentOf = (workspaceId: string): string | undefined => {
    const parent = parentOf(workspaceId)
    if (parent === '' || containerOf(parent) !== containerOf(workspaceId)) return undefined
    return parent
  }
  // 父工作区与子工作区的关系另按「原始父工作区」建一份索引，放进分组的子工作区与父工作区不在同一段，段内层级看不到它们
  // 但父工作区那一段仍要把它们带出来
  for (const workspaceId of workspaceIds) {
    const parent = parentOf(workspaceId)
    if (parent === '') continue
    const all = childrenByParent.get(parent)
    if (all === undefined) childrenByParent.set(parent, [workspaceId])
    else all.push(workspaceId)
    const boundGroup = boundIndex.get(workspaceId)?.groupId
    if (boundGroup === undefined) continue
    let byGroup = childrenByGroup.get(parent)
    if (byGroup === undefined) {
      byGroup = new Map()
      childrenByGroup.set(parent, byGroup)
    }
    const list = byGroup.get(boundGroup)
    if (list === undefined) byGroup.set(boundGroup, [workspaceId])
    else list.push(workspaceId)
  }

  for (const [container, list] of members) {
    const top: string[] = []
    for (const workspaceId of list) {
      // 父工作区不在这一段的那些就是这一层的顶层
      if (directParentOf(workspaceId) === undefined) top.push(workspaceId)
    }
    for (const workspaceId of list) {
      // 祖先链从近到远，供「展开到这一行」逐层打开撑开体
      // `seen` 兜住元数据自相矛盾时可能出现的环：链本身已经校验过父工作区是真实祖先，这里只是不让一次坏记录把界面挂死
      const chain: string[] = []
      const seen = new Set<string>([workspaceId])
      for (let cursor = parentOf(workspaceId); cursor !== ''; cursor = parentOf(cursor)) {
        if (seen.has(cursor)) break
        seen.add(cursor)
        chain.push(cursor)
      }
      if (chain.length > 0) ancestors.set(workspaceId, chain)
      levels.set(workspaceId, levelOf(workspaceId))
    }
    roots.set(container, top)
  }

  return {
    containers,
    containerOf,
    rootsOf: (container) => roots.get(container) ?? [],
    childIdsOf: (workspaceId) => childrenByParent.get(workspaceId) ?? [],
    groupedChildIdsOf: (workspaceId, groupId) =>
      childrenByGroup.get(workspaceId)?.get(groupId) ?? [],
    looseChildIdsOf: (workspaceId) =>
      (childrenByParent.get(workspaceId) ?? []).filter(
        (childId) => boundIndex.get(childId) === undefined,
      ),
    bindingOf: (workspaceId) => boundIndex.get(workspaceId),
    ancestorsOf: (workspaceId) => ancestors.get(workspaceId) ?? [],
    levelOf: (workspaceId) => levels.get(workspaceId) ?? 0,
  }
}

/**
 * 找一条路径在同一虚拟工作区里最近的现存祖先
 *
 * 新增工作区时用它推断「这个新目录本该嵌到谁下面」，新工作区此刻还不在这份列表里，因此按路径查而不是按 id 查
 *
 * 与 {@link deriveNesting} 同一作用范围：只与同处一个虚拟工作区分组（或都不在任何分组里）的工作区相连
 * @param virtual - 目标路径所属的虚拟工作区
 * @returns 祖先工作区 id，没有祖先时为 undefined
 */
export function nearestAncestorForPath(
  workspaceIds: readonly string[],
  pathOf: (workspaceId: string) => string | undefined,
  virtualOf: (workspaceId: string) => string,
  path: string,
  virtual: string,
): string | undefined {
  return nearestAncestor(
    path,
    workspaceIds.filter((id) => virtualOf(id) === virtual),
    pathOf,
  )
}

/**
 * 取一个工作区在同一虚拟工作区里的全部后代，按路径从近到远
 *
 * 把工作区放进父工作区分组的会话分组时，它名下的子工作区要一并跟随，否则层级会在分组边界上断开
 *
 * 与 {@link deriveNesting} 同一作用范围：跨虚拟分组不算后代，父工作区与子工作区都必须在同一片里
 * @returns 后代 id，没有后代时为空表
 */
export function descendantsOf(
  workspaceIds: readonly string[],
  pathOf: (workspaceId: string) => string | undefined,
  virtualOf: (workspaceId: string) => string,
  workspaceId: string,
): string[] {
  const rootPath = pathOf(workspaceId)
  if (rootPath === undefined) return []
  const virtual = virtualOf(workspaceId)
  return workspaceIds
    .filter((candidate) => {
      if (candidate === workspaceId || virtualOf(candidate) !== virtual) return false
      const path = pathOf(candidate)
      return path !== undefined && isAncestorPath(rootPath, path)
    })
    .sort((a, b) => (pathOf(a)?.length ?? 0) - (pathOf(b)?.length ?? 0))
}
