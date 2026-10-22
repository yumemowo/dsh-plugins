/**
 * 拖拽计划的构造
 *
 * 五类来源（会话、置顶会话、会话分组、工作区、虚拟分组）各有自己的构造器，它们的共同点只有一件事：
 * 交出一张「区域键 → 落到之后做什么」的表。命中层只查这张表，因此不认识任何一种业务对象。
 *
 * 工作区那一族的业务知识有一半在 `relations.ts`：容器归属、同层名单与落点判定都在那里，
 * 这里只按它交回的关系接线。区域键的形状由 `tree.ts` 一处决定。
 *
 * 纯逻辑，不碰 React、不碰 DOM
 */
import { beforeIdOf, placeBefore } from '../../order.ts'
import type { Anchor } from '../../order.ts'
import { dropRelationsOf } from './relations.ts'
import type { DragPlan, DragPlanTarget, DragSource, DropAnchor } from './protocol.ts'
import { sessionGroupRegionKey, sessionGroupZoneKey, groupHeadKey, workspaceRegionKey, workspaceHeadKey, looseKey } from './protocol.ts'
import type { TreeNodeRef, WorkspaceTree } from './tree.ts'

// ── 计划构造 ──

/**
 * 一条会话行拖起时的计划
 *
 * 落点全走整块档：落到哪个容器上就归入哪个容器，位次由渲染侧的默认序决定，计划不带位次
 *
 * 三类落点都是「换一个容器」这件事的不同入口
 * - 别的分组：块与头两格共用同一个提交，拖到分组上任何位置都读作归入该分组
 * - 未归组那一段：移出分组
 * - 本条会话所属工作区的标题行：同一个「移出分组」，标题行也是目录性质的落点
 *
 * 来源当前所在的那一个容器一律不进表，拖回原位因此是构造期缺席
 * 这一条不能靠提交期判等代替：归属没有变化时宿主仍会写一次盘
 * @param input - 来源、它当前所在的分组，以及落点落到哪次写入
 */
export function sessionGroupingPlan(input: {
  workspaceId: string
  sessionId: string
  /** 本条会话当前所属分组 id，空串表示未归组 */
  currentGroupId: string
  /** 本工作区的会话分组，含空分组 */
  sections: readonly { id: string }[]
  /** 只改归属 */
  moveToGroup: (groupId: string) => void
  /** 本区域的树：检测器沿它往上走，落到组内任何一条成员行上都读作落在这一片上 */
  tree?: WorkspaceTree
}): DragPlan {
  const { workspaceId, sessionId, currentGroupId, sections } = input
  const targets = new Map<string, DragPlanTarget>()

  for (const section of sections) {
    if (section.id === currentGroupId) continue
    // 分组头自己另占一格，因此这里也得收一格：拖到头上会先命中那一格，它不在计划里就读成「这一段不接」
    // 两格同属一整块：框与线都该套住整个分组，挂在头上会只描住那一行
    const toGroup: DragPlanTarget = {
      mode: 'container',
      regionOf: sessionGroupRegionKey(workspaceId, section.id),
      commit: () => input.moveToGroup(section.id),
    }
    targets.set(sessionGroupZoneKey(workspaceId, section.id), toGroup)
    targets.set(groupHeadKey(workspaceId, section.id), toGroup)
  }

  // 来源已在未归组段时，拖回那一段是原地投放，两格因此都不进表
  if (currentGroupId !== '') {
    // 落到未归组段读作「回到这个工作区」：那一段只是工作区体内的一截，
    // 自己不是容器，能放进去的是它所在的那一个工作区——框因此套住整块工作区。
    // 标题行那一格共用这一份提交，单位自然也是同一块
    const toLoose: DragPlanTarget = {
      mode: 'container',
      regionOf: workspaceRegionKey(workspaceId),
      commit: () => input.moveToGroup(''),
    }
    targets.set(looseKey(workspaceId), toLoose)
    targets.set(workspaceHeadKey(workspaceId), toLoose)
  }

  return { source: { kind: 'session', id: sessionId }, targets, ...(input.tree === undefined ? {} : { tree: input.tree }) }
}

/**
 * 一条工作区行拖起时的计划（树驱动）
 *
 * 只收一棵树：枚举面、容器归属与合法性判定都收在树那一层（`dropRelationsOf`），
 * 调用方因此不需要传当前分组、平铺名单、同层名单、祖先会话分组四份互有重叠的名单
 *
 * 落点档由关系本身决定，不由区域形状决定：换位是 `rows`（按参照行的前后半算），其余都是 `container`
 * 同一格因此不会既接排序又接放入——这正是「指针读出的语义必须单一」在代码里的形态
 *
 * 换算绑的是构造那一刻的同层名单，折起的成员因此不动
 * @param input - 树、来源，以及四种写入各自落到哪次调用
 */
