/**
 * 拖到边缘时的自动滚动
 *
 * 原生拖放自带的边缘滚动只在贴着边缘的十几像素里生效，滚轮又在拖拽期间被浏览器吞掉，
 * 因此这一段是本包自己补的。滚错方向或滚不停在界面上都不报错，
 * 只表现为「拖着会话翻不到列表另一头」，所以这里把带宽、方向、速度与「不该滚」逐条钉住
 *
 * 全是不碰 DOM 的算术，容器矩形与指针位置都直接给数
 */
import { describe, expect, it } from 'vitest'
import { SCROLL_MAX_SPEED, SCROLL_REACH, autoScrollStep } from '../src/client/data/scroll.ts'
import type { ScrollBox } from '../src/client/data/scroll.ts'

/** 一个上下都够长的容器 */
function box(top: number, bottom: number, left = 0, right = 300): ScrollBox {
  return { top, bottom, left, right }
}

/** 容器中线上的一点 */
function centreOf(target: ScrollBox): { x: number; y: number } {
  return { x: (target.left + target.right) / 2, y: (target.top + target.bottom) / 2 }
}

/** 一帧 60Hz 的时长 */
const FRAME = 1000 / 60

describe('picking the container to scroll', () => {
  it('scrolls nothing while the pointer sits in the middle of the container', () => {
    const target = box(100, 700)

    const decision = autoScrollStep({ boxes: [target], pointer: centreOf(target), elapsedMs: FRAME })

    expect(decision).toEqual({ index: -1, step: 0 })
  })

  it('scrolls down once the pointer enters the band above the bottom edge', () => {
    const target = box(100, 700)
    const pointer = { x: 150, y: 700 - (SCROLL_REACH - 4) }

    const decision = autoScrollStep({ boxes: [target], pointer, elapsedMs: FRAME })

    expect(decision.index).toBe(0)
    expect(decision.step).toBeGreaterThan(0)
  })

  it('scrolls up once the pointer enters the band below the top edge', () => {
    const target = box(100, 700)
    const pointer = { x: 150, y: 100 + (SCROLL_REACH - 4) }

    const decision = autoScrollStep({ boxes: [target], pointer, elapsedMs: FRAME })

    expect(decision.index).toBe(0)
    expect(decision.step).toBeLessThan(0)
  })

  it('keeps scrolling while the pointer is pushed just past the bottom edge', () => {
    // 用户最常见的那一手：指针推到容器下缘之外一点。窗口底缘之下没有别的东西可推，因此这一档离边缘很近
    const target = box(100, 700)
    const pointer = { x: 150, y: 700 + 8 }

    const decision = autoScrollStep({ boxes: [target], pointer, elapsedMs: FRAME })

    expect(decision.index).toBe(0)
    expect(decision.step).toBeGreaterThan(0)
  })

  it('leaves the container alone once the pointer is far past the edge', () => {
    const target = box(100, 700)
    const pointer = { x: 150, y: 700 + SCROLL_REACH + 50 }

    expect(autoScrollStep({ boxes: [target], pointer, elapsedMs: FRAME }).index).toBe(-1)
  })

  it('ignores a container the pointer is not horizontally over', () => {
    // 侧栏之外是会话区：指针移到那一边不该把侧栏滚起来
    const target = box(100, 700, 0, 300)
    const pointer = { x: 400, y: 698 }

    expect(autoScrollStep({ boxes: [target], pointer, elapsedMs: FRAME }).index).toBe(-1)
  })

  it('takes the innermost of two nested containers the pointer is inside', () => {
    // 置顶区排在会话列表上方且各自独立滚动，指针同时落在两者范围内时该滚里面的那一个
    const outer = box(0, 900)
    const inner = box(100, 500)
    const pointer = { x: 150, y: 494 }

    expect(autoScrollStep({ boxes: [outer, inner], pointer, elapsedMs: FRAME }).index).toBe(1)
  })

  it('takes the nearer container when the pointer sits in the gap between two', () => {
    // 上下相邻的两个容器之间有一道缝，指针停在缝里会同时落进上方的下带与下方的上带
    // 缝要比触发带窄，两边才都够得着；此时该滚离得更近的那一个
    const above = box(0, 300)
    const below = box(310, 700)
    const pointer = { x: 150, y: 306 }

    expect(autoScrollStep({ boxes: [above, below], pointer, elapsedMs: FRAME }).index).toBe(1)
  })

  it('reads no container out of an empty list', () => {
    expect(
      autoScrollStep({ boxes: [], pointer: { x: 10, y: 10 }, elapsedMs: FRAME }).index,
    ).toBe(-1)
  })
})

