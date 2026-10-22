/**
 * 拖拽的 DOM 胶水：元素 ↔ 节点 ↔ 像素
 *
 * 拖拽期间要碰 DOM 的活全在这里：沿祖先链找区域键、把计划算成落点与绘制表、按压淡判定该淡哪一片、
 * 找还滚得动的容器，以及日志里怎么称呼一个元素。
 *
 * 搬出 `useDnd.ts` 的理由与行数无关：这些函数不认识事件时序，也不需要 React。
 * 它们的输入是一次计划、一份对照表、一个元素，输出是节点、标记或像素位置，因此可以脱离拖拽流程单独读、单独断言。
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
} from '../../data/protocol.ts'
import type { DragPlan, DragPlanTarget } from '../../data/protocol.ts'
import type { DropNode, DropTarget } from '../../data/dropSearcher.ts'
import type { ScrollBox } from '../../data/scroll.ts'
import type { TreeContainerRef, TreeNodeRef } from '../../data/tree.ts'

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
 * 一个区域元素里参与前后半判定的参照行，按文档序
 *
 * 区域元素自己带参照行标记时只取它自己
 * 分组头那种「一块即一个成员」的段据此成立：块头既是落点区域也是参照行
 * 指针停在它上面时按这一块的上下半算前后，不会被它撑开体里的会话行抢走
 * 未归组段那种「一格装多行」的段没有这一格，按后代里的行标记取
 * @param element - 命中的区域元素
 */
function rowsIn(element: Element): Element[] {
  if (element.getAttribute(ROW_ATTRIBUTE) !== null) return [element]
  return Array.from(element.querySelectorAll(`[${ROW_ATTRIBUTE}]`))
}

/**
 * 这次拖拽可能接住的所有位置，以及每个位置该画在哪个元素上
 *
 * 检测本身只认区域键（见 `dropSearcher.ts`）：这里把计划里的每一格算成一条节点，
 * 同时交出「键 → 元素」的绘制表。检测层因此一个元素都不用碰，
 * 需要元素的地方只有本函数与画标记那一处——也就是这一份映射
 *
 * 名单从计划来：计划里每一格配什么档，这里就落成什么形状的落点
 * - `container` 档只给放入
 * - `rows` 档给排序，参照行是那一格里的每一行
 *
 * 一格只落成一档，因此每次检测最多拿到一个框和一个线，且来自两格
 *
 * @param root - 本实例那一片的根节点
 * @param plan - 当前计划
 */
