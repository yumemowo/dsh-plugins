import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  planStaggerUnits,
  resolveLead,
  staggerDelayMs,
  scheduleAfterExpand,
} from '../src/client/components/CollapsibleBody.tsx'
import type {
  RevealTimer,
  StaggerTiming,
  TransitionLikeEvent,
} from '../src/client/components/CollapsibleBody.tsx'

/**
 * 逐个淡入的排期与显隐
 *
 * 这几个函数只依赖「查元素 + 读写元素」这点能力，接口因此收窄成结构类型，
 * node 环境用替身即可验证——真正要看的是延迟排期、哪些元素被排除，以及
 * 「撑开跑完才淡入」的时序，不需要一个完整的 DOM
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
  classList: { add(token: string): void; remove(token: string): void }
  style: { setProperty(name: string, value: string): void }
  /** 当前延迟值；没排过期时为 undefined */
  delay: string | undefined
  revealed: boolean
}

/** 造一个元素替身；`parent` 是它的父节点，用来表达嵌套层级 */
function unit(parent: FakeNode | null = null): FakeUnit {
  const node: FakeUnit = {
    ...fakeNode([], parent),
    delay: undefined,
    revealed: false,
    classList: {
      add: (token) => {
        if (token === 'wg-reveal') node.revealed = true
      },
      remove: (token) => {
        if (token === 'wg-reveal') node.revealed = false
      },
    },
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

/** 可手动推进的定时器替身；记下被请求的延时，便于断言提前量 */
function fakeTimer(): RevealTimer & { fire(): void; pending(): boolean; delay(): number | undefined } {
  let handler: (() => void) | undefined
  let wait: number | undefined
  return {
    setTimeout: (fn, ms) => {
      handler = fn
      wait = ms
      return 1
    },
    clearTimeout: () => {
      handler = undefined
      wait = undefined
    },
    fire: () => handler?.(),
    pending: () => handler !== undefined,
    delay: () => wait,
  }
}

/** 可手动触发过渡结束的容器替身 */
function fakeShell(): {
  addEventListener(type: string, fn: (e: TransitionLikeEvent) => void): void
  removeEventListener(type: string, fn: (e: TransitionLikeEvent) => void): void
  end(propertyName: string, target?: unknown): void
  listenerCount(): number
} {
  const listeners = new Set<(e: TransitionLikeEvent) => void>()
  const shell = {
    addEventListener: (_type: string, fn: (e: TransitionLikeEvent) => void) => {
      listeners.add(fn)
    },
    removeEventListener: (_type: string, fn: (e: TransitionLikeEvent) => void) => {
      listeners.delete(fn)
    },
    end: (propertyName: string, target?: unknown) => {
      for (const fn of [...listeners]) fn({ propertyName, target: target ?? shell })
    },
    listenerCount: () => listeners.size,
  }
  return shell
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

    planStaggerUnits(container, TIMING)

    expect(units.map((u) => u.delay)).toEqual(['0ms', '16ms', '32ms'])
  })

  it('skips elements inside a still-closed nested body', () => {
    const { root: container, units } = scene(3, [1])

    planStaggerUnits(container, TIMING)

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

    planStaggerUnits(container, TIMING)

    expect(units.map((u) => u.delay)).toEqual(['0ms', '16ms'])
  })

  it('leaves the elements of a closed nested body out of the sequence', () => {
    // 收着的嵌套体里的元素此刻根本看不见：不给延迟，免得它自己展开时淡入已经走完
    const { root: container, units } = scene(2)
    units[0]!.parentElement = closedBody(container)

    planStaggerUnits(container, TIMING)

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

describe('reveal class ownership', () => {
  it('hands the reveal class to the elements through context, not by writing DOM', () => {
    // className 归 React 所有：行内状态一变（菜单开合）React 会整体重写它。命令式
    // 挂上去的类会被抹掉，而父组件不会因此重渲染、补不回来——表现为该行卡在透明，
    // 反复补挂则是闪烁。因此显隐类只能由元素自己在渲染时产出
    const source = readFileSync(
      new URL('../src/client/components/CollapsibleBody.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain('export function useStaggerReveal')
    // 折叠体不得从外部改元素的 classList
    expect(source).not.toMatch(/classList\.(add|remove)/)
  })

  it('exposes the reveal suffix only when context allows it', () => {
    // hook 的返回值直接拼进 className，因此必须是「带前导空格的后缀或空串」
    const source = readFileSync(
      new URL('../src/client/components/CollapsibleBody.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain('` ${REVEAL_CLASS}`')
  })
})

describe('scheduleAfterExpand', () => {
  it('waits for the expand transition to end before acting', () => {
    const shell = fakeShell()
    const timer = fakeTimer()
    let done = 0

    scheduleAfterExpand(shell, { duration: 180, onExpandDone: () => (done += 1), timer })
    expect(done).toBe(0)

    shell.end('grid-template-rows')

    expect(done).toBe(1)
  })

  it('ignores transitions bubbled up from the inner clip', () => {
    const shell = fakeShell()
    const timer = fakeTimer()
    let done = 0

    scheduleAfterExpand(shell, { duration: 180, onExpandDone: () => (done += 1), timer })
    // 内层 clip 的 visibility 过渡会冒泡到容器，认错就会提前淡入
    shell.end('visibility', {})
    expect(done).toBe(0)

    shell.end('grid-template-rows')
    expect(done).toBe(1)
  })

  it('falls back to a timer when no transition event ever arrives', () => {
    const shell = fakeShell()
    const timer = fakeTimer()
    let done = 0

    // 关掉动画时过渡事件不会来，没有兜底元素会永远停在透明
    scheduleAfterExpand(shell, { duration: 180, onExpandDone: () => (done += 1), timer })
    timer.fire()

    expect(done).toBe(1)
  })

  it('acts exactly once even when both the event and the timer arrive', () => {
    const shell = fakeShell()
    const timer = fakeTimer()
    let done = 0

    scheduleAfterExpand(shell, { duration: 180, onExpandDone: () => (done += 1), timer })
    shell.end('grid-template-rows')
    timer.fire()

    expect(done).toBe(1)
  })

  it('waits until the expand is over before acting by default', () => {
    const shell = fakeShell()
    const timer = fakeTimer()

    scheduleAfterExpand(shell, { duration: 180, onExpandDone: () => {}, timer })

    // 默认 lead = 1，等过渡结束；定时器只是兜底，因此要多留一点宽限
    expect(timer.delay()).toBe(180 + 60)
  })

  it('acts at the given fraction of the expand', () => {
    const shell = fakeShell()
    const timer = fakeTimer()
    let done = 0

    scheduleAfterExpand(shell, {
      duration: 200,
      lead: 0.25,
      onExpandDone: () => (done += 1),
      timer,
    })

    // 比例 < 1 时定时器说了算，`transitionend` 退居兜底
    expect(timer.delay()).toBe(50)
    timer.fire()
    expect(done).toBe(1)
  })

  it('acts immediately at a lead of zero', () => {
    const shell = fakeShell()
    const timer = fakeTimer()

    scheduleAfterExpand(shell, { duration: 180, lead: 0, onExpandDone: () => {}, timer })

    expect(timer.delay()).toBe(0)
  })

  it('clamps a negative lead to zero', () => {
    const shell = fakeShell()
    const timer = fakeTimer()

    scheduleAfterExpand(shell, { duration: 180, lead: -0.5, onExpandDone: () => {}, timer })

    expect(timer.delay()).toBe(0)
  })

  it('clamps a lead above one to waiting for the whole expand', () => {
    const shell = fakeShell()
    const timer = fakeTimer()

    // 比例超过区间时按「等完全撑开」处理，等待不该超出整段
    scheduleAfterExpand(shell, { duration: 180, lead: 3, onExpandDone: () => {}, timer })

    expect(timer.delay()).toBe(180 + 60)
  })

  it('drops the listener once the expand has been handled', () => {
    const shell = fakeShell()
    const timer = fakeTimer()

    scheduleAfterExpand(shell, { duration: 180, onExpandDone: () => {}, timer })
    expect(shell.listenerCount()).toBe(1)

    shell.end('grid-template-rows')

    // 留着监听会在后续每次重渲染里被反复触发
    expect(shell.listenerCount()).toBe(0)
    expect(timer.pending()).toBe(false)
  })

  it('cancels the pending action and cleans up', () => {
    const shell = fakeShell()
    const timer = fakeTimer()
    let done = 0

    const cancel = scheduleAfterExpand(shell, {
      duration: 180,
      onExpandDone: () => (done += 1),
      timer,
    })
    cancel()

    // 收起动作会取消等待；取消后既不该回调，也不该留下监听或定时器
    shell.end('grid-template-rows')
    timer.fire()
    expect(done).toBe(0)
    expect(shell.listenerCount()).toBe(0)
    expect(timer.pending()).toBe(false)
  })
})
