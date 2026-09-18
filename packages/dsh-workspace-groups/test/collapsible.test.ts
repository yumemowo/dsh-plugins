import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  planStaggerUnits,
  resolveLead,
  staggerDelayMs,
} from '../src/client/components/CollapsibleBody.tsx'
import type { StaggerTiming } from '../src/client/components/CollapsibleBody.tsx'

/**
 * 逐个淡入的排期与延迟
 *
 * 这几个函数只依赖「查元素 + 写元素」这点能力，接口因此收窄成结构类型，
 * node 环境用替身即可验证——真正要看的是延迟排期、哪些元素被排除，以及
 * 「撑开那段等待也在延迟里」的换算，不需要一个完整的 DOM
 */

/**
 * 按类名判断一个选择器是否命中
 *
 * 只实现本包用到的形式：`.cls` 与 `.cls:not(.other)`。替身**必须真的解释选择器**：
 * 漏掉点的 `wg-collapse` 是标签选择器，匹配不到 `<div class="wg-collapse">`，那种错
 * 只有真解释选择器才抓得到
 * @param classes - 节点拥有的类名
 * @param selector - 待判断的选择器
 * @returns 命中为 true
 */
function matchesClasses(classes: Set<string>, selector: string): boolean {
  const base = /^\.([\w-]+)/.exec(selector)
  if (base === null || !classes.has(base[1] ?? '')) return false
  const excluded = /:not\(\.([\w-]+)\)/.exec(selector)
  if (excluded !== null && classes.has(excluded[1] ?? '')) return false
  return true
}

interface FakeNode {
  classes: Set<string>
  parentElement: FakeNode | null
  matches(selector: string): boolean
}

/** 造一个节点 */
function fakeNode(classes: string[], parent: FakeNode | null): FakeNode {
  const owned = new Set(classes)
  return {
    classes: owned,
    parentElement: parent,
    matches: (selector) => matchesClasses(owned, selector),
  }
}

/** 仍收着的嵌套折叠体 */
function closedBody(parent: FakeNode | null): FakeNode {
  return fakeNode(['wg-collapse'], parent)
}

/** 展开着的嵌套折叠体 */
function openBody(parent: FakeNode | null): FakeNode {
  return fakeNode(['wg-collapse', 'wg-collapse-open'], parent)
}

interface FakeUnit extends FakeNode {
  style: { setProperty(name: string, value: string): void }
  /** 当前延迟值；没排过期时为 undefined */
  delay: string | undefined
}

/** 造一个元素替身；`parent` 是它的父节点，用来表达嵌套层级 */
function unit(parent: FakeNode | null = null): FakeUnit {
  const node: FakeUnit = {
    ...fakeNode([], parent),
    delay: undefined,
    style: {
      setProperty: (name, value) => {
        if (name === '--wg-collapse-delay') node.delay = value
      },
    },
  }
  return node
}

/** 造一个容器替身：折叠体本身，带展开态 */
function root(
  units: FakeUnit[],
  classes: string[] = ['wg-collapse', 'wg-collapse-open'],
): { querySelectorAll(selectors: string): ArrayLike<FakeUnit> } & FakeNode {
  return {
    ...fakeNode(classes, null),
    querySelectorAll: () => units,
  }
}

/**
 * 造一个场景：本次展开的容器，以及挂在它下面的元素
 * @param hiddenIndexes - 这些下标的元素改挂到仍收着的嵌套折叠体下
 */
function scene(
  count: number,
  hiddenIndexes: number[] = [],
): { root: ReturnType<typeof root>; units: FakeUnit[] } {
  const units: FakeUnit[] = []
  const container = root(units)
  for (let i = 0; i < count; i += 1) {
    const parent = hiddenIndexes.includes(i) ? closedBody(container) : container
    units.push(unit(parent))
  }
  return { root: container, units }
}

const TIMING: StaggerTiming = { step: 16, cap: 160 }

describe('staggerDelayMs', () => {
  it('spaces the elements by the step', () => {
    expect([0, 1, 2, 3].map((n) => staggerDelayMs(n, TIMING))).toEqual([0, 16, 32, 48])
  })

  it('caps the delay so a long list does not wait indefinitely', () => {
    expect(staggerDelayMs(100, TIMING)).toBe(160)
  })

  it('never returns a negative delay', () => {
    expect(staggerDelayMs(0, TIMING)).toBe(0)
  })
})

