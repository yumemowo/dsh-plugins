/**
 * 区域顶部的置顶区：段头 + 若干置顶会话行
 *
 * 一个控件、两种溢出给法（`overflow` prop）
 * 依据是三种做法去掉模式标记后 DOM 结构完全相同
 * 差别只有模式类、行尾提示字符串，以及超出可见条数的行怎么露出来：
 *   - `expand`：静止时占可见条数那么高，指针移到预览行上时整块向下浮出、一次列出全部
 *   - `scroll`：同一个高度里自行滚动
 *
 * 两种给法都把全部行放进 DOM：`scroll` 靠超出的行撑出滚动，`expand` 靠它们做展开与收回的过渡
 * 超出可见条数的行由样式表在静止时收起可见性
 *
 * 触发区是预览行本身，不含段头
 * 段头是一块独立的交互区（管收起 / 展开整块），把浮出也挂在它上面会让两个意图互相干扰
 *
 * 两种模式占据的高度完全相同，因此切换它们不改变布局
 * `expand` 的浮出用绝对定位、不推挤下方内容
 * 浮出态不加内边距也不加描边环——前几行必须逐格不变，否则指针下的行会在展开瞬间动一下
 *
 * 行上有面板开着（行内 `...` 菜单或右键菜单）时浮出不收回
 * 面板 portal 到 body，指针移上去就离开了预览区，否则那一段会在菜单还开着时当场收回
 *
 * 无置顶项时整块返回 `null`，段头与分隔都不出现，那一段空间完整交还给列表
 */
import { useCallback, useState } from 'react'
import type { ReactElement } from 'react'
import { IconTriangleRightFillRegular } from '../runtime.ts'
import { statusViewOfRow } from '../data/rows.ts'
import type { PinnedEntry } from '../data/pinned.ts'
import { DEFAULT_EXPAND_MOTION, expandMotionVars } from '../utils/expandMotion.ts'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import { useLocale } from '../useLocale.ts'
import { SessionRowItem } from './SessionRowItem.tsx'
import type { OfficialSessionActions } from '../actions.ts'
import type { PinnedLabels, RegionLabels } from '../labels.ts'
import styles from './PinnedSection.module.css'
import clsx from 'clsx'

/**
 * 一条置顶行的高度，与列表里的会话行同值
 *
 * 静止高度要用它算：这个模块自己不知道行高，而 `.module.css` 那边也不能反过来读组件
 */
const ROW_HEIGHT = 32

/** 相邻行之间的间距，与列表里那一段同值 */
const ROW_GAP = 2

/** 段头高度，与样式表里的 `.pinHead` 同值 */
const HEAD_HEIGHT = 30

/** 分隔高度，与样式表里的 `.pinDivider` 同值（1px 线 + 上下各 6px margin） */
const DIVIDER_HEIGHT = 13

/** 没有行开着面板时的空集合，恒为同一引用，供下面那条回报的比对用 */
const NO_PANELS: ReadonlySet<string> = new Set()

export interface PinnedSectionProps {
  entries: readonly PinnedEntry[]
  /** 静止时显示几条，来自宿主 settings */
  visibleCount: number
  /** 溢出给法，来自浏览器本地 store */
  overflow: 'expand' | 'scroll'
  /** 是否展开，来自浏览器本地 store */
  expanded: boolean
  onToggle: () => void
  /** 切换一条会话的置顶 */
  onTogglePin: (sessionId: string) => void
  /** 是否还能新增置顶，达到上限时该项禁用 */
  canPin: boolean
  /** 官方会话操作，缺省时行上不挂菜单 */
  official?: OfficialSessionActions | undefined
  onOpenSession: (sessionId: string) => void
  /** 会话行状态快照，与列表里的行取同一份 */
  statuses: SessionStatusSnapshot
}

/**
 * 行尾那句提示
 *
 * 收起时只报总数（那时一条也没显示，「还有几条」没有意义）
 * 溢出时报「N 条 · 还有 M 条」而不是「N 条中的 X 条」：后者要读者自己做减法
 * @param total - 置顶总条数
 * @param shown - 静止时显示几条
 * @param expanded - 是否处于展开态
 * @param labels - 置顶区文案
 */
