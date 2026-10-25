/**
 * 拖拽协议的形状：计划、DOM 标记属性与区域键
 *
 * 计划是整个拖拽架构里唯一含业务知识的东西：它声明「这次拖拽能落到哪几片、落到之后执行什么」。
 * 手势层与命中层只认区域键与落点读法，不认识会话、分组与工作区。
 *
 * 这一层只放**形状**，不放构造：构造在 `plan.ts`，那里才认识索引与落点关系。
 * 这样渲染层要取一个区域键时只 import 本模块，不会把计划构造器与整份索引一起拖进产物。
 *
 * 纯逻辑，不碰 React、不碰 DOM
 */
import { bodyKeyOf, headKeyOf, looseZoneKeyOf, regionKeyOf } from './zones.ts'

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

/**
 * 一片落点区域
 *
 * 一片是界面上的一块地方：一个工作区块、一个分组、整段置顶区、根节点那一片。
 * 它声明三件事——占哪几格、按什么读、落下之后做什么——命中层因此不必认识
 * 工作区、分组与会话的差别。
 *
 * 一片可以装下别的行（分组的组体里还有会话与子工作区），因此它的**读数单位**
 * 与它占的格子不是一回事：格是入口，单位是「框套哪一块、线画在哪、排到谁前后」
 */
export interface DropArea {
  /**
   * 这一片在 DOM 上占的那几格区域键
   *
   * 标题行与体内那一格都是入口：指针停在体内的任何一行上，读出的仍是这一片。
   * 只登记标题一格会让体内成为死区——用户把指针往下一移，框和线就整个消失
   */
  zones: readonly string[]
  /**
   * 这一片的读数单位
   *
   * 多数片只有一个（一个工作区块、一个分组）；一格装多行的段（置顶区）一条行一个，
   * 由指针正落着的那一行选出是哪一个
   */
  units: readonly DropUnit[]
  /**
   * 这一片接哪一种读法
   *
   * `inside`：整块放进去，画一圈
   * `order`：与这一片谈先后，画一条线
   *
   * 一片只接一种。同一格上两种都成立的读法服务分组嵌套，那件事尚未实现，
   * 判定点留在 {@link DropSearcher.checkDrop} 里，见那里的说明
   */
  accepts: 'inside' | 'order'
  /**
   * 这一片何时算「指针落在它上面」
   *
   * `subtree`（缺省）：指针落进它范围内的任何地方都算。分组的组体里坐着会话与子工作区，
   * 指着它们时说的仍是这一组
   *
   * `ownLevel`：只有指针就在这一层时才算——中间隔了别的容器就不算。
   * 罩住整片列表的那一层必须这么声明，否则指针停在任何一个成员上时它都会跟着接住：
   * 一个已经住在分组里的工作区，拖到那个分组的空白上时，本该只由分组那一层回答
   */
  hitArea?: 'subtree' | 'ownLevel'
  /** 放开时执行，交回的是这一片上的一次落点 */
  commit: (anchor: DropAnchor) => void
}

/** 一片里的一处读数单位 */
export interface DropUnit {
  /**
   * 框与线套住的那一块
   *
   * 由渲染层写在 {@link REGION_ATTRIBUTE} 上。没有值表示这一处自己就是单位——
   * 「只有一行的块」没有单独立单位，置顶区那一格也只按行分，两者都退回区域元素本身
   */
  region: string | undefined
  /** 谈先后时排到谁前后；接 `inside` 的那一片没有这一格 */
  row: string | undefined
  /**
   * 这一条**之后**那处缝由哪一条代言
   *
   * 「排到这一条之后」与「排到下一条之前」是屏幕上同一处空白，只能有一条线。
   * 取值是下一条的 {@link DropUnit.row}；命中层把「之后」改读作那一条的「之前」。
   * 没有值表示这一段末尾，或者下一条正被拖走（那时那处是原地投放）
   */
  seam?: string | undefined
}

/** 一次拖拽的完整计划，dragstart 时构造，dragend 时销毁 */
export interface DragPlan {
  source: DragSource
  /**
   * 这次拖拽能落到哪几片
   *
   * 来源自己所在的那一片按构造不在其中：拖回去是原地投放，因此连标记都不该画
   */
  areas: readonly DropArea[]
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
 * 取值是**它的落点单位标识**。命中层拿计划里 {@link DropUnit.region} 点名的那一个值一次查回，
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

/**
 * 区域键那一格属性
 *
 * 渲染层写下它，命中层沿祖先链读它；两处只经由这个函数与 {@link ZONE_ATTRIBUTE} 见面
 * @param key - 区域键，与计划表里的键一一对应
 */
export function zoneProps(key: string): Record<string, string> {
  return { [ZONE_ATTRIBUTE]: key }
}

/**
 * 落点单位那一格属性
 *
 * 与区域键分开：区域键说「这一格是哪儿」，单位标识说「框该套在哪个元素上」。
 * 一片可以占好几格而框只画一个，因此两套标识并不同名
 * @param unit - 由 `zones.ts` 的 `regionKeyOf` 算出的单位标识
 */
export function regionProps(unit: string): Record<string, string> {
  return { [REGION_ATTRIBUTE]: unit }
}

/**
 * 可作 before / after 参照物的行 id 那一格属性
 *
 * 与 `draggable` 分开：前者写在元素上供命中层读，后者是 DOM 的拖放开关
 * @param id - 参照行 id
 */
export function rowIdProps(id: string): Record<string, string> {
  return { [ROW_ATTRIBUTE]: id }
}

/** 一个可滚容器：拖拽期间边缘自动滚动靠这个属性找它 */
export function scrollProps(): Record<string, string> {
  return { [SCROLL_ATTRIBUTE]: '' }
}

/**
 * 一片可整块压暗的范围
 *
 * 压淡按这一层算：整片淡一次，里面那些行不必各自再标
 */
export function scopeProps(): Record<string, string> {
  return { [SCOPE_ATTRIBUTE]: '' }
}

// ── 区域键 ──

/**
 * 按对象取的一层区域键封装
 *
 * 形状由 `data/dnd/zones.ts` 的 `bodyKeyOf` / `headKeyOf` / `regionKeyOf` 一处决定，这里只把
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