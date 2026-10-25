/**
 * 拖拽落点的唯一检测入口
 *
 * 判定全部在节点上完成，而且检测器**拿着整份索引**：指针落在哪个节点上，由适配层读出来交给它；
 * 那个节点能接什么、它的上位容器是谁、谁罩着它，全部从索引现算，不靠调用方预先枚举一份格子清单。
 *
 * 唯一的例外是线的上下半：那要量一量有多高、顶边在哪。量的是**落点自己那一块**而不是指针下
 * 那个小元素，因此量法随名单一起交进来（见 {@link OrderTarget.measure}），检测器仍然不碰元素。
 */
import type { OutlineIndex } from './outlineIndex.ts'
import type { ContainerNode } from './nest.ts'
import type { NodeRef } from './zones.ts'

/** 一块落点单位的几何读数：只有分上下半要用的那两格 */
export interface BlockRect {
  top: number
  height: number
}

/**
 * 量一块落点单位的口子
 *
 * 交给检测器的是这个函数而不是读数本身：线的上下半只在真的对上落点时才会量，
 * 而指针每移动一次都会走一遍检测。传读数会让调用方每帧量一次，传这个口子只在需要时量
 */
export type BlockMeasure = () => BlockRect

/** 线画在落点的哪一侧 */
export type DropSide = 'before' | 'after'

/**
 * 一个落点身份
 *
 * 索引里的节点与容器都是对象身份（索引对同一身份恒交回同一实例），因此可以直接当 Map 的键；
 * 索引里没有的行（会话行、置顶行）用 `row` 表示，同一个 id 在一次拖拽里也恒交回同一实例
 */
export type DropNode = NodeRef | ContainerNode | { kind: 'row'; id: string }

/**
 * 一次拖拽可能接住的一个位置
 *
 * 两类落点是两件事，因此交回的东西也不同：框没有几何可言，线要分上下半。
 * 拆成两个形状而不是给同一个形状挂可选的几何格，是为了让「线一定量得出、框一定用不上」
 * 由类型承担——否则漏给一次几何就是一条永远画在落点上缘的线，而那不会报错
 */
export type DropTarget = InsideTarget | OrderTarget

/** 整块落进某一片 */
export interface InsideTarget {
  kind: 'inside'
  /** 这一条落在哪个节点上 */
  node: DropNode
  /** 放开时执行 */
  commit: () => void
}

/** 与某一片里的成员行谈先后 */
export interface OrderTarget {
  kind: 'order'
  /** 这一条落在哪个节点上 */
  node: DropNode
  /**
   * 量这一块的口子
   *
   * 量的是**落点自己那一块**，不是指针正压着的那个小元素：指针停在容器体内的任何一行上，
   * 读出的都是「排到这一整块之前 / 之后」，上下半因此要按这一整块分。
   * 量法随名单一起交进来，检测器因此仍然不碰元素
   */
  measure: BlockMeasure
  /** 放开时执行，参数是线画在哪一侧 */
  commit: (side: DropSide) => void
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
   * @param point - 指针坐标
   * @param node - 指针正落着的那个节点，由适配层读出来
   * @returns 最多一个画框的节点与一个画线的节点；都不接时为 null
   */
  checkDrop(point: { x: number; y: number }, node: DropNode): DropCheck | null
  /** 放开时执行 {@link checkDrop} 交回的那次写入 */
  commit(check: DropCheck): void
}

/**
 * 把一份索引与一份名单收成一个检测器
 *
 * 名单只回答「这次拖拽允许落到哪些节点上」，**不回答「指针这一点属于谁」**——
 * 后者由索引现算：从指针正落着的那个节点出发，沿索引往上走，遇到的第一个在名单里的就是答案。
 * 因此组内任何一条成员行都能让罩着它的那一片响应，不必由调用方把成员逐一列进名单。
 *
 * @param index - {@link indexOutline} 装配的索引；索引里没有的行（会话、置顶行）传 undefined，此时只认节点自己
 * @param targets - 这次拖拽允许落到哪些节点上
 */
