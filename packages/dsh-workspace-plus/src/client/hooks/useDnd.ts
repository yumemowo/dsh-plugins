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
  DROP_ATTRIBUTE,
  ROW_ATTRIBUTE,
  ZONE_ATTRIBUTE,
  findZone,
  resolveHit,
  targetOfZone,
} from '../data/dnd.ts'
import type { DragPlan, DragPlanTarget, DropAnchor, DropHit } from '../data/dnd.ts'

/**
 * 拖拽载荷的前缀
 *
 * 本包不读它，写它是为了让外部插件的监听认得出「这是另一个插件的拖拽」而让路
 */
const PAYLOAD_PREFIX = 'wg-dnd:'

/** 被拖行的画淡标记，行自己监听 dragstart / dragend 置本地状态 */
const DRAGGING_ATTRIBUTE = 'data-wg-dragging'

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

/** 自内向外取一棵祖先链，含元素自己 */
function chainOf(element: Element): Element[] {
  const chain: Element[] = []
  let node: Element | null = element
  while (node !== null) {
    chain.push(node)
    node = node.parentElement
  }
  return chain
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
 * 落点标记画在哪个元素上
 *
 * `before` / `after` 是对某一条参照行的落点，标记因此画在那条行上，线才贴着它
 * 「一格即一行」的段（分组头）本来就命中那一个元素，这里取回的还是它
 * 「一格装多行」的段（组内会话段、未归组段）只能按锚点里的参照行 id 回溯到具体那一行
 * 画在段容器上会让线落在整段的上边或下边，与放开后真正落到的位置不符
 * `inside` 是整块投放，标记仍画在区域元素上，整块描一圈
 * @param zoneElement - 命中的区域元素
 * @param rows - 该区域里的参照行元素
 * @param hit - 落点读数
 */
function markerElementOf(
  zoneElement: Element,
  rows: readonly Element[],
  hit: DropHit | null,
): Element {
  if (hit === null || hit.anchor.kind === 'inside') return zoneElement
  const rowId = hit.anchor.rowId
  return rows.find((element) => element.getAttribute(ROW_ATTRIBUTE) === rowId) ?? zoneElement
}

/**
 * 清掉一组元素上的落点标记
 *
 * 只清本实例画过的那些，而不是扫整份文档或某一棵子树
 * 侧边栏与对照 tab 双开时两者共享同一个`document`，扫谁的范围都可能把另一个实例正画着的标记擦掉，而两个实例的渲染树也没有共同祖先
 * @param marked - 本实例画过标记的元素
 */
function clearMarkers(marked: Iterable<Element>): void {
  for (const element of marked) element.removeAttribute(DROP_ATTRIBUTE)
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

  /** 本实例画过落点标记的元素，清理时只碰这些 */
  const markedRef = useRef<Set<Element>>(new Set())
  /**
   * 上一次 `dragover` 算出的落点
   *
   * `drop` 只用它，不按自己的坐标重算
   * 指针在两格之间可能已经越过中线，那时提交的会是与用户看到的标记不同的一件事
   */
  const pendingRef = useRef<{ target: DragPlanTarget; anchor: DropAnchor } | null>(null)
  /** 本次拖拽是否已经提交过，提交只发生一次 */
  const committedRef = useRef(false)

  /**
   * 摘掉监听与本实例画下的全部标记
   *
   * `dragend` 与「提交完成后」都走它，因此两处不会各写一份清理
   */
  const teardown = useCallback(() => {
    const listeners = listenersRef.current
    if (listeners !== null) {
      document.removeEventListener('dragover', listeners.dragover)
      document.removeEventListener('drop', listeners.drop)
      document.removeEventListener('dragend', listeners.dragend)
      listenersRef.current = null
    }
    clearMarkers(markedRef.current)
    markedRef.current = new Set()
    pendingRef.current = null
    currentPlan = null
  }, [])

  /**
   * 画这一次命中的落点标记
   *
   * 指针移开时把上一次那个元素上的标记删掉；`rows` 档命中一段空白时标记值为空
   * 那时元素上不该留标记，否则样式会画出一次并不成立的 before / after
   * @param element - 这次命中的区域元素，没有命中时为 null
   * @param hit - 落点读数，没有落点时为 null
   * @param rows - 该区域里的参照行元素，`before` / `after` 据此落到具体那一行上
   */
  const drawMarker = useCallback(
    (element: Element | null, hit: DropHit | null, rows: readonly Element[] = []) => {
      const marked = element === null ? null : markerElementOf(element, rows, hit)
      for (const previous of markedRef.current) {
        if (previous !== marked) previous.removeAttribute(DROP_ATTRIBUTE)
      }
      markedRef.current.clear()
      if (marked === null) return
      markedRef.current.add(marked)
      if (hit === null) {
        marked.removeAttribute(DROP_ATTRIBUTE)
        return
      }
      marked.setAttribute(DROP_ATTRIBUTE, hit.anchor.kind)
    },
    [],
  )

  /**
   * 算一次落点读数
   * @param target - 事件目标，可能为 null（指针在窗口之外）
   * @param point - 指针位置，`rows` 档据此算前后半
   */
  const hitAt = useCallback((target: Element | null, point: { x: number; y: number }) => {
    const plan = currentPlan
    if (plan === null || target === null) return null
    // 事件目标不在本实例那一片里：这一格不归本实例管，另一个实例的拖拽或页面上的别的拖放
    const scope = region?.current
    if (scope !== undefined && scope !== null && !scope.contains(target)) return null
    const found = findZone(chainOf(target), plan)
    if (found === null) return null
    const zoneTarget = targetOfZone(plan, found.zoneKey)
    if (zoneTarget === undefined) return null
    const rows = rowsIn(found.element)
    return {
      element: found.element,
      rows,
      hit: resolveHit({ zoneKey: found.zoneKey, target: zoneTarget, rows, point }),
      zoneTarget,
    }
  }, [])

  /**
   * 处理一次 `dragover`：从事件目标向上找区域，算出落点读数并画上标记
   * @param target - 事件目标，可能为 null
   * @param point - 指针位置
   */
  const applyHit = useCallback(
    (target: Element | null, point: { x: number; y: number }) => {
      const found = hitAt(target, point)
      if (found === null) {
        drawMarker(null, null)
        pendingRef.current = null
        return
      }
      drawMarker(found.element, found.hit, found.rows)
      pendingRef.current = found.hit === null ? null : { target: found.zoneTarget, anchor: found.hit.anchor }
    },
    [drawMarker, hitAt],
  )

  /**
   * 提交上一次命中画下的落点，只发生一次
   *
   * 计划在 `dragstart` 那一刻构造、绑定的是那一刻的数据
   * 拖拽期间快照可能被别的 surface 改掉，因此写入方一律在宿主侧复核锚点资格，这里只负责不重复提交
   */
  const commit = useCallback(() => {
    if (committedRef.current) return
    const pending = pendingRef.current
    if (pending === null) return
    committedRef.current = true
    teardown()
    pending.target.commit(pending.anchor)
  }, [teardown])

  const beginDrag = useCallback(
    (plan: DragPlan) => {
      // 后到的调用覆盖先到的：浏览器本身保证同一时刻只有一场原生拖拽，这里只是防御
      if (listenersRef.current !== null) teardown()
      currentPlan = plan
      committedRef.current = false

      const dragover = (event: DragEvent): void => {
        // 接管这一格，浏览器才会把元素读成可放置的容器，`drop` 才会派发
        event.preventDefault()
        applyHit(event.target as Element | null, { x: event.clientX, y: event.clientY })
      }
      const drop = (event: DragEvent): void => {
        // 与 `dragover` 同理：不拦的话浏览器会按默认行为处理这次放置
        event.preventDefault()
        commit()
      }
      const dragend = (): void => {
        teardown()
      }

      listenersRef.current = { dragover, drop, dragend }
      document.addEventListener('dragover', dragover)
      document.addEventListener('drop', drop)
      document.addEventListener('dragend', dragend)
    },
    [applyHit, commit, teardown],
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
