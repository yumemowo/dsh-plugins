// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { DndProvider, useDnd } from '../src/client/hooks/useDnd.ts'
import { SCROLL_ATTRIBUTE } from '../src/client/data/protocol.ts'
import type { DragPlan } from '../src/client/data/protocol.ts'
import { fire } from './support/dndDom.ts'

/**
 * 拖拽期间跟着指针自动滚动
 *
 * 这一段是本包自己补的：原生拖放自带的边缘滚动只在贴着边缘的十几像素里生效，
 * 而滚轮在拖拽期间被浏览器吞在自己的拖放循环里，事件根本不到页面
 *
 * 滚错方向、停不下来、滚动之后把落点留在旧位置，三种毛病在界面上都不报错，
 * 只表现为「拖着会话翻不到列表另一头」或「松手放进了滚之前那一格」，
 * 因此这里逐条断言容器的 `scrollTop` 与滚动之后落点标记落在哪
 *
 * jsdom 不做版式（`scrollHeight` 恒为 0、`getBoundingClientRect()` 恒为零矩形），
 * 因此容器的高度、矩形与 `scrollTop` 的夹取都由替身给出
 */

/** 收到提交时记一笔，用来验证滚动之后提交的是滚之后那一格 */
const commits: string[] = []

/** 造一份计划：一个整块档的落点区域 */
function planOf(zoneKeys: readonly string[]): DragPlan {
  const targets = new Map(
    zoneKeys.map((key) => [
      key,
      { mode: 'container' as const, commit: () => commits.push(key) },
    ]),
  )
  return { source: { kind: 'session', id: 'row-1' }, targets }
}

/**
 * 把一个元素做成可滚容器
 *
 * jsdom 里 `scrollTop` 不夹取，不夹的话「已经贴到那一头」这个分支永远走不到
 * 溢出样式要显式给：jsdom 不做层叠，内联之外的样式一律读成 `visible`，那样整表都会被排除
 * @param element - 目标元素
 * @param top - 视口纵坐标上缘
 * @param bottom - 视口纵坐标下缘
 * @param overflowY - 溢出样式，缺省 `auto`
 */
function makeScrollable(
  element: HTMLElement,
  top: number,
  bottom: number,
  overflowY: 'auto' | 'hidden' = 'auto',
): void {
  element.style.overflowY = overflowY
  let scrollTop = 0
  Object.defineProperty(element, 'scrollHeight', { value: 2000, configurable: true })
  Object.defineProperty(element, 'clientHeight', { value: bottom - top, configurable: true })
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      top,
      bottom,
      left: 0,
      right: 300,
      height: bottom - top,
      width: 300,
      x: 0,
      y: top,
    }),
    configurable: true,
  })
  Object.defineProperty(element, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, Math.min(1500, value))
    },
    configurable: true,
  })
}

/** 一棵最小树：一个可滚容器，里面是落点区域与一条可拖的行 */
function Harness({ zoneKeys, plan }: { zoneKeys: readonly string[]; plan: DragPlan }): React.ReactElement {
  const { dndZoneProps, dndRowProps } = useDnd()
  const dnd = dndRowProps('row-1', () => plan)
  return React.createElement(
    'div',
    { [SCROLL_ATTRIBUTE]: '' },
    React.createElement(
      'div',
      dndZoneProps(zoneKeys[0] as string),
      React.createElement(
        'div',
        { [SCROLL_ATTRIBUTE]: '' },
        zoneKeys.slice(1).map((key) =>
          React.createElement('div', { key, ...dndZoneProps(key) }),
        ),
        React.createElement(
          'div',
          {
            'data-wg-dnd-row': dnd.rowId,
            draggable: true,
            onDragStart: dnd.onDragStart,
            onDragEnd: dnd.onDragEnd,
          },
          '会话一',
        ),
      ),
    ),
  )
}

/** 挂上树并交出容器与卸载入口 */
async function mount(zoneKeys: readonly string[]): Promise<{
  root: ReturnType<typeof createRoot>
  container: HTMLElement
}> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(
        DndProvider,
        null,
        React.createElement(Harness, { zoneKeys, plan: planOf(zoneKeys) }),
      ),
    )
  })
  return { root, container }
}

/** 树上第 n 个挂了滚动标记的元素 */
function scrollerAt(container: HTMLElement, index: number): HTMLElement {
  const found = container.querySelectorAll<HTMLElement>(`[${SCROLL_ATTRIBUTE}]`)[index]
  if (found === undefined) throw new Error(`no scroll container at ${index}`)
  return found
}

/** 那条可拖的行，先起拖才能谈自动滚动 */
function dragRow(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('[data-wg-dnd-row]')
  if (found === null) throw new Error('no draggable row')
  return found
}

/**
 * 先起拖，再把指针放到某处并推进若干帧
 *
 * `dragstart` 必须派发到行自己身上：派发到祖先上不会触发行的 `onDragStart`，拖拽根本没开始
 * @param container - 挂载容器
 * @param point - 指针位置
 * @param ms - 推进的毫秒数
 * @param over - 收到 `dragover` 的元素，缺省取最外层容器
 */
