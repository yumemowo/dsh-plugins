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
import { useState } from 'react'
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
import { useFloatingPanel } from './components/useFloatingPanel.ts'
import { handleRowKeyDown } from './components/rowKeyboard.ts'
import type { PickerEntry, PickerSections } from '../data/picker.ts'
import { ALL_ENTRIES, sameAddress } from '../../rootEntry.ts'
import type { RootEntryAddress } from '../../rootEntry.ts'
import { useLocale } from '../hooks/useLocale.ts'
import pickerStyles from './WorkspacePickerMenu.module.css'
import rowsStyles from './components/rows.module.css'
import clsx from 'clsx'

/**
 * 方向键循环认的键
 *
 * 分区头与置顶让这张面板比视图选项那张长，因此多认 Home / End
 * 模块级单例：每次渲染换一份新数组会让挂监听的 effect 每帧重跑
 */
const NAVIGATION_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const

export interface WorkspacePickerMenuProps {
  /** 菜单是否打开，开合状态由持有触发器的 header 持有 */
  open: boolean
  /** 触发器元素，面板贴它的下缘展开 */
  triggerRef: RefObject<HTMLElement>
  /** 当前聚焦条目的地址，面板按它标出选中项 */
  focused: RootEntryAddress
  /** 菜单的三个分区 */
  sections: PickerSections
  onClose: () => void
  /** 选中一个条目：聚焦它 */
  onSelect: (address: RootEntryAddress) => void
  /** 切换一个条目的置顶 */
  onTogglePinned: (address: RootEntryAddress) => void
  /** 重命名一个条目，工作区分组与独立工作区各走自己的对话框 */
  onRename: (entry: PickerEntry) => void
  /** 删除一个条目，工作区分组与独立工作区各走自己的确认框 */
  onDelete: (entry: PickerEntry) => void
}

/**
 * 面板里的一行条目
 *
 * 结构与 `WorkspaceRow` 同形，行本身是 `role="button"` 的 div
 * 三枚 16px 操作按钮嵌在行内的操作位里（`.rowActions`）
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
  onSelect,
  onTogglePinned,
  onRename,
  onDelete,
}: {
  entry: PickerEntry
  focused: boolean
  pinned: boolean
  onSelect: (address: RootEntryAddress) => void
  onTogglePinned: (address: RootEntryAddress) => void
  onRename: (entry: PickerEntry) => void
  onDelete: (entry: PickerEntry) => void
}): ReactElement {
  const { labels } = useLocale()
  const picker = labels.picker
  const pinLabel = pinned ? picker.unpin(entry.label) : picker.pin(entry.label)
  return (
    <div
      className={clsx(rowsStyles.row, rowsStyles.pickerRow)}
      role="button"
      tabIndex={0}
      aria-current={focused ? 'true' : undefined}
      // 缩进层级由条目自带，样式按这个属性换算，与列表里的层级步进同一个 16px
      style={{ '--wg-picker-depth': String(entry.depth) } as Record<string, string>}
      onClick={() => onSelect(entry.address)}
      onKeyDown={(event) => handleRowKeyDown(event, () => onSelect(entry.address))}
    >
      <span className={pickerStyles.pickerIcon}>
        {entry.kind === 'virtual' ? <IconVirtualFolder16 /> : <IconFolderCloseRegular />}
      </span>
      <span className={pickerStyles.pickerLabel}>{entry.label}</span>
      {/* 选中标记排在操作位之前：操作位是行尾那个只在该行悬停/聚焦时露出的格子
          标记若排在它之后就会被顶得左右移动 */}
      {focused ? <IconCheckOutlineRegular className={pickerStyles.pickerCheck} /> : null}
      <span className={rowsStyles.rowActions}>
        <IconButton
          ariaLabel={picker.rename(entry.label)}
          icon={<IconEditOutlineRegular />}
          onClick={() => onRename(entry)}
        />
        <IconButton
          ariaLabel={picker.remove(entry.label)}
          icon={<IconTrashOutlineRegular />}
          danger
          onClick={() => onDelete(entry)}
        />
        <IconButton
          ariaLabel={pinLabel}
          icon={pinned ? <IconPinFillRegular /> : <IconPinOutlineRegular />}
          pressed={pinned}
          onClick={() => onTogglePinned(entry.address)}
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
    <section className={pickerStyles.pickerSection}>
      <button
        type="button"
        className={pickerStyles.pickerSectionHead}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={pickerStyles.pickerSectionTitle}>{title}</span>
        <IconChevronDownOutlineRegular
          className={clsx(pickerStyles.pickerCaret, expanded && pickerStyles.pickerCaretOpen)}
        />
      </button>
      {/* 收起时整段不渲染，而不是留在文档里靠高度收拢：
          这一层没有撑开动画，内容留在文档里只会让键盘还能 Tab 进看不见的条目 */}
      {expanded ? <div className={pickerStyles.pickerSectionBody}>{children}</div> : null}
    </section>
  )
}