describe('how far one frame scrolls', () => {
  it('scrolls faster the deeper the pointer is inside the band', () => {
    const target = box(100, 700)
    const shallow = autoScrollStep({
      boxes: [target],
      pointer: { x: 150, y: 700 - (SCROLL_REACH - 2) },
      elapsedMs: FRAME,
    })
    const deep = autoScrollStep({
      boxes: [target],
      pointer: { x: 150, y: 700 - 1 },
      elapsedMs: FRAME,
    })

    expect(deep.step).toBeGreaterThan(shallow.step)
  })

  it('caps the speed at the edge', () => {
    const target = box(100, 700)
    // 贴着边缘连续跑一秒，位移不该超过上限
    let moved = 0
    for (let frame = 0; frame < 60; frame += 1) {
      moved += autoScrollStep({
        boxes: [target],
        pointer: { x: 150, y: 700 },
        elapsedMs: FRAME,
      }).step
    }

    expect(moved).toBeLessThanOrEqual(SCROLL_MAX_SPEED * 1.05)
    expect(moved).toBeGreaterThan(SCROLL_MAX_SPEED * 0.9)
  })

  it('moves at least one pixel a frame just inside the band', () => {
    // 刚进带时按比例算下来不足一个像素，四舍五入成零会让「进了带却不动」
    const target = box(100, 700)
    const decision = autoScrollStep({
      boxes: [target],
      pointer: { x: 150, y: 700 - (SCROLL_REACH - 1) },
      elapsedMs: 1,
    })

    expect(decision.step).toBe(1)
  })

  it('scrolls further in a longer frame', () => {
    const target = box(100, 700)
    const pointer = { x: 150, y: 700 - 4 }
    const short = autoScrollStep({ boxes: [target], pointer, elapsedMs: 8 })
    const long = autoScrollStep({ boxes: [target], pointer, elapsedMs: 32 })

    expect(long.step).toBeGreaterThan(short.step)
  })

  it('scrolls nothing when the frame carries no time', () => {
    const target = box(100, 700)

    expect(
      autoScrollStep({ boxes: [target], pointer: { x: 150, y: 699 }, elapsedMs: 0 }),
    ).toEqual({ index: -1, step: 0 })
  })

  it('gives each half its own band when the container is shorter than two bands', () => {
    // 太矮的容器里两条带会在中间重叠，那时各取一半：宁可带子窄，也不要一处向上、一处向下互相抵消
    const target = box(100, 140)
    const upper = autoScrollStep({
      boxes: [target],
      pointer: { x: 110, y: 102 },
      elapsedMs: FRAME,
    })
    const lower = autoScrollStep({
      boxes: [target],
      pointer: { x: 110, y: 138 },
      elapsedMs: FRAME,
    })

    expect(upper.step).toBeLessThan(0)
    expect(lower.step).toBeGreaterThan(0)
  })

  it('scrolls nothing in the middle of a container too short for two bands', () => {
    // 两个半带之间那道空白正是「各取一半」的意思：不分开的话中线附近会两向皆可，一直滚不停
    const target = box(100, 140)

    expect(
      autoScrollStep({ boxes: [target], pointer: { x: 110, y: 120 }, elapsedMs: FRAME }),
    ).toEqual({ index: -1, step: 0 })
  })

  it('reads one flat band out of a container with no height', () => {
    expect(
      autoScrollStep({
        boxes: [box(200, 200)],
        pointer: { x: 10, y: 200 },
        elapsedMs: FRAME,
      }).index,
    ).toBe(-1)
  })
})
