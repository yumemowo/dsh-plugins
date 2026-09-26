/**
 * 工作区下拉菜单：header 两行标题旁那个箭头打开的面板
 *
 * 这一份是本包专用的菜单，不是官方 `Menu` 原语：原语的条目只有「前导图标 → 文案 → 尾部选中标记」三个槽
 * 放不下可折叠的分区头，也放不下挂在条目行尾的第二个按钮（置顶）
 * 这里按原语的外观与交互约定自绘一份：面板的定位与夹取、指针离开关闭、Escape 关闭、方向键在条目间移动，都照原语的做法
 *
 * 无障碍上是展开式弹出层而不是 `role="menu"`，面板里既有可折叠的分区头，也有挂在条目行尾的第二个按钮
 * 而 `role="menu"` 只允许 `menuitem` 一类的子项
 * 分区头与行尾按钮都塞不进那个模型，因此面板取 `role="group"`，触发器只声明 `aria-expanded`
 * 不写 `aria-haspopup`，那等于承诺一个 `menu` 角色。键盘靠自然 Tab 顺序加上下面那套方向键
 *
 * 面板 portal 到 `document.body`：header 自己带 `overflow: hidden`（搜索展开时整行要收拢淡出）
 * 就近渲染的面板会被它整个裁掉
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode, RefObject } from 'react'
import {
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconEditOutlineRegular,
  IconFolderCloseRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconTrashOutlineRegular,
} from '../runtime.ts'
import { IconVirtualFolder16 } from '../icons.tsx'
import { IconButton } from './components/IconButton.tsx'
import { handleRowKeyDown } from './components/rowKeyboard.ts'
import type { PickerEntry, PickerSections } from '../data/picker.ts'
import type { PickerLabels } from '../labels.ts'

/** 面板与窗口边缘的最小距离，取官方 `Menu` 原语的同一个值 */
const VIEWPORT_MARGIN = 12

/** 面板与触发器之间的缝隙，同上 */
const ANCHOR_GAP = 4

/**
 * 指针离开后延迟多久关闭
 *
 * 触发器与面板之间隔着 {@link ANCHOR_GAP}，指针从前者移向后者时会先离开触发器
 * 不留这段延迟的话，用户还没点到条目菜单就没了。取官方 `Menu` 原语那套的 200ms
 */
const CLOSE_DELAY_MS = 200

/** 面板落点 */
interface PanelRect {
  left: number
  top: number
}

export interface WorkspacePickerMenuProps {
  /** 菜单是否打开，开合状态由持有触发器的 header 持有 */
  open: boolean
  /** 触发器元素，面板贴它的下缘展开 */
  triggerRef: RefObject<HTMLElement>
  /** 当前聚焦的条目键，空串表示「全部」 */
  focused: string
  /** 菜单的三个分区 */
  sections: PickerSections
  labels: PickerLabels
  onClose: () => void
  /** 选中一个条目：聚焦它 */
  onSelect: (key: string) => void
  /** 切换一个条目的置顶 */
  onTogglePinned: (key: string) => void
  /** 重命名一个条目，工作区分组与独立工作区各走自己的对话框 */
  onRename: (entry: PickerEntry) => void
  /** 删除一个条目，工作区分组与独立工作区各走自己的确认框 */
  onDelete: (entry: PickerEntry) => void
}

/**
 * 面板里的一行条目
 *
 * 结构与 `WorkspaceRow` 同形，行本身是 `role="button"` 的 div
 * 三枚 16px 操作按钮嵌在行内的操作位里（`.wg-row-actions`）
 * 行的可点区不能做成与按钮并排的两个热区——那样行的可点范围会比看起来窄
 *
 * 行本体必须是 div 而不是 `<button>`，按钮不能嵌按钮，键盘激活因此由 `handleRowKeyDown` 承担
 * 与工作区行同一套（只认行自身拿到焦点的那一次按键，行内按钮的按键不冒泡上来）
 *
 * 三枚操作按钮各管一件事（重命名 / 删除 / 置顶），点击一律 `stopPropagation`，否则会连带聚焦到那个工作区
 *
 * 子工作区按 `entry.depth` 缩进，层级因此在菜单里也读得出来
 */
function PickerRow({
  entry,
  focused,
  pinned,
  labels,
  onSelect,
  onTogglePinned,
  onRename,
  onDelete,
}: {
  entry: PickerEntry
  focused: boolean
  pinned: boolean
  labels: PickerLabels
  onSelect: (key: string) => void
  onTogglePinned: (key: string) => void
  onRename: (entry: PickerEntry) => void
  onDelete: (entry: PickerEntry) => void
}): ReactElement {
  const pinLabel = pinned ? labels.unpin(entry.label) : labels.pin(entry.label)
  return (
    <div
      className="wg-row wg-picker-row"
      role="button"
      tabIndex={0}
      aria-current={focused ? 'true' : undefined}
      // 缩进层级由条目自带，样式按这个属性换算，与列表里的层级步进同一个 16px
      style={{ '--wg-picker-depth': String(entry.depth) } as Record<string, string>}
      onClick={() => onSelect(entry.key)}
      onKeyDown={(event) => handleRowKeyDown(event, () => onSelect(entry.key))}
    >
      <span className="wg-picker-icon">
        {entry.kind === 'virtual' ? <IconVirtualFolder16 /> : <IconFolderCloseRegular />}
      </span>
      <span className="wg-picker-label">{entry.label}</span>
      {/* 选中标记排在操作位之前：操作位是行尾那个只在该行悬停/聚焦时露出的格子
          标记若排在它之后就会被顶得左右移动 */}
      {focused ? <IconCheckOutlineRegular className="wg-picker-check" /> : null}
      <span className="wg-row-actions">
        <IconButton
          ariaLabel={labels.rename(entry.label)}
          icon={<IconEditOutlineRegular />}
          onClick={() => onRename(entry)}
        />
        <IconButton
          ariaLabel={labels.remove(entry.label)}
          icon={<IconTrashOutlineRegular />}
          danger
          onClick={() => onDelete(entry)}
        />
        <IconButton
          ariaLabel={pinLabel}
          icon={pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />}
          pressed={pinned}
          onClick={() => onTogglePinned(entry.key)}
        />
      </span>
    </div>
  )
}

