// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useHoverMarquee } from '../src/client/hooks/useHoverMarquee.ts'

/**
 * 跑马灯把省略号摘掉的时机
 *
 * 文字移出期间省略号会压在中间那截字身上，读起来是「字中间夹了三个点」
 * 因此它必须在位移开始那一刻就消失，而不是等文字挪开、也不是等回位时才处理
 * 静止时仍要留着它：被裁掉的地方需要一个「后面还有」的标记
 */

/** 排队等待执行的帧回调 */
const pendingFrames: FrameRequestCallback[] = []

/** 每一帧前进的毫秒数 */
const FRAME_STEP_MS = 1_000

let frameClock = 0

/** 把一帧跑完 */
async function tick(): Promise<void> {
  frameClock += FRAME_STEP_MS
  const callbacks = pendingFrames.splice(0)
  await act(async () => {
    for (const callback of callbacks) callback(frameClock)
  })
}

/** 一格被裁掉的文字，溢出宽度由用例指定 */
function stubWidths(element: HTMLElement, overflow: number): void {
  Object.defineProperty(element, 'scrollWidth', { value: 100 + overflow, configurable: true })
  Object.defineProperty(element, 'clientWidth', { value: 100, configurable: true })
  Object.defineProperty(element, 'scrollTo', { value: undefined, configurable: true })
}

function Harness({ overflow }: { overflow: number }): React.ReactElement {
  const ref = React.useRef<HTMLSpanElement>(null)
  const marquee = useHoverMarquee(ref)
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

async function mount(overflow: number): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(React.createElement(Harness, { overflow }))
  })
  const title = container.querySelector<HTMLElement>('[data-wg-test-title]')
  if (title === null) throw new Error('harness did not render the title')
  return title
}

/** 指针进入 */
async function enter(title: HTMLElement): Promise<void> {
  await act(async () => {
    title.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse', relatedTarget: document.body }),
    )
  })
}

/** 指针离开 */
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

describe('useHoverMarquee ellipsis state', () => {
  it('marks the title as marqueeing before the first frame runs', async () => {
    // 位移第一帧才动，省略号却要在进入那一刻就没有
    // 等第一帧才置标记的话，起步那一下省略号还压在右缘
    const title = await mount(60)
    expect(title.dataset.marquee).toBeUndefined()

    await enter(title)

    expect(title.dataset.marquee).toBe('')
    // 这一刻文字还在起点：标记与位置是两件事
    expect(title.scrollLeft).toBe(0)
  })

  it('keeps the marker through the whole travel and drops it on leave', async () => {
    const title = await mount(60)

    await enter(title)
    await tick()
    expect(title.dataset.marquee).toBe('')

    await leave(title)
    // 回位即回静止态：省略号重新出现，与位移期间互斥
    expect(title.dataset.marquee).toBeUndefined()
    expect(title.scrollLeft).toBe(0)
  })

  it('never marks a title that barely overflows', async () => {
    // 溢出小到不值得挪，那一趟只是一次抖动，省略号因此不该消失
    const title = await mount(4)

    await enter(title)
    await tick()

    expect(title.dataset.marquee).toBeUndefined()
  })
})
