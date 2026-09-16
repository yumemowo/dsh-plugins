/**
 * 折叠体：展开时向下撑开、收起时收回，内容始终留在文档里
 *
 * 高度走 grid 轨道的 `0fr` ↔ `1fr`：轨道高度由内容自身决定，因此不需要预先
 * 知道子元素数量或高度，样式里也不写死任何尺寸
 *
 * 内容常驻是收起动画的前提（卸载掉就没有可收回的东西），visibility 交给
 * 样式在轨道合拢后再把内容移出焦点顺序
 *
 * 展开分两段：先把容器撑开，撑开跑完再让元素自上而下逐个淡入
 *
 * 分两段是为了不让两种代价叠在同一时间段：撑开每帧都要重排整棵子树，而一批元素
 * 同时做 opacity 过渡又要逐帧重新合成。撑开期间元素保持透明、不跑任何过渡，两段
 * 各自只承担一件事
 *
 * 淡入放在撑开之后还顺带解决了首帧问题：首次展开要付样式与布局的初始化代价，而
 * 过渡按挂钟时间推进，等第一帧真的画出来，淡入往往已经过去大半
 *
 * 嵌套时内层要让外层先走完（见 {@link CollapsibleBody} 里的 settled）：内层若抢在
 * 外层撑开期间点亮，它的元素还在逐渐揭开的裁剪区里，整段淡入都会落在暗处
 */
import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  COLLAPSE_VARS,
  DEFAULT_COLLAPSE_MOTION,
  collapseMotionVars,
} from '../utils/collapseMotion.ts'
import type { CollapseMotion } from '../utils/collapseMotion.ts'

// 节奏参数与自定义属性名都定义在 utils/collapseMotion.ts（样式表要用同一份），
// 这里转发给元素组件使用
export { COLLAPSE_VARS, DEFAULT_COLLAPSE_MOTION, collapseMotionVars }
export type { CollapseMotion }

/** 逐个淡入的节奏依据 */
export interface StaggerTiming {
  /** 相邻元素淡入延迟的间隔 */
  step: number
  /** 淡入延迟的上限 */
  cap: number
}

/** 带此标记的元素参与逐个淡入；标记由元素组件打在自己根节点上 */
const STAGGER_UNIT = '[data-wg-stagger]'

/** 逐个淡入的显隐类；由 useStaggerReveal 按 context 决定是否拼进 className */
const REVEAL_CLASS = 'wg-reveal'

/** 折叠体根节点的类名 */
const BODY_CLASS = 'wg-collapse'

/** 折叠体根节点的选择器 */
const BODY_SELECTOR = `.${BODY_CLASS}`

/** 仍收着的折叠体；落在它里面的元素本次展开不会露面 */
const CLOSED_BODY = `${BODY_SELECTOR}:not(.wg-collapse-open)`

/** 撑开动作对应的过渡属性；用它把容器的轨道过渡与别的过渡分开 */
const EXPAND_PROPERTY = 'grid-template-rows'

/** 兜底计时的宽限；过渡结束时事件通常先到 */
const FALLBACK_SLACK_MS = 60

/**
 * 本子树此刻是否可以点亮
 *
 * 逐个淡入的元素**自己从 context 取**显隐类，而不是由折叠体命令式地往它们身上挂：
 * className 归 React 所有，行内状态一变（例如菜单开合）React 会整体重写它，命令式
 * 挂上去的类会被抹掉，而且父组件不会因此重渲染、补不回来——表现为该行卡在透明，
 * 反复补挂则是闪烁
 *
 * 折叠体只负责算出「现在能不能亮」，写类交给渲染。默认 true，没被折叠体包着的
 * 元素因此不受影响
 */
const RevealContext = createContext(true)

/**
 * 取本元素要附加的显隐类
 *
 * 参与逐个淡入的元素（会话行、分组头、空态）在渲染时调用它，把返回的值接到
 * className 末尾。返回空串表示还没到点亮的时候
 * @returns 形如 ` wg-reveal` 的后缀，或空串
 */
export function useStaggerReveal(): string {
  return useContext(RevealContext) ? ` ${REVEAL_CLASS}` : ''
}

/**
 * 祖先链上的节点
 */
export interface StaggerAncestor {
  matches(selector: string): boolean
  parentElement: StaggerAncestor | null
}

/**
 * 逐个淡入所需的元素能力
 *
 * 收窄成结构类型只为可测，真实节点天然满足
 */
export interface StaggerNode extends StaggerAncestor {
  classList: { add(token: string): void; remove(token: string): void }
  style: { setProperty(name: string, value: string): void }
}

/** 能查元素的容器；真实节点天然满足 */
export interface StaggerRoot extends StaggerAncestor {
  querySelectorAll(selectors: string): ArrayLike<StaggerNode>
}