export function collectDropTargets(
  root: ParentNode,
  plan: DragPlan,
): { targets: DropTarget[]; paint: Map<string, () => PaintMark | undefined> } {
  /** 区域键 → 节点身份：树对全部节点算一遍，这里只查表 */
  const zoneNodes: ReadonlyMap<string, TreeNodeRef | TreeContainerRef> =
    plan.tree?.nodesByZone() ?? new Map()
  const nodeOf = (key: string, fallback: DropNode): DropNode => zoneNodes.get(key) ?? fallback

  /**
   * 一格的落点单位：框与线该画的那个元素
   *
   * 落点单位由渲染层写在 `data-wg-dnd-region` 上，值是一处单位标识（见 `data/tree.ts` 的
   * `regionOfKey`）。计划点名了 `regionOf` 就按它查；没点名表示这一格自己就是单位。
   *
   * 两种情形合成一次查询，因此「只有一行的块」与「很多行的块」在这里没有分支：
   * 前者没有那个标记，退回那一格自己的元素；后者由标记直接交出整块
   *
   * 查不到时交回 undefined 而不是退到区域键上：两套标识不共用命名空间，
   * 单位标识（`workspaceBlock/…`、`virtualBlock/…`、`sessionGroupBlock/…`）在任何元素上都不会是区域键的取值
   * @param key - 这一格的区域键
   * @param target - 这一格的计划
   */
  const regionOf = (key: string, target: DragPlanTarget): Element | undefined => {
    if (target.regionOf === undefined) {
      // 没有点名表示这一格自己就是单位（「只有一行的块」）
      return root.querySelector(`[${ZONE_ATTRIBUTE}="${key}"]`) ?? undefined
    }
    return root.querySelector(`[${REGION_ATTRIBUTE}="${target.regionOf}"]`) ?? undefined
  }

  /**
   * 键 → 画框 / 画线的元素与它该带哪个标记
   *
   * 存成惰性的一格：线的落点取决于哪一行正被拖走，而那只在拖拽进行中才确定——
   * 拖起那一刻 React 还没把画淡状态写到行上
   */
  const paint = new Map<string, () => PaintMark | undefined>()
  const targets: DropTarget[] = []
  for (const element of root.querySelectorAll(`[${ZONE_ATTRIBUTE}]`)) {
    const key = element.getAttribute(ZONE_ATTRIBUTE)
    if (key === null) continue
    const target = plan.targets.get(key)
    if (target === undefined) continue
    // 不在树上的行（会话、置顶）用行 id 作身份
    const rowId = element.getAttribute(ROW_ATTRIBUTE) ?? key
    const node = nodeOf(key, { kind: 'row', id: rowId })

    // 框与线都画在这一格的**落点单位**上：一片可以装下别的行（分组含组内成员、
    // 工作区块含子工作区），框套住整个范围、线跨整个范围画在它的上下缘。
    // 「只有一行的块」没有那个标记，单位就是这一格自己，这里因此不必分情况
    const region = regionOf(key, target) ?? element

    if (target.mode === 'container') {
      // 绘制表按**区域键**存：一个节点可以有好几格（标题、体内、未归组段），
      // 框该画在指针真正落着的那一格对应的单位上，而不是按节点身份合并
      paint.set('inside/' + key, () => ({ element: region, mark: 'inside' }))
      targets.push({
        kind: 'inside',
        node,
        commit: () => target.commit({ kind: 'inside' }),
      })
    }

    if (target.mode === 'rows') {
      /**
       * 单位里可供排序的行
       *
       * 一格即一条时（虚拟分组、会话分组、工作区标题格）就是这一格自己，线跨它的单位；
       * 一格装多行时（置顶区）是单位里的每一条行，线画在那一行身上——它们是同段里的
       * 并列成员，各自就是一处单位。两种只是行数不同，这里交出同一个形状
       *
       * `paintKey` 与 `rowId` 分开：绘制表按**查得到的键**存，一格即一条时是区域键
       * （绘制查询按区域键走），一格装多行时是行 id（那时按行 id 查）；
       * 而提交要的是参照行的 id，两者不是同一个东西
       */
      const ownRow = element.getAttribute(ROW_ATTRIBUTE)
      const lines: { rowId: string; paintKey: string; identity: DropNode; carrier: Element }[] =
        ownRow !== null
          ? [{ rowId: ownRow, paintKey: key, identity: node, carrier: region }]
          : rowsIn(region).flatMap((row) => {
              const id = row.getAttribute(ROW_ATTRIBUTE)
              return id === null
                ? []
                : [{ rowId: id, paintKey: id, identity: { kind: 'row', id } as DropNode, carrier: row }]
            })
      for (const [index, line] of lines.entries()) {
        const markFor = (side: 'before' | 'after'): PaintMark | undefined =>
          fadedAt(line.carrier) ? undefined : { element: line.carrier, mark: side }
        paint.set('order/before/' + line.paintKey, () => markFor('before'))
        // 这一条之后那处缝归下一条的上缘：屏幕上只有一处空白，从哪一侧靠近都该是
        // 同一个像素位置、同一个标记，因此「之后」这里改去取下一份「之前」
        //
        // 下一条可能就在同一格里（置顶段那样一格装多行），也可能在隔壁那一格
        // （每个成员各占一格时可排序的段）：前者按行 id 就在手边，后者由计划点名
        const seamKey = lines[index + 1]?.paintKey ?? target.seamKey
        paint.set('order/after/' + line.paintKey, () => {
          // 下一条画在压淡里时那处是原地投放，交给它只会让线跟着一起淡掉，退回本条下缘
          const shared = seamKey === undefined ? undefined : paint.get('order/before/' + seamKey)?.()
          return shared ?? markFor('after')
        })
        targets.push({
          kind: 'order',
          node: line.identity,
          commit: (side) =>
            target.commit(
              side === 'before' ? { kind: 'before', rowId: line.rowId } : { kind: 'after', rowId: line.rowId },
            ),
        })
      }
    }
  }
  return { targets, paint }
}
/**
 * 一个节点在区域键表里占了哪几格
 * @param zoneNodes - 区域键 → 节点身份的对照表
 * @param node - 落点身份
 */
function zonesOfNode(
  zoneNodes: ReadonlyMap<string, TreeNodeRef | TreeContainerRef>,
  node: DropNode,
): string[] {
  const keys: string[] = []
  for (const [key, value] of zoneNodes) if (value === node) keys.push(key)
  return keys
}

/**
 * 指针这一格归哪一片
 *
 * 从元素自己往上走，遇到的第一个带区域键的就是答案。这是这一层里唯一一处「沿祖先链找」
 * ——它属于 DOM 层，检测层因此拿到的永远是一个键
 * @param element - 指针下的元素
 * @returns 那一格的区域键，沿途没有区域元素时为 null
 */
