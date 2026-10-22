/**
 * 行拖拽的计划类型、命中推导与区域键
 *
 * 纯逻辑，不碰 React、不碰 DOM
 * 命中函数收的是「已经取到的元素」与「已在手的事件坐标」，因此可以在 node 环境下逐条断言，不必搭一棵真实元素树
 *
 * 计划是整个拖拽架构里唯一含业务知识的东西
 * 它声明「我是谁、能落到哪些区域、落到之后执行什么」
 * 手势层与命中层只认计划里的区域键与档次，不认识会话、分组与工作区
 *
 * 工作区那一族的业务知识又有一半在 `data/tree.ts`：容器归属、同层名单与落点判定都在那里，这里只按解析结果接线
 * 区域键的形状也由那边一处决定，本模块保留的同名构造器只是给渲染层的薄封装
 */

import { dropRelationsOf, looseZoneKeyOf, regionOfKey, zoneKeyOf } from './tree.ts'
import type { TreeNodeRef, WorkspaceTree } from './tree.ts'

// ── 计划 ──

/**
 * 被拖对象，类别由类型表达
 *
 * 载荷前缀（`dataTransfer` 里的 `wg-dnd:<sourceId>`）由手势层按它拼，外部插件据此认出这是本包的拖拽
 */
export type DragSource =
  | { kind: 'session'; id: string }
  | { kind: 'sessionGroup'; workspaceId: string; groupId: string }
  | { kind: 'workspace'; id: string }
  | { kind: 'virtualWorkspace'; groupId: string }

/** 落点：整块落进容器，或插到某行之前 / 之后 */
export type DropAnchor =
  | { kind: 'inside' }
  | { kind: 'before'; rowId: string }
  | { kind: 'after'; rowId: string }

/** 计划里的一个目标区域 */
export interface DragPlanTarget {
  /**
   * 落点给什么档
   *
   * `container`：整块只接 inside
   * `rows`：按区域内的行算 before / after，指针落在段内空白（行与行之间的缝隙、段尾）时读作追加到段尾
   *
   * 第三种读法「同一格上两种都成立，按指针在带里的位置分流」今天没有：它服务分组嵌套，
   * 那一能力尚未实现。判定点留在 `dropSearcher` 的 `checkDrop` 里，见那里的说明
   *
   * ## 「一行只有一个身份」与框线并存的区别
   *
   * 指针停在一行上时，这一行的语义只有一个：要么承接放入（inside），要么作为位次参照
   * （order），不会既是又是。这个不变量由 `tree.ts` 的 `dropRelationsOf` 保证——
   * 祖先工作区不当位次参照（`isAncestorRow`），因此同一个工作区不会两样都給。
   *
   * 框与线**同时出现**不等于一行兼两职，两者是不同层次的答案：
   * **拖一条行到分组体上**时，框说「放进这一组」、线说「排在组内某一行之前」。
   * 承载 inside 的是分组那一片，承载 order 是组体内某一条合法行——两个不同的语义主体。
   * 这类落点因此走两格：`container` 一档管框，`rows` 一档管线，各自独立登记。
   *
   * **合成写入尚未接线**：`DropTarget.mergeInto` 只有形状、没有调用方，
   * 因此今天一次投放仍会发出两笔独立写入（改归属一笔、改位次一笔）。
   * 把它接进 `useDnd` 的命中层之前，这里描述的设计没有在运行时生效。
   *
   * ## 留下来的那个判定点
   *
   * 「同一格上两种读法都成立、按指针在带里的位置分流」这一档服务**分组能嵌套分组**，
   * 那件事尚未实现。它今天一行都产生不出来：`dropRelationsOf` 只给 workspace 节点算位次关系
   * （`if (other.kind === 'workspace')`），虚拟分组根本不进那条分支，
   * 因此不可能有同一格既承接放入又承接同一节点的位次。
   *
   * 判定点留在 `dropSearcher.ts` 的 `checkDrop`：那里是唯一同时握着两种答案的地方，
   * 走到那里时两条链各自找到自己的节点，才谈得上「比较它们是不是同一格」。
   * 该分支今天会报错，见那里的注释。
   *
   * 真要启用它，改动集中在中间层三处，渲染与手势一行不用动：
   * `tree.ts` 让虚拟分组也能当位次参照、`tree.ts` 的 `isAncestorRow` 放宽排他、
   * `dropSearcher.ts` 的 `checkDrop` 给那一支真实实现。
   */
  mode: 'container' | 'rows'
  /**
   * 这一片的落点单位由哪一格代言
   *
   * 一片可以占好几格（工作区的标题行与体内那一格、虚拟分组的组头与组体），
   * 而框与线的落点单位只有一个元素。这里点名其中一格，命中层用它的键查
   * {@link REGION_ATTRIBUTE} 找回那一整块。
   *
   * 缺省表示这一格自己就是落点单位——「只有一行的块」不必额外声明
   */
  regionOf?: string
  /**
   * 这一条**之后**那处缝由哪一格代言
   *
   * 「排到这一条之后」与「排到下一条之前」是同一处缝：屏幕上只有一处空白，
   * 因此只能有一个像素位置、一条线。它天然属于下一条的上缘，于是这一片认领它，
   * 「之后」在命中时改读作下一条的「之前」——标记、位置、写入因此仍是同一件事。
   *
   * 取值是**下一条那一格的绘制键**（见 `collectDropTargets` 里的 `paintKey`）：
   * 命中层拿着它去取那一条自己的「之前」。
   * 缺省表示这一处之后没有可代言的下一条：它是本段最后一条，或者下一条正被拖走
   * （那一处是原地投放，交给一个画淡的元素只会让线跟着淡下去）
   */
  seamKey?: string
  /** 放开时执行。闭包在计划构造时绑定全量顺序等数据，执行前自行复核 */
  commit: (anchor: DropAnchor) => void
}