export function workspaceTreeDragPlan(input: {
  tree: WorkspaceTree
  workspaceId: string
  /** 同层换位，`beforeWorkspaceId` 为 undefined 表示挪到末尾 */
  reorder: (beforeWorkspaceId: string | undefined) => void
  /** 移入一个虚拟工作区分组，空串表示移出到根节点 */
  moveToGroup: (groupId: string) => void
  /** 移入某个祖先工作区体内的会话分组 */
  nestInto: (parentId: string, groupId: string) => void
  /** 解除嵌套归属 */
  unnest: () => void
}): DragPlan {
  const { tree, workspaceId } = input
  const source: TreeNodeRef = { kind: 'workspace', id: workspaceId }
  const targets = new Map<string, DragPlanTarget>()

  // 关系由树一次给全：它能落进哪几片、能排到哪几行前后
  // 每条关系自带它占的那几格区域键，这一层因此不必认识虚拟分组、会话分组与工作区行的差别
  const relations = dropRelationsOf(tree, source, {
    moveToGroup: input.moveToGroup,
    reorder: input.reorder,
    nestInto: input.nestInto,
    unnest: input.unnest,
  })

  // 一格只给一档：给框的那一格与给线的那一格是两格，各自独立登记。
  // 同一格两档并存的读法服务分组嵌套，尚未实现，判定点在 dropSearcher 的 checkDrop
  interface Slot {
    inside?: () => void
    order?: (side: 'before' | 'after') => void
    /** 这一片的落点单位由哪一格代言，见 {@link DragPlanTarget.regionOf} */
    regionOf?: string
    /** 这一片之后那处缝由哪一格代言，见 {@link DragPlanTarget.seamKey} */
    seamKey?: string
  }
  const byZone = new Map<string, Slot>()
  for (const relation of relations) {
    for (const key of relation.zones) {
      const slot = byZone.get(key) ?? {}
      if (relation.kind === 'inside') {
        slot.inside = () => relation.commit()
      } else {
        slot.order = (side) => relation.place(side)
        if (relation.seam !== undefined) slot.seamKey = relation.seam
      }
      if (relation.region !== undefined) slot.regionOf = relation.region
      byZone.set(key, slot)
    }
  }
  for (const [key, slot] of byZone) {
    // 一格两档都成立时不能静默取其中一档：那正是分组嵌套要用的读法，
    // 而网关层（dropSearcher 的 checkDrop）已经在同一格两档并存的落点上拦了一道。
    // 这里**不抛错**也是有意的：计划是纯函数，抛错会让一次页面渲染失败；
    // 真正的守门放在检测层，那里才有「指针落在这一格上」这个事实
    if (slot.inside !== undefined) {
      const inside = slot.inside
      targets.set(key, {
        mode: 'container',
        ...(slot.regionOf === undefined ? {} : { regionOf: slot.regionOf }),
        commit: () => inside(),
      })
      continue
    }
    const order = slot.order
    targets.set(key, {
      mode: 'rows',
      ...(slot.regionOf === undefined ? {} : { regionOf: slot.regionOf }),
      ...(slot.seamKey === undefined ? {} : { seamKey: slot.seamKey }),
      commit: (anchor) => order?.(anchor.kind === 'before' ? 'before' : 'after'),
    })
  }

  return { source: { kind: 'workspace', id: workspaceId }, targets, tree }
}

/**
 * 一条成员「之后」那处缝由哪一格代言
 *
 * 相邻两条之间只有一处空白。指针停在上面那一条的下半时读作「排到它之后」，
 * 停在下一条的上半时读作「排到它之前」——两种读法换算出的新顺序完全一样，
 * 屏幕上也是同一处，因此只能画出一条线。这里把「之后」交给下一条的上缘：
 * 命中层拿着这个键去取那一条自己的「之前」那一条线。
 *
 * 本段最后一条没有下一条，段尾照常画在它自己的下缘
 * 下一条正是被拖走的那一条时不代言：那一处是原地投放，线画上去会跟着它一起淡掉
 *
 * 交给的是**下一条那一格的键**，不是一个「是的，我来认领」的开关：命中层拿它去查
 * 「下一条的之前」，那一格画在哪个元素上由它自己决定，这里因此不必认识块与行
 * @param order - 这一段的全量成员顺序
 * @param memberId - 这一条的成员 id
 * @param movingId - 被拖走的成员
 * @param keyOf - 成员的绘制键
 * @returns 下一条的绘制键，无下一条时 undefined
 */