/**
 * 一个可折叠分区（「最近使用」与「置顶」）
 *
 * 展开方向朝下，因此条目就排在这个头下面，不另开一层浮出的二级菜单
 */
function PickerGroup({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}): ReactElement {
  return (
    <section className="wg-picker-section">
      <button
        type="button"
        className="wg-picker-section-head"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="wg-picker-section-title">{title}</span>
        <IconChevronDownOutlineRegular
          className={`wg-picker-caret${expanded ? ' wg-picker-caret-open' : ''}`}
        />
      </button>
      {/* 收起时整段不渲染，而不是留在文档里靠高度收拢：
          这一层没有折叠动画，内容留在文档里只会让键盘还能 Tab 进看不见的条目 */}
      {expanded ? <div className="wg-picker-section-body">{children}</div> : null}
    </section>
  )
}

export function WorkspacePickerMenu({
  open,
  triggerRef,
  focused,
  sections,
  labels,
  onClose,
  onSelect,
  onTogglePinned,
  onRename,
  onDelete,
}: WorkspacePickerMenuProps): ReactElement | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<PanelRect | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
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
    let left = anchor.left
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
    // 相等时保留上一次的对象：滚动与改尺寸都会重测
    // 每次换一个新对象会让面板每帧都重渲染一遍
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
    // 分区展开、置顶项改名都会改变面板高度，落点要跟着重算
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
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      // 可聚焦的条目是行本身（`role="button"` 的 div）与那一个「全部工作区」：
      // 行尾的三枚操作按钮不参与方向键循环，否则按↓会逐枚停在按钮上
      const items = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          '.wg-picker-row, .wg-picker-reset',
        ) ?? [],
      )
      if (items.length === 0) return
      const at = items.indexOf(document.activeElement as HTMLElement)
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : at < 0
              ? 0
              : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
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

  const recentCollapsed = collapsed['recent'] === true
  const pinnedCollapsed = collapsed['pinned'] === true

  return createPortal(
    <div
      ref={panelRef}
      className="wg-picker-menu"
      role="group"
      aria-label={labels.entry}
      // 首次渲染时还没量过，先藏起来，否则面板会先在窗口左上角露一帧再跳到落点
      style={
        rect === null
          ? { visibility: 'hidden', left: 0, top: 0 }
          : { left: rect.left, top: rect.top }
      }
      onPointerEnter={cancelClose}
      onPointerLeave={armClose}
    >
      {/* 「全部工作区」只在已经聚焦时才出现
        * 它是恢复入口，没聚焦时点它不做任何事，留着就是一个点不动的死条目
        *
        * 它不是菜单条目而是一个动作（退出聚焦、回到全部），因此不带选中标记，也不带那三枚操作按钮：这里的「全部」没有可重命名或删除的对象 */}
      {focused === '' ? null : (
        <div className="wg-picker-section">
          <button type="button" className="wg-picker-reset" onClick={() => onSelect('')}>
            <span className="wg-picker-icon">
              <IconFolderCloseRegular />
            </span>
            <span className="wg-picker-label">{labels.all}</span>
          </button>
        </div>
      )}
      {sections.recent.length === 0 ? null : (
        <PickerGroup
          title={labels.recent}
          expanded={!recentCollapsed}
          onToggle={() => setCollapsed((prev) => ({ ...prev, recent: !recentCollapsed }))}
        >
          {sections.recent.map((entry) => (
            <PickerRow
              key={entry.key}
              entry={entry}
              focused={entry.key === focused}
              pinned={sections.pinned.some((item) => item.key === entry.key)}
              labels={labels}
              onSelect={onSelect}
              onTogglePinned={onTogglePinned}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </PickerGroup>
      )}
      {sections.pinned.length === 0 ? null : (
        <PickerGroup
          title={labels.pinned}
          expanded={!pinnedCollapsed}
          onToggle={() => setCollapsed((prev) => ({ ...prev, pinned: !pinnedCollapsed }))}
        >
          {sections.pinned.map((entry) => (
            <PickerRow
              key={entry.key}
              entry={entry}
              focused={entry.key === focused}
              pinned
              labels={labels}
              onSelect={onSelect}
              onTogglePinned={onTogglePinned}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </PickerGroup>
      )}
      {/* 「全部」是这一个菜单的主体，因此不做折叠、也不带标题
        * 它是没有标题时默认的那一栏，而上面两栏的标题正是因为要与它区分才需要
        * 分区之间的那条分隔线仍然画着，因此三栏的边界照旧读得出来 */}
      <section className="wg-picker-section">
        <div className="wg-picker-section-body">
          {sections.all.map((entry) => (
            <PickerRow
              key={entry.key}
              entry={entry}
              focused={entry.key === focused}
              pinned={sections.pinned.some((item) => item.key === entry.key)}
              labels={labels}
              onSelect={onSelect}
              onTogglePinned={onTogglePinned}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      </section>
    </div>,
    document.body,
  )
}