/** 一次拖拽的完整计划，dragstart 时构造，dragend 时销毁 */
export interface DragPlan {
  source: DragSource
  /** 键与 DOM 标记上的区域键一一对应；不在表里的区域这次拖拽就不接 */
  targets: ReadonlyMap<string, DragPlanTarget>
  /**
   * 这份计划背后的树
   *
   * 检测器拿它现算「指针这一格归谁」：沿树上往上走，而不是把每个成员逐一列进名单。
   * 会话行、置顶行这类不在树上的拖拽没有这一项，那时检测只认指针正落着的那一格
   */
  tree?: WorkspaceTree
}

// ── DOM 上的标记属性 ──

/** 区域键所在的属性，业务渲染期写好，拖拽期间不变 */
export const ZONE_ATTRIBUTE = 'data-wg-dnd'

/** 可作 before / after 参照物的行 id 所在的属性，同上 */
export const ROW_ATTRIBUTE = 'data-wg-dnd-row'

/**
 * 一个可整块压暗的区块所在的属性，业务渲染期写好
 *
 * 今天挂在工作区块上：一次拖拽够不着的工作区整块压暗，比逐格压暗更整齐
 * 取值是区块的身份，机制层只用来判嵌套包含，不解析它
 */
export const SCOPE_ATTRIBUTE = 'data-wg-dnd-scope'

/** 命中层画在当前落点上的标记，取值是落点形状 */
export const DROP_ATTRIBUTE = 'data-wg-drop'

/**
 * 一片区域的**落点单位**标记，由渲染层写在代表它的那个元素上
 *
 * 落点单位是「这一片能接住投放、框与线该套住的整个范围」：分组把组头与组体圈成一块，
 * 工作区块把标题行与体内的子工作区、会话圈成一块；没有子节点的行自成一块，范围就是那一行。
 *
 * 取值是**它代表的区域键**。命中层拿计划点名的 {@link DragPlanTarget.regionOf} 一次查回，
 * 不做任何「沿祖先链往上找到哪一层」的推断——一片是不是一个单位，是渲染层写下的事实。
 *
 * 一片只有一格时不挂这个标记：那时它自己就是自己的单位（「只有一行的块」），
 * 于是「只有一行」与「很多行」在机制层是同一件事，只是单位的元素不同
 */
