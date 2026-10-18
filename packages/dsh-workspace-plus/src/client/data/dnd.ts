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

import { dropRelationsOf, looseZoneKeyOf, zoneKeyOf } from './tree.ts'
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
   * `banded`：同一格上两种读法都成立，按指针落在这条带的哪一段分流
   *
   * `banded` 给的是**容器对容器**的情形：一个分组既能承接放入（成为它的下级），也能与它谈先后。
   * 拖拽的对象本身就是容器时两种读法才并存，因此这一档留给分组之间的嵌套排序。
   * 拖工作区时用不上——工作区不是容器，它要么被放进去、要么作为参照行排队，不会兼两职
   */
  mode: 'container' | 'rows' | 'banded'
  /**
   * 框画在哪一格所在的元素上
   *
   * 一片可以占好几格，它们未必落在同一个块标记之下：一个工作区的标题行与它体内那一格就是这样。
   * 这时要靠这一项点名标题行，否则框会沿着体内那一格一路找到外面那个虚拟分组。
   */
  blockKey?: string
  /**
   * 线画在哪一格所在的元素上
   *
   * 与 {@link blockKey} 同一个道理，只是给排序那一档用：一片可以占好几格，
   * 线要跨整片画在它的上下缘，而不是贴着标题那一行画一条短边。
   * 给出这一项时，前后半也按整片的矩形算
   */
  orderBlock?: string
  /** 放开时执行。闭包在计划构造时绑定全量顺序等数据，执行前自行复核 */
  commit: (anchor: DropAnchor) => void
}

/**
 * 一条带上下分流的落点，两段的边界各占带高的比例
 *
 * 上段读 before、下段读 after、中间读 inside
 * 比例是产品手感参数，只写在这里一处，样式与计划都不各写一份
 */
const BAND_EDGE = 0.25

/**
 * 指针落在一条带的哪一段
 *
 * 带高为零（jsdom 恒如此、尚未布局的节点也如此）时读作中间那一段：
 * 那时上下半都无从谈起，退回「整块落进容器」这个不需要像素的读法
 * @param rect - 参照行的矩形
 * @param y - 指针的纵坐标
 */
export function bandOf(
  rect: { top: number; height: number },
  y: number,
): 'before' | 'inside' | 'after' {
  if (rect.height <= 0) return 'inside'
  const offset = (y - rect.top) / rect.height
  if (offset < BAND_EDGE) return 'before'
  if (offset > 1 - BAND_EDGE) return 'after'
  return 'inside'
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
 * 一片区域里「框该画在哪一整块上」的标记，业务渲染期写好
 *
 * 一片区域可以由好几格组成：虚拟分组的组头与组体是两格，会话分组的组头与组体也是两格。
 * 指针落在其中任何一格，用户看到的都是「放进这一片」，框因此该套住整块而不是只套住标题。
 * 挂这个标记的就是那一块。
 *
 * 没有这个标记的格自己就是框的位置。未归组段与工作区标题行虽然共用一份提交，
 * 但它们处在工作区的两头、是两处独立的地方，不该被套进同一个框——不挂标记即可区分，
 * 不必由命中层去猜它们的共同祖先是不是「够小」
 */
export const BLOCK_ATTRIBUTE = 'data-wg-dnd-block'

/**
 * 某一格对应的**整块**标记
 *
 * {@link BLOCK_ATTRIBUTE} 说的是「这一格属于哪一块」（分组把组头与组体圈在一起）；
 * 这一个说的是「某一格对应的整块是哪个元素」——工作区的标题格对应整个工作区块，
 * 指针停在标题行上时框因此套住整块工作区（含它体内的子工作区行），而不是只套住标题那一行
 */
export const BLOCK_KEY_ATTRIBUTE = 'data-wg-block-key'

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
export function sessionGroupKey(workspaceId: string, groupId: string): string {
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
    const toGroup: DragPlanTarget = {
      mode: 'container',
      commit: () => input.moveToGroup(section.id),
    }
    targets.set(sessionGroupKey(workspaceId, section.id), toGroup)
    targets.set(groupHeadKey(workspaceId, section.id), toGroup)
  }

  // 来源已在未归组段时，拖回那一段是原地投放，两格因此都不进表
  if (currentGroupId !== '') {
    const toLoose: DragPlanTarget = {
      mode: 'container',
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

  // 同一格上两种读法都成立时合成一个目标，档记作 banded：
  // 上四分之一读 before、下四分之一读 after、中二分之一读 inside
  //
  // 这不是特例——它正是「一行既是容器、又能谈位次」的情形。祖先行与同层兄弟撞在同一格上，
  // 或者两个虚拟分组里的同层兄弟互相指着对方时，都会落到这里
  interface Slot {
    inside?: () => void
    /** 这一片点名把框画在哪一格上 */
    insideBlock?: string
    order?: (side: 'before' | 'after') => void
    /** 这一片点名把线画在哪一格上 */
    orderBlock?: string
  }
  const byZone = new Map<string, Slot>()
  for (const relation of relations) {
    for (const key of relation.zones) {
      const slot = byZone.get(key) ?? {}
      if (relation.kind === 'inside') {
        slot.inside = () => relation.commit()
        if (relation.block !== undefined) slot.insideBlock = relation.block
      } else {
        slot.order = (side) => relation.place(side)
        if (relation.block !== undefined) slot.orderBlock = relation.block
      }
      byZone.set(key, slot)
    }
  }
  for (const [key, slot] of byZone) {
    if (slot.inside !== undefined && slot.order !== undefined) {
      const inside = slot.inside
      const order = slot.order
      targets.set(key, {
        mode: 'banded',
        ...(slot.insideBlock === undefined ? {} : { blockKey: slot.insideBlock }),
        ...(slot.orderBlock === undefined ? {} : { orderBlock: slot.orderBlock }),
        commit: (anchor) =>
          anchor.kind === 'inside'
            ? inside()
            : order(anchor.kind === 'before' ? 'before' : 'after'),
      })
      continue
    }
    if (slot.inside !== undefined) {
      const inside = slot.inside
      targets.set(key, {
        mode: 'container',
        ...(slot.insideBlock === undefined ? {} : { blockKey: slot.insideBlock }),
        commit: () => inside(),
      })
      continue
    }
    const order = slot.order
    targets.set(key, {
      mode: 'rows',
      ...(slot.orderBlock === undefined ? {} : { orderBlock: slot.orderBlock }),
      commit: (anchor) => order?.(anchor.kind === 'before' ? 'before' : 'after'),
    })
  }

  return { source: { kind: 'workspace', id: workspaceId }, targets, tree }
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
  /** 这一段的全量成员顺序，在 dragstart 那一刻绑定 */
  order: readonly string[]
  movingId: string
  /** 换算出的新位次落成一次写入，`undefined` 表示挪到末尾 */
  commit: (beforeId: string | undefined) => void
}): DragPlan {
  const targets = new Map<string, DragPlanTarget>()
  for (const memberId of input.order) {
    if (memberId === input.movingId) continue
    targets.set(input.keyOf(memberId), {
      mode: 'rows',
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
  targets.set(input.zoneKey, {
    mode: 'rows',
    // 相邻位与「锚点就是来源自己」两种落点都在换算里返回 undefined，那时不写
    commit: (anchor) => {
      const next = reorderTo(input.order, input.movingId, anchor)
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
