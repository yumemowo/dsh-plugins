/**
 * 浮层面板的定位与开合
 *
 * 本包自绘的两张面板（视图选项、工作区选择器）共用这一套：贴触发器下缘展开、放不下翻到上方、两个方向都夹进窗口
 * 指针离开延迟关闭——触发器与面板之间隔着 `ANCHOR_GAP`，不留这段延迟用户还没点到条目菜单就没了
 * 点面板与触发器之外关闭，Escape 关闭并把焦点还给触发器，方向键在面板里的可停点之间循环
 *
 * 量的是布局视口（`documentElement.clientWidth`）而不是 `window.innerWidth`：二者差一个经典滚动条宽度，而实测矩形以布局视口为参照
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** 面板与窗口边缘的最小距离，取官方 `Menu` 原语的同一个值 */
const VIEWPORT_MARGIN = 12

/** 面板与触发器之间的缝隙，同上 */
const ANCHOR_GAP = 4

/** 指针离开后延迟多久关闭，取官方 `Menu` 原语那套的 200ms */
const CLOSE_DELAY_MS = 200

/** 只认上下方向键时的键集，模块级单例，避免每次渲染换一份新数组 */
const VERTICAL_KEYS = ['ArrowDown', 'ArrowUp'] as const

/** 面板落点 */
export interface PanelRect {
  left: number
  top: number
}

export interface FloatingPanelOptions {
  open: boolean
  /** 触发器元素，面板贴它的下缘展开 */
  triggerRef: RefObject<HTMLElement | null>
  onClose: () => void
  /** 面板与触发器左缘对齐，还是与右缘对齐 */
  align: 'start' | 'end'
  /** 方向键循环时要停的那些可聚焦元素 */
  focusable: string
  /** 参与循环的键，缺省只认上下方向键 */
  navigationKeys?: readonly string[] | undefined
}

export interface FloatingPanel {
  panelRef: RefObject<HTMLDivElement>
  /** 落点，首次渲染还没量过时为 null，调用方据此先藏起来 */
  rect: PanelRect | null
  /** 取消一次待关闭：指针回到触发器或面板上 */
  cancelClose: () => void
  /** 安排一次延迟关闭 */
  armClose: () => void
}

/** 按下的键决定下一个可停点，不参与循环时返回 undefined */
function nextIndex(key: string, at: number, length: number): number | undefined {
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  const step = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : undefined
  if (step === undefined) return undefined
  return at < 0 ? 0 : (at + step + length) % length
}

export function useFloatingPanel({
  open,
  triggerRef,
  onClose,
  align,
  focusable,
  navigationKeys = VERTICAL_KEYS,
}: FloatingPanelOptions): FloatingPanel {
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<PanelRect | null>(null)
  const closeTimer = useRef<number | null>(null)

  /** 面板贴触发器下缘展开，放不下就翻到上方，并在两个方向上都夹进窗口 */
  const measure = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (trigger === null || panel === null) return
    const anchor = trigger.getBoundingClientRect()
    const width = panel.offsetWidth
    const height = panel.offsetHeight
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    let left = align === 'end' ? anchor.right - width : anchor.left
    let top = anchor.bottom + ANCHOR_GAP
    if (height > 0 && top + height > viewportHeight - VIEWPORT_MARGIN) {
      top = anchor.top - height - ANCHOR_GAP
    }
    if (width > 0) {
      left = Math.min(Math.max(left, VIEWPORT_MARGIN), viewportWidth - width - VIEWPORT_MARGIN)
    }
    if (height > 0) {
      top = Math.min(Math.max(top, VIEWPORT_MARGIN), viewportHeight - height - VIEWPORT_MARGIN)
    }
    // 相等时保留上一次的对象：滚动与改尺寸都会重测，每次换新对象会让面板每帧重渲染
    setRect((prev) =>
      prev !== null && prev.left === left && prev.top === top ? prev : { left, top },
    )
  }, [align, triggerRef])

  useLayoutEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    measure()
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    // 面板高度会随语言与文案变化，落点要跟着重算
    // jsdom 没有 ResizeObserver，它只影响即时性，缺了不影响正确性
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    if (panelRef.current !== null) observer?.observe(panelRef.current)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [open, measure])

  const cancelClose = useCallback(() => {
    if (closeTimer.current === null) return
    window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }, [])

  const armClose = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      onClose()
    }, CLOSE_DELAY_MS)
  }, [cancelClose, onClose])

  useEffect(() => () => cancelClose(), [cancelClose])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return
      if (panelRef.current?.contains(event.target) === true) return
      if (triggerRef.current?.contains(event.target) === true) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        triggerRef.current?.focus()
        return
      }
      if (!navigationKeys.includes(event.key)) return
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(focusable) ?? [],
      )
      if (items.length === 0) return
      const next = nextIndex(event.key, items.indexOf(document.activeElement as HTMLElement), items.length)
      if (next === undefined) return
      event.preventDefault()
      items[next]?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, triggerRef, focusable, navigationKeys])

  return { panelRef, rect, cancelClose, armClose }
}