export const REGION_ATTRIBUTE = 'data-wg-dnd-region'

/** 本次拖拽够不着的元素，由命中层在拖拽期间写上 */
export const DIM_ATTRIBUTE = 'data-wg-dnd-dim'

/**
 * 拖拽期间可以跟着指针自动滚动的容器所在的属性，业务渲染期写好
 *
 * 原生拖放自带的边缘滚动只在贴着边缘的十几像素里生效，滚轮又会在拖拽期间被浏览器吞掉
 * 这一段因此由本包按这个属性挑出容器自己滚，取值只用来选元素，机制层不解析它
 */
export const SCROLL_ATTRIBUTE = 'data-wg-dnd-scroll'


// ── 区域键 ──

/**
 * 一格的区域键
 *
 * 形状由 `data/tree.ts` 的 `zoneKeyOf` 一处决定，这里只是给渲染层一层按对象取的薄封装
 * 分成两个模块是因为渲染层只知道「我在画哪个工作区、哪个分组」，还不认识节点身份
 */

/** 一个会话分组整块那一格 */
export function sessionGroupZoneKey(workspaceId: string, groupId: string): string {
  return zoneKeyOf({ kind: 'group', workspaceId, groupId }, 'body') as string
}

/** 一个会话分组头那一格 */
export function groupHeadKey(workspaceId: string, groupId: string): string {
  return zoneKeyOf({ kind: 'group', workspaceId, groupId }, 'head') as string
}

/** 一个工作区未归组那一段 */
export function looseKey(workspaceId: string): string {
  return looseZoneKeyOf(workspaceId)
}

/** 一个工作区标题行那一格 */
export function workspaceHeadKey(workspaceId: string): string {
  return zoneKeyOf({ kind: 'workspace', id: workspaceId }, 'head') as string
}

/** 一个工作区的落点单位：标题行与它整个区块同属的那一块 */
export function workspaceRegionKey(workspaceId: string): string {
  return regionOfKey({ kind: 'workspace', id: workspaceId }, 'head') as string
}

/** 一个虚拟工作区分组的落点单位：组头与组体同属的那一块 */
export function virtualRegionKey(groupId: string): string {
  return regionOfKey({ kind: 'virtual', id: groupId }, 'head') as string
}

/** 一个会话分组的落点单位：组头与组体同属的那一块 */
export function sessionGroupRegionKey(workspaceId: string, groupId: string): string {
  return regionOfKey({ kind: 'group', workspaceId, groupId }, 'head') as string
}

/**
 * 一个工作区体内那一格
 *
 * 与标题行那一格分开：拖到它的子工作区行上时，用户面对的范围是这一个工作区，
 * 而那一行渲染在它体内、并不在标题行之内
 */
export function workspaceBodyKey(workspaceId: string): string {
  return `workspaceBody/${workspaceId}`
}

/** 一个虚拟工作区分组头那一格 */
export function virtualWorkspaceHeadKey(groupId: string): string {
  return zoneKeyOf({ kind: 'virtual', id: groupId }, 'head') as string
}

/** 一个虚拟工作区分组组体那一格 */
export function virtualWorkspaceBodyKey(groupId: string): string {
  return zoneKeyOf({ kind: 'virtual', id: groupId }, 'body') as string
}

/**
 * 根节点那一层的区域键，工作区分组与未归组工作区共用一格
 *
 * 工作区计划里它是「移出虚拟工作区分组」的落点：拖到分组结构之外的任何空白上都算回到根节点
 * 平铺在根节点上的工作区行另各占一格 `workspaceHeadKey`，两格同一档
 * 行那一格不能省，命中层停在指针下第一个带区域键的元素上，拖到行上时若它不在计划里，这次落点就到此为止
 */
