// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useHoverMarquee } from '../src/client/hooks/useHoverMarquee.ts'

/**
 * 悬停跑马灯
 *
 * jsdom 不做布局，`scrollWidth` / `clientWidth` 恒为 0
 * 因此这里手工给出「文字比格子宽多少」，否则溢出判定永远为假，用例会静默变成空转
 * 帧循环用替身驱动，让位移在用例里同步走完，不必等真实时间
 */

/** 排队等待执行的帧回调，由下面的替身收集 */
const pendingFrames: FrameRequestCallback[] = []

/** 每一帧前进的毫秒数，足够把任意测试用的位移走完 */
const FRAME_STEP_MS = 1_000

/** 已经过去的帧时间，逐帧累加 */
let frameClock = 0

/**
 * 把一帧跑完
 *
 * 钩子的步进函数读的是回调参数，因此必须把时间戳往前推，否则位置永远不增加
 */
async function tick(): Promise<void> {
  frameClock += FRAME_STEP_MS
  const callbacks = pendingFrames.splice(0)
  await act(async () => {
    for (const callback of callbacks) callback(frameClock)
  })
}

/** 连跑若干帧 */
async function frames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await tick()
}

/** 一格被裁掉的文字，溢出宽度由用例指定 */
function stubWidths(element: HTMLElement, overflow: number): void {
  Object.defineProperty(element, 'scrollWidth', { value: 100 + overflow, configurable: true })
  Object.defineProperty(element, 'clientWidth', { value: 100, configurable: true })
  // jsdom 的 scrollTo 只记一个空操作，换成直接写 scrollLeft 才读得回来
  Object.defineProperty(element, 'scrollTo', { value: undefined, configurable: true })
}

/** 把钩子挂到一个可断言的元素上，指针事件由用例自己派发 */
function Harness({ overflow, hold }: { overflow: number; hold: boolean }): React.ReactElement {
  const ref = React.useRef<HTMLSpanElement>(null)
  const marquee = useHoverMarquee(ref, { hold })
  React.useLayoutEffect(() => {
    if (ref.current !== null) stubWidths(ref.current, overflow)
  })
  return React.createElement(
    'span',
    {
      ref,
      'data-wg-test-title': '',
      onPointerEnter: marquee.onPointerEnter,
      onPointerLeave: marquee.onPointerLeave,
    },
    'x'.repeat(200),
  )
}

const roots: { unmount: () => void }[] = []

/** 挂载一格标题，返回可派发事件的元素 */
async function mount(overflow: number, hold = false): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(React.createElement(Harness, { overflow, hold }))
  })
  const title = container.querySelector<HTMLElement>('[data-wg-test-title]')
  if (title === null) throw new Error('harness did not render the title')
  return title
}

/**
 * 指针进入
 *
 * React 的 `onPointerEnter` 不是原生事件：它由 `pointerover` 合成，`relatedTarget` 在行外即视为进入
 * 直接派发 `pointerenter` 收不到任何回调，用例会静默变成空转
 * @param title - 被悬停的元素
 * @param pointerType - 指针类型，触摸指针应当被忽略
 */
async function enter(title: HTMLElement, pointerType = 'mouse'): Promise<void> {
  await act(async () => {
    title.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType, relatedTarget: document.body }),
    )
  })
}

/**
 * 指针离开
 * @param title - 被悬停的元素
 */
async function leave(title: HTMLElement): Promise<void> {
  await act(async () => {
    title.dispatchEvent(
      new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
    )
  })
}

beforeEach(() => {
  pendingFrames.length = 0
  frameClock = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pendingFrames.push(callback)
    return pendingFrames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrames.length = 0
  })
})

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

describe('useHoverMarquee', () => {
  it('moves an overflowing title aside while the pointer rests on the row', async () => {
    const title = await mount(60)

    await enter(title)
    await frames(3)

    // 走到最右端：位置等于溢出距离，右缘那一档淡出因此撤掉
    expect(title.scrollLeft).toBe(60)
    expect(title.dataset.scrolled).toBe('')
    expect(title.dataset.clipped).toBeUndefined()
  })

  it('takes the first frame as the timestamp baseline instead of moving on it', async () => {
    const title = await mount(60)

    await enter(title)
    await tick()
    // 第一帧只记下起点时间，位移从第二帧开始算：没有上一帧就没有经过的时间
    expect(title.scrollLeft).toBe(0)

    await tick()
    expect(title.scrollLeft).toBeGreaterThan(0)
    expect(title.scrollLeft).toBeLessThan(60)
    // 已经把起点甩在身后，左缘因此淡出，右边还有字没露出来，右缘也淡
    expect(title.dataset.scrolled).toBe('')
    expect(title.dataset.clipped).toBe('')
  })

  it('returns the title to its start when the pointer leaves', async () => {
    const title = await mount(60)

    await enter(title)
    await frames(2)
    await leave(title)

    expect(title.scrollLeft).toBe(0)
    expect(title.dataset.scrolled).toBeUndefined()
    expect(title.dataset.clipped).toBeUndefined()
  })

  it('leaves a barely clipped title where it is', async () => {
    const title = await mount(4)

    await enter(title)
    await frames(2)

    // 只被裁掉几个像素的文字挪一点点看起来像抖动，不算揭示
    expect(title.scrollLeft).toBe(0)
    expect(title.dataset.scrolled).toBeUndefined()
  })

  it('ignores a touch pointer', async () => {
    const title = await mount(60)

    await enter(title, 'touch')
    await frames(2)

    // 触摸没有悬停这回事，指尖离开后文字还得停在原处
    expect(title.scrollLeft).toBe(0)
  })

  it('keeps the title aside while the marquee is held', async () => {
    // 行菜单开着时面板是 portal 到 body 的浮层，指针移上去时行已经不再悬停
    // 保持移出状态，面板关掉之前标题不会跳回起点
    const title = await mount(60, true)

    await enter(title)
    await frames(3)
    await leave(title)
    await frames(1)

    expect(title.scrollLeft).toBe(60)
    expect(title.dataset.scrolled).toBe('')
  })
})
