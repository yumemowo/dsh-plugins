/**
 * 拖拽计划的构造
 *
 * 五类来源（会话、置顶会话、会话分组、工作区、虚拟分组）各有自己的构造器，它们的共同点只有一件事：
 * 交出一份**片区名单**——这次拖拽能落到哪几片、每片接哪种读法、落下之后做什么。
 * 命中层只查这份名单，因此不认识任何一种业务对象。
 *
 * 工作区那一族的业务知识有一半在 `relations.ts`：容器归属、同层名单与落点判定都在那里，
 * 这里只把它交回的片区接过来。片区的形状由 `zones.ts` 一处决定。
 *
 * 纯逻辑，不碰 React、不碰 DOM
 */
import { beforeIdOf, placeBefore } from '../../order.ts'
import type { Anchor } from '../../order.ts'
import { dropAreasOf } from './relations.ts'
import type { DragPlan, DragSource, DropAnchor, DropArea, DropUnit } from './protocol.ts'
import { workspaceHeadKey } from './protocol.ts'
import type { OutlineIndex } from './outlineIndex.ts'
import { areaShapeOf, looseZoneKeyOf, unitOf } from './zones.ts'
import type { AreaShape, NodeRef } from './zones.ts'

// ── 计划构造 ──

/**
 * 一条会话行拖起时的计划
 *
 * 落点全走整块档：落到哪个容器上就归入哪个容器，位次由渲染侧的默认序决定，计划不带位次
 *
 * 三类落点都是「换一个容器」这件事的不同入口
 * - 别的分组：组头与组体同属一片，拖到分组上任何位置都读作归入该分组
 * - 未归组那一段：移出分组
 * - 本条会话所属工作区的标题行：同一个「移出分组」，标题行也是目录性质的落点
 *
 * 来源当前所在的那一个容器一律不进名单，拖回原位因此是构造期缺席
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
}): DragPlan {
  const { workspaceId, sessionId, currentGroupId, sections } = input
  const areas: DropArea[] = []

  /**
   * 一片只接「放进去」的片区
   * @param shape - 这一片的形状
   * @param move - 落进去时执行的那次写入
   */
  const intoArea = (shape: AreaShape, move: () => void): DropArea => ({
    zones: shape.zones,
    units: [unitOf(shape)],
    accepts: 'inside',
    commit: (anchor) => {
      if (anchor.kind === 'inside') move()
    },
  })

  for (const section of sections) {
    if (section.id === currentGroupId) continue
    // 分组头与组体同属一整块：框该套住整个分组，挂在头上会只描住那一行
    areas.push(
      intoArea(
        areaShapeOf({ kind: 'group', workspaceId, groupId: section.id }),
        () => input.moveToGroup(section.id),
      ),
    )
  }

  // 来源已在未归组段时，拖回那一段是原地投放，两格因此都不进名单
  if (currentGroupId !== '') {
    // 落到未归组段读作「回到这个工作区」：那一段只是工作区体内的一截，
    // 自己不是容器，能放进去的是它所在的那一个工作区——框因此套住整块工作区。
    // 标题行那一格共用这一份写入，单位自然也是同一块
    const shape = areaShapeOf({ kind: 'workspace', id: workspaceId })
    areas.push({
      // **只收标题行与未归组段**，不收工作区体内那一格：体内坐着各个会话分组，
      // 把它们也收进来会让「拖回自己所在的分组」读成「移出分组」——而那是原地投放
      zones: [workspaceHeadKey(workspaceId), looseZoneKeyOf(workspaceId)],
      units: [unitOf(shape)],
      accepts: 'inside',
      commit: (anchor) => {
        if (anchor.kind === 'inside') input.moveToGroup('')
      },
    })
  }

  return { source: { kind: 'session', id: sessionId }, areas }
}

/**
 * 一条工作区行拖起时的计划
 *
 * 只收一份索引：枚举面、容器归属与合法性判定都收在 `dropAreasOf` 那一层，
 * 调用方因此不需要传当前分组、平铺名单、同层名单、祖先会话分组四份互有重叠的名单
 *
 * @param input - 索引、来源，以及四种写入各自落到哪次调用
 */