export const ROOT_KEY = zoneKeyOf({ kind: 'root' }, 'body') as string

/** 置顶区的区域键，跨工作区共用一格 */
export const PINNED_KEY = 'pinned'

/** 一个区域键所属的工作区，不落在任何工作区里时为 undefined */
export function workspaceOfZoneKey(key: string): string | undefined {
  const parts = key.split('/')
  if (parts[0] !== 'sessionGroup' && parts[0] !== 'loose') return undefined
  return parts[1] === undefined || parts[1] === '' ? undefined : parts[1]
}

/**
 * 一个会话分组区域键里的分组 id
 * @returns 分组 id，该键不是会话分组区域键时返回 undefined
 */
export function groupOfZoneKey(key: string): string | undefined {
  const parts = key.split('/')
  if (parts[0] !== 'sessionGroup') return undefined
  return parts[2] === undefined || parts[2] === '' ? undefined : parts[2]
}

// ── 计划构造与落点换算 ──

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
 * 一段可排序行的计划构造器
 *
 * 由持有整段顺序的那一层合成一次，行组件只按自己的 id 取计划
 * 与会话行的归组上下文同一取舍：行级 memo 按引用比对
 * 每次渲染新建的构造器会让整片列表的 memo 失效
 */
export interface OrderDragging {
  /** 拖起这一行时的计划 */
  buildDragPlan: (memberId: string) => DragPlan
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
        const next = reorderTo(input.order, input.movingId, anchor)
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
 * 拖回原位的落点由 {@link reorderTo} 判成无变化，因此不写盘
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
      const next = reorderTo(order, movingId, anchor)
      if (next === undefined) return
      input.commit(next)
    },
  })
  return { source: input.source, targets }
}

/**
 * 把「参照成员 + 前后半」换算成这一段的新顺序
 *
 * 换算在整段成员顺序上做，而不是在露出的那些行上，因此被折起的成员不动，相对位置自动保持
 *
 * 返回 `undefined` 表示这次落点不改变任何顺序，调用方据此跳过写入
 * 三种落点读作无变化：来源不在这一段里、锚点不是这一段的其他成员、以及换算出的新顺序与现状逐位相同
 * 最后一种是「拖到自己的相邻位」——拖动发生了，顺序没变
 * @param order - 这一段当前的完整成员顺序
 * @param movingId - 被拖的成员
 * @param anchor - 命中层算出的落点
 * @returns 新顺序，无变化时为 undefined
 */
export function reorderTo(
  order: readonly string[],
  movingId: string,
  anchor: DropAnchor,
): string[] | undefined {
  if (!order.includes(movingId)) return undefined
  const rest = order.filter((id) => id !== movingId)
  const next = anchor.kind === 'inside' ? [...rest, movingId] : insertRelative(rest, movingId, anchor)
  if (next === null) return undefined
  if (next.every((id, index) => id === order[index])) return undefined
  return next
}

/**
 * 新顺序里「插到谁之前」那一格
 *
 * 被拖成员排到末尾时没有下一个成员，返回 `undefined`，宿主方法把缺参数读作同一个意思
 * @param order - 换算出的新顺序
 * @param movingId - 被拖的成员
 */
export function beforeIdOf(order: readonly string[], movingId: string): string | undefined {
  return order[order.indexOf(movingId) + 1]
}

/**
 * 把被拖成员插到参照成员的前一位或后一位
 * @returns 新顺序，参照成员不是这一段的其他成员时返回 null
 */
function insertRelative(
  rest: readonly string[],
  movingId: string,
  anchor: { kind: 'before' | 'after'; rowId: string },
): string[] | null {
  const at = rest.indexOf(anchor.rowId)
  if (at < 0) return null
  const next = [...rest]
  next.splice(anchor.kind === 'before' ? at : at + 1, 0, movingId)
  return next
}