describe('planStaggerUnits', () => {
  it('numbers the delays in document order', () => {
    const { root: container, units } = scene(3)

    planStaggerUnits(container, TIMING, 0)

    expect(units.map((u) => u.delay)).toEqual(['0ms', '16ms', '32ms'])
  })

  it('adds the expand wait to every delay', () => {
    const { root: container, units } = scene(2)

    // 撑开那段等待是绝对量：元素在它之后才开始淡入，因此逐元素加上去。样式因此只
    // 消费一个值，不必再把两段时长拼一次，也就不存在两处各写一份时长而失配
    planStaggerUnits(container, TIMING, 90)

    expect(units.map((u) => u.delay)).toEqual(['90ms', '106ms'])
  })

  it('keeps the cap independent of the expand wait', () => {
    const { root: container, units } = scene(20)

    // 上限只压元素之间的先后，不该把撑开那段等待也一起压掉
    planStaggerUnits(container, TIMING, 90)

    expect(units[19]?.delay).toBe(`${90 + TIMING.cap}ms`)
  })

  it('skips elements inside a still-closed nested body', () => {
    const { root: container, units } = scene(3, [1])

    planStaggerUnits(container, TIMING, 0)

    // 藏起来的元素不占号，否则它后面的元素会被推得更晚
    expect(units.map((u) => u.delay)).toEqual(['0ms', undefined, '16ms'])
  })
})

describe('resolveLead', () => {
  it('waits for the whole expand when only one element will show', () => {
    const { root: container } = scene(1)

    // 只有一个元素时提前起步没有任何好处：唯一那段缓动会被藏进裁剪区
    expect(resolveLead(container, 0.25)).toBe(1)
  })

  it('honours the configured lead once more than one element shows', () => {
    const { root: container } = scene(2)

    // 多于一个时收尾紧凑与否才可感知，交给配置决定
    expect(resolveLead(container, 0.25)).toBe(0.25)
  })

  it('ignores elements that this open will not show', () => {
    const { root: container } = scene(2, [1])

    // 藏起来的元素不露面，不该把它算进来：本次实际只有一个元素，因此等完全撑开
    expect(resolveLead(container, 0.25)).toBe(1)
  })

  it('counts the elements of an open nested body', () => {
    const { root: container, units } = scene(2)
    units[0]!.parentElement = openBody(container)

    // 内部展开着的嵌套体里的元素同样属于本次这一批
    expect(resolveLead(container, 0.25)).toBe(0.25)
  })

  it('waits for the whole expand when nothing will show', () => {
    const { root: container } = scene(0)

    expect(resolveLead(container, 0.25)).toBe(1)
  })
})

describe('nested visibility', () => {
  it('keeps the delays of an open nested body in the same sequence', () => {
    const { root: container, units } = scene(2)
    // 外层展开会连内部展开着的嵌套体一起排期，它们同属一批
    units[0]!.parentElement = openBody(container)

    planStaggerUnits(container, TIMING, 0)

    expect(units.map((u) => u.delay)).toEqual(['0ms', '16ms'])
  })

  it('leaves the elements of a closed nested body out of the sequence', () => {
    // 收着的嵌套体里的元素此刻根本看不见：不给延迟，免得它自己展开时淡入已经走完
    const { root: container, units } = scene(2)
    units[0]!.parentElement = closedBody(container)

    planStaggerUnits(container, TIMING, 0)

    expect([units[0]?.delay, units[1]?.delay]).toEqual([undefined, '0ms'])
  })

  it('recognises a closed body by class rather than by tag name', () => {
    // 选择器漏掉点会变成标签选择器，匹配不到 <div class="wg-collapse">，
    // 「祖先仍收着」的判定因此整条失效
    const outer = fakeNode(['wg-collapse'], null)
    const inner = closedBody(outer)
    const inside = unit(inner)

    expect(inside.matches('.wg-collapse:not(.wg-collapse-open)')).toBe(false)
    expect(inner.matches('.wg-collapse:not(.wg-collapse-open)')).toBe(true)
    expect(inner.matches('wg-collapse')).toBe(false)
  })
})

describe('fail-open reveal', () => {
  /**
   * 读组件源码；显隐是否 fail-open 是**结构性**的，只能从源码断言
   * @returns 去掉了注释的源码
   */
  function componentSource(): string {
    return readFileSync(
      new URL('../src/client/components/CollapsibleBody.tsx', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '')
  }

  it('never leaves an element hidden behind a callback that may not wake up', () => {
    // 透明一旦写进基准规则，就得靠某个回调在正确时刻把类补回去。那次唤醒在主线程被
    // 长任务占住时会被挤掉且补不回来——元素会一直白着，这正是卡死的现象。因此这里
    // 不得有任何会过期的显隐状态，也不得靠定时器或过渡事件驱动显隐
    const source = componentSource()

    expect(source).not.toMatch(/useState/)
    expect(source).not.toMatch(/transitionend/)
    expect(source).not.toMatch(/setTimeout/)
    expect(source).not.toMatch(/classList\.(add|remove)/)
  })

  it('schedules delays in a layout effect so the first frame is already correct', () => {
    // 延迟必须和展开态的样式变更落在同一次样式计算里；放到普通 effect 里元素会先以
    // 没有延迟的状态亮一帧，逐个淡入的开头因此丢掉
    expect(componentSource()).toMatch(/useLayoutEffect/)
  })

  it('derives the expand wait from the shared duration instead of a second copy', () => {
    // 撑开那段等待若另写一个数字，改时长就会失配：容器先撑完而元素还没开始淡入，
    // 或元素在容器还收着时就把淡入用掉
    expect(componentSource()).toMatch(/duration \* resolveLead\(/)
  })
})
