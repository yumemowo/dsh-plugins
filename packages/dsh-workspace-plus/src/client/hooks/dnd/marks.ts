/**
 * 拖拽的 DOM 胶水：元素 ↔ 区域 ↔ 像素
 *
 * 拖拽期间要碰 DOM 的活全在这里：读指针那一点落在哪几格、按片区名单找出该画在哪一块、
 * 按压淡判定该淡哪一片、找还滚得动的容器，以及日志里怎么称呼一个元素。
 *
 * 搬出 `useDnd.ts` 的理由与行数无关：这些函数不认识事件时序，也不需要 React。
 * 它们的输入是一次计划、一个元素，输出是区域键、标记或像素位置，因此可以脱离拖拽流程单独读、单独断言。
 * 留在 `useDnd.ts` 里的只有「什么时候做这些事」——监听、单例、自动滚动与提交。
 *
 * 不碰 React；碰的 DOM 只有属性读写、`querySelector` 与 `getBoundingClientRect`
 */
import {
  DIM_ATTRIBUTE,
  DRAGGING_ATTRIBUTE,
  DROP_ATTRIBUTE,
  REGION_ATTRIBUTE,
  ROW_ATTRIBUTE,
  SCOPE_ATTRIBUTE,
  SCROLL_ATTRIBUTE,
  ZONE_ATTRIBUTE,
} from '../../data/dnd/protocol.ts'
import type { DragPlan, DropArea, DropUnit } from '../../data/dnd/protocol.ts'
import type { OrderHit, DropTarget } from '../../data/dnd/dropSearcher.ts'
import type { ScrollBox } from '../../data/dnd/scroll.ts'

/**
 * 一处落点标记：画在哪个元素上、带哪个值
 *
 * 两件事分开记，是因为「排到这一行之后」那处缝的线画在**下一条**的上缘，
 * 元素与标记不再是同一行上的同一个值
 */
export interface PaintMark {
  element: Element
  mark: 'inside' | 'before' | 'after'
}

/**
 * 把这一帧的落点写上去，同时擦掉上一帧多画的
 *
 * 「上一帧画过、这一帧没画」要逐个摘，因此两个集合都要过一遍；写在元素属性上而不是 React 状态里，
 * 拖拽期间因此零次重渲染
 * @param painted - 上一帧画过的元素
 * @param drawn - 这一帧该画的元素与标记
 * @returns 这一帧画过的元素，交给下一帧当 painted
 */
export function applyDropMarks(
  painted: Iterable<Element>,
  drawn: ReadonlyMap<Element, string>,
): Set<Element> {
  for (const element of painted) if (!drawn.has(element)) element.removeAttribute(DROP_ATTRIBUTE)
  for (const [element, mark] of drawn) element.setAttribute(DROP_ATTRIBUTE, mark)
  return new Set(drawn.keys())
}

/**
 * 把够不着的那一片压下去
 * @param elements - 本次该压淡的元素
 */
export function applyDimmed(elements: Iterable<Element>): void {
  for (const element of elements) element.setAttribute(DIM_ATTRIBUTE, '')
}

/**
 * 指针那一点落在哪几格上，最近的在前
 *
 * 从元素自己往上走，沿途每一格带区域键的都收进来。这是这一层里唯一一处「沿祖先链找」
 * ——它属于 DOM 层，检测层因此拿到的永远是一串键
 * @param element - 指针下的元素
 * @returns 区域键，最近的在前
 */
export function zoneKeysAt(element: Element): string[] {
  const keys: string[] = []
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    const key = node.getAttribute(ZONE_ATTRIBUTE)
    if (key !== null) keys.push(key)
  }
  return keys
}

/**
 * 指针压着的那一行
 * @param element - 指针下的元素
 * @returns 参照行 id，沿途没有行标记时为 undefined
 */
export function rowIdAt(element: Element): string | undefined {
  return element.closest(`[${ROW_ATTRIBUTE}]`)?.getAttribute(ROW_ATTRIBUTE) ?? undefined
}

/**
 * 一处单位画在哪个元素上
 *
 * 三档，按「这一处自己有没有更具体的落脚点」依次收窄：
 * - 点名了一块（分组、工作区块那样有独立容器的）：那一块
 * - 只点名了一行（置顶区那种一格装多行）：那一行自己
 * - 都没有：这一片的区域元素（「只有一行的块」）
 *
 * 第二种要单独走一遍，不能落到第三种：置顶段整段共用一格，退回那一格会让线横跨全段，
 * 而用户指的是某一条行
 * @param root - 本实例那一片的根节点
 * @param area - 命中的那一片
 * @param unit - 命中的那一处单位
 */
