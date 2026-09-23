/**
 * 子工作区嵌套的推导
 *
 * 纯数据变换：给定工作区列表、它们的 cwd、虚拟工作区归属、落盘的嵌套归属与会话分组定义，算出每个工作区挂在哪个容器的哪个位置
 *
 * 路径关系不落盘，每次从 cwd 现推——cwd 是工作区自己的事实，落盘只会多一份可能与它偏离的副本
 * 真正落盘的只有「被放进某个分组」这一条归属，而它记在子工作区自己的记录上（见宿主 `spec.ts`）
 *
 * 容器用一个自解释的键表示，它表达的是「列表里哪一段把这个工作区当作自己的一项」
 * - `''`：根节点这一段
 * - `vw:<虚拟分组 id>`：某个虚拟工作区分组体内
 * - `gp:<父工作区 id>:<分组 id>`：某个工作区体内某个会话分组
 *
 * 一个工作区没有自己的归属时，它就落在父所在的那一段，整棵子树因此自然跟着父走
 * 放进分组时不必逐个后代改写归属。段内再靠 {@link Nesting.childrenOf} 分出层级
 */

/** 一个工作区被放进某个分组的归属；父与分组一起存，因为分组属于某个工作区 */
export interface NestingBinding {
  /** 父工作区 id */
  workspaceId: string
  /** 父工作区体内那个分组的 id */
  groupId: string
}

/** 根节点那个容器：不在任何虚拟工作区里的顶层工作区 */
export const ROOT_CONTAINER = ''

/** 某个虚拟工作区分组那个容器 */
export function virtualContainer(groupId: string): string {
  return `vw:${groupId}`
}

/** 某个工作区体内某个会话分组 */
export function groupContainer(workspaceId: string, groupId: string): string {
  return `gp:${workspaceId}:${groupId}`
}

/** 推导的输入 */
export interface NestingInput {
  /**
   * 是否按子工作区渲染
   *
   * 关掉时每个工作区都退回「自己那个容器里的顶层」：同一虚拟工作区分组里平铺，根节点上平铺
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
  /** workspaceId → 它所属的容器键 */
  containerOf: (workspaceId: string) => string
  /** 一个容器里的顶层工作区，按传入顺序；「顶层」指这一段的父不在同一段的那些 */
  rootsOf: (container: string) => readonly string[]
  /**
   * 一个工作区的全部直接子工作区，按传入顺序
   *
   * 子工作区跟着父走：父在哪一段，没有自己归属的子工作区就在同一段
   */
  childIdsOf: (workspaceId: string) => readonly string[]
  /**
   * 一个工作区名下、落进某个分组的直接子工作区
   * @param groupId - 该工作区体内那个分组的 id
   */
  groupedChildIdsOf: (workspaceId: string, groupId: string) => readonly string[]
  /** 一个工作区名下没有落进任何分组的直接子工作区：它们渲染在它体内未归组那一段 */
  looseChildIdsOf: (workspaceId: string) => readonly string[]
  /** 该工作区当前生效的归属，没有或指向已消失的分组时为 undefined */
  bindingOf: (workspaceId: string) => NestingBinding | undefined
  /**
   * 该工作区的祖先链，从近到远
   *
   * 逐层展开折叠体、以及「移入父分组」的候选祖先都取自它
   */
  ancestorsOf: (workspaceId: string) => readonly string[]
  /**
   * 该工作区的缩进层级：从渲染结构上数它让出了几格
   *
   * 与 {@link ancestorsOf} 的长度不是一回事——两者只在父是纯 cwd 祖先时相等：
   * - 挂在父体内未归组那一段：父的层级 +1
   * - 被放进父体内某个会话分组：父的层级 +2（中间还夹着那个分组头）
   * - 不在任何虚拟分组里的顶层：0
   * - 在虚拟分组里、但组内没有更近的父：1（工作区分组是这条链上的第 0 层）
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
 * 分隔符统一成 `/`、去掉末尾多余的斜杠；根目录归一成空串，这样它与任何绝对路径都只差一个前导斜杠
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
 * 「最近」按路径段数最多者算；段数相同时取传入顺序靠前的，让结果稳定
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
 * 父一旦被放进某个虚拟工作区分组，它的子工作区就不再嵌进它体内——那时两者各自按虚拟工作区
 * 归属平铺，界面上读作两个并列的工作区，而不是一个套一个
 *
 * 一条落盘的归属只有全部条件都成立时才算数，否则退回按 cwd 推导的位置：
 * 父工作区与那个分组都还在、父确实是它的祖先目录、两者同处一个虚拟工作区
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
   * 两个工作区能不能构成父子
   *
   * 判据是「同处一个虚拟工作区分组，或两者都不在任何虚拟分组里」：把一组同一个项目下的工作区
   * 收进一个虚拟分组之后，它们之间的 cwd 层级仍要保留，否则收进去就散成了平铺的一排
   *
   * 跨虚拟分组不成立：分属两个分组的工作区在列表上读作两片互不相干的内容
   * 即使路径上确实是父子也不连起来
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
    // 父必须是路径上的祖先：不成立时这条归属会让树自相矛盾，退回按路径推导
    const parentPath = pathOf(binding.workspaceId)
    if (parentPath === undefined || !isAncestorPath(parentPath, path)) continue
    boundIndex.set(workspaceId, binding)
  }

  /**
   * 一个工作区挂在谁之下
   *
   * 有效归属优先：它指向父工作区，分组只决定渲染在父体内的哪一段
   * 没有归属时取路径上最近的祖先，因此父子关系不必先放进分组就已成立
   * @returns 父工作区 id，挂在根节点那一层时为空串
   */
  const parentOf = (workspaceId: string): string =>
    boundIndex.get(workspaceId)?.workspaceId ?? ancestorIndex.get(workspaceId) ?? ''

