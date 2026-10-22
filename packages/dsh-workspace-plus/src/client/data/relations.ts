/**
 * 一个工作区节点此刻能落到哪些地方
 *
 * 交给调用方的是**关系**，不是身份：它只看到「有几个能放进去的地方、有几个能排前后的行」，
 * 不必知道那一格是虚拟分组、会话分组还是某个工作区——三种来源的差别在这一层里就消掉了。
 *
 * 与 `tree.ts` 的分工：那里答「谁在谁里面」（随 cwd 与落盘归属变，与拖拽规则无关），
 * 这里答「能落到哪儿」（随拖拽规则变）。因此这里是唯一该认识拖拽判据的模块，
 * 反过来没有人读它——渲染层只 import 树与区域键。
 *
 * 纯数据变换：输入是一棵装配好的树与几个写入回调，不碰 React、不碰 DOM
 */
import { beforeIdOf, placeBefore } from '../../order.ts'
import { bodyKeyOf, headKeyOf, regionKeyOf, zoneKeysOf } from './tree.ts'
import type { TreeContainerRef, TreeNodeRef, WorkspaceTree } from './tree.ts'

// ── 落点关系 ──

/**
 * 一条行能落到哪儿
 *
 * 两类关系分开列，因为它们在界面上是两件事：
 * - `inside` 落到这一片上画框
 * - `order` 落到那一行上画线，且这一手同时会把它移出当前所在的那一片（换一片才谈得上新位次）
 */
type DropRelation =
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
  if (next === undefined || next === movingId) return undefined
  return headKeyOf({ kind: 'workspace', id: next })
}

/**
 * 一个节点此刻的全部落点关系
 *
 * 顺序即优先级：同层兄弟在前（位次是最近的一层关系），其余在后
 * @param tree - 装配好的树
 * @param node - 被拖的节点
 * @param writes - 落到各族写入面时各调哪一个
 */
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
    const relation: DropRelation = {
      kind: 'order',
      // 整片都算这一行的检测范围：标题行与它体内的那一格。指针停在体内的会话上时，
      // 读出的仍然是「排在这个工作区之前 / 之后」——那一格属于这一片，与标题行是同一件事
      zones: zoneKeysOf({ kind: 'workspace', id: targetId }),
      // 线跨整块工作区画：贴着标题那一行画会在体内有内容时显得只有半截
      region: regionKeyOf({ kind: 'workspace', id: targetId }),
      place: (side) => {
        // 位次没变（拖到自己的相邻位）与锚点对不上都在换算里判掉，那时不写
        const next = placeBefore(order, node.id, { kind: side, id: targetId })
        if (next === undefined) return
        // 落盘的会话分组归属不在这条序列上，单独补一笔
        if (leavesGroup && bound !== undefined) writes.unnest()
        writes.reorder(beforeIdOf(next, node.id))
      },
    }
    // 这一处缝交给下一条：标题那一格得说出「下一条」是哪一格
    // 序列不同时下一条也不同，因此在这里按本次换算用的那份序列算
    const seam = seamOfOrder(order, node.id, targetId)
    return seam === undefined ? relation : { ...relation, seam }
  }

  // 全遍历整棵树：任何节点都可能与来源构成某种关系
  //
  // 这一轮同时决定了「一行只有一个身份」：祖先工作区只承接放入、不当位次参照，
  // 两者因此不会落在同一个工作区上。虚拟分组今天只承接放入，没有位次关系可言，
  // 于是也不会有「同一格两种读法」。分组嵌套要做时，这两条是首先要放宽的
  for (const other of tree.allNodes()) {
    if (other.id === node.id) continue

    // ── 位次关系 ──
    // 两行能谈先后，当且仅当它们在同一条序列上：此刻并排（注册表序同段），
    // 或者 cwd 上同父（挪过去之后就是同层兄弟）。两条各自用自己的序列换算
    if (other.kind === 'workspace') {
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
      const isAncestorRow =
        (selfParent !== undefined && selfParent.id === other.id) ||
        tree.dropAncestorsOf(node).some((entry) => entry.id === other.id)
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
      relations.push({
        kind: 'inside',
        zones: zoneKeysOf(target),
        // 组头与组体是两格、同一片：框与线都该套住整块分组，单位因此挂在整块容器上
        region: regionKeyOf({ kind: 'virtual', id: other.id }),
        commit: () => writes.moveToGroup(other.id),
      })
      continue
    }

    // 祖先工作区：落上去读作「成为它的子工作区」
    const isAncestor = tree.dropAncestorsOf(node).some((entry) => entry.id === other.id)
    if (isAncestor) {
      const ancestorZones = zoneKeysOf({ kind: 'workspace', id: other.id })
      const ancestorRegion = regionKeyOf({ kind: 'workspace', id: other.id })
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
      if (
        selfParent !== undefined &&
        selfParent.id === other.id &&
        container === tree.containerOf(other)
      ) {
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
      const holder = tree.containers.groupOf(ancestor.id, groupId)
      const zones = zoneKeysOf(holder)
      const region = regionKeyOf({ kind: 'group', workspaceId: ancestor.id, groupId })
      // 已经住在这个分组里：落回它这一片读作原地投放，不写，但这一片必须留在名单里
      //
      // 直接跳过整条关系会让指针落在组头时读不到这一片，链于是继续往上走到外层的
      // 虚拟分组——框套在整个虚拟分组上，而这一行明明就在这个分组体内
      if (bound !== undefined && bound.parentId === ancestor.id && bound.groupId === groupId) {
        relations.push({ kind: 'inside', zones, region, commit: () => {} })
        continue
      }
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
  if (membership !== undefined) {
    relations.push({
      kind: 'inside',
      zones: [bodyKeyOf(tree.containers.root)],
      commit: () => writes.moveToGroup(''),
    })
  }

  return relations
}