export function workspaceTreeDragPlan(input: {
  index: OutlineIndex
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
  const source: NodeRef = { kind: 'workspace', id: input.workspaceId }
  const areas = dropAreasOf(input.index, source, {
    moveToGroup: input.moveToGroup,
    reorder: input.reorder,
    nestInto: input.nestInto,
    unnest: input.unnest,
  })
  return { source, areas }
}

/**
 * 「排到这一条之后」那处缝由哪一条代言
 *
 * 相邻两条之间只有一处空白。指针停在上面那一条的下半时读作「排到它之后」，
 * 停在下一条的上半时读作「排到它之前」——两种读法换算出的新顺序完全一样，
 * 屏幕上也是同一处，因此只能画出一条线。这里把「之后」交给下一条的上缘。
 *
 * 本段最后一条没有下一条，段尾照常画在它自己的下缘
 * 下一条正是被拖走的那一条时不当位：那一处是原地投放，线画上去会跟着它一起淡掉
 * @param order - 这一段的全量成员顺序
 * @param memberId - 这一条的成员 id
 * @param movingId - 被拖走的成员
 * @returns 下一条的成员 id，无下一条时 undefined
 */
function seamOf(
  order: readonly string[],
  memberId: string,
  movingId: string,
): string | undefined {
  const next = order[order.indexOf(memberId) + 1]
  if (next === undefined || next === movingId) return undefined
  return next
}

/**
 * 一段可排序成员的计划
 *
 * 来源那一个成员不进名单，拖到它自己头上因此连命中都没有
 * @param input - 来源、成员的形状、全量顺序、被拖的成员，以及换算结果要落到哪次写入
 */
export function orderDragPlan(input: {
  source: DragSource
  /**
   * 一个成员那一片的形状
   *
   * 交出整份形状而不是单个区域键：一个成员可能占好几格（分组的组头与组体、
   * 工作区的标题行与体内那一格），而指针停在体内时读出的仍是「排到这一整块之前 / 之后」——
   * 那一格与标题格是同一件事。只登记标题一格会让体内成为死区，用户把指针移进组里线就整个消失
   */
  shapeOf: (memberId: string) => AreaShape
  /** 这一段的全量成员顺序，在 dragstart 那一刻绑定 */
  order: readonly string[]
  movingId: string
  /** 换算出的新位次落成一次写入，`undefined` 表示挪到末尾 */
  commit: (beforeId: string | undefined) => void
}): DragPlan {
  const { order, movingId, shapeOf } = input
  const areas: DropArea[] = []
  for (const memberId of order) {
    if (memberId === movingId) continue
    const shape = shapeOf(memberId)
    const seam = seamOf(order, memberId, movingId)
    areas.push({
      zones: shape.zones,
      // 这一片当位次参照时说的是这个成员自己的行：几格里只有标题那一格带行标记，
      // 组体与体内那几格由这里点名，否则会把一串区域键当成行 id
      units: [unitOf(shape, seam)],
      accepts: 'order',
      commit: (anchor) => {
        if (anchor.kind === 'inside') return
        // 换算用的是构造期绑定的那一份全量顺序，不是露出的那些行，折起的成员因此不动
        // 相邻位与「锚点已不是本段成员」两种落点都在换算里返回 undefined，那时不写
        const next = placeBefore(input.order, input.movingId, { kind: anchor.kind, id: memberId })
        if (next === undefined) return
        input.commit(beforeIdOf(next, input.movingId))
      },
    })
  }
  return { source: input.source, areas }
}

/**
 * 一段共用同一格的成员排序计划
 *
 * 与 {@link orderDragPlan} 的差别只在片上：那里每个成员各占一片，这里整段共一片、
 * 成员行自己带参照行标记。落点因此由指针压着的那一行选单位，与段容器本身无关
 *
 * 来源自己那一行仍在名单里：一格区域罩着多行，行与区域分不开
 * 拖回原位的落点由换位换算判成无变化，因此不写盘
 *
 * 换算绑的是构造那一刻的顺序，不是成员名单的原始序
 * 一段已有顺序位时同步跟的是用户当时看见的那一版，接管因此零跳变
 * @param input - 来源、区域键、整段顺序，以及换算结果要落到哪次写入
 */
export function stretchDragPlan(input: {
  source: DragSource
  /** 整段共用的区域键 */
  zoneKey: string
  /** 这一段的全量成员顺序，在 dragstart 那一刻绑定 */
  order: readonly string[]
  movingId: string
  /** 换算出的新顺序整份落成一次写入，换算判出无变化时不被调用 */
  commit: (order: readonly string[]) => void
}): DragPlan {
  const { order, movingId } = input
  // 一条行一处单位：这一格里装了好几行，指针压着哪一行就是哪一行。
  // 每一处之后的缝交给下一条代言——同一处空白只能画一条线，见 {@link seamOf}
  const units: DropUnit[] = order.map((id) => ({
    region: undefined,
    row: id,
    seam: seamOf(order, id, movingId),
  }))
  const area: DropArea = {
    zones: [input.zoneKey],
    units,
    accepts: 'order',
    // 相邻位与「锚点就是来源自己」两种落点都在换算里返回 undefined，那时不写。
    // 「落到整段上」读作追加到末尾，那一半由 {@link anchorOf} 换算
    commit: (anchor) => {
      const next = placeBefore(order, movingId, anchorOf(anchor))
      if (next === undefined) return
      input.commit(next)
    },
  }
  return { source: input.source, areas: [area] }
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