/**
 * 判断元素此刻是否可见
 *
 * 沿祖先链一路向上找仍收着的折叠体：收着的祖先里的元素根本看不见，点亮它等于把
 * 淡入提前用掉，等祖先真的展开时已经是不透明，淡入不再发生
 *
 * 「祖先正在撑开」不在这里判断——那是会随时间变化的时序状态，适合用 context 传，
 * DOM 里看不出来
 * @param unit - 待判断的元素
 * @returns 可见为 true
 */
function isVisible(unit: StaggerNode): boolean {
  let node: StaggerAncestor | null = unit.parentElement
  while (node !== null) {
    if (node.matches(CLOSED_BODY)) return false
    node = node.parentElement
  }
  return true
}

/**
 * 取可见的元素
 * @param root - 折叠体的内容根节点
 * @returns 文档序（即视觉上的从上到下）的可见元素
 */
function visibleUnits(root: StaggerRoot): StaggerNode[] {
  return Array.from(root.querySelectorAll(STAGGER_UNIT)).filter(isVisible)
}

/**
 * 取本次展开实际生效的淡入起点比例
 *
 * 只有一个元素时**总是等到完全撑开**：那时它独占整段淡入，提前起步只会把唯一那段
 * 缓动藏进裁剪区，看不到任何好处。元素多于一个时才轮到 `lead` 决定，因为那时收尾
 * 紧凑与否才有可感知的差别
 *
 * 判据用「会露面的元素个数」而不是 `children` 的节点数：`children` 可能是几个容器，
 * 里面才装着真正参与淡入的元素；反过来收着的嵌套体里的元素本次不露面，也不该算进来
 * @param root - 折叠体的内容根节点
 * @param lead - 配置里的淡入起点比例
 * @returns 0..1 的比例，`1` 表示等完全撑开
 */
export function resolveLead(root: StaggerRoot, lead: number): number {
  return visibleUnits(root).length > 1 ? lead : 1
}

/**
 * 算出某个序号的元素的淡入延迟
 *
 * 撑开跑完时所有元素都已完全可见，因此先后只由序号决定——元素在文档里的位置就是
 * 它在视觉上的位置
 * @param order - 该元素在本次露面元素里的序号，从 0 起
 * @param timing - 换算依据
 * @returns 毫秒延迟
 */
export function staggerDelayMs(order: number, timing: StaggerTiming): number {
  return Math.round(Math.min(order * timing.step, timing.cap))
}

/**
 * 给会露面的元素逐个下发淡入延迟
 *
 * 只写延迟、不点亮——点亮要等撑开动作跑完，否则元素会在容器还没撑开时就淡入
 * @param root - 折叠体的内容根节点
 * @param timing - 换算依据
 */
export function planStaggerUnits(root: StaggerRoot, timing: StaggerTiming): void {
  visibleUnits(root).forEach((unit, order) => {
    unit.style.setProperty(COLLAPSE_VARS.delay, `${staggerDelayMs(order, timing)}ms`)
  })
}

/** 过渡结束事件里我们关心的那两栏 */
export interface TransitionLikeEvent {
  target?: unknown
  propertyName?: string
}

/** 展开动作结束的通知口；只用到添加/移除监听这点能力 */
export interface ExpandWatcher {
  addEventListener(type: string, listener: (event: TransitionLikeEvent) => void): void
  removeEventListener(type: string, listener: (event: TransitionLikeEvent) => void): void
}

/** 兜底计时所需的定时器能力；只为可测而收窄 */
export interface RevealTimer {
  setTimeout(handler: () => void, ms: number): number
  clearTimeout(id: number): void
}

/** 真实环境里的定时器 */
const REAL_TIMER: RevealTimer = {
  setTimeout: (handler, ms) => window.setTimeout(handler, ms),
  clearTimeout: (id) => window.clearTimeout(id),
}

export interface ScheduleAfterExpandOptions {
  /** 撑开动作的时长 */
  duration: number
  /**
   * 等撑开走到这个比例时动手，取 0..1
   *
   * `1` 表示等完全撑开，`0` 表示立刻动手。比例 < 1 时只能靠定时器——`transitionend`
   * 只在结束那一刻才来，回不到过去；比例 = 1 则认事件，过渡真正结束才算数，标签页被
   * 降频或主线程被占住时也停在正确的时刻
   */
  lead?: number | undefined
  /** 动手时调用 */
  onExpandDone: () => void
  /** 定时器能力，缺省用真实环境 */
  timer?: RevealTimer | undefined
}

/**
 * 等撑开动作跑到预定比例再执行后续动作
 *
 * 比例 = 1（默认）时认容器的 `transitionend`：过渡真正结束的时刻才算数，标签页被
 * 降频或主线程被占住时也停在正确的时刻。定时器只作兜底——`prefers-reduced-motion`
 * 下过渡被关掉、事件不会来，没有兜底元素会永远停在透明
 *
 * 比例 < 1 时反过来以定时器为准，`transitionend` 退居兜底
 * @param shell - 承载撑开过渡的容器
 * @param options - 时长、比例、后续动作与定时器
 * @returns 取消这次等待；取消后定时器会被清掉，后续动作不再执行
 */