export function paintOf(
  root: ParentNode,
  area: DropArea,
  unit: DropUnit,
): Element | undefined {
  if (unit.region !== undefined) {
    const found = root.querySelector(`[${REGION_ATTRIBUTE}="${unit.region}"]`)
    if (found !== null) return found
  }
  // 一格装多行：这一处就是一个行，线画在那一行身上。它是同段里的并列成员，
  // 自己就是一处单位——按行找，不按区域找（按区域找会退到整段那一格，线就横跨全段）
  if (unit.row !== undefined) {
    const found = root.querySelector(`[${ROW_ATTRIBUTE}="${unit.row}"]`)
    if (found !== null) return found
  }
  // 没有点名单位、或者那个元素还没渲染出来：退回这一片自己的区域元素
  for (const zone of area.zones) {
    const found = root.querySelector(`[${ZONE_ATTRIBUTE}="${zone}"]`)
    if (found !== null) return found
  }
  return undefined
}

/**
 * 框的落点
 *
 * 压淡里的那一块不画：框画上去会跟着一起淡，用户看到的是「这块颜色不对」而不是「这里能放」
 * @param root - 本实例那一片的根节点
 * @param area - 命中的那一片
 * @param unit - 命中的那一处单位
 */
export function paintBox(
  root: ParentNode,
  area: DropArea,
  unit: DropUnit,
): PaintMark | undefined {
  const element = paintOf(root, area, unit)
  if (element === undefined || fadedAt(element)) return undefined
  return { element, mark: 'inside' }
}

/**
 * 线的落点
 *
 * 「排到这一条之后」那处缝归下一条的上缘：屏幕上只有一处空白，从哪一侧靠近都该是
 * 同一个像素位置、同一个标记。检测层因此已经把「之后」换成了下一条那一处（见 `OrderHit.seam`），
 * 这里只负责画
 *
 * 下一条画在压淡里时那处是原地投放，交给它只会让线跟着一起淡掉，那时退回本条下缘
 * @param root - 本实例那一片的根节点
 * @param hit - 谈先后的那一次命中
 */
export function lineOf(root: ParentNode, hit: OrderHit): PaintMark | undefined {
  /** 一处单位画在哪、画不画得出：压淡里的那一块不画 */
  const markAt = (target: DropTarget, mark: 'before' | 'after'): PaintMark | undefined => {
    const element = paintOf(root, target.area, target.unit)
    if (element === undefined || fadedAt(element)) return undefined
    return { element, mark }
  }
  if (hit.seam !== undefined) {
    const shared = markAt(hit.seam, 'before')
    if (shared !== undefined) return shared
  }
  return markAt(hit, hit.side)
}

/**
 * 量一处单位的口子
 *
 * 量与画查的是同一个元素：线画在哪一块，上下半就按哪一块分
 * @param root - 本实例那一片的根节点
 * @param area - 那一片
 * @param unit - 那一处单位
 */
export function measureOf(
  root: ParentNode,
  area: DropArea,
  unit: DropUnit,
): (() => { top: number; height: number }) | undefined {
  const element = paintOf(root, area, unit)
  if (element === undefined) return undefined
  return () => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, height: rect.height }
  }
}

/**
 * 一个元素的简短称呼，日志里用
 *
 * 带上区域键或行 id：只写类名在同一个分组里会出现好几条一模一样的记录，分不出是哪一格
 * @param element - 待描述的元素
 */
export function describeElement(element: Element): string {
  const key = element.getAttribute(ZONE_ATTRIBUTE)
  const region = element.getAttribute(REGION_ATTRIBUTE)
  const row = element.getAttribute(ROW_ATTRIBUTE)
  const tag = element.tagName.toLowerCase()
  if (region !== null) return `${tag}[${region}]`
  if (key !== null) return `${tag}{${key}}`
  if (row !== null) return `${tag}(${row})`
  return `${tag}.${String(element.className).split(' ')[0] ?? ''}`
}

/**
 * 一个元素是不是画在压淡里
 *
 * 压淡写在祖先上、按元素叠乘，因此要从元素自己往上找一遍。
 * 被拖走的那一行自己也画淡，同样算在这一类里
 * @param element - 待查的元素
 */
export function fadedAt(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (node.hasAttribute(DIM_ATTRIBUTE) || node.hasAttribute(DRAGGING_ATTRIBUTE)) return true
  }
  return false
}