function dragAndHold(
  container: HTMLElement,
  point: { x: number; y: number },
  ms: number,
  over?: Element,
): void {
  fire(dragRow(container), 'dragstart')
  fire(over ?? scrollerAt(container, 0), 'dragover', point)
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

afterEach(() => {
  commits.length = 0
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('the container that follows the pointer', () => {
  it('scrolls down while the pointer sits in the band above the bottom edge', async () => {
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)

    dragAndHold(container, { x: 150, y: 695 }, 96)

    expect(outer.scrollTop).toBeGreaterThan(0)
    await act(async () => root.unmount())
  })

  it('scrolls up while the pointer sits in the band below the top edge', async () => {
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)
    // 先把容器推到中段，向上滚才有得减
    outer.scrollTop = 600

    dragAndHold(container, { x: 150, y: 105 }, 96)

    expect(outer.scrollTop).toBeLessThan(600)
    await act(async () => root.unmount())
  })

  it('leaves the container alone while the pointer sits in the middle', async () => {
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)

    dragAndHold(container, { x: 150, y: 400 }, 160)

    expect(outer.scrollTop).toBe(0)
    await act(async () => root.unmount())
  })

  it('stops scrolling once the drag ends', async () => {
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)
    dragAndHold(container, { x: 150, y: 695 }, 96)
    const scrolled = outer.scrollTop
    expect(scrolled).toBeGreaterThan(0)

    fire(dragRow(container), 'dragend')
    act(() => {
      vi.advanceTimersByTime(320)
    })

    // 拖拽结束后循环必须已经停掉，否则列表会在没有拖拽时继续自己滚
    expect(outer.scrollTop).toBe(scrolled)
    await act(async () => root.unmount())
  })

  it('carries no pointer from the previous drag into the next one', async () => {
    // 上一场拖拽把指针留在边缘带上，若不随清理一起忘掉，下一场拖拽在用户还没动指针时就会自己滚起来
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)

    dragAndHold(container, { x: 150, y: 695 }, 96)
    expect(outer.scrollTop).toBeGreaterThan(0)
    fire(dragRow(container), 'dragend')

    // 第二场拖拽：只起拖，还没有任何 `dragover`，因此指针位置无从谈起
    outer.scrollTop = 0
    fire(dragRow(container), 'dragstart')
    act(() => {
      vi.advanceTimersByTime(320)
    })

    expect(outer.scrollTop).toBe(0)
    await act(async () => root.unmount())
  })

  it('yields the frame when something else already scrolled the container', async () => {
    // 原生拖放自带的边缘滚动关不掉，指针贴边时它和本包滚的是同一个容器
    // 那一帧本包若再叠一份，逐帧位移就会在「一份」与「两份」之间来回跳
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)

    fire(dragRow(container), 'dragstart')
    fire(outer, 'dragover', { x: 150, y: 695 })
    // 本包先照常走一帧，记下它写完之后容器停在哪
    act(() => {
      vi.advanceTimersByTime(16)
    })
    const own = outer.scrollTop
    expect(own).toBeGreaterThan(0)

    // 下一次本包读到的值已经被别人推走了，这一帧不该再加自己那份
    outer.scrollTop = own + 40
    act(() => {
      vi.advanceTimersByTime(16)
    })
    expect(outer.scrollTop).toBe(own + 40)

    // 别人停手之后，本包下一帧照常接上
    act(() => {
      vi.advanceTimersByTime(16)
    })
    expect(outer.scrollTop).toBeGreaterThan(own + 40)

    await act(async () => root.unmount())
  })

  it('leaves a container of its own that does not overflow', async () => {
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)
    // 内容没超出：没什么可滚的，指针进带也不该动
    Object.defineProperty(outer, 'scrollHeight', { value: 200, configurable: true })

    dragAndHold(container, { x: 150, y: 695 }, 96)

    expect(outer.scrollTop).toBe(0)
    await act(async () => root.unmount())
  })

  it('leaves a clipped container alone even though it can be scrolled programmatically', async () => {
    // `overflow: hidden` 的元素一样吃 `scrollTop`，滚它会把裁掉的内容在无滚动条的情况下推着走
    // 置顶区展开档静止时正是这一种，因此必须排除
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700, 'hidden')

    dragAndHold(container, { x: 150, y: 695 }, 96)

    expect(outer.scrollTop).toBe(0)
    await act(async () => root.unmount())
  })

  it('scrolls the inner of two nested containers the pointer is inside', async () => {
    vi.useFakeTimers()
    const { root, container } = await mount(['zone'])
    const outer = scrollerAt(container, 0)
    const inner = scrollerAt(container, 1)
    makeScrollable(outer, 100, 700)
    // 内层自己也可滚，且指针同时落在两者范围内：该滚内层
    makeScrollable(inner, 300, 500)

    dragAndHold(container, { x: 150, y: 495 }, 96, inner)

    expect(inner.scrollTop).toBeGreaterThan(0)
    expect(outer.scrollTop).toBe(0)
    await act(async () => root.unmount())
  })

  it('keeps the landing on what the pointer now points at after scrolling', async () => {
    // 程序化滚动不会重派 `dragover`，指针下的元素却已经换了
    // 不重算就会把滚之前那一格提交出去——用户看到的是滚完之后的界面
    vi.useFakeTimers()
    const { root, container } = await mount(['zone', 'moved'])
    const outer = scrollerAt(container, 0)
    makeScrollable(outer, 100, 700)
    const moved = container.querySelector('[data-wg-dnd="moved"]') as HTMLElement

    // 指针下先是原来那一格，滚动之后换成另一格
    let current: Element = container.querySelector('[data-wg-dnd="zone"]') as Element
    Object.defineProperty(document, 'elementFromPoint', {
      value: () => current,
      configurable: true,
    })

    dragAndHold(container, { x: 150, y: 695 }, 16)
    expect(moved.getAttribute('data-wg-drop')).toBeNull()

    current = moved
    act(() => {
      vi.advanceTimersByTime(96)
    })
    expect(moved.getAttribute('data-wg-drop')).toBe('inside')

    fire(moved, 'drop')
    expect(commits).toEqual(['moved'])
    await act(async () => root.unmount())
  })
})