function seamKeyOf(
  order: readonly string[],
  memberId: string,
  movingId: string,
  keyOf: (memberId: string) => string,
): { seamKey?: string } {
  const next = order[order.indexOf(memberId) + 1]
  // 本段最后一条没有下一条；下一条正是被拖走的那一条时那处是原地投放，也不认领
  if (next === undefined || next === movingId) return {}
  return { seamKey: keyOf(next) }
}

/**
 * 一段可排序成员里某个成员的落点区域键，以及这个计划要落到哪件事上
 *
 * 来源那一个成员不进 `targets`，拖到它自己头上因此连命中都没有
 * @param input - 来源、段落键、全量顺序、被拖的成员，以及换算结果要落到哪次写入
 */
export function orderDragPlan(input: {
  source: DragSource
  /** 这段成员各自的落点区域键 */
  keyOf: (memberId: string) => string
  /**
   * 一个成员的落点单位
   *
   * 缺省表示它自己就是单位（「只有一行的块」）。分组头不是：它与组体同属一整块，
   * 线要跨整块画，因此由调用方交出那一块的标识
   */
  regionKeyOf?: (memberId: string) => string
  /** 这一段的全量成员顺序，在 dragstart 那一刻绑定 */
  order: readonly string[]
  movingId: string
  /** 换算出的新位次落成一次写入，`undefined` 表示挪到末尾 */
  commit: (beforeId: string | undefined) => void
}): DragPlan {
  const targets = new Map<string, DragPlanTarget>()
  const { order, movingId, keyOf, regionKeyOf } = input
  for (const memberId of order) {
    if (memberId === movingId) continue
    const region = regionKeyOf?.(memberId)
    targets.set(keyOf(memberId), {
      mode: 'rows',
      ...(region === undefined ? {} : { regionOf: region }),
      // 两行之间只有一处缝：它由下一条的上缘代言，紧挨着的两条不会各画一条
      ...seamKeyOf(order, memberId, movingId, keyOf),
      // 换算用的是构造期绑定的那一份全量顺序，不是露出的那些行，折起的成员因此不动
      // 相邻位与「锚点已不是本段成员」两种落点都在换算里返回 undefined，那时不写
      commit: (anchor) => {
        const next = placeBefore(input.order, input.movingId, anchorOf(anchor))
        if (next === undefined) return
        input.commit(beforeIdOf(next, input.movingId))
      },
    })
  }
  return { source: input.source, targets }
}

/**
 * 一段共用一格落点区域的成员排序计划
 *
 * 与 {@link orderDragPlan} 的分工按区域形状划开
 * 那里每个成员各占一格区域，这里整段共用一个区域键、成员行自己带参照行标记
 * 落点因此由离指针最近的那一行算前后半，与段容器本身无关
 *
 * 来源自己那一行仍在计划里：一格区域罩着多行，行与区域分不开
 * 拖回原位的落点由换位换算判成无变化，因此不写盘
 *
 * 换算绑的是构造那一刻的顺序，不是成员名单的原始序
 * 一段已有顺序位时同步跟的是用户当时看见的那一版，接管因此零跳变
 * @param input - 来源、区域键、整段顺序，以及换算结果要落到哪次写入
 */
export function stretchDragPlan(input: {
  source: DragSource
  /** 整段共用的落点区域键 */
  zoneKey: string
  /** 这一段的全量成员顺序，在 dragstart 那一刻绑定 */
  order: readonly string[]
  movingId: string
  /** 换算出的新顺序整份落成一次写入，换算判出无变化时不被调用 */
  commit: (order: readonly string[]) => void
}): DragPlan {
  const targets = new Map<string, DragPlanTarget>()
  const { order, movingId } = input
  targets.set(input.zoneKey, {
    mode: 'rows',
    // 一处缝只有一条线：一格装好几行时下一条就在同一格里，命中层按行 id 自己接过去，
    // 这里因此不必点名（`seamKey` 缺省），段尾那一条照常画在它自己的下缘
    // 相邻位与「锚点就是来源自己」两种落点都在换算里返回 undefined，那时不写
    commit: (anchor) => {
      const next = placeBefore(order, movingId, anchorOf(anchor))
      if (next === undefined) return
      input.commit(next)
    },
  })
  return { source: input.source, targets }
}

/**
 * 把一次落点换成 {@link Anchor}
 *
 * 落点用的是界面语言（落在哪一格、落在它的哪一半），换位换算用的是序列语言（插到谁之前 / 之后 / 末尾）。
 * 这一处是两种语言之间唯一的翻译：「落到整块上」读作追加到末尾
 * @param anchor - 命中层算出的落点
 */
export function anchorOf(anchor: DropAnchor): Anchor {
  if (anchor.kind === 'inside') return { kind: 'end' }
  return { kind: anchor.kind, id: anchor.rowId }
}