export function maybeDropSearcher(
  index: OutlineIndex | undefined,
  targets: readonly DropTarget[],
): DropSearcher {
  /**
   * 名单按种类收成两张表，一个节点在一类关系里只出现一次
   *
   * 分两张而不是一张带种类的表：两种落点连形状都不同，「查回来再收窄种类」
   * 会逼出一串断言，而那是这里唯一会写错的地方。分表之后查什么得到什么，由表自己承担
   */
  const insideByNode = new Map<string, InsideTarget>()
  const orderByNode = new Map<string, OrderTarget>()
  for (const entry of targets) {
    const key = idOf(entry.node)
    if (entry.kind === 'inside') {
      if (!insideByNode.has(key)) insideByNode.set(key, entry)
    } else if (!orderByNode.has(key)) {
      orderByNode.set(key, entry)
    }
  }

  /**
   * 从指针落着的那个节点往上走的这一条链
   *
   * 最近的在前：它自己、它的祖先工作区、它所在的那一片、再往外直到根节点。
   * 这条链就是「这一格归谁」。它由索引算，不从 DOM 上找——
   * DOM 上的祖先关系是渲染细节，跨虚拟分组的两个工作区在 DOM 上互为祖先，在索引里却不是父子
   */
  const chainOf = (node: DropNode): readonly DropNode[] => {
    if (index === undefined || node.kind === 'row') return [node]
    const chain: DropNode[] = [node]
    /** 链上还没有它才收：同一个容器可能从两条路问到 */
    const push = (entry: DropNode): void => {
      if (!chain.includes(entry)) chain.push(entry)
    }
    /**
     * 一个工作区往外的那一条，近的在前
     *
     * 逐层往上，每一层两样东西，先后由渲染层级决定：
     * - 会话分组是宿主工作区**体内**的一层，因此比宿主本身更近
     * - 其余的容器（最外层那一段、虚拟分组）都在宿主**外面**，排在宿主之后
     *
     * 只按「祖先然后容器」一刀切会出错：一个被放进父工作区会话分组的子工作区，
     * 它最近的那一片是那个分组，而祖先排在了前面，于是框套到父工作区上，
     * 与「这一行和谁同层」完全对不上——框和线因此会指着两层
     */
    const walkWorkspace = (entry: NodeRef): void => {
      let current = entry
      const seen = new Set<string>([entry.id])
      for (;;) {
        const container = index.containerOf(current)
        if (container !== undefined && container.kind === 'group') push(container)
        const parent = index.parentOf(current)
        if (parent === undefined) {
          // 没有父工作区了：这一层容器就是最外那一片
          if (container !== undefined && container.kind === 'virtual') push(container)
          break
        }
        // 元数据自相矛盾写成环时到此为止：拖拽层不该因为这个挂死
        if (seen.has(parent.id)) break
        seen.add(parent.id)
        push(parent)
        current = parent
      }
      // 归属分组：进了会话分组的子工作区容器已经不是「归属」，但那一片仍要能用
      const membership = index.virtualGroupOf(entry)
      if (membership !== undefined) push(membership)
    }
    if (node.kind === 'root') return [node]
    /** 指针此刻在哪一片的**范围内**：这决定根节点那一片接不接 */
    let atRoot = false
    if (node.kind === 'workspace') {
      walkWorkspace(node)
      atRoot = index.containerOf(node)?.kind === 'root'
    } else if (node.kind === 'virtual') {
      // 虚拟分组自己就在根节点那一层，但它罩住的那一片才是指针此刻的范围：
      // 拖回自己所在分组的组头是原地投放，不该被根节点的「移出分组」接住
      atRoot = false
    } else if (node.kind === 'group') {
      // 会话分组挂在某个工作区体内：那一片归它的宿主工作区管
      const host = index.workspaceNodeOf(node.workspaceId)
      if (host !== undefined) {
        push(index.containers.groupOf(node.workspaceId, node.groupId))
        walkWorkspace(host)
        atRoot = index.containerOf(host)?.kind === 'root'
      }
    }
    // 根节点那一片只在指针本来就落在它那一层时进链。
    // 无条件兜底会让组内换位、拖回自己那一片都多出一圈「移出分组」的框
    if (atRoot && chain[chain.length - 1] !== index.containers.root) chain.push(index.containers.root)
    return chain
  }

  /**
   * 链上第一个满足条件的节点
   *
   * 链上任何一格都可能不在名单里（那一片这次不接），因此逐格查、取第一个命中的
   * @param chain - 从指针落着的那个节点往外的那一条
   * @param table - 按节点身份查的表
   */
  const firstOn = <T>(chain: readonly DropNode[], table: ReadonlyMap<string, T>): T | undefined => {
    for (const node of chain) {
      const found = table.get(idOf(node))
      if (found !== undefined) return found
    }
    return undefined
  }

  return {
    checkDrop(point, node) {
      const chain = chainOf(node)
      const check: DropCheck = {}

      // 线：链上第一条件次参照。上下半按**那一条落点自己那一块**量，
      // 不按指针正压着的元素量：指针停在容器体内的任意一行上时，
      // 读出的都是「排到这一整块之前 / 之后」，按那一行量会得到与线的位置无关的读数
      const order = firstOn(chain, orderByNode)
      if (order !== undefined) {
        check.order = order.node
        check.side = sideOf(order.measure(), point)
      }

      // 框：链上第一个能放进去的节点。
      //
      // 它和线同源——都从指针正落着的那个节点往上走，因此两条永远指着同一条链上的邻居：
      // 线是这一行本身能否谈先后，框是它上面那一片能不能进去。
      // 框**不从线上取**：那一行有自己的 cwd 父工作区、而那个父工作区与来源毫无关系时，
      // 拿它的祖先当框会把一块毫不相干的区域高亮起来
      const holder = firstOn(chain, insideByNode)
      if (holder !== undefined) check.inside = holder.node

      // 框与线落在**同一格**上时，这一格两种读法都成立：按指针落在块里的哪一段分流。
      // 这一档服务「分组能嵌套分组」，那件事尚未实现，因此这里不该被走到。
      //
      // 留在这一处是因为它同时握着两种答案：框与线各自沿链找、互不知道对方在哪一层，
      // 只有在这里才看得出它们是不是指着同一格。判定放在别处（计划里、绘制里）都拿不到这一对照。
      //
      // 今天走不到：`dropRelationsOf` 只给工作区节点算位次关系，虚拟分组根本不进那条分支，
      // 因此不可能有同一格既承接放入、又承接同一节点的位次。
      //
      // 真做分组嵌套时，把这里换成按指针在块里的位置分流（上段 before、中段 inside、
      // 下段 after），并让 `dropRelationsOf` 同时交出两种读法——那一族的改动都集中在中间层，
      // 渲染与手势不用动。这一档的几何现在就在手边（`order.measure()`），因此不用另找量法
      if (
        check.inside !== undefined &&
        check.order !== undefined &&
        idOf(check.inside) === idOf(check.order)
      ) {
        throw new Error(
          'workspace-plus: 一次投放同时落在同一格的两档读法上（banded），而分组嵌套尚未实现',
        )
      }

      // 这一格既不是任何落点、也不在任何一片的范围之内：这次到此为止。
      // 那一句管的是原地投放：拖回自己那一片时它按设计不在名单里，于是不标记、不提交
      return check.inside === undefined && check.order === undefined ? null : check
    },

    commit(check) {
      if (check.inside !== undefined) insideByNode.get(idOf(check.inside))?.commit()
      // 线一定有方向：`checkDrop` 给出 `order` 时同时给出 `side`，那一格只是类型上的兜底
      if (check.order !== undefined) {
        orderByNode.get(idOf(check.order))?.commit(check.side ?? 'before')
      }
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
 * 指针落在这一块的上半还是下半
 *
 * 量的那一块由名单给出（见 {@link OrderTarget.measure}）：落点本身是节点，没有矩形可言。
 * 量不出高度时读作「之前」：尚未布局的元素与 jsdom 都是这种情形，那时分不出上下，
 * 而「之前」那处缝落在这一块自己身上，读出来仍是指着它的一条线
 * @param rect - 落点那一块的矩形
 * @param point - 指针坐标
 */
function sideOf(rect: BlockRect, point: { x: number; y: number }): DropSide {
  if (rect.height <= 0) return 'before'
  return point.y - rect.top < rect.height / 2 ? 'before' : 'after'
}
