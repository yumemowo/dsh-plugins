/**
 * 拖拽协议的形状：计划、DOM 标记属性与区域键
 *
 * 计划是整个拖拽架构里唯一含业务知识的东西：它声明「我是谁、能落到哪些区域、落到之后执行什么」。
 * 手势层与命中层只认计划里的区域键与档次，不认识会话、分组与工作区。
 *
 * 这一层只放**形状**，不放构造：构造在 `plan.ts`，那里才认识树与落点关系。
 * 这样渲染层要取一个区域键时只 import 本模块，不会把计划构造器与整棵树一起拖进产物。
 *
 * 纯逻辑，不碰 React、不碰 DOM
 */
import { bodyKeyOf, headKeyOf, looseZoneKeyOf, regionKeyOf } from './tree.ts'
import type { WorkspaceTree } from './tree.ts'

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
   * **这一类投放今天发出两笔独立写入**（改归属一笔、改位次一笔）。宿主侧没有「一次写完归属与顺序」的接口，
   * 两笔落在两个存储里，因此中途失败会留下半个状态；那一半是可恢复的，重投一次即可。
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

/**
 * 被拖起的那一行自己带上的标记，由行在 dragstart / dragend 时按本地状态写
 *
 * 机制层只读它一处：压淡时这些行不再压淡，否则被拖的那一条会连自己一起淡掉
 */
export const DRAGGING_ATTRIBUTE = 'data-wg-dragging'

/**
 * 画淡那一格，摊在行元素上
 *
 * 行自己在 dragstart / dragend 时置本地状态，这里只把状态换成属性：四处行组件各写一遍
 * 属性名，写错一处就是「这一行拖起来不画淡」，而它不会报错
 * @param dragging - 这一行是否正被拖
 * @returns 拖拽期间才有的那一格属性
 */
export function draggingProps(dragging: boolean): Record<string, string> {
  return dragging ? { [DRAGGING_ATTRIBUTE]: '' } : {}
}

// ── 区域键 ──

/**
 * 按对象取的一层区域键封装
 *
 * 形状由 `data/tree.ts` 的 `bodyKeyOf` / `headKeyOf` / `regionKeyOf` 一处决定，这里只把
 * 「我在画哪个工作区、哪个分组」翻译成节点身份。分成两个模块是因为渲染层还不认识节点身份，
 * 而拖拽层只按节点身份要键
 */

/** 一个会话分组整块那一格 */
export function sessionGroupZoneKey(workspaceId: string, groupId: string): string {
  return bodyKeyOf({ kind: 'group', workspaceId, groupId })
}

/** 一个会话分组头那一格 */
export function groupHeadKey(workspaceId: string, groupId: string): string {
  return headKeyOf({ kind: 'group', workspaceId, groupId })
}

/** 一个工作区未归组那一段 */
export function looseKey(workspaceId: string): string {
  return looseZoneKeyOf(workspaceId)
}

/** 一个工作区标题行那一格 */
export function workspaceHeadKey(workspaceId: string): string {
  return headKeyOf({ kind: 'workspace', id: workspaceId })
}

/** 一个工作区的落点单位：标题行与它整个区块同属的那一块 */
export function workspaceRegionKey(workspaceId: string): string {
  return regionKeyOf({ kind: 'workspace', id: workspaceId })
}

/** 一个虚拟工作区分组的落点单位：组头与组体同属的那一块 */
export function virtualRegionKey(groupId: string): string {
  return regionKeyOf({ kind: 'virtual', id: groupId })
}

/** 一个会话分组的落点单位：组头与组体同属的那一块 */
export function sessionGroupRegionKey(workspaceId: string, groupId: string): string {
  return regionKeyOf({ kind: 'group', workspaceId, groupId })
}

/**
 * 一个工作区体内那一格
 *
 * 与标题行那一格分开：拖到它的子工作区行上时，用户面对的范围是这一个工作区，
 * 而那一行渲染在它体内、并不在标题行之内
 */
export function workspaceBodyKey(workspaceId: string): string {
  return bodyKeyOf({ kind: 'workspace', id: workspaceId })
}

/** 一个虚拟工作区分组头那一格 */
export function virtualWorkspaceHeadKey(groupId: string): string {
  return headKeyOf({ kind: 'virtual', id: groupId })
}

/** 一个虚拟工作区分组组体那一格 */
export function virtualWorkspaceBodyKey(groupId: string): string {
  return bodyKeyOf({ kind: 'virtual', id: groupId })
}

/**
 * 根节点那一层的区域键，工作区分组与未归组工作区共用一格
 *
 * 工作区计划里它是「移出虚拟工作区分组」的落点：拖到分组结构之外的任何空白上都算回到根节点
 * 平铺在根节点上的工作区行另各占一格 `workspaceHeadKey`，两格同一档
 * 行那一格不能省，命中层停在指针下第一个带区域键的元素上，拖到行上时若它不在计划里，这次落点就到此为止
 */
export const ROOT_KEY = bodyKeyOf({ kind: 'root' })

/** 置顶区的区域键，跨工作区共用一格 */
export const PINNED_KEY = 'pinned'