function hintText(
  total: number,
  shown: number,
  expanded: boolean,
  labels: PinnedLabels,
): string {
  if (!expanded || total <= shown) return labels.count(total)
  return labels.more(total, total - shown)
}

/**
 * 静止时那几条占的高度
 *
 * 段头与行的尺寸都在样式表里，这里按同一份常量算出来当 CSS 变量下发
 * 浮出态里预览区是绝对定位的，段本身必须自己占住静止高度，否则浮出的一瞬间下方内容会跳一下
 * @param rowCount - 要叠几条
 */
function stackHeight(rowCount: number): number {
  return rowCount === 0 ? 0 : rowCount * ROW_HEIGHT + (rowCount - 1) * ROW_GAP
}

/**
 * 置顶区
 *
 * 段头复用容器行的词汇（箭头 + 名字 + 行尾计数），因此「点它收起」不需要额外教
 * 它不画图钉：那枚图标在这一行不承担任何指向，只是装饰
 */
export function PinnedSection({
  entries,
  visibleCount,
  overflow,
  expanded,
  onToggle,
  onTogglePin,
  canPin,
  official,
  onOpenSession,
  statuses,
}: PinnedSectionProps): ReactElement | null {
  const { labels } = useLocale()
  // 指针是否落在预览行上。只在 expand 模式下有意义，用它把整块浮出
  const [hoverOpen, setHoverOpen] = useState(false)
  // 有面板开着的行。面板 portal 到 body，指针移上去就离开了预览区，据这一格把浮出留住
  const [panelOpenIds, setPanelOpenIds] = useState<ReadonlySet<string>>(NO_PANELS)

  /**
   * 行上面板开合的回报
   *
   * 引用必须稳定：这一格会传进行级 memo 的比对，每次渲染新建一个会让每一行都判定为变过
   * 集合没变时返回原对象，卸载时那一串「关」的回报因此不会引起额外的重渲染
   */
  const onPanelOpenChange = useCallback((sessionId: string, open: boolean) => {
    setPanelOpenIds((prev) => {
      if (open === prev.has(sessionId)) return prev
      const next = new Set(prev)
      if (open) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }, [])

  // 无置顶项时整块不渲染：段头、分隔线都不出现，那一段空间完整交还给列表
  if (entries.length === 0) return null

  const overflowing = entries.length > visibleCount
  /**
   * 悬停展开只在真有行被裁掉时才成立
   *
   * 全部行都已在静止高度里显示时，浮出只是把一个等高的盒子重新定位一遍
   * 指针进入的瞬间换掉定位与底色，读起来是一次没有反馈的闪动，这一档因此不接悬停
   */
  const canExpand = overflow === 'expand' && overflowing
  const open = canExpand && (hoverOpen || panelOpenIds.size > 0)

  const head = (
    <button
      type="button"
      className={styles.pinHead}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className={styles.pinHeadSlot}>
        <IconTriangleRightFillRegular
          className={clsx(styles.pinArrow, expanded && styles.pinArrowOpen)}
        />
      </span>
      <span className={styles.pinHeadName}>{labels.pinned.section}</span>
      <span className={styles.pinHeadSpacer} />
      <span className={styles.pinHeadHint}>
        {hintText(entries.length, visibleCount, expanded, labels.pinned)}
      </span>
    </button>
  )

  /**
   * 静止高度与浮出落点
   *
   * 收起态不渲染预览区，高度由段头自己撑，因此这一份只在展开时有用
   * 高度在这里算而不是写死在样式里：可见条数来自宿主 settings，是可调的
   *
   * 四项分开发是因为样式表要分别用到：
   *   - 静止高度由段自己常驻（浮出时预览区脱离了流）
   *   - 浮出上限取「全部行叠起来」的实高，不取视口上限
   * 上限若取视口上限（`min(60vh, 640px)`），内容远矮于它时可见高度会在过渡前段就走完
   * 剩下的时长只是看不见的 max-height 在涨
   */
  const sizing = {
    '--wg-pin-rest': `${stackHeight(Math.min(entries.length, visibleCount))}px`,
    '--wg-pin-full': `${stackHeight(entries.length)}px`,
    '--wg-pin-head': `${HEAD_HEIGHT}px`,
    '--wg-pin-divider': `${DIVIDER_HEIGHT}px`,
    // 浮出与收回的节奏取撑开体的同一份参数：变量名与时长都只有一处定义
    // 置顶区不在任何撑开体之内，缺了这几项样式表会落到自己的回退值上，两边从此可以悄悄分叉
    ...expandMotionVars(DEFAULT_EXPAND_MOTION),
  } as Record<string, string>

  // 模式类只在这里算一次：它在 JSX 里出现多次，写成逐个三元会在每处重复一遍同一个条件
  const pinExpandClass = overflow === 'expand' ? styles.pinExpand : undefined
  const pinScrollClass = clsx(
    overflow === 'expand' && styles.pinScrollClipped,
    open && styles.pinScrollOpen,
  )

  return (
    <div
      className={clsx(styles.pinnedSection, expanded && pinExpandClass)}
      style={sizing}
      data-wg-overflow={overflow}
    >
      {head}
      {/* 收起后只剩段头一行。分隔仍留着：不留它就与下面的工作区行接在一起了 */}
      {expanded && (
        <div
          className={clsx(styles.pinScroll, pinScrollClass)}
          // 触发区是预览行本身，不含段头；没有行被裁掉时不接悬停，那种浮出只是白闪一下
          onPointerEnter={canExpand ? () => setHoverOpen(true) : undefined}
          onPointerLeave={canExpand ? () => setHoverOpen(false) : undefined}
          // 溢出与否只影响提示文案与能否滚动，DOM 结构不变
          data-wg-overflowing={overflowing ? '' : undefined}
        >
          {/* 全部行都渲染：多出来的那些静止时被裁在高度之外，由样式表用 visibility 移出焦点顺序。
              卸载掉就没有可收回的东西，收回方向的动画也就无从谈起 */}
          {entries.map((entry, index) => (
            <PinnedRow
              key={entry.id}
              entry={entry}
              labels={labels}
              statuses={statuses}
              // 超出可见条数的那几条：只在 `expand` 档静止时有意义，`scroll` 档它们本就在裁剪高度里可滚
              clipped={overflow === 'expand' && index >= visibleCount}
              onTogglePin={onTogglePin}
              canPin={canPin}
              official={official}
              onPanelOpenChange={onPanelOpenChange}
              onOpenSession={onOpenSession}
            />
          ))}
        </div>
      )}
      <div className={styles.pinDivider} />
    </div>
  )
}

/**
 * 置顶区里的一行
 *
 * 复用会话行条目组件，因此状态位、几何与键盘行为与列表里的行完全一致
 * 每一条本就已置顶，于是走「已置顶」那条排布：图钉钉在最右，位置不随时间与操作位变
 * 不挂悬停卡片：这些行已经钉在一段固定的区里，来源由位置说明，卡片在这里只多一层浮层
 *
 * 官方服务不在场、或这一条是新建中的空白会话时，条目组件自己就不生成菜单，这里因此不分叉
 * 取消置顶必须仍然可点：图钉与菜单的有无无关，不受影响
 */
function PinnedRow({
  entry,
  labels,
  statuses,
  clipped,
  onTogglePin,
  canPin,
  official,
  onPanelOpenChange,
  onOpenSession,
}: {
  entry: PinnedEntry
  labels: RegionLabels
  statuses: SessionStatusSnapshot
  /** 超出静止可见条数：静止时被裁在高度之外，由样式表连可见性一起收掉 */
  clipped: boolean
  onTogglePin: (sessionId: string) => void
  canPin: boolean
  official: OfficialSessionActions | undefined
  onPanelOpenChange: (sessionId: string, open: boolean) => void
  onOpenSession: (sessionId: string) => void
}): ReactElement {
  const view = statusViewOfRow(entry.row, statuses, labels.status)

  return (
    <SessionRowItem
      row={entry.row}
      title={entry.blank ? null : entry.title}
      selected={entry.current}
      status={view.dot}
      official={official}
      pinned
      canPin={canPin}
      clipped={clipped}
      onTogglePin={onTogglePin}
      onPanelOpenChange={onPanelOpenChange}
      onOpenSession={onOpenSession}
    />
  )
}
