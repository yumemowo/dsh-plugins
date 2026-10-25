/**
 * 一个工作区节点能落到哪些片区
 *
 * 交给调用方的是**片区**，不是身份：它只看到「有几片能放进去、有几片能排前后」，
 * 不必知道那一片是虚拟分组、会话分组还是某个工作区——三种来源的差别在这一层里就消掉了。
 *
 * 与 `outline.ts` 的分工：那里的索引答「谁在谁里面」（随 cwd 与落盘归属变，与拖拽规则无关），
 * 这里答「能落到哪儿」（随拖拽规则变）。因此这里是唯一该认识拖拽判据的模块，
 * 反过来没有人读它——渲染层只 import 行序列与区域键。
 *
 * 纯数据变换：输入是一份装好的索引与几个写入回调，不碰 React、不碰 DOM
 */
import { beforeIdOf, placeBefore } from '../../order.ts'
import type { OutlineIndex } from './outlineIndex.ts'
import type { ContainerNode } from './nest.ts'
import type { DropArea } from './protocol.ts'
import { areaShapeOf, unitOf } from './zones.ts'
import type { NodeRef } from './zones.ts'

// ── 片区 ──

/**
 * 「排到某一行之后」那处缝由哪一条代言
 *
 * 那一处空白同时是「下一条之前」，因此交给下一条的上缘画，屏幕上就只剩一条线。
 * 下一条是此刻并排的那一行，不是「把被拖的抽走之后」的那一行：后者会让线跳到更远的
 * 一行上去，而用户在屏幕上看到的是紧邻的这一处
 * @param order - 这次换位要在其上算的那份序列
 * @param movingId - 被拖的成员
 * @param targetId - 参照行
 * @returns 下一条的成员 id，无下一条时 undefined
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
  return next
}

/**
 * 一个工作区节点此刻的全部落点片区
 *
 * 顺序即优先级：同层兄弟在前（位次是最近的一层关系），其余在后
 * @param index - {@link indexOutline} 装配的索引
 * @param node - 被拖的节点
 * @param writes - 落到各族写入面时各调哪一个
 */