export function WorkspacePickerMenu({
  open,
  triggerRef,
  focused,
  sections,
  onClose,
  onSelect,
  onTogglePinned,
  onRename,
  onDelete,
}: WorkspacePickerMenuProps): ReactElement | null {
  const { labels } = useLocale()
  const picker = labels.picker
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const { panelRef, rect, cancelClose, armClose } = useFloatingPanel({
    open,
    triggerRef,
    onClose,
    align: 'start',
    // 可聚焦的条目是行本身（`role="button"` 的 div）与那一个「全部工作区」
    // 行尾的三枚操作按钮不参与方向键循环，否则按↓会逐枚停在按钮上
    focusable: `.${rowsStyles.pickerRow}, .${pickerStyles.pickerReset}`,
    navigationKeys: NAVIGATION_KEYS,
  })

  if (!open) return null

  const recentExpanded = expanded.recent !== false
  const pinnedExpanded = expanded.pinned !== false

  return createPortal(
    <div
      ref={panelRef}
      className={pickerStyles.pickerMenu}
      role="group"
      aria-label={picker.entry}
      // 首次渲染时还没量过，先藏起来，否则面板会先在窗口左上角露一帧再跳到落点
      style={rect ?? { visibility: 'hidden', left: 0, top: 0 }}
      onPointerEnter={cancelClose}
      onPointerLeave={armClose}
    >
      {/* 「全部工作区」只在已经聚焦时才出现
        * 它是恢复入口，没聚焦时点它不做任何事，留着就是一个点不动的死条目
        *
        * 它不是菜单条目而是一个动作（退出聚焦、回到全部），因此不带选中标记，也不带那三枚操作按钮：这里的「全部」没有可重命名或删除的对象 */}
      {focused.kind === 'all' ? null : (
        <div className={pickerStyles.pickerSection}>
          <button
            type="button"
            className={pickerStyles.pickerReset}
            onClick={() => onSelect(ALL_ENTRIES)}
          >
            <span className={pickerStyles.pickerIcon}>
              <IconFolderCloseRegular />
            </span>
            <span className={pickerStyles.pickerLabel}>{picker.all}</span>
          </button>
        </div>
      )}
      {sections.recent.length === 0 ? null : (
        <PickerGroup
          title={picker.recent}
          expanded={recentExpanded}
          onToggle={() => setExpanded((prev) => ({ ...prev, recent: !recentExpanded }))}
        >
          {sections.recent.map((entry) => (
            <PickerRow
              key={entry.key}
              entry={entry}
              focused={sameAddress(entry.address, focused)}
              pinned={sections.pinned.some((item) => sameAddress(item.address, entry.address))}
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
          title={picker.pinned}
          expanded={pinnedExpanded}
          onToggle={() => setExpanded((prev) => ({ ...prev, pinned: !pinnedExpanded }))}
        >
          {sections.pinned.map((entry) => (
            <PickerRow
              key={entry.key}
              entry={entry}
              focused={sameAddress(entry.address, focused)}
              pinned
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
      <section className={pickerStyles.pickerSection}>
        <div className={pickerStyles.pickerSectionBody}>
          {sections.all.map((entry) => (
            <PickerRow
              key={entry.key}
              entry={entry}
              focused={sameAddress(entry.address, focused)}
              pinned={sections.pinned.some((item) => sameAddress(item.address, entry.address))}
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
