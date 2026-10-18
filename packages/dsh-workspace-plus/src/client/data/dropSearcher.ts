/**
 * 拖拽落点的唯一检测入口
 *
 * 判定全部在节点上完成，而且检测器**拿着整棵树**：指针落在哪个节点上，由适配层读出来交给它；
 * 那个节点能接什么、它的上位容器是谁、谁罩着它，全部从树现算，不靠调用方预先枚举一份格子清单。
 *
 * 唯一的例外是线的上下半：那要量指针正落着的那个元素的矩形，因此 `Element` 只出现在
 * {@link DropSearcher.checkDrop} 的入参签名里。
 */
import type { TreeContainerRef, TreeNodeRef, WorkspaceTree } from './tree.ts'

/** 线画在参照行的哪一侧 */
export type DropSide = 'before' | 'after'

/**
 * 一个落点身份
 *
 * 树上的节点与树上的容器都是对象身份（树对同一身份恒交回同一实例），因此可以直接当 Map 的键；
 * 不属于树的行（会话行、置顶行）用 `row` 表示，同一个 id 在一次拖拽里也恒交回同一实例
 */
export type DropNode = TreeNodeRef | TreeContainerRef | { kind: 'row'; id: string }

/** 一次拖拽可能接住的一个位置 */
export interface DropTarget {
  /** 整块放进去，还是与这一行排序 */
  kind: 'inside' | 'order'
  /** 这一条落在哪个节点上 */
  node: DropNode
  /** 放开时执行 */
  commit: (side?: DropSide) => void
}

/** 一次检测的结果：两个节点，最多再带一个方向 */
export interface DropCheck {
  /** 整块落进这个节点，画一圈 */
  inside?: DropNode
  /** 与这个节点排序，画一条线 */
  order?: DropNode
  /** 线画在 `order` 的上侧还是下侧 */
  side?: DropSide
}

/** 检测器 */
export interface DropSearcher {
  /**
   * 指针此刻落在名单里的哪些位置上
   * @param target - 指针下的元素，只用来量线的上下半
   * @param point - 指针坐标
   * @param node - 指针正落着的那个节点，由适配层读出来
   * @returns 最多一个画框的节点与一个画线的节点；都不接时为 null
   */
  checkDrop(
    target: Element | null,
    point: { x: number; y: number },
    node: DropNode,
  ): DropCheck | null
  /** 放开时执行 {@link checkDrop} 交回的那次写入 */
  commit(check: DropCheck): void
}

/**
 * 把一棵树与一份名单收成一个检测器
 *
 * 名单只回答「这次拖拽允许落到哪些节点上」，**不回答「指针这一点属于谁」**——
 * 后者由树现算：从指针正落着的那个节点出发，沿树往上走，遇到的第一个在名单里的就是答案。
 * 因此组内任何一条成员行都能让罩着它的那一片响应，不必由调用方把成员逐一列进名单。
 *
 * @param tree - 装配好的树；不属于树的行（会话、置顶行）传 undefined，此时只认节点自己
 * @param targets - 这次拖拽允许落到哪些节点上
 */
