/**
 * 行拖拽的手势层与命中层
 *
 * 提供者只交出一个稳定的 `beginDrag(plan)`：整条拖拽路径不经过 React，
 * 计划存模块级单例、监听挂 `document`、落点标记直写在命中元素上，因此拖拽期间零次重渲染
 *
 * 所有权由那个单例表达，只有调过 `beginDrag` 的那个提供者会挂 `document` 监听，另一个实例的监听根本不存在，天然不抢
 * 没有拖拽时 `document` 上没有任何监听，拖文件、拖文本完全不受影响
 * 两个实例共享同一个 `document`，各自挂上去的监听因此都收得到对方的 DOM 事件
 * 靠区域根节点再收一道，事件目标不在自己那一片里就不归本实例管
 *
 * 命中从事件目标沿祖先链向上找，不走坐标反查。jsdom 不实现 `document.elementFromPoint()`
 * 真实运行里坐标反查还要先处理遮挡与滚动，向上走一层是同一件事的更省的写法
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  DIM_ATTRIBUTE,
  DROP_ATTRIBUTE,
  REGION_ATTRIBUTE,
  ROW_ATTRIBUTE,
  SCOPE_ATTRIBUTE,
  SCROLL_ATTRIBUTE,
  ZONE_ATTRIBUTE,
} from '../data/dnd.ts'
import type { DragPlan, DragPlanTarget } from '../data/dnd.ts'
import { maybeDropSearcher } from '../data/dropSearcher.ts'
import type { DropCheck, DropNode, DropSearcher, DropTarget } from '../data/dropSearcher.ts'
import type { TreeContainerRef, TreeNodeRef } from '../data/tree.ts'
import { debugLog, debugWarn } from '../data/debug.ts'
import { autoScrollStep } from '../data/scroll.ts'
import type { ScrollBox } from '../data/scroll.ts'

/**
 * 拖拽载荷的前缀
 *
 * 本包不读它，写它是为了让外部插件的监听认得出「这是另一个插件的拖拽」而让路
 */
const PAYLOAD_PREFIX = 'wg-dnd:'

/** 被拖行的画淡标记，行自己监听 dragstart / dragend 置本地状态 */
const DRAGGING_ATTRIBUTE = 'data-wg-dragging'

/**
 * 一处落点标记：画在哪个元素上、带哪个值
 *
 * 两件事分开记，是因为「排到这一行之后」那处缝的线画在**下一条**的上缘，
 * 元素与标记不再是同一行上的同一个值
 */
interface PaintMark {
  element: Element
  mark: 'inside' | 'before' | 'after'
}

/**
 * 模块级单例：当前有一场拖拽时是那份计划，否则为 null
 *
 * 放模块级而不是提供者里，是因为「谁拥有 `document`」这件事要跨实例、跨 React 树来问
 */
let currentPlan: DragPlan | null = null

/**
 * 一份什么都不接的计划
 *
 * 计划构造器在拖起当刻可能已经被摘掉（那一行在拖拽期间卸载），那时没有来源可交
 * 交空表让命中层一路查不到，比抛错或延续上一次的落点都更接近事实
 */
