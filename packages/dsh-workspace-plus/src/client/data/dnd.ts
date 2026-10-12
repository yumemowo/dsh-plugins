/**
 * 行拖拽的计划类型、命中推导与区域键编解码
 *
 * 纯逻辑，不碰 React、不碰 DOM
 * 命中函数收的是「已经取到的元素」与「已在手的事件坐标」，因此可以在 node 环境下逐条断言，不必搭一棵真实元素树
 *
 * 计划是整个拖拽架构里唯一含业务知识的东西
 * 它声明「我是谁、能落到哪些区域、落到之后执行什么」
 * 手势层与命中层只认计划里的区域键与档次，不认识会话、分组与工作区
 */

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
   */
  mode: 'container' | 'rows'
  /** 放开时执行。闭包在计划构造时绑定全量顺序等数据，执行前自行复核 */
  commit: (anchor: DropAnchor) => void
}

/** 一次拖拽的完整计划，dragstart 时构造，dragend 时销毁 */
export interface DragPlan {
  source: DragSource
  /** 键与 DOM 标记上的区域键一一对应；不在表里的区域这次拖拽就不接 */
  targets: ReadonlyMap<string, DragPlanTarget>
}

// ── DOM 上的两种静态标记 ──

/** 区域键所在的属性，业务渲染期写好，拖拽期间不变 */
export const ZONE_ATTRIBUTE = 'data-wg-dnd'

/** 可作 before / after 参照物的行 id 所在的属性，同上 */
export const ROW_ATTRIBUTE = 'data-wg-dnd-row'

/** 命中层画在当前落点上的标记，取值是落点形状 */
export const DROP_ATTRIBUTE = 'data-wg-drop'

// ── 区域键编解码 ──

/** 一个会话分组在它所属工作区里的区域键 */
export function sessionGroupKey(workspaceId: string, groupId: string): string {
  return `sessionGroup/${workspaceId}/${groupId}`
}

/** 一个工作区未归组那一段的区域键 */
export function looseKey(workspaceId: string): string {
  return `loose/${workspaceId}`
}

/** 置顶区的区域键，跨工作区共用一格 */
export const PINNED_KEY = 'pinned'

/** 根节点那一层的区域键，工作区分组与未归组工作区共用一格 */
export const ROOT_KEY = 'root'

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

// ── 命中 ──

/** 命中层的读数：落在哪个区域、什么形状 */
export interface DropHit {
  /** 区域键，它就是计划表里的那一格 */
  zoneKey: string
  anchor: DropAnchor
}

/** 一个元素上的区域键，没有标记时为 null */
function zoneKeyOf(element: Element): string | null {
  return element.getAttribute(ZONE_ATTRIBUTE)
}

/** 一个元素上的参照行 id，没有标记时为 null */
function rowIdOf(element: Element): string | null {
  return element.getAttribute(ROW_ATTRIBUTE)
}

/**
 * 从事件目标向上找最近的那个区域，并看计划接不接它
 *
 * 走到第一个带区域键的元素就停
 * 那个元素是「指针正落在哪一段」的答案，计划里没有它就表示这一段不接，命中到此为止，不继续往上找别的区域
 *
 * 原地投放靠这条读法成立：
 * 拖回自己所在那一段时，那一段的键按设计不在计划里，停在这一格上即「不标记、不提交」
 * 若继续向上走，包着它的区域会接到这次落点，把一次原地投放读成「移出这一段」
 * @param chain - 自内向外排列的祖先链
 * @param plan - 当前计划
 * @returns 命中的区域元素与区域键，沿途没有区域元素、或最近那一个不在计划里时为 null
 */
export function findZone(
  chain: readonly Element[],
  plan: DragPlan,
): { element: Element; zoneKey: string } | null {
  for (const element of chain) {
    const key = zoneKeyOf(element)
    if (key === null) continue
    return plan.targets.has(key) ? { element, zoneKey: key } : null
  }
  return null
}

/**
 * 一个区域里离指针最近的那一行，以及指针落在它的上半还是下半
 *
 * 两行之间没有缝隙时，指针总在最近那一行的某半边里
 * 真落在段尾空白上时最近的那一行仍是最后一行，读作追加到它之后
 * @param rows - 区域里带参照行标记的元素，按文档序
 * @param point - 指针位置
 * @returns 参照行与它的前后半，区域里没有行时返回 null
 */
export function nearestRow(
  rows: readonly Element[],
  point: { x: number; y: number },
): { rowId: string; half: 'before' | 'after' } | null {
  let nearest: { rowId: string; distance: number; half: 'before' | 'after' } | null = null
  for (const element of rows) {
    const rowId = rowIdOf(element)
    if (rowId === null) continue
    const rect = element.getBoundingClientRect()
    const distance = verticalDistance(rect, point.y)
    const half = halfOf(rect, point.y)
    if (nearest === null || distance < nearest.distance) nearest = { rowId, distance, half }
  }
  return nearest === null ? null : { rowId: nearest.rowId, half: nearest.half }
}

/** 指针到一条矩形带的竖向距离，落在带内时为 0 */
function verticalDistance(rect: { top: number; bottom: number }, y: number): number {
  if (y < rect.top) return rect.top - y
  if (y > rect.bottom) return y - rect.bottom
  return 0
}

/**
 * 指针落在一条矩形带的前半还是后半
 * @param rect - 参照行的矩形
 * @param y - 指针的纵坐标
 * @returns 中线以上是 before，中线以下是 after
 */
export function halfOf(rect: { top: number; height: number }, y: number): 'before' | 'after' {
  return y < rect.top + rect.height / 2 ? 'before' : 'after'
}

/**
 * 判定一个点是否落在一条矩形带里
 * @param rect - 要判定的矩形
 * @param point - 指针位置
 */
export function containsPoint(
  rect: { left: number; top: number; right: number; bottom: number },
  point: { x: number; y: number },
): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
}

/**
 * 读出这次指针位置落在计划里的什么落点
 *
 * `container` 档整块只接 inside；`rows` 档再找最近的行算前后半，区域里一行都没有时落到段尾追加
 * @param input - 命中的区域元素与区域键、计划、参照行元素与指针位置
 * @returns 落点读数，该区域这次不接时为 null
 */
export function resolveHit(input: {
  zoneKey: string
  target: DragPlanTarget
  rows: readonly Element[]
  point: { x: number; y: number }
}): DropHit | null {
  if (input.target.mode === 'container') {
    return { zoneKey: input.zoneKey, anchor: { kind: 'inside' } }
  }
  const nearest = nearestRow(input.rows, input.point)
  if (nearest === null) return { zoneKey: input.zoneKey, anchor: { kind: 'inside' } }
  return {
    zoneKey: input.zoneKey,
    anchor:
      nearest.half === 'before'
        ? { kind: 'before', rowId: nearest.rowId }
        : { kind: 'after', rowId: nearest.rowId },
  }
}

/**
 * 计划里有没有这一格，以及它要不要接这次拖拽
 * @param plan - 当前计划
 * @param zoneKey - 区域键
 * @returns 那一格的目标，计划表里没有它时返回 undefined
 */
export function targetOfZone(plan: DragPlan, zoneKey: string): DragPlanTarget | undefined {
  return plan.targets.get(zoneKey)
}
