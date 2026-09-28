/**
 * header 里「视图选项」那个按钮打开的自绘弹出菜单
 *
 * 官方原语 `Menu` 的条目只有「前导图标 → 文案 → 尾部选中标记」三个槽，表达不了「一个开关」
 * 因此照官方菜单面板的外观与交互约定自绘一份，规矩与 `WorkspacePickerMenu` 同一套：
 * 贴触发器下缘展开、放不下翻到上方、两个方向都夹进窗口、指针离开延迟关闭、点外/Escape 关闭、方向键在条目间移动
 *
 * 面板是不透明浮层，底色与描边必须用官方菜单面板那套 token（见样式表），否则 token 名写错时面板会变透明而界面不会报错
 *
 * 内容分两组：上面是展示方式（两条互斥的可选项，行尾以勾标记当前值），下面是子工作区嵌套开关
 * 两组之间用一条分隔线隔开，与官方把「分组方式」和「排序方式」分成两段的做法一致
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement, RefObject } from 'react'
import {
  IconBarIndicator16,
  IconDotIndicator16,
} from '../icons.tsx'
import {
  IconCheckOutlineRegular,
  IconFlatListOutlineRegular,
  IconFolderCloseRegular,
  IconWorkspaceTreeOutlineRegular,
  Switch,
} from '../runtime.ts'
import type { IndicatorStyle, ViewMode } from '../data/types.ts'
import { useLocale } from '../useLocale.ts'
import { useLocalViewOptions } from '../useLocalViewOptions.ts'
import styles from './ViewOptionsMenu.module.css'

/** 面板与窗口边缘的最小距离，取官方 `Menu` 原语的同一个值 */
const VIEWPORT_MARGIN = 12

/** 面板与触发器之间的缝隙，同上 */
const ANCHOR_GAP = 4

/** 指针离开后延迟多久关闭，同上 */
const CLOSE_DELAY_MS = 200

/** 面板落点 */
interface PanelRect {
  left: number
  top: number
}

/**
 * 展示方式的两个取值，按面板里的先后
 *
 * 图标与官方那组「分组方式」同字形：按工作区是文件夹，平铺是一条列表
 */
const VIEW_MODES: readonly {
  mode: ViewMode
  icon: ReactElement
}[] = [
  { mode: 'workspace', icon: <IconFolderCloseRegular /> },
  { mode: 'flat', icon: <IconFlatListOutlineRegular /> },
]

/**
 * 指示器样式的两个取值，按面板里的先后
 *
 * 与展示方式那一组同形：标题 + 两条互斥可选项，行尾以勾标记当前值
 */
const INDICATOR_STYLES: readonly {
  style: IndicatorStyle
  icon: ReactElement
}[] = [
  { style: 'icon', icon: <IconDotIndicator16 /> },
  { style: 'bar', icon: <IconBarIndicator16 /> },
]

export interface ViewOptionsMenuProps {
  /** 菜单是否打开，开合状态由持有触发器的 header 持有 */
  open: boolean
  /** 触发器元素，面板贴它的下缘展开 */
  triggerRef: RefObject<HTMLElement>
  /** 另一组设置：子工作区嵌套开关。它是分组元数据，随快照往返，因此仍由区域容器下发 */
  nesting: {
    /** 当前是否开启 */
    enabled: boolean
    onToggle: () => void
  }
  onClose: () => void
}

export function ViewOptionsMenu({
  open,
  triggerRef,
  nesting,
  onClose,
}: ViewOptionsMenuProps): ReactElement | null {
  const { labels } = useLocale()
  const { mode, indicator, setMode, setIndicator } = useLocalViewOptions()
  const viewMode = labels.viewMode
  const indicatorLabels = labels.indicatorStyle
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
    // 量的是布局视口（documentElement.clientWidth）而不是 window.innerWidth
    // 二者差一个经典滚动条宽度，而实测矩形以布局视口为参照
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    let left = anchor.right - width
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
  }, [triggerRef])

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

  /** 取消一次待关闭：指针回到触发器或面板上 */
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

  // 点面板与触发器之外关闭，Escape 关闭并把焦点还给触发器
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
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      // 可选行与开关自己都是可聚焦控件，这一列就是全部可停点
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          `.${styles.viewOptionRow}, .${styles.viewOptionSwitch}`,
        ) ?? [],
      )
      if (items.length === 0) return
      const at = items.indexOf(document.activeElement as HTMLElement)
      const next = at < 0 ? 0 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      event.preventDefault()
      items[next]?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, triggerRef])

  if (!open) return null

  /** 两条可选行的文案 */
  const modeLabel = (candidate: ViewMode): string =>
    candidate === 'flat' ? viewMode.flat : viewMode.workspace

  const styleLabel = (candidate: IndicatorStyle): string =>
    candidate === 'bar' ? indicatorLabels.bar : indicatorLabels.icon

  return createPortal(
    <div
      ref={panelRef}
      className={styles.viewMenu}
      role="group"
      aria-label={labels.add.viewOptions}
      // 首次渲染时还没量过，先藏起来，否则面板会先在窗口左上角露一帧再跳到落点
      style={
        rect === null ? { visibility: 'hidden', left: 0, top: 0 } : { left: rect.left, top: rect.top }
      }
      onPointerEnter={cancelClose}
      onPointerLeave={armClose}
    >
      {/* 展示方式：标题 + 两条互斥的可选项 */}
      <>
        <div className={styles.viewGroupLabel}>{viewMode.label}</div>
        {VIEW_MODES.map(({ mode: candidate, icon }) => {
          const selected = candidate === mode
          return (
            <button
              key={candidate}
              type="button"
              className={styles.viewOptionRow}
              aria-pressed={selected}
              onClick={() => setMode(candidate)}
            >
              <span className={styles.viewOptionIcon}>{icon}</span>
              <span className={styles.viewOptionLabel}>{modeLabel(candidate)}</span>
              {selected ? <IconCheckOutlineRegular className={styles.viewOptionCheck} /> : null}
            </button>
          )
        })}
      </>
      <div className={styles.viewSeparator} role="separator" />
      {/* 指示器：与展示方式同形，两条互斥的可选项 */}
      <>
        <div className={styles.viewGroupLabel}>{indicatorLabels.label}</div>
        {INDICATOR_STYLES.map(({ style: candidate, icon }) => {
          const selected = candidate === indicator
          return (
            <button
              key={candidate}
              type="button"
              className={styles.viewOptionRow}
              aria-pressed={selected}
              onClick={() => setIndicator(candidate)}
            >
              <span className={styles.viewOptionIcon}>{icon}</span>
              <span className={styles.viewOptionLabel}>{styleLabel(candidate)}</span>
              {selected ? <IconCheckOutlineRegular className={styles.viewOptionCheck} /> : null}
            </button>
          )
        })}
      </>
      <div className={styles.viewSeparator} role="separator" />
      {/* 子工作区嵌套：行不可点——`Switch` 自己已是按钮，嵌进可点的行会叠两层控件 */}
      <div className={styles.viewOption}>
        <span className={styles.viewOptionIcon}>
          {/* 官方在视图选项里就是用这个字形标「按工作区树分组」，而本条开关控制的正是子工作区的树形渲染 */}
          <IconWorkspaceTreeOutlineRegular />
        </span>
        <span className={styles.viewOptionLabel}>{labels.nested.setting}</span>
        <Switch
          checked={nesting.enabled}
          label={labels.nested.setting}
          className={styles.viewOptionSwitch}
          onChange={() => nesting.onToggle()}
        />
      </div>
    </div>,
    document.body,
  )
}