const EMPTY_PLAN: DragPlan = { source: { kind: 'session', id: '' }, targets: new Map() }


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
function collectDropTargets(
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
   * @param key - 这一格的区域键
   * @param target - 这一格的计划
   */
  const regionOf = (key: string, target: DragPlanTarget): Element | undefined => {
    if (target.regionOf === undefined) {
      // 没有点名表示这一格自己就是单位（「只有一行的块」）
      return root.querySelector(`[${ZONE_ATTRIBUTE}="${key}"]`) ?? undefined
    }
    const region = root.querySelector(`[${REGION_ATTRIBUTE}="${target.regionOf}"]`)
    if (region !== null) return region
    return root.querySelector(`[${ZONE_ATTRIBUTE}="${target.regionOf}"]`) ?? undefined
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
 * 从元素自己往上走，遇到的第一个带区域键的就是答案。这是本文件里唯一一处「沿祖先链找」
 * ——它属于 DOM 层，检测层因此拿到的永远是一个键
 * @param element - 指针下的元素
 * @returns 那一格的区域键，沿途没有区域元素时为 null
 */
function owningZoneKey(element: Element): string | null {
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
function describeElement(element: Element): string {
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
function describeNode(node: DropNode): string {
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
function clearMarkers(marked: Iterable<Element>): void {
  for (const element of marked) element.removeAttribute(DROP_ATTRIBUTE)
}

/**
 * 清掉一组元素上的压淡标记
 * @param marked - 本实例压淡过的元素
 */
function clearDimmed(marked: Iterable<Element>): void {
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
function dimmedElements(root: ParentNode, plan: DragPlan): Element[] {
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
function scrollContainers(root: ParentNode): HTMLElement[] {
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
function boxOf(element: HTMLElement): ScrollBox {
  const rect = element.getBoundingClientRect()
  return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }
}

/**
 * 把 `beginDrag` 与两个属性助手交给子树
 *
 * 消费方里有被 `memo` 包住的会话行条目，而 context 的变化穿透 `memo`
 * value 每次渲染新建会让那些行的比对失效，因此提供者用 `useMemo` 合成它
 */
export interface Dnd {
  /**
   * 开始一场拖拽
   *
   * 由被拖行的业务侧在 `dragstart` 里构造计划后调用，后到的调用覆盖先到的
   * @param plan - 这次拖拽的完整计划
   */
  beginDrag: (plan: DragPlan) => void
  /**
   * 一个区域（分组头、未归组段、置顶区……）的渲染期属性
   * @param key - 区域键，与计划表里的键一一对应
   */
  dndZoneProps: (key: string) => Record<string, string>
  /**
   * 一行（可作 before / after 参照物的行）的渲染期属性
   * @param id - 参照行 id
   * @param buildPlan - 拖起这一行时构造计划
   */
  dndRowProps: (id: string, buildPlan: () => DragPlan) => RowDndProps
}

/**
 * 一行的拖拽属性
 *
 * 参照行 id 单列一格而不是直接当属性名给出：属性名是机制层的常量，行组件据此拼出 DOM 属性
 * 两个名字因此各只有一处定义
 */
export interface RowDndProps {
  draggable: true
  /** 这一行的参照行 id */
  rowId: string
  onDragStart: (event: DragStartEvent) => void
  onDragEnd: () => void
}

/** 拖起事件里手势层真正读到的部分 */
export interface DragStartEvent {
  dataTransfer: {
    effectAllowed: string
    setData: (format: string, value: string) => void
  }
}

const DndContext = createContext<Dnd | null>(null)

/**
 * 拖拽机制的提供者，交出一个稳定的 `beginDrag` 与两个属性助手
 *
 * 本实例渲染出来的那一片的根节点由调用方经 `region` 交给它
 * 侧边栏与对照 tab 双开时两个实例共享同一个 `document`，各自挂在 `document` 上的监听因此都会
 * 收到对方的 DOM 事件。真实指针只会划过其中一片，但监听本身不带这个信息，靠元素归属来判：
 * 事件目标不在自己这一片里，这一次 `dragover` 与 `drop` 就不归本实例管
 * 不报节点表示不作范围判定，此时本实例接管 `document` 上全部拖放事件（单实例场景，如单独渲染一行）
 */
export function DndProvider({
  children,
  region,
}: {
  children: ReactNode
  /** 本实例那一片的根节点引用，缺省表示不作范围判定 */
  region?: React.RefObject<HTMLElement | null> | undefined
}): ReactElement {
  // 拖拽期间要挂的监听只在这一处，`dragend` 里摘掉的因此是同一批函数
  const listenersRef = useRef<{
    dragover: (event: DragEvent) => void
    drop: (event: DragEvent) => void
    dragend: () => void
  } | null>(null)

  /** 自动滚动那一帧的句柄，没有循环在跑时为 null */
  const scrollFrameRef = useRef<number | null>(null)
  /**
   * 指针最后一次被读到的位置
   *
   * 只从 `dragover` 里取，不额外挂别的事件
   * 拖拽期间浏览器只保证派发拖放那一族，`mousemove` 在原生拖放中根本不产生
   * 自动滚动会让指针下的内容移位，而程序化滚动不会重派 `dragover`，
   * 因此滚动之后要拿这个坐标自己重算一次落点，否则松手提交的是滚之前那一格
   */
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  /** 上一帧的时间戳，用来算这一帧的滚动量 */
  const lastFrameRef = useRef(0)
  /**
   * 上一次本包写完之后，各个滚动容器停在哪
   *
   * 下一帧先跟这里比对：对不上就说明还有别的机制在滚同一个容器
   */
  const ownTopRef = useRef(new Map<HTMLElement, number>())

  /** 本实例画过落点标记的元素，清理时只碰这些 */
  const markedRef = useRef<Set<Element>>(new Set())
  /** 本实例压淡过的元素，同上 */
  const dimmedRef = useRef<Element[]>([])
  /** 这一场拖拽的落点检测器，dragstart 时建一次，指针移动期间只查它 */
  const searcherRef = useRef<DropSearcher | null>(null)
  /** 区域键 → 画框 / 画线的元素：检测只交回键，靠它落成像素 */
  const paintRef = useRef<Map<string, () => PaintMark | undefined>>(new Map())
  /** 区域键 → 节点身份：把指针落着的那个元素读成节点，检测层只认节点 */
  const zoneNodesRef = useRef<ReadonlyMap<string, TreeNodeRef | TreeContainerRef>>(new Map())

  /**
   * 上一次 `dragover` 算出的落点
   *
   * `drop` 只用它，不按自己的坐标重算
   * 指针在两格之间可能已经越过中线，那时提交的会是与用户看到的标记不同的一件事
   */
  /** 上一次检测的结果，放开时提交的就是它 */
  const checkRef = useRef<DropCheck | null>(null)
  /** 本次拖拽是否已经提交过，提交只发生一次 */
  const committedRef = useRef(false)
  /**
   * 上一次打出来的落点摘要
   *
   * 用来只在落点**变了**的时候打日志；放 ref 而不是局部变量，因为 `applyHit` 可能在
   * 组件重渲染时重建，那时局部变量会被重置成空串，同一次拖拽里就会重复打
   */
  const lastMarkKeyRef = useRef('')

  /**
   * 停止自动滚动
   *
   * 与开始那处成对：`teardown` 与「后到的计划覆盖先到的」都走它，因此两处不会各写一份
   */
  const stopAutoScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }
    pointerRef.current = null
    lastFrameRef.current = 0
    ownTopRef.current = new Map()
  }, [])

  /**
   * 摘掉监听与本实例画下的全部标记
   *
   * `dragend` 与「提交完成后」都走它，因此两处不会各写一份清理
   */
  const teardown = useCallback(() => {
    stopAutoScroll()
    const listeners = listenersRef.current
    if (listeners !== null) {
      document.removeEventListener('dragover', listeners.dragover)
      document.removeEventListener('drop', listeners.drop)
      document.removeEventListener('dragend', listeners.dragend)
      listenersRef.current = null
    }
    clearMarkers(markedRef.current)
    markedRef.current = new Set()
    clearDimmed(dimmedRef.current)
    dimmedRef.current = []
    searcherRef.current = null
    paintRef.current = new Map()
    checkRef.current = null
    lastMarkKeyRef.current = ''
    currentPlan = null
  }, [stopAutoScroll])

  /**
   * 处理一次 `dragover`：问一次检测器，按它交回的至多两个元素画标记
   *
   * 画什么完全由检测结果决定：有 `inside` 就画框、有 `order` 就画线，
   * 调用方不再自己往上找区域、也不再把两份提交合并成一格
   * @param target - 事件目标，可能为 null
   * @param point - 指针位置
   */
  /**
   * 指针落着的元素是树上哪个节点
   *
   * 适配层唯一一处「元素 → 节点」的换算：元素上的区域键经树的对照表换成节点身份。
   * 找不到时按行 id 立一个行身份——会话行与置顶行不在树上
   * @param element - 指针下的元素
   */
  const nodeAt = useCallback((element: Element): DropNode => {
    const zone = owningZoneKey(element)
    if (zone !== null) {
      const found = zoneNodesRef.current.get(zone)
      if (found !== undefined) return found
    }
    const row = element.closest(`[${ROW_ATTRIBUTE}]`)
    const id = row?.getAttribute(ROW_ATTRIBUTE) ?? zone ?? ''
    return { kind: 'row', id }
  }, [])

  /**
   * 一个落点节点该画在哪个元素上
   *
   * 先按**指针正落着的那一格**查：同一个节点可以占好几格（工作区的标题行、体内那一格、未归组段），
   * 用户指的是哪一格，框就该画在哪一格对应的块上。
   * 查不到时退回这个节点自己那一格——排序命中时指针那一格未必是参照行本身
   * @param kind - 画框还是画线
   * @param node - 交回的那个落点身份
   * @param here - 指针正落着的区域键，读不到时为 null
   */
  const paintFor = useCallback(
    (
      kind: 'inside' | 'order',
      node: DropNode,
      here: string | null,
      side?: 'before' | 'after',
    ): PaintMark | undefined => {
      const paint = paintRef.current
      // 线分上下两处缝：同一处缝由下一条接过去，因此两条线各有各的落点
      const at = (key: string): PaintMark | undefined =>
        paint.get(kind === 'order' ? 'order/' + (side ?? 'after') + '/' + key : kind + '/' + key)?.()
      const zones = zonesOfNode(zoneNodesRef.current, node)
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
    },
    [],
  )

  const applyHit = useCallback((target: Element | null, point: { x: number; y: number }) => {
    const searcher = searcherRef.current
    if (searcher === null) return
    // 事件目标不在本实例那一片里：这一格不归本实例管，另一个实例的拖拽或页面上的别的拖放
    const scope = region?.current
    const inside = target !== null && (scope === undefined || scope === null || scope.contains(target))
    // 指针正落着哪个节点：适配层读一次（元素带区域键，经树换成节点身份），
    // 此后落点判定全在节点上做，检测层沿树往上走
    const node = inside ? nodeAt(target) : null
    const check = inside && node !== null ? searcher.checkDrop(target, point, node) : null
    checkRef.current = check

    // 一次最多两个节点：一个画框、一个画线。
    // 先按**指针落着的那一格**查绘制表，再退回节点身份——
    // 同一个节点可以有好几格（标题、体内、未归组段），用户指着哪一格就该画在哪一格
    const drawn = new Map<Element, string>()
    const here = node === null ? null : owningZoneKey(target as Element)
    const box =
      check?.inside === undefined ? undefined : paintFor('inside', check.inside, here)
    const line =
      check?.order === undefined
        ? undefined
        : paintFor('order', check.order, here, check.side)
    if (box !== undefined) drawn.set(box.element, box.mark)
    if (line !== undefined) drawn.set(line.element, line.mark)

    for (const previous of markedRef.current) {
      if (!drawn.has(previous)) previous.removeAttribute(DROP_ATTRIBUTE)
    }
    markedRef.current = new Set(drawn.keys())

    for (const [element, mark] of drawn) element.setAttribute(DROP_ATTRIBUTE, mark)

    // 只在落点**变了**的时候打：指针每移动一像素都会重算，逐帧打会把日志刷满
    const key = [...drawn].map(([element, mark]) => mark + '@' + describeElement(element)).join(' ')
    if (key !== lastMarkKeyRef.current) {
      lastMarkKeyRef.current = key
      debugLog('hit', {
        pointer: point,
        pointerZone: here,
        node: node === null ? null : describeNode(node),
        check:
          check === null
            ? null
            : {
                inside: check.inside === undefined ? undefined : describeNode(check.inside),
                order: check.order === undefined ? undefined : describeNode(check.order),
                side: check.side,
              },
        marks: key === '' ? '(none)' : key,
      })
    }
  }, [region, nodeAt, paintFor])

  /**
   * 边缘自动滚动的那一帧
   *
   * 指针在容器的触发带里就按离边缘的远近滚一截，滚完按同一个坐标重算一次落点
   * 程序化滚动不会重派 `dragover`，指针下的元素却已经换了，不重算就会把滚之前那一格提交出去
   * @param timestamp - 这一帧的时间戳，用来算与上一帧的间隔
   */
  const scrollFrame = useCallback(
    (timestamp: number) => {
      scrollFrameRef.current = null
      // 计划没了就是这一场拖拽已经结束，不必再排下一帧
      const plan = currentPlan
      if (plan === null) return
      const pointer = pointerRef.current
      // 第一帧常常早于首次 `dragover`（起拖到指针移动之间有一段静止），那时还没有坐标
      // 这时不能直接返回，否则循环再也接不上
      if (pointer === null) {
        scrollFrameRef.current = requestAnimationFrame(scrollFrame)
        return
      }

      // 首帧没有上一帧可减，按一个 60Hz 的间隔起步，避免第一帧跳一大步
      const elapsedMs = lastFrameRef.current === 0 ? 16 : timestamp - lastFrameRef.current
      const containers = scrollContainers(region?.current ?? document)
      const decision = autoScrollStep({
        boxes: containers.map(boxOf),
        pointer,
        elapsedMs,
      })

      if (decision.index >= 0) {
        const container = containers[decision.index]
        if (container !== undefined) {
          const before = container.scrollTop
          const own = ownTopRef.current.get(container)
          // 原生拖放自带的边缘滚动关不掉，指针进到贴边那十几像素里时浏览器自己也在滚同一个容器
          // 两份直接相加就成了「本包那一段 + 浏览器那一份」，逐帧位移在两档之间来回跳，看着就是走一下停一下
          // 那一帧因此让给浏览器：只把它推到的位置收下，等它不再动，本包下一帧自然接着算
          const takenByOther = own !== undefined && before !== own
          if (!takenByOther) container.scrollTop = before + decision.step
          const after = container.scrollTop
          ownTopRef.current.set(container, after)
          // 已经贴到那一头时值不再变，这一帧不必重算落点
          if (takenByOther || after !== before) {
            // jsdom 不实现 `elementFromPoint`，取不到就跳过这一帧的重算：坐标反查是这里的便利，不是承重
            const target =
              typeof document.elementFromPoint === 'function'
                ? document.elementFromPoint(pointer.x, pointer.y)
                : null
            applyHit(target, pointer)
          }
        }
      }

      lastFrameRef.current = timestamp
      scrollFrameRef.current = requestAnimationFrame(scrollFrame)
    },
    [applyHit, region],
  )

  /**
   * 起一轮自动滚动
   *
   * 容器可能在指针进带之后才变得可滚（撑开体展开、列表变长），因此每帧重新取一次容器表
   * 指针不在触发带里的那些帧只是空转，代价是每帧一次查表与几条 `getBoundingClientRect`
   */
  const startAutoScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) return
    lastFrameRef.current = 0
    scrollFrameRef.current = requestAnimationFrame(scrollFrame)
  }, [scrollFrame])

  /**
   * 提交上一次命中画下的落点，只发生一次
   *
   * 计划在 `dragstart` 那一刻构造、绑定的是那一刻的数据
   * 拖拽期间快照可能被别的 surface 改掉，因此写入方一律在宿主侧复核锚点资格，这里只负责不重复提交
   */
  const commit = useCallback(() => {
    if (committedRef.current) return
    const searcher = searcherRef.current
    const check = checkRef.current
    if (searcher === null || check === null) {
      // 松手时没有任何落点：界面上看不出异常，用户只会觉得「拖了没反应」。
      // 这一条因此不受调试开关管，永远打出来
      debugWarn('drop with no landing', {
        hasSearcher: searcher !== null,
        lastMarks: markedRef.current.size,
      })
      return
    }
    committedRef.current = true
    debugWarn('commit', {
      inside: check.inside === undefined ? undefined : describeNode(check.inside),
      order: check.order === undefined ? undefined : describeNode(check.order),
      side: check.side,
    })
    searcher.commit(check)
    teardown()
  }, [teardown])

  const beginDrag = useCallback(
    (plan: DragPlan) => {
      // 后到的调用覆盖先到的：浏览器本身保证同一时刻只有一场原生拖拽，这里只是防御
      if (listenersRef.current !== null) teardown()
      currentPlan = plan
      committedRef.current = false

      // 名单、检测器与绘制表一场拖拽只建一次，指针移动期间只问它
      // 绘制表反过来读：元素上的区域键经树换算成节点身份，
      // 检测器因此拿到的与交回的都是节点，只有这里那一层 map 需要碰 DOM
      const scope = region?.current ?? document
      const collected = collectDropTargets(scope, plan)
      zoneNodesRef.current = plan.tree?.nodesByZone() ?? new Map()
      searcherRef.current = maybeDropSearcher(plan.tree, collected.targets)
      paintRef.current = collected.paint
      debugWarn('drag begin', {
        source: plan.source,
        targets: [...plan.targets.keys()],
        // 计划里有多少格真的在 DOM 上找到了元素：对不上就是「界面有格、计划没有」或反过来
        painted: collected.paint.size,
        dimmed: dimmedElements(scope, plan).length,
      })

      // 压淡够不着的那一片：判定与命中层同源，因此不会出现「淡着却能放进去」
      const dimmed = dimmedElements(scope, plan)
      for (const element of dimmed) element.setAttribute(DIM_ATTRIBUTE, '')
      dimmedRef.current = dimmed

      const dragover = (event: DragEvent): void => {
        // 接管这一格，浏览器才会把元素读成可放置的容器，`drop` 才会派发
        event.preventDefault()
        const point = { x: event.clientX, y: event.clientY }
        // 自动滚动那一帧没有事件可读，指针位置只能在这里留下
        pointerRef.current = point
        applyHit(event.target as Element | null, point)
      }
      const drop = (event: DragEvent): void => {
        // 与 `dragover` 同理：不拦的话浏览器会按默认行为处理这次放置
        event.preventDefault()
        // 常开：这一条与下面的 `drag end` 合起来才能分清「浏览器没派 drop」与「drop 到了但没提交」
        debugWarn('drop event', {
          alreadyCommitted: committedRef.current,
          hasCheck: checkRef.current !== null,
          marks: markedRef.current.size,
        })
        commit()
      }
      const dragend = (): void => {
        // 常开：drop 之后浏览器还会派 dragend，两条都出现说明松手正常；
        // 只有 dragend 而没有 drop，说明这次拖拽被浏览器取消了（拖动的元素在中途从文档里消失就会这样）
        debugWarn('drag end', { committed: committedRef.current })
        teardown()
      }

      listenersRef.current = { dragover, drop, dragend }
      document.addEventListener('dragover', dragover)
      document.addEventListener('drop', drop)
      document.addEventListener('dragend', dragend)
      startAutoScroll()
    },
    [applyHit, commit, region, startAutoScroll, teardown],
  )

  // 提供者被卸载时那一场拖拽跟着作废：监听留着会指到一个已经不渲染的树
  useEffect(() => () => {
    if (listenersRef.current !== null) teardown()
  }, [teardown])

  const dndZoneProps = useCallback(
    (key: string) => ({ [ZONE_ATTRIBUTE]: key }),
    [],
  )

  /**
   * 一行的拖拽属性
   *
   * 被拖行的画淡由行自己置
   * 行是 React 渲染的那一片里唯一知道「正在拖的是我」的地方
   * 而标记写在它自己的元素上，所以这一步不必经过任何共享状态
   */
  const dndRowProps = useCallback(
    (id: string, buildPlan: () => DragPlan): RowDndProps => ({
      draggable: true,
      rowId: id,
      onDragStart: (event: DragStartEvent) => {
        const plan = buildPlan()
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', `${PAYLOAD_PREFIX}${id}`)
        beginDrag(plan)
      },
      onDragEnd: () => {
        teardown()
      },
    }),
    [beginDrag, teardown],
  )

  // 三个成员都由 `useCallback` 稳定，value 因此只在它们换引用时重建
  const value: Dnd = useMemo(
    () => ({ beginDrag, dndZoneProps, dndRowProps }),
    [beginDrag, dndZoneProps, dndRowProps],
  )
  return createElement(DndContext.Provider, { value }, children)
}

/**
 * 读取拖拽机制的入口
 * @returns 稳定的 `beginDrag` 与两个属性助手
 */
export function useDnd(): Dnd {
  const value = useContext(DndContext)
  if (value === null) {
    throw new Error('workspace-plus: useDnd() requires a DndProvider above it')
  }
  return value
}

/**
 * 被拖行的画淡开关
 *
 * 行自己监听 `dragstart` / `dragend` 置本地状态
 * 整条拖拽路径零次 React 重渲染，画淡只影响这一行，因此它是唯一一处值得付一次重渲染的地方
 * @returns 该行是否正在被拖，以及置位与清位的两个入口
 */
export function useRowDragging(): {
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
} {
  const [dragging, setDragging] = useState(false)
  const start = useCallback(() => setDragging(true), [])
  const end = useCallback(() => setDragging(false), [])
  return { dragging, onDragStart: start, onDragEnd: end }
}

/**
 * 一个排序段成员行的拖拽接线
 *
 * 三格分开是因为它们的生命周期不同：区域属性恒常存在，参照行属性与拖拽属性同生共死
 */
export interface OrderRowProps {
  /** 摊在元素上，让这一行成为本段的落点区域 */
  zone: Record<string, string>
  /**
   * 摊在元素上，让这一行可以被拖起
   *
   * 没有排序计划时整格为 null，元素因此不挂 `draggable`，拖不动
   */
  drag: {
    draggable: true
    onDragStart: (event: DragStartEvent) => void
    onDragEnd: () => void
  } | null
  /**
   * 摊在元素上，让这一行成为别的成员换算前后的参照行
   *
   * 与 `drag` 同生共死：能被参照的前提是能被选中，两者分开会让参照物指向一个拖不动的行
   */
  rowAttribute: Record<string, string>
  /** 这一行是否正被拖，样式据此画淡 */
  dragging: boolean
}

/**
 * 排序段里一个成员行的完整接线
 *
 * 排序段的成员行既是落点区域又是参照行，这一处把区域属性、参照行属性与被拖时的画淡合成一格
 * 与会话行手工拼的那套同一取舍，只是那边落点与参照物是两种元素，这边合成一个
 *
 * 区域属性恒回：没有排序计划时这一行仍要接会话归组那类落点
 * @param zoneKey - 这一行的区域键，须与计划里的键一致
 * @param memberId - 这一行的成员 id，同时是它的参照行 id
 * @param buildPlan - 拖起这一行时构造计划，缺省表示这一行不可拖起
 */
export function useOrderRow(
  zoneKey: string,
  memberId: string,
  buildPlan: (() => DragPlan) | undefined,
): OrderRowProps {
  const { dndZoneProps, dndRowProps } = useDnd()
  const drag = useRowDragging()
  const zone = useMemo(() => dndZoneProps(zoneKey), [dndZoneProps, zoneKey])

  /**
   * 计划构造器的最新一份
   *
   * 调用点每渲染都会新建一个闭包（它要绑当刻的成员顺序），放进依赖列会让下面那一格每渲染换引用
   * 构造器只在 `dragstart` 那一刻被调用一次，因此读 ref 而不是读依赖
   */
  const planRef = useRef(buildPlan)
  planRef.current = buildPlan
  const canDrag = buildPlan !== undefined

  const dnd = useMemo(() => {
    if (!canDrag) return null
    // 构造器每渲染都是新的一份闭包，`dndRowProps` 却只该在成员身份变化时重建
    // 因此交给它一个读 ref 的稳定闭包，拖起当刻再取最新那份计划
    return dndRowProps(memberId, () => planRef.current?.() ?? EMPTY_PLAN)
  }, [dndRowProps, memberId, canDrag])

  const onDragStart = drag.onDragStart
  const onDragEnd = drag.onDragEnd
  const dragProps = useMemo(
    () =>
      dnd === null
        ? null
        : {
            draggable: dnd.draggable,
            onDragStart: (event: DragStartEvent) => {
              onDragStart()
              dnd.onDragStart(event)
            },
            onDragEnd: () => {
              onDragEnd()
              dnd.onDragEnd()
            },
          },
    [dnd, onDragStart, onDragEnd],
  )
  const rowAttribute = useMemo(
    () => (dnd === null ? {} : { [ROW_ATTRIBUTE]: dnd.rowId }),
    [dnd],
  )
  return { zone, drag: dragProps, rowAttribute, dragging: drag.dragging }
}

/** 被拖行的画淡标记名，行的样式按它选档 */
export const ROW_DRAGGING_ATTRIBUTE = DRAGGING_ATTRIBUTE
