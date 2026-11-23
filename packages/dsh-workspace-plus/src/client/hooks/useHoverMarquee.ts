/**
 * 悬停跑马灯：把被格子裁掉的一行文字横向移出来
 *
 * 只有真的溢出、且移得出有意义一段距离时才动（见 {@link MIN_REVEAL_PX}）
 * 指针离开立刻回原位，因为静止态那个省略号与变窄的格子在文字挪回来的路上会撞上它
 *
 * 逐帧脚本而不是 CSS 动画：这段位移的时长取决于量出来的溢出宽度，而长度只有进入那一刻才知道
 * 折行、缩放、字体加载都会改它，写死在样式表里迟早对不上
 *
 * 与业务无关，因此收在 `hooks/` 下
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PointerEvent, RefObject } from 'react'

/** 这么小的溢出藏不住有意义的尾巴，为它爬一趟看起来只是抖动 */
const MIN_REVEAL_PX = 8

/** 移出速度，慢到能在经过时读清那行字 */
const PX_PER_MS = 0.03

/** 一条行上跑马灯的进出入口，展开到行元素上 */
export interface HoverMarquee {
  /** 开始移出，触摸指针与本来就不溢出的文字什么也不做 */
  readonly onPointerEnter: (event: PointerEvent) => void
  /** 一步回原位 */
  readonly onPointerLeave: () => void
}

/**
 * 把文字的滚动位置放好，并写下样式表读的两格淡出钩子
 *
 * `data-scrolled` 表示文字已离开起点（左缘淡出），`data-clipped` 表示右侧还有字没露出来（右缘淡出）
 * `data-marquee` 标记「正在移出」，由开始那一刻置上而不是等第一帧
 * 省略号固在右缘，留在那儿会压在挪到中间的半截字身上，因此这一态一置上就得摘掉它
 * @param text - 行上那个裁剪文字的元素
 * @param left - 滚动位置，CSS 像素
 * @param range - 这个元素的最大滚动距离，CSS 像素
 */
function place(text: HTMLElement, left: number, range: number): void {
  // jsdom 不实现 scrollTo，那里直接赋值同样是瞬时的，两条路径落在同一位置
  if (typeof text.scrollTo === 'function') text.scrollTo({ left, behavior: 'instant' })
  else text.scrollLeft = left
  if (left > 0) text.dataset.scrolled = ''
  else delete text.dataset.scrolled
  if (left < range) text.dataset.clipped = ''
  else delete text.dataset.clipped
}

/**
 * 把文字送回静止态：回到起点、三个钩子都摘掉，静止的省略号因此以全强度显示
 * @param text - 行上那个裁剪文字的元素
 */
function rest(text: HTMLElement): void {
  if (typeof text.scrollTo === 'function') text.scrollTo({ left: 0, behavior: 'instant' })
  else text.scrollLeft = 0
  delete text.dataset.scrolled
  delete text.dataset.clipped
  delete text.dataset.marquee
}

/**
 * 指针停在行上时把溢出的文字移出来
 *
 * 溢出不超过 {@link MIN_REVEAL_PX} 的不动，只被裁掉几个像素的文字挪一点点看起来像抖动，不像揭示
 * 减少动态效果时直接跳到最右端，不逐帧爬
 * @param text - 行上那个裁剪文字的引用
 * @param options.hold - 指针不在行上时也保持移出，用于行菜单开着的情形
 * @returns 稳定的进入与离开处理函数
 */
export function useHoverMarquee(
  text: RefObject<HTMLElement | null>,
  { hold = false }: { hold?: boolean } = {},
): HoverMarquee {
  const frame = useRef(0)
  const revealing = useRef(false)
  const hovered = useRef(false)
  const held = useRef(hold)

  const stop = useCallback((): void => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])

  /** 按「指针在行上」与「被留住」两格决定移出还是回位 */
  const sync = useCallback((): void => {
    const element = text.current
    const wanted = hovered.current || held.current
    if (!wanted) {
      if (!revealing.current) return
      revealing.current = false
      stop()
      if (element !== null) rest(element)
      return
    }
    /* v8 ignore next -- defensive: 标题元素无条件渲染 */
    if (element === null || revealing.current) return
    const range = element.scrollWidth - element.clientWidth
    if (range <= MIN_REVEAL_PX) return
    revealing.current = true
    // 先从第一帧之前就置上：省略号要在这段位移开始时就摘掉，而不是等文字挪开
    element.dataset.marquee = ''
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      place(element, range, range)
      return
    }
    stop()
    let previous: number | undefined
    let position = 0
    const step = (now: DOMHighResTimeStamp): void => {
      position += previous === undefined ? 0 : (now - previous) * PX_PER_MS
      previous = now
      place(element, Math.min(position, range), range)
      if (position < range) frame.current = requestAnimationFrame(step)
      else frame.current = 0
    }
    frame.current = requestAnimationFrame(step)
  }, [stop, text])

  useEffect(() => () => {
    stop()
  }, [stop])

  // 菜单开合这类外部状态变化也要重新判一次：指针可能早就离开了行
  useEffect(() => {
    held.current = hold
    sync()
  }, [hold, sync])

  return useMemo(
    () => ({
      onPointerEnter: (event?: PointerEvent): void => {
        if (event?.pointerType === 'touch') return
        hovered.current = true
        sync()
      },
      onPointerLeave: (): void => {
        hovered.current = false
        sync()
      },
    }),
    [sync],
  )
}