export function scheduleAfterExpand(
  shell: ExpandWatcher,
  options: ScheduleAfterExpandOptions,
): () => void {
  const { duration, onExpandDone } = options
  // 比例越界时夹回区间：调用点给错值不该把等待算成负数或超出整段
  const lead = Math.min(Math.max(options.lead ?? 1, 0), 1)
  const timer = options.timer ?? REAL_TIMER
  let settled = false
  let fallback: number | undefined

  const finish = (): void => {
    if (settled) return
    settled = true
    shell.removeEventListener('transitionend', onEnd)
    if (fallback !== undefined) timer.clearTimeout(fallback)
    onExpandDone()
  }

  function onEnd(event: TransitionLikeEvent): void {
    // 只认容器自己的轨道过渡：内层 clip 的 visibility 过渡也会冒泡到这里
    if (event.target !== shell || event.propertyName !== EXPAND_PROPERTY) return
    finish()
  }

  shell.addEventListener('transitionend', onEnd)
  fallback = timer.setTimeout(
    finish,
    lead < 1 ? duration * lead : duration + FALLBACK_SLACK_MS,
  )

  return () => {
    if (settled) return
    settled = true
    shell.removeEventListener('transitionend', onEnd)
    if (fallback !== undefined) timer.clearTimeout(fallback)
  }
}

/** 是否要求减少动态效果 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface CollapsibleBodyProps {
  /** 展开态；收起时轨道收成 0 高 */
  open: boolean
  /** 折叠体内容，通常是 `.wg-workspace-body` 或 `.wg-sessions` */
  children: ReactNode
  /**
   * 折叠动画的节奏；缺省用 {@link DEFAULT_COLLAPSE_MOTION}
   *
   * 只覆盖传入的字段，未传的取默认值
   */
  motion?: Partial<CollapseMotion> | undefined
}

export function CollapsibleBody({ open, children, motion }: CollapsibleBodyProps): ReactElement {
  const shell = useRef<HTMLDivElement | null>(null)
  const clip = useRef<HTMLDivElement | null>(null)
  const wasOpen = useRef(open)
  /** 本层是否已走完撑开、可以淡入 */
  const [settled, setSettled] = useState(true)
  /** 取消「撑开后淡入」这次等待 */
  const cancelReveal = useRef<(() => void) | null>(null)

  // 节奏参数只用于换算，不必进依赖：中途改它不该取消已经在跑的等待
  const resolved = { ...DEFAULT_COLLAPSE_MOTION, ...motion }
  const motionRef = useRef(resolved)
  motionRef.current = resolved

  // 祖先此刻是否已点亮；本层要不要亮还要看自己的展开与撑开进度
  const ancestorsRevealed = useContext(RevealContext)
  const justOpened = open && !wasOpen.current

  /**
   * 在渲染期就把「还没点亮」传下去
   *
   * layout effect 是子组件先跑，等到 effect 里再改状态就已经晚了：内层早已先跑过
   * 一轮，会抢在撑开期间把自己点亮，整段淡入都落在裁剪区里。React 允许在渲染期按
   * props 调整状态，它会立刻重渲染，子树因此读到新值
   *
   * 减少动态效果时容器不做撑开动作、没有可等的过渡，因此不进入这个状态
   */
  if (justOpened && settled && !prefersReducedMotion()) setSettled(false)

  useLayoutEffect(() => {
    const root = clip.current
    const outer = shell.current
    if (root === null || outer === null) return
    wasOpen.current = open

    if (!open) {
      // 收起：撤掉等待。显隐类由渲染的 context 决定，这里不必也不该去动它
      cancelReveal.current?.()
      cancelReveal.current = null
      return
    }

    // 自己这次展开：先记下这一批的先后，等撑开跑完再按它点亮
    if (justOpened) {
      planStaggerUnits(root, { step: motionRef.current.step, cap: motionRef.current.cap })
    }

    // 撑开中：等它跑完才轮到点亮。已经在等就不重复排期
    if (!settled && cancelReveal.current === null) {
      cancelReveal.current = scheduleAfterExpand(outer, {
        duration: motionRef.current.duration,
        // 只有一个元素时强制等完全撑开，见 resolveLead
        lead: resolveLead(root, motionRef.current.lead),
        onExpandDone: () => setSettled(true),
      })
    }
  })

  // 卸载时取消等待，免得定时器醒来去碰已摘除的节点
  useLayoutEffect(() => {
    return () => {
      cancelReveal.current?.()
      cancelReveal.current = null
    }
  }, [])

  // 三层都满足才点亮：自己展开着、自己的撑开已跑完、祖先也已点亮
  const revealed = open && settled && ancestorsRevealed

  return (
    <RevealContext.Provider value={revealed}>
      <div
        className={'wg-collapse' + (open ? ' wg-collapse-open' : '')}
        style={collapseMotionVars(resolved)}
        ref={shell}
      >
        <div className="wg-collapse-clip" ref={clip}>
          {children}
        </div>
      </div>
    </RevealContext.Provider>
  )
}
