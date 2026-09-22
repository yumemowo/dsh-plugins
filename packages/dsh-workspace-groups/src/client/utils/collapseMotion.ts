/**
 * 折叠动画的节奏参数与自定义属性名
 *
 * 单独成一个模块，因为样式表与组件都要用：值在本模块只有一份，样式表把它插进 CSS 回退值，组件把它下发成内联自定义属性，两边因此不可能漂移
 *
 * 不放进组件模块是为了不让样式表依赖 React——反过来组件日后若要引用样式表（例如取标签 id），直接互相 import 就成环了
 */
import type { CSSProperties } from 'react'

/**
 * 折叠动画的自定义属性名
 *
 * 样式表与组件共用同一份：名字也写两遍的话，改一处漏一处同样会静默失配
 */
export const COLLAPSE_VARS = {
  /** 容器撑开与收回的时长，也是「撑开后开始淡入」的等待时长 */
  duration: '--wg-collapse-duration',
  /** 缓动曲线，容器与淡入共用 */
  easing: '--wg-collapse-easing',
  /** 单个元素淡入淡出的时长 */
  fade: '--wg-collapse-fade',
  /** 逐元素不同的淡入延迟；由组件量出来单独下发，样式只消费 */
  delay: '--wg-collapse-delay',
} as const

/** 折叠动画的节奏参数；单位一律毫秒，缓动直接给 CSS 的 timing function */
export interface CollapseMotion {
  /** 容器撑开与收回的时长 */
  duration: number
  /** 缓动曲线，容器与淡入共用 */
  easing: string
  /** 单个元素淡入淡出的时长 */
  fade: number
  /** 相邻元素淡入延迟的间隔 */
  step: number
  /** 淡入延迟的上限，防止元素很多时末尾等太久 */
  cap: number
  /**
   * 淡入起点在撑开过程中的位置，取 0..1 的比例；默认 `1` 即等容器完全撑开
   *
   * 只在会露面的元素多于一个时生效：只有一个元素时总是等完全撑开，那时提前淡入没有任何好处，只会把唯一那段缓动藏进裁剪区
   *
   * 小于 `1` 的值会让这个比例之后才露出的元素有一段淡入落在裁剪区内，因此 `1` 是唯一能保证每个元素的淡入都完整可见的取值
   */
  lead: number
}

/**
 * 默认节奏
 *
 * 时长与缓动取官方侧边栏的值（官方 `.18s` 与 `--ds-ease-in-out`）
 */
export const DEFAULT_COLLAPSE_MOTION: CollapseMotion = {
  duration: 180,
  easing: 'var(--ds-ease-in-out, ease-in-out)',
  fade: 200,
  step: 16,
  cap: 160,
  lead: 0.5,
}

/**
 * 把节奏参数摊成根节点上的自定义属性
 *
 * 自定义属性会继承，内层 clip 与每个元素因此都读得到，不必逐层下发
 * 延迟不进这里——它逐元素不同，由折叠体量出来单独下发
 * @returns 可直接挂到 `.wg-collapse` 上的内联样式
 */
export function collapseMotionVars(motion: CollapseMotion): CSSProperties {
  return {
    [COLLAPSE_VARS.duration]: `${motion.duration}ms`,
    [COLLAPSE_VARS.easing]: motion.easing,
    [COLLAPSE_VARS.fade]: `${motion.fade}ms`,
  } as CSSProperties
}
