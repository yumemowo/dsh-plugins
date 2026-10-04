/**
 * 会话行外壳：状态指示器、标题、最近更新时间与可选的行尾操作位
 *
 * 行首的状态指示器不占行内流，它绝对定位在行的左侧，空闲时不渲染
 * 因此标题的位置与状态无关，不会因为出现一个点而位移
 * 两种样式由 `indicator` 选定，一个是官方 `StateDot`，一个是色条，两者占同一处、同一尺寸域
 * 行上的 `data-wg-state` 供样式表给「运行中 / 待交互」两态上底色，完成与空闲共用默认背景
 *
 * 行尾在操作位之前放官方风格的相对时间，悬停时让位给操作位（与官方同为 CSS 切换）
 * `action` 缺省时不渲染行尾操作位——未分组桶里的会话不属于任何工作区，没有可用的归组操作
 *
 * 状态位与相对时间由调用方算好传进来，两者都必须是内容稳定的值（时间文案的精度是分钟级），因此既能参与行级 memo 的比对，又能在任何一次区域重渲染时刷新
 * 不要在行内按渲染当刻取时间：被 memo 挡下的行不会重算，文案会停住
 *
 * `reveal` 为真的那一行在挂载后把自己滚进可视区并回报一次（官方 `SessionNodeItem` 的 `onReveal` 就是这条路径）
 * 从搜索结果打开一条会话时，列表要自动滚到它所在的那一行
 *
 * 本组件只有「一行长什么样」这件事：菜单与悬停卡片由组装它的 `SessionRowItem` 负责
 */
