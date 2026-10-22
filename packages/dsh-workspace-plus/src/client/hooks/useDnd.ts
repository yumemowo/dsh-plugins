/**
 * 行拖拽的手势层
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
 *
 * 碰 DOM 的那一层在 `dnd/marks.ts`：元素怎么读成节点、计划怎么算成绘制表、哪一片该压淡。
 * 本文件只决定「什么时候」调它们——监听、单例、自动滚动与提交
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { rowIdProps, zoneProps } from '../data/protocol.ts'
import type { DragPlan } from '../data/protocol.ts'
import { maybeDropSearcher } from '../data/dropSearcher.ts'
import type { DropCheck, DropSearcher } from '../data/dropSearcher.ts'
import type { TreeContainerRef, TreeNodeRef } from '../data/tree.ts'
import { debugLog, debugWarn } from '../utils/debug.ts'
import { autoScrollStep } from '../data/scroll.ts'
import {
  applyDimmed,
  applyDropMarks,
  boxOf,
  clearDimmed,
  clearMarkers,
  collectDropTargets,
  describeElement,
  describeNode,
  dimmedElements,
  nodeAt,
  owningZoneKey,
  paintFor,
  scrollContainers,
} from './dnd/marks.ts'
import type { PaintMark } from './dnd/marks.ts'

/**
 * 拖拽载荷的前缀
 *
 * 本包不读它，写它是为了让外部插件的监听认得出「这是另一个插件的拖拽」而让路
 */
const PAYLOAD_PREFIX = 'wg-dnd:'

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
    dragend: (event: DragEvent) => void
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
  const teardown = useCallback((from: string) => {
    // 常开：几处清理入口互相踩踏时，缺了「谁先摘掉监听」这一条就分不清
    // 「浏览器没派 drop」与「自己把 drop 监听摘早了」——两者在界面上都表现为「拖了没反应」
    if (listenersRef.current !== null) {
      debugWarn('teardown', { from, committed: committedRef.current })
    }
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
  const applyHit = useCallback((target: Element | null, point: { x: number; y: number }) => {
    const searcher = searcherRef.current
    if (searcher === null) return
    // 事件目标不在本实例那一片里：这一格不归本实例管，另一个实例的拖拽或页面上的别的拖放
    const scope = region?.current
    const inside = target !== null && (scope === undefined || scope === null || scope.contains(target))
    // 指针正落着哪个节点：适配层读一次（元素带区域键，经树换成节点身份），
    // 此后落点判定全在节点上做，检测层沿树往上走
    const node = inside ? nodeAt(zoneNodesRef.current, target) : null
    // 捡到这一步才量带宽：检测器只在真的要分上下半时才问它，指针每移动一次都会走一遍这里
    const band = target === null ? null : () => target.getBoundingClientRect()
    const check = inside && node !== null && band !== null ? searcher.checkDrop(band, point, node) : null
    checkRef.current = check

    // 一次最多两个节点：一个画框、一个画线。
    // 先按**指针落着的那一格**查绘制表，再退回节点身份——
    // 同一个节点可以有好几格（标题、体内、未归组段），用户指着哪一格就该画在哪一格
    const drawn = new Map<Element, string>()
    const here = node === null ? null : owningZoneKey(target as Element)
    const box =
      check?.inside === undefined
        ? undefined
        : paintFor(paintRef.current, zoneNodesRef.current, 'inside', check.inside, here)
    const line =
      check?.order === undefined
        ? undefined
        : paintFor(paintRef.current, zoneNodesRef.current, 'order', check.order, here, check.side)
    if (box !== undefined) drawn.set(box.element, box.mark)
    if (line !== undefined) drawn.set(line.element, line.mark)

    markedRef.current = applyDropMarks(markedRef.current, drawn)

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
  }, [region])

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
    teardown('commit')
  }, [teardown])

  const beginDrag = useCallback(
    (plan: DragPlan) => {
      // 后到的调用覆盖先到的：浏览器本身保证同一时刻只有一场原生拖拽，这里只是防御
      if (listenersRef.current !== null) teardown('begin-drag-overwrite')
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
      // 压淡够不着的那一片：判定与命中层同源，因此不会出现「淡着却能放进去」
      const dimmed = dimmedElements(scope, plan)
      debugWarn('drag begin', {
        source: plan.source,
        targets: [...plan.targets.keys()],
        // 计划里有多少格真的在 DOM 上找到了元素：对不上就是「界面有格、计划没有」或反过来
        painted: collected.paint.size,
        dimmed: dimmed.length,
      })
      applyDimmed(dimmed)
      dimmedRef.current = dimmed

      const dragover = (event: DragEvent): void => {
        // 接管这一格，浏览器才会把元素读成可放置的容器，`drop` 才会派发
        event.preventDefault()
        // 松手能不能落下由这一格决定，不由 preventDefault 决定：
        // `dropEffect` 停在 `none` 时浏览器照样不派 `drop`，界面上表现为「框线都在、松手什么都没发生」。
        // 浏览器只在 `dropEffect` 属于 `effectAllowed` 允许的集合时才认这次赋值，
        // 因此给它 move（拖拽起手处 setData 时写的也是 move）
        if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
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
      /**
       * 松手
       *
       * 正常路径是 `drop` 先到、这里只做清理。但有另一种情形：浏览器在指针静止期间
       * 放弃了这个目标，之后再没向本片派过任何事件——框和线留在界面上，松手什么也不发生。
       * `drop` 在那种情形下永远不会来，而 `dragend` 一定来，因此在这里补交一次。
       *
       * 补交有误交的风险：用户按 Esc 取消拖拽时也只有 `dragend`。
       * 两者靠 `dropEffect` 分开——它只在本包的 `dragover` 里被写成 `move`，
       * 取消时浏览器把它重置成 `none`。因此只认 `move`
       */
      const dragend = (event: DragEvent): void => {
        if (event.dataTransfer?.dropEffect === 'move') commit()
        teardown('dragend')
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
    if (listenersRef.current !== null) teardown('provider-unmount')
  }, [teardown])

  const dndZoneProps = useCallback((key: string) => zoneProps(key), [])

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
      // 这里**不**清理：React 的事件挂在根容器上，它比 `document` 那一层先跑，
      // 在这里 teardown 会把 `document` 上的 dragend 监听摘掉，那条「拖拽结束了」的日志
      // 因此永远打不出来，事后分不清「浏览器没派 drop」与「自己摘早了」。
      onDragEnd: () => {},
    }),
    [beginDrag],
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
  const rowAttribute = useMemo(() => (dnd === null ? {} : rowIdProps(dnd.rowId)), [dnd])
  return { zone, drag: dragProps, rowAttribute, dragging: drag.dragging }
}