export function owningZoneKey(element: Element): string | null {
  let node: Element | null = element
  while (node !== null) {
    const key = node.getAttribute(ZONE_ATTRIBUTE)
    if (key !== null) return key
    node = node.parentElement
  }
  return null
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
 * 一个落点身份的简短称呼，日志里用
 * @param node - 树节点、容器或行
 */
export function describeNode(node: DropNode): string {
  if (node.kind === 'workspace') return 'workspace/' + node.id
  if (node.kind === 'virtual') return 'virtual/' + node.id
  if (node.kind === 'group') return `group/${node.workspaceId}/${node.groupId}`
  if (node.kind === 'root') return 'root'
  return 'row/' + node.id
}

/**
 * 一个元素是不是画在压淡里
 *
 * 压淡写在祖先上、按元素叠乘，因此要从元素自己往上找一遍。
 * 被拖走的那一行自己也画淡，同样算在这一类里
 * @param element - 待查的元素
 */
function fadedAt(element: Element): boolean {
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
    if (key !== null && plan.targets.has(key)) return true
  }
  return false
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
 * 第一条覆盖来源自己所在的那一片：按构造它不在计划里，拖回去是原地投放，那一片因此退下去
 *
 * 祖先已经压淡的不再单独标：整片淡一次足够，重复标只会让样式叠乘
 * 压淡盖住了里面的被拖行时，行自己那一层画淡由样式表让开，两层不会叠乘
 * @param root - 本实例那一片的根节点
 * @param plan - 当前计划
 */
export function dimmedElements(root: ParentNode, plan: DragPlan): Element[] {
  const candidates: Element[] = []
  for (const element of root.querySelectorAll(`[${ZONE_ATTRIBUTE}], [${SCOPE_ATTRIBUTE}]`)) {
    const key = element.getAttribute(ZONE_ATTRIBUTE)
    if (key !== null && plan.targets.has(key)) continue
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
/**
 * 指针落着的元素是树上哪个节点
 *
 * 这一层里唯一一处「元素 → 节点」的换算：元素上的区域键经树的对照表换成节点身份。
 * 找不到时按行 id 立一个行身份——会话行与置顶行不在树上
 * @param zoneNodes - 区域键 → 节点身份的对照表
 * @param element - 指针下的元素
 */
export function nodeAt(
  zoneNodes: ReadonlyMap<string, TreeNodeRef | TreeContainerRef>,
  element: Element,
): DropNode {
  const zone = owningZoneKey(element)
  if (zone !== null) {
    const found = zoneNodes.get(zone)
    if (found !== undefined) return found
  }
  const row = element.closest(`[${ROW_ATTRIBUTE}]`)
  const id = row?.getAttribute(ROW_ATTRIBUTE) ?? zone ?? ''
  return { kind: 'row', id }
}

/**
 * 一个落点节点该画在哪个元素上
 *
 * 先按**指针正落着的那一格**查：同一个节点可以占好几格（工作区的标题行、体内那一格、未归组段），
 * 用户指的是哪一格，框就该画在哪一格对应的块上。
 * 查不到时退回这个节点自己那一格——排序命中时指针那一格未必是参照行本身
 * @param paint - 区域键 → 画框 / 画线的元素，构造计划时算好的一次
 * @param zoneNodes - 区域键 → 节点身份的对照表
 * @param kind - 画框还是画线
 * @param node - 交回的那个落点身份
 * @param here - 指针正落着的区域键，读不到时为 null
 * @param side - 线画在前一处缝还是后一处缝
 */
export function paintFor(
  paint: Map<string, () => PaintMark | undefined>,
  zoneNodes: ReadonlyMap<string, TreeNodeRef | TreeContainerRef>,
  kind: 'inside' | 'order',
  node: DropNode,
  here: string | null,
  side?: 'before' | 'after',
): PaintMark | undefined {
  // 线分上下两处缝：同一处缝由下一条接过去，因此两条线各有各的落点
  const at = (key: string): PaintMark | undefined =>
    paint.get(kind === 'order' ? 'order/' + (side ?? 'after') + '/' + key : kind + '/' + key)?.()
  const zones = zonesOfNode(zoneNodes, node)
  // 指针那一格在这个节点的格子名单里：就用它
  if (here !== null) {
    if (zones.length === 0 || zones.includes(here)) {
      const found = at(here)
      if (found !== undefined) return found
    }
  }
  // 不在树上的行（会话行、置顶行）绘制表按行 id 存：它自己就是那一格
  if (zones.length === 0) return node.kind === 'row' ? at(node.id) : undefined
  // 否则取这个节点的任意一格（顺序即区域键的登记顺序）
  for (const zone of zones) {
    const found = at(zone)
    if (found !== undefined) return found
  }
  return undefined
}