/**
 * 清掉一组元素上的落点标记
 *
 * 只清本实例画过的那些，而不是扫整份文档或某一棵子树
 * 侧边栏与对照 tab 双开时两者共享同一个 `document`，扫谁的范围都可能把另一个实例正画着的标记擦掉
 * @param marked - 本实例画过标记的元素
 */
export function clearMarkers(marked: Iterable<Element>): void {
  for (const element of marked) element.removeAttribute(DROP_ATTRIBUTE)
}

/**
 * 清掉一组元素上的压淡标记
 * @param marked - 本实例压淡过的元素
 */
export function clearDimmed(marked: Iterable<Element>): void {
  for (const element of marked) element.removeAttribute(DIM_ATTRIBUTE)
}

/**
 * 一个元素的子树里有没有本次的落点
 * @param element - 待查的元素
 * @param plan - 当前计划
 */
function containsLanding(element: Element, plan: DragPlan): boolean {
  for (const inner of element.querySelectorAll(`[${ZONE_ATTRIBUTE}]`)) {
    const key = inner.getAttribute(ZONE_ATTRIBUTE)
    if (key !== null && plan.areas.some((area) => area.zones.includes(key))) return true
  }
  return false
}

/**
 * 计划里那几格，收成一张查得到的表
 *
 * 压淡与「子树里有没有落点」只问「这一格接不接」，因此按格查比逐片扫一遍省事
 * @param plan - 当前计划
 */
export function zonesOfPlan(plan: DragPlan): ReadonlySet<string> {
  const zones = new Set<string>()
  for (const area of plan.areas) for (const zone of area.zones) zones.add(zone)
  return zones
}

/**
 * 本次拖拽够不着、该压淡的元素
 *
 * 引导按「压淡够不着的」做，而不是「点亮够得着的」
 * 一次拖拽能落到的地方往往有好几处，逐个点亮会把界面涂成一片
 * 反过来只让够不着的退下去，可投的那些保持原样，指针下那一处再单独抬高，三段因此分得开
 *
 * 两条都成立才压淡
 * - 这个元素自己的区域键不是落点
 * - 它子树里也没有落点
 *
 * 第二条让包着一片落点的外层退出：列表根节点罩着全部工作区，压它会把可投的目标一起压淡
 * 第一条覆盖来源自己所在的那一片：按构造它不在名单里，拖回去是原地投放，那一片因此退下去
 *
 * 祖先已经压淡的不再单独标：整片淡一次足够，重复标只会让样式叠乘
 * 压淡盖住了里面的被拖行时，行自己那一层画淡由样式表让开，两层不会叠乘
 * @param root - 本实例那一片的根节点
 * @param plan - 当前计划
 */
export function dimmedElements(root: ParentNode, plan: DragPlan): Element[] {
  const landings = zonesOfPlan(plan)
  const candidates: Element[] = []
  for (const element of root.querySelectorAll(`[${ZONE_ATTRIBUTE}], [${SCOPE_ATTRIBUTE}]`)) {
    const key = element.getAttribute(ZONE_ATTRIBUTE)
    if (key !== null && landings.has(key)) continue
    if (containsLanding(element, plan)) continue
    candidates.push(element)
  }
  return candidates.filter(
    (element) => !candidates.some((outer) => outer !== element && outer.contains(element)),
  )
}

/**
 * 拖拽期间还滚得动的容器，按文档序
 *
 * 两条都要满足：
 * - 内容确实超出了一屏，否则没什么可滚
 * - 溢出样式是 auto 或 scroll。`overflow: hidden` 的元素同样吃 `scrollTop`，
 *   滚它会让被裁掉的内容在无滚动条的情况下凭空错位，用户找不回自己在哪
 *
 * 置顶区展开档正是后一种：静止时它靠 `overflow: hidden` 裁掉超出的行，要浮出才变成可滚
 *
 * 每帧重取而不是拖起时取一次：撑开体在拖拽中可能展开或收起，可滚的高度跟着变
 * @param root - 本实例那一片的根节点，或整份文档
 */
export function scrollContainers(root: ParentNode): HTMLElement[] {
  const found = root.querySelectorAll<HTMLElement>(`[${SCROLL_ATTRIBUTE}]`)
  return Array.from(found).filter((element) => {
    if (element.scrollHeight <= element.clientHeight) return false
    const overflowY = getComputedStyle(element).overflowY
    return overflowY === 'auto' || overflowY === 'scroll'
  })
}

/**
 * 一个容器在视口里的范围
 * @param element - 可滚动的容器
 */
export function boxOf(element: HTMLElement): ScrollBox {
  const rect = element.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
}