export function dropAreasOf(
  index: OutlineIndex,
  node: NodeRef,
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
): readonly DropArea[] {
  if (node.kind !== 'workspace') return []
  const areas: DropArea[] = []
  const container = index.containerOf(node)
  const membership = index.virtualGroupOf(node)
  const bound = index.bindingOf(node)
  const ancestors = index.dropAncestorsOf(node)
  const selfParent = ancestors[0]

  /**
   * 一片能整块放进去的片区
   *
   * 框只回答「落在哪一片」，因此没有位次、没有缝——那三样都是谈先后才需要的
   * @param target - 那一片的节点或容器
   * @param commit - 落进去时执行的那次写入
   */
  const insideAreaOf = (target: NodeRef | ContainerNode, commit: () => void): DropArea => {
    const shape = areaShapeOf(target)
    return {
      zones: shape.zones,
      units: [unitOf(shape)],
      accepts: 'inside',
      commit: (anchor) => {
        if (anchor.kind === 'inside') commit()
      },
    }
  }

  /**
   * 一片谈先后的片区
   *
   * 只回答「排到这一行前后」。**框不归它管**：框问的是「指针这一点归哪一片」，
   * 由检测层逐格查名单现算——把框塞进这里就等于拿目标行的祖先去回答指针的问题
   * @param order - 这次换位要在其上算的那份序列
   * @param targetId - 参照行
   * @param leavesGroup - 这条序列在 root 层，落上去要先把落盘的会话分组归属摘掉
   */
  const orderAreaOf = (
    order: readonly string[],
    targetId: string,
    leavesGroup = false,
  ): DropArea => {
    const shape = areaShapeOf({ kind: 'workspace', id: targetId })
    const seam = seamOfOrder(order, node.id, targetId)
    return {
      // 整片都算这一行的检测范围：标题行与它体内的那一格。指针停在体内的会话上时，
      // 读出的仍然是「排在这个工作区之前 / 之后」——那一格属于这一片，与标题行是同一件事
      zones: shape.zones,
      // 线跨整块工作区画：贴着标题那一行画会在体内有内容时显得只有半截。
      // 参照行由 shape 点名，几格里只有标题那一格带行标记
      units: [unitOf(shape, seam)],
      accepts: 'order',
      commit: (anchor) => {
        if (anchor.kind === 'inside') return
        // 位次没变（拖到自己的相邻位）与锚点对不上都在换算里判掉，那时不写
        const next = placeBefore(order, node.id, { kind: anchor.kind, id: targetId })
        if (next === undefined) return
        // 落盘的会话分组归属不在这条序列上，单独补一笔
        if (leavesGroup && bound !== undefined) writes.unnest()
        writes.reorder(beforeIdOf(next, node.id))
      },
    }
  }

  /**
   * 这个节点能进去的每一片
   *
   * 与放入片区那几处一一对应：根节点、每个虚拟分组、祖先工作区名下的每个会话分组。
   * 每一片顶层的成员都是它的位次参照——「排到这一片里某一行前后」与「移进这一片」
   * 是同一件事的两半
   *
   * 只认来源，与正在比的另一行无关，因此在这里算一次
   */
  const joinableContainers: readonly ContainerNode[] = (() => {
    const list: ContainerNode[] = [index.containers.root]
    for (const virtual of index.virtualGroups) {
      if (virtual.kind !== 'virtual') continue
      const holder = index.containers.virtualOf(virtual.id)
      if (holder !== container) list.push(holder)
    }
    for (const ancestor of ancestors) {
      for (const groupId of index.sessionGroupsOf(ancestor)) {
        list.push(index.containers.groupOf(ancestor.id, groupId))
      }
    }
    return list
  })()

  /**
   * 谈位次用的那几份序列
   *
   * 两行能谈先后，当且仅当它们在同一条序列上：此刻并排（注册表序同段），
   * 或者 cwd 上同父（挪过去之后就是同层兄弟）。两条各自用自己的序列换算。
   *
   * 能进去的每一片，它顶层的那些成员也是位次参照：「排到这一片里某一行前后」与
   * 「移进这一片」是同一件事的两半，用户在界面上看到的是「把它放到那一行旁边」，
   * 不该因为两者此刻不在同一片而少掉那条线。来源此刻所在的那一片除外——
   * 组内换位由 `siblingsOf` 那条已经给出，再列一遍是同一份序列
   */
  const orderSequences: { order: readonly string[]; leavesGroup: boolean }[] = [
    { order: index.siblingsOf(node).map((entry) => entry.id), leavesGroup: false },
    { order: index.dropSiblingsOf(node).map((entry) => entry.id), leavesGroup: false },
  ]
  for (const holder of joinableContainers) {
    if (holder === container) continue
    const sequence = index.rootsOf(holder).map((entry) => entry.id)
    if (sequence.length === 0) continue
    // 换片之后落盘的会话分组归属就不成立了；落在 root 那一层还多一件「退出虚拟分组」，
    // 那一半由根节点那片自己的 inside 片区负责，这里只补归属
    orderSequences.push({ order: sequence, leavesGroup: bound !== undefined })
  }

  // 祖先工作区不作位次参照：一个工作区既然已经确认自己要作为子工作区出现在
  // 某个容器里，它就不再与那个容器的行谈先后——那一行承接的是「放进去」
  const isAncestorRowOf = (other: NodeRef): boolean =>
    (selfParent !== undefined && selfParent.id === other.id) ||
    ancestors.some((entry) => entry.id === other.id)

  // 全遍历索引里的节点：任何节点都可能与来源构成某种关系
  //
  // 这一轮同时决定了「一行只有一个身份」：祖先工作区只承接放入、不当位次参照，
  // 两者因此不会落在同一个工作区上。虚拟分组今天只承接放入，没有位次关系可言，
  // 于是也不会有「同一格两种读法」。分组嵌套要做时，这两条是首先要放宽的
  for (const other of index.allNodes()) {
    if (other.id === node.id) continue

    // ── 位次片区 ──
    if (other.kind === 'workspace') {
      const matched = isAncestorRowOf(other)
        ? undefined
        : orderSequences.find((entry) => entry.order.includes(other.id))
      if (matched !== undefined) {
        areas.push(orderAreaOf(matched.order, other.id, matched.leavesGroup))
        continue
      }
    }

    // ── 放入片区 ──
    // 虚拟分组是容器；祖先工作区是容器；祖先名下的会话分组是容器
    if (other.kind === 'virtual') {
      const target = index.containers.virtualOf(other.id)
      if (target === container) continue
      // 组头与组体是两格、同一片：框该套住整块分组，单位因此挂在整块容器上
      areas.push(insideAreaOf(target, () => writes.moveToGroup(other.id)))
      continue
    }

    // 祖先工作区：落上去读作「成为它的子工作区」
    if (isAncestorRowOf(other)) {
      // 已经住在它体内：落回它这一行读作回到它的直接管辖
      if (bound !== undefined && bound.parentId === other.id) {
        areas.push(insideAreaOf(other, () => writes.unnest()))
        continue
      }
      // 按 cwd 本来就是它的子工作区，且此刻已经嵌在它体内：原地投放，不写
      //
      // 这一条只在两者**已经在同一片里**时成立。跨片的兄弟不在此列——那时界面上并没有嵌进去，
      // 这次投放恰恰是要把来源移进祖先所在的那一片，移进去之后 cwd 关系才在界面上成立
      if (
        selfParent !== undefined &&
        selfParent.id === other.id &&
        container === index.containerOf(other)
      ) {
        areas.push(insideAreaOf(other, () => {}))
        continue
      }
      const target = index.containerOf(other)
      if (target === undefined) continue
      areas.push(
        insideAreaOf(other, () => {
          if (target.kind === 'group') writes.nestInto(target.workspaceId, target.groupId)
          else writes.moveToGroup(target.kind === 'root' ? '' : target.id)
        }),
      )
      continue
    }
  }

  // 祖先工作区名下的会话分组。
  //
  // 这一段**不按 other 走**：它是「来源能落到哪几个分组里」这一件事，与 allNodes 里
  // 有哪些节点无关。放进上面那个循环里会让它只在某个 other 恰好没命中任何关系时才执行，
  // 一旦别的分支 continue 掉，整段就静默失效
  for (const ancestor of ancestors) {
    for (const groupId of index.sessionGroupsOf(ancestor)) {
      const holder = index.containers.groupOf(ancestor.id, groupId)
      // 已经住在这个分组里：落回它这一片读作原地投放，不写，但这一片必须留在名单里
      //
      // 直接跳过整条片区会让指针落在组头时读不到这一片，逐格查到的那一格于是继续往上走到外层的
      // 虚拟分组——框套在整个虚拟分组上，而这一行明明就在这个分组体内
      const still = bound !== undefined && bound.parentId === ancestor.id && bound.groupId === groupId
      areas.push(insideAreaOf(holder, still ? () => {} : () => writes.nestInto(ancestor.id, groupId)))
    }
  }

  // 回到最外层：在分组里时才成立，且只认**整片列表的空白处**（那一片自己的区域键）。
  // 落在一行上的「移出分组」由检测层逐格查到得出：那一行归它所在的片区，
  // 再往上走到根节点，根节点那一片若也接了放入关系，就是这一条
  if (membership !== undefined) {
    areas.push({
      ...insideAreaOf(index.containers.root, () => writes.moveToGroup('')),
      // 它裹住整片列表：只有指针直接落在它自己的空白上才算「退到最外层」。
      // 落在某个成员身上时那是成员那一片的事，而移出分组那一半已经由那条位次关系补上
      hitArea: 'ownLevel',
    })
  }

  return areas
}
