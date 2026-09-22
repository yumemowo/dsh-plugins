/**
 * 折叠体：展开时向下撑开、收起时收回，内容始终留在文档里
 *
 * 高度走 grid 轨道的 `0fr` ↔ `1fr`：轨道高度由内容自身决定，因此不需要预先知道子元素数量或高度，样式里也不写死任何尺寸
 *
 * 内容常驻是收起动画的前提（卸载掉就没有可收回的东西），visibility 交给样式在轨道合拢后再把内容移出焦点顺序
 *
 * 展开分两段：先把容器撑开，撑开跑完再让元素自上而下逐个淡入
 *
 * 分两段是为了不让两种代价叠在同一时间段：撑开每帧都要重排整棵子树
 * 而一批元素同时做 opacity 过渡又要逐帧重新合成
 *
 * 衔接两段的是一段延迟：撑开那段等待（容器时长 × 起点比例）与逐个淡入的先后相加后一起写进元素的延迟
 * 等待走挂钟时间，主线程被长任务占住时只是晚一点淡入
 *
 * 透明只挂在「所在折叠体还没展开」这一条结构条件上（见 styles.ts），不透明是元素的自然状态
 * 这里只写延迟、不写显隐，因此没有会过期的状态
 *
 * 淡入放在撑开之后还顺带解决了首帧问题：首次展开要付样式与布局的初始化代价
 * 而过渡按挂钟时间推进，等第一帧真的画出来，淡入往往已经过去大半
 *
 * 嵌套时内层要让外层先走完：内层若抢在外层撑开期间点亮，它的元素还在逐渐揭开的裁剪区里
 * 整段淡入都会落在暗处
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  COLLAPSE_VARS,
  DEFAULT_COLLAPSE_MOTION,
  collapseMotionVars,
} from '../utils/collapseMotion.ts'
import type { CollapseMotion } from '../utils/collapseMotion.ts'

// 节奏参数与自定义属性名都定义在 utils/collapseMotion.ts（样式表要用同一份），这里转发给元素组件使用
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

/** 折叠体根节点的类名 */
const BODY_CLASS = 'wg-collapse'

/** 折叠体根节点的选择器 */
const BODY_SELECTOR = `.${BODY_CLASS}`

/** 仍收着的折叠体；落在它里面的元素本次展开不会露面 */
const CLOSED_BODY = `${BODY_SELECTOR}:not(.wg-collapse-open)`

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
  style: { setProperty(name: string, value: string): void }
}

/** 能查元素的容器；真实节点天然满足 */
export interface StaggerRoot extends StaggerAncestor {
  querySelectorAll(selectors: string): ArrayLike<StaggerNode>
}

/**
 * 判断元素此刻是否可见
 *
 * 沿祖先链一路向上找仍收着的折叠体：收着的祖先里的元素根本看不见
 * 给它排期等于把淡入提前用掉，等祖先真的展开时延迟已经过完，淡入不再发生
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
 * @returns 文档序（即视觉上的从上到下）的可见元素
 */
function visibleUnits(root: StaggerRoot): StaggerNode[] {
  return Array.from(root.querySelectorAll(STAGGER_UNIT)).filter(isVisible)
}

/**
 * 取本次展开实际生效的淡入起点比例
 *
 * 只有一个元素时总是等到完全撑开：那时它独占整段淡入，提前起步只会把唯一那段缓动藏进裁剪区，看不到任何好处
 * 元素多于一个时才轮到 `lead` 决定，因为那时收尾紧凑与否才有可感知的差别
 *
 * 判据用「会露面的元素个数」而不是 `children` 的节点数：`children` 可能是几个容器，里面才装着真正参与淡入的元素
 * 反过来收着的嵌套体里的元素本次不露面，也不该算进来
 * @param lead - 配置里的淡入起点比例
 * @returns 0..1 的比例，`1` 表示等完全撑开
 */
export function resolveLead(root: StaggerRoot, lead: number): number {
  return visibleUnits(root).length > 1 ? lead : 1
}

/**
 * 算出某个序号的元素的淡入延迟
 *
 * 撑开跑完时所有元素都已完全可见，因此先后只由序号决定——元素在文档里的位置就是它在视觉上的位置
 * @param order - 该元素在本次露面元素里的序号，从 0 起
 * @returns 毫秒延迟
 */
export function staggerDelayMs(order: number, timing: StaggerTiming): number {
  return Math.round(Math.min(order * timing.step, timing.cap))
}

/**
 * 给会露面的元素逐个下发淡入延迟
 *
 * 写进去的是绝对延迟：撑开那段等待（`waitMs`）加上该元素自己的先后，因此样式只需消费一个值
 * 只写延迟、不写显隐
 */
export function planStaggerUnits(root: StaggerRoot, timing: StaggerTiming, waitMs: number): void {
  visibleUnits(root).forEach((unit, order) => {
    unit.style.setProperty(COLLAPSE_VARS.delay, `${waitMs + staggerDelayMs(order, timing)}ms`)
  })
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
  const clip = useRef<HTMLDivElement | null>(null)
  const wasOpen = useRef(open)

  // 节奏参数只用于换算与下发，不进依赖：中途改它不该让已经在跑的淡入换一套延迟
  const resolved = { ...DEFAULT_COLLAPSE_MOTION, ...motion }
  const motionRef = useRef(resolved)
  motionRef.current = resolved

  // 时长、缓动、淡入时长对所有元素相同，下发一次由自定义属性继承下去
  // 依赖按字段列出，父组件每次重渲染传进来的新对象因此不会让内联样式每帧换一份
  const { duration, easing, fade, step, cap, lead } = resolved
  const vars = useMemo(
    () => collapseMotionVars({ duration, easing, fade, step, cap, lead }),
    [duration, easing, fade, step, cap, lead],
  )

  const justOpened = open && !wasOpen.current

  useLayoutEffect(() => {
    const root = clip.current
    if (root === null) return
    wasOpen.current = open
    if (!justOpened) return

    // 只有这一个元素要露面时等完全撑开，因此先量出这一批里有多少元素，再算等待时长
    // 在布局阶段写，和展开态本身的样式变更落在同一次样式计算里，元素不会先亮一帧
    const current = motionRef.current
    const waitMs = current.duration * resolveLead(root, current.lead)
    planStaggerUnits(root, { step: current.step, cap: current.cap }, waitMs)
  })

  return (
    <div className={'wg-collapse' + (open ? ' wg-collapse-open' : '')} style={vars}>
      <div className="wg-collapse-clip" ref={clip}>
        {children}
      </div>
    </div>
  )
}