export function maybeDropSearcher(
  tree: WorkspaceTree | undefined,
  targets: readonly DropTarget[],
): DropSearcher {
  /** 名单按「种类 + 节点」索引，一个节点在一类关系里只出现一次 */
  const index = new Map<string, DropTarget>()
  for (const entry of targets) {
    const key = entry.kind + '/' + idOf(entry.node)
    if (!index.has(key)) index.set(key, entry)
  }

  /** 节点 id → 树上的那个实例：树是发牌器，同一身份恒同一实例，链上的匹配因此可以按引用比 */
  const nodes = new Map<string, DropNode>()
  if (tree !== undefined) {
    for (const entry of tree.workspaceNodes) nodes.set('workspace/' + entry.id, entry)
    for (const entry of tree.virtualGroups) nodes.set('virtual/' + entry.id, entry)
    nodes.set('root/', tree.containers.root)
  }

  /**
   * 从指针落着的那个节点往上走的这一条链
   *
   * 最近的在前：它自己、它的祖先工作区、它所在的那一片、再往外直到根节点。
   * 这条链就是「这一格归谁」。它由树算，不从 DOM 上找——
   * DOM 上的祖先关系是渲染细节，跨虚拟分组的两个工作区在 DOM 上互为祖先，在树上却不是父子
   */
  const chainOf = (node: DropNode): readonly DropNode[] => {
    if (tree === undefined || node.kind === 'row') return [node]
    const chain: DropNode[] = [node]
    const push = (kind: string, id: string): void => {
      const found = nodes.get(kind + '/' + id)
      if (found !== undefined && !chain.includes(found)) chain.push(found)
    }
    /** 一个工作区往外的那一条：它的祖先、它所在的那一片、它归属的分组，最后是根节点 */
    const walkWorkspace = (id: string): void => {
      const host = nodes.get('workspace/' + id)
      if (host === undefined || host.kind !== 'workspace') return
      for (const ancestor of tree.ancestorsOf(host)) push('workspace', ancestor.id)
      const container = tree.containerOf(host)
      if (container !== undefined) {
        if (container.kind === 'virtual') push('virtual', container.id)
        else if (container.kind === 'group') chain.push(container)
      }
      const membership = tree.virtualGroupOf(host)
      if (membership !== undefined) push('virtual', membership.id)
    }
    if (node.kind === 'root') return [node]
    /** 指针此刻在哪一片的**范围内**：这决定根节点那一片接不接 */
    let atRoot = false
    if (node.kind === 'workspace') {
      walkWorkspace(node.id)
      atRoot = tree.containerOf(node)?.kind === 'root'
    } else if (node.kind === 'virtual') {
      // 虚拟分组自己就在根节点那一层，但它罩住的那一片才是指针此刻的范围：
      // 拖回自己所在分组的组头是原地投放，不该被根节点的「移出分组」接住
      atRoot = false
    } else if (node.kind === 'group') {
      // 会话分组挂在某个工作区体内：那一片归它的宿主工作区管
      chain.push(tree.containers.groupOf(node.workspaceId, node.groupId))
      walkWorkspace(node.workspaceId)
      const host = nodes.get('workspace/' + node.workspaceId)
      atRoot =
        host !== undefined && host.kind === 'workspace' && tree.containerOf(host)?.kind === 'root'
    }
    // 根节点那一片只在指针本来就落在它那一层时进链。
    // 无条件兜底会让组内换位、拖回自己那一片都多出一圈「移出分组」的框
    if (atRoot && chain[chain.length - 1] !== tree.containers.root) chain.push(tree.containers.root)
    return chain
  }

  /** 链上第一个在名单里的节点 */
  const first = (kind: DropTarget['kind'], chain: readonly DropNode[]): DropTarget | undefined => {
    for (const node of chain) {
      const found = index.get(kind + '/' + idOf(node))
      if (found !== undefined) return found
    }
    return undefined
  }

  return {
    checkDrop(target, point, node) {
      if (target === null) return null
      const chain = chainOf(node)
      const check: DropCheck = {}

      // 线：链上第一条件次参照
      const order = first('order', chain)
      if (order !== undefined) {
        check.order = order.node
        check.side = sideOf(target.getBoundingClientRect(), point)
      }

      // 框：链上第一个能放进去的节点。
      //
      // 它和线同源——都从指针正落着的那个节点往上走，因此两条永远指着同一条链上的邻居：
      // 线是这一行本身能否谈先后，框是它上面那一片能不能进去。
      // 框**不从线上取**：那一行有自己的 cwd 父工作区、而那个父工作区与来源毫无关系时，
      // 拿它的祖先当框会把一块毫不相干的区域高亮起来
      const holder = first('inside', chain)
      if (holder !== undefined) check.inside = holder.node

      // 这一格既不是任何落点、也不在任何一片的范围之内：这次到此为止。
      // 那一句管的是原地投放：拖回自己那一片时它按设计不在名单里，于是不标记、不提交
      return check.inside === undefined && check.order === undefined ? null : check
    },

    commit(check) {
      if (check.inside !== undefined) index.get('inside/' + idOf(check.inside))?.commit()
      if (check.order !== undefined) index.get('order/' + idOf(check.order))?.commit(check.side)
    },
  }
}

/**
 * 一个落点身份在索引里的键
 *
 * 只用于在检测器内部把同一个身份找回来，不参与任何判定——判定一律按对象身份比
 * @param node - 落点身份
 */
function idOf(node: DropNode): string {
  return node.kind === 'group'
    ? 'group/' + node.workspaceId + '/' + node.groupId
    : node.kind === 'root'
      ? ''
      : node.kind + '/' + node.id
}

/**
 * 指针落在一条带的上半还是下半
 *
 * 只问指针正落着的那一条带的矩形——落点本身是节点，没有矩形可言。
 * 量不出高度时读作「之后」：尚未布局的节点与 jsdom 都是这种情形，那时没有上半
 * @param rect - 指针正落着的那一条带的矩形
 * @param point - 指针坐标
 */
function sideOf(rect: { top: number; height: number }, point: { x: number; y: number }): DropSide {
  if (rect.height <= 0) return 'after'
  return point.y - rect.top < rect.height / 2 ? 'before' : 'after'
}