  /** 容器键缓存，同一次推导里每个工作区只算一遍 */
  const containerCache = new Map<string, string>()

  /**
   * workspaceId → 它所属的容器键，也就是「列表里哪一段把它当作自己的一项」
   *
   * 被放进分组的落在父体内的那个分组里，其余落在父自己所在的那个容器里
   * 后一条是「整棵子树跟着父走」的实现：没有自己归属的后代与父同处一段，放进分组时整片一起过去
   * 不需要为每个后代改写归属。根节点那一层再按虚拟工作区归属分，不在任何虚拟工作区里才落根容器
   *
   * 归属已经校验过父是真实祖先，因此沿父链向上一定收敛；缓存只是不重复走同一条链
   */
  const containerOf = (workspaceId: string): string => {
    const cached = containerCache.get(workspaceId)
    if (cached !== undefined) return cached
    let container: string
    const parent = parentOf(workspaceId)
    if (parent === '') {
      const virtual = virtualOf(workspaceId)
      container = virtual === '' ? ROOT_CONTAINER : virtualContainer(virtual)
    } else {
      // 没有自己的归属时与父同一段，有归属时落在父体内那个分组里
      const groupId = boundIndex.get(workspaceId)?.groupId ?? ''
      container = groupId === '' ? containerOf(parent) : groupContainer(parent, groupId)
    }
    containerCache.set(workspaceId, container)
    return container
  }

  /**
   * 缩进层级：父的层级再加上「从父走到它」让出的格数
   *
   * 父链由已校验的祖先关系给出（每一步都是真实路径祖先），因此递归必然收敛，不需要环检测
   */
  const levelCache = new Map<string, number>()
  const levelOf = (workspaceId: string): number => {
    const cached = levelCache.get(workspaceId)
    if (cached !== undefined) return cached
    const parent = parentOf(workspaceId)
    let level: number
    if (parent === '') {
      // 顶层：在虚拟工作区分组里就比根节点多让一格
      level = virtualOf(workspaceId) === '' ? 0 : 1
    } else {
      // 被放进分组的比纯 cwd 子工作区多让一格——中间那个分组头也占一层
      level = levelOf(parent) + (boundIndex.get(workspaceId) === undefined ? 1 : 2)
    }
    levelCache.set(workspaceId, level)
    return level
  }

  /** 容器键 → 它的成员（按传入顺序） */
  const members = new Map<string, string[]>()
  for (const workspaceId of workspaceIds) {
    const container = containerOf(workspaceId)
    const list = members.get(container)
    if (list === undefined) members.set(container, [workspaceId])
    else list.push(workspaceId)
  }

  const roots = new Map<string, string[]>()
  const ancestors = new Map<string, string[]>()
  const levels = new Map<string, number>()
  /** 父 id → 它名下全部直接子工作区，不分段 */
  const childrenByParent = new Map<string, string[]>()
  /** 父 id → 落进各个分组的子工作区 */
  const childrenByGroup = new Map<string, Map<string, string[]>>()
  /**
   * 一个容器里的直接父
   *
   * 父按 {@link containerOf} 的定义本就与子同处一个容器，因此它就是父自己
   * 父不在这个容器里只会出现在元数据自相矛盾时，那时把它当作顶层，不让一行坏记录挂死界面
   */
  const directParentOf = (workspaceId: string): string | undefined => {
    const parent = parentOf(workspaceId)
    if (parent === '' || containerOf(parent) !== containerOf(workspaceId)) return undefined
    return parent
  }
  // 父子关系另按「原始父」建一份索引：放进分组的子工作区与父不在同一段，段内层级看不到它们
  // 但父工作区渲染时仍要在自己体内那一段把它们带出来
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
      // 父不在这一段的那些就是这一层的顶层
      if (directParentOf(workspaceId) === undefined) top.push(workspaceId)
    }
    for (const workspaceId of list) {
      // 祖先链从近到远，供「展开到这一行」逐层打开折叠体
      // `seen` 兜住元数据自相矛盾时可能出现的环：链本身已经校验过父是真实祖先，这里只是不让一次坏记录把界面挂死
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
 * 把工作区放进父分组的会话分组时，它名下的子工作区要一并跟随，否则层级会在分组边界上断开
 *
 * 与 {@link deriveNesting} 同一作用范围：跨虚拟分组不算后代，父与子都必须在同一片里
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