import { memo, useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { IconPinFillRegular, IconPinOutlineRegular, StateDot } from '../runtime.ts'
import { handleRowKeyDown } from './components/rowKeyboard.ts'
import { sameSessionStatus } from '../data/status.ts'
import { useLocale } from '../useLocale.ts'
import { useLocalViewOptions } from '../useLocalViewOptions.ts'
import type { RowContextMenuEvent } from './components/RowContextMenu.tsx'
import type { SessionStatus } from '../data/status.ts'
import styles from './components/rows.module.css'
import clsx from 'clsx'

export interface SessionRowViewProps {
  /** 本行对应的会话 id */
  sessionId: string
  /**
   * 行上显示的标题
   *
   * 传 null 表示这是一条新建中的空白会话，标题取语言包的固定名
   */
  title: string | null
  selected: boolean
  /** 该行要显示的状态，空闲时为 undefined，那时整枚指示器都不渲染 */
  status?: SessionStatus | undefined
  /** 行尾相对时间文案，缺省表示不显示（新建中的空白行与「未分组」桶） */
  time?: string | undefined
  /** 行尾操作位，缺省表示该行没有任何可用操作（如未分组桶里的会话） */
  action?: ReactNode
  /**
   * 行右键处理，缺省表示该行没有右键菜单，右键保持浏览器默认行为
   *
   * 通过 props 下发而不是在行内自建：菜单条目与分派都属于「这一行有哪些操作」，由持有菜单的组件决定
   * 本组件只管把事件接上
   */
  onContextMenu?: ((event: RowContextMenuEvent) => void) | undefined
  /**
   * 打开会话
   *
   * 传动作本身而不是绑好 id 的闭包：绑好的闭包每次渲染都是新引用，行级 memo 因此永远判定为变过
   */
  onOpenSession: (sessionId: string) => void
  /**
   * 请求把这一行滚进可视区
   *
   * 只在从搜索结果打开会话时下发，缺省表示这一行没有待揭示的请求
   */
  onReveal?: (() => void) | undefined
  /**
   * 该行是否已置顶
   *
   * 已置顶时图钉常驻可见并占宽，未置顶时与操作位一起显隐，两态的先后顺序相同
   */
  pinned?: boolean | undefined
  /**
   * 是否还能新增置顶
   *
   * 达到上限时未置顶行的图钉转禁用态——上限只拦新增，已置顶的照常可以取消
   * 缺省表示不涉及上限
   */
  canPin?: boolean | undefined
  /** 切换这一行的置顶，缺省表示该行不提供置顶入口 */
  onTogglePin?: ((sessionId: string) => void) | undefined
  /**
   * 该行是否被容器裁在高度之外
   *
   * 交给样式表收起可见性
   * 被裁掉的行仍然留在文档里（收回方向的动画要有东西可收），但不可以被 Tab 聚焦到看不见的位置
   * 缺省表示不涉及裁剪
   */
  clipped?: boolean | undefined
}

/**
 * 一组状态对应的颜色色阶
 *
 * 运行与待交互各有自己的语义词，完成与空闲共用同一个中性色
 * 完成那次提醒已经由指示器的绿色表达
 */
function StatusIndicator({ status }: { status: SessionStatus }): ReactElement {
  const { indicator } = useLocalViewOptions()
  return (
    <span className={styles.indicator} data-wg-state={status.state} role="img" aria-label={status.label}>
      {indicator === 'bar' ? (
        <span className={styles.indicatorBar} />
      ) : (
        <StateDot state={status.state} />
      )}
    </span>
  )
}

function SessionRowViewImpl({
  sessionId,
  title,
  selected,
  status,
  time,
  action,
  pinned = false,
  canPin = true,
  clipped = false,
  onTogglePin,
  onContextMenu,
  onOpenSession,
  onReveal,
}: SessionRowViewProps): ReactElement {
  const { labels } = useLocale()
  const open = () => onOpenSession(sessionId)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const shownTitle = title ?? labels.newSession

  // 挂载后把自己滚进可视区，并立刻回报一次：请求方要在收到回报后清掉标记，否则该行会在后续每次重新挂载时再滚一次
  useEffect(() => {
    if (onReveal === undefined) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
    onReveal()
  }, [onReveal])

  const pin =
    onTogglePin === undefined ? null : (
      <button
        type="button"
        className={clsx(styles.rowPin, pinned ? styles.rowPinOn : styles.rowPinOff)}
        // 上限只拦新增：已置顶的行永远可以点它取消，因此禁用判据只看「未置顶且到上限」
        disabled={!pinned && !canPin}
        aria-pressed={pinned}
        aria-label={pinned ? labels.pinned.unpin(shownTitle) : labels.pinned.pin(shownTitle)}
        onClick={(event) => {
          // 行本身也可点，不拦住就会连带打开会话
          event.stopPropagation()
          onTogglePin(sessionId)
        }}
      >
        {pinned ? <IconPinFillRegular size={13} /> : <IconPinOutlineRegular size={13} />}
      </button>
    )

  const actionSlot =
    action === undefined ? null : (
      <span className={styles.rowActionSlot} onClick={(event) => event.stopPropagation()}>
        {action}
      </span>
    )

  // 行是一个裸 div：菜单开合标记、悬停卡片都由组装它的 SessionRowItem 负责
  return (
    <div
      ref={rowRef}
      className={clsx(styles.row, selected && styles.rowSelected)}
      // 状态色底与选中加深都由样式表按它选档，行组件不感知配色
      data-wg-state={status?.state ?? 'idle'}
      // 参与所在撑开体的逐个淡入，序号由撑开体按文档序下发
      data-wg-stagger=""
      data-wg-clipped={clipped ? '' : undefined}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => handleRowKeyDown(event, open)}
      onContextMenu={onContextMenu}
    >
      {status && <StatusIndicator status={status} />}
      <span className={styles.rowTitle}>{shownTitle}</span>
      {time && <span className={styles.rowTime}>{time}</span>}
      {/* 行尾两段：操作位在左、图钉在右
          已置顶的图钉常驻可见并占宽，因此它的位置不随时间隐去、操作位展开而变；
          未置顶的图钉与操作位一起显隐，静止时连宽度一起收掉 */}
      {actionSlot}
      {pin}
    </div>
  )
}

/**
 * 行级 memo 的比较器
 *
 * 传进来的都是原语或内容稳定的值，因此逐格比即可
 * 状态位每次渲染都是新对象，按引用比会让每一行都判定为变过，因此那一格按内容比
 */
function sameRowViewProps(prev: SessionRowViewProps, next: SessionRowViewProps): boolean {
  return (
    prev.sessionId === next.sessionId &&
    prev.title === next.title &&
    prev.selected === next.selected &&
    prev.time === next.time &&
    sameSessionStatus(prev.status, next.status) &&
    prev.pinned === next.pinned &&
    prev.canPin === next.canPin &&
    prev.clipped === next.clipped &&
    prev.onTogglePin === next.onTogglePin &&
    prev.action === next.action &&
    prev.onContextMenu === next.onContextMenu &&
    prev.onOpenSession === next.onOpenSession &&
    prev.onReveal === next.onReveal
  )
}

/**
 * 裹上 memo 的会话行
 *
 * 流式期间每次活动都会重渲染整片区域，未变的行若跟着重算，长列表就会在每次活动
 * 时付出与行数成正比的代价
 */
export const SessionRowView = memo(SessionRowViewImpl, sameRowViewProps)
