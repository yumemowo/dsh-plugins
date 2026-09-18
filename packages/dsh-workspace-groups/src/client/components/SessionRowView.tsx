/**
 * 会话行：状态点位列、标题、最近更新时间与可选的行尾操作位
 *
 * 行首列放官方 `StateDot`：待交互、运行、完成未打开时显示，空闲时留空占位，
 * 因此标题与工作区标题的横向关系始终与官方一致。行尾在操作位之前放官方风格的
 * 相对时间，悬停时让位给操作位（与官方同为 CSS 切换）。`action` 缺省时不
 * 渲染行尾操作位——未分组桶里的会话不属于任何工作区，没有可用的归组操作
 *
 * 状态位与相对时间由调用方算好传进来，两者都必须是内容稳定的值（时间文案的精度是
 * 分钟级），因此既能参与行级 memo 的比对，又能在任何一次区域重渲染时刷新。不要在行内
 * 按渲染当刻取时间：被 memo 挡下的行不会重算，文案会停住
 *
 * `reveal` 为真的那一行在挂载后把自己滚进可视区并回报一次（官方
 * `SessionNodeItem` 的 `onReveal` 就是这条路径）：从搜索结果打开一条会话时，
 * 列表要自动滚到它所在的那一行
 */
import { memo, useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { StateDot } from '../runtime.ts'
import { handleRowKeyDown } from './rowKeyboard.ts'
import { sameSessionStatus } from '../data/status.ts'
import type { RowContextMenuEvent } from './RowContextMenu.tsx'
import type { SessionStatus } from '../data/status.ts'

export interface SessionRowViewProps {
  /** 本行对应的会话 id */
  sessionId: string
  /** 行上显示的标题；空白会话由调用方套语言包的固定名 */
  title: string
  selected: boolean
  /** 该行要显示的状态位；空闲时为 undefined，槽位仍占位 */
  status?: SessionStatus | undefined
  /** 行尾相对时间文案；缺省表示不显示（新建中的空白行与「未分组」桶） */
  time?: string | undefined
  /** 菜单展开时行上挂标记：锚点按钮只靠 :hover 显示，菜单还开着时指针一旦
   * 移开按钮就会消失，标记让样式把它留住 */
  menuOpen?: boolean
  /** 行尾操作位；缺省表示该行没有任何可用操作（如未分组桶里的会话） */
  action?: ReactNode
  /**
   * 行右键处理；缺省表示该行没有右键菜单，右键保持浏览器默认行为
   *
   * 通过 props 下发而不是在行内自建：菜单条目与分派都属于「这一行有哪些
   * 操作」，由持有菜单的组件决定；本组件只管把事件接上
   */
  onContextMenu?: ((event: RowContextMenuEvent) => void) | undefined
  /**
   * 打开会话
   *
   * 传动作本身而不是绑好 id 的闭包：绑好的闭包每次渲染都是新引用，行级 memo
   * 因此永远判定为变过
   */
  onOpenSession: (sessionId: string) => void
  /**
   * 请求把这一行滚进可视区
   *
   * 只在从搜索结果打开会话时下发；缺省表示这一行没有待揭示的请求
   */
  onReveal?: (() => void) | undefined
}

function SessionRowViewImpl({
  sessionId,
  title,
  selected,
  status,
  time,
  menuOpen = false,
  action,
  onContextMenu,
  onOpenSession,
  onReveal,
}: SessionRowViewProps): ReactElement {
  const open = () => onOpenSession(sessionId)
  const rowRef = useRef<HTMLDivElement | null>(null)

  // 挂载后把自己滚进可视区，并立刻回报一次：请求方要在收到回报后清掉标记，
  // 否则该行会在后续每次重新挂载时再滚一次
  useEffect(() => {
    if (onReveal === undefined) return
    rowRef.current?.scrollIntoView({ block: 'nearest' })
    onReveal()
  }, [onReveal])

  return (
    <div
      ref={rowRef}
      className={
        'wg-row' + (selected ? ' wg-row-selected' : '') + (menuOpen ? ' wg-row-menu-open' : '')
      }
      // 参与所在折叠体的逐个淡入；序号由折叠体按文档序下发
      data-wg-stagger=""
      role="button"
      tabIndex={0}
      title={title}
      onClick={open}
      onKeyDown={(event) => handleRowKeyDown(event, open)}
      onContextMenu={onContextMenu}
    >
      {status === undefined ? (
        <span className="wg-slot" />
      ) : (
        <span className="wg-slot" role="img" aria-label={status.label}>
          <StateDot state={status.state} />
        </span>
      )}
      <span className="wg-row-title">{title}</span>
      {time === undefined ? null : <span className="wg-row-time">{time}</span>}
      {action === undefined ? null : (
        <span className="wg-row-action-slot" onClick={(event) => event.stopPropagation()}>
          {action}
        </span>
      )}
    </div>
  )
}

/**
 * 行级 memo 的比较器
 *
 * 传进来的都是原语或内容稳定的值，因此逐格比即可；状态位每次渲染都是新对象，
 * 按引用比会让每一行都判定为变过，因此那一格按内容比
 */
function sameRowViewProps(prev: SessionRowViewProps, next: SessionRowViewProps): boolean {
  return (
    prev.sessionId === next.sessionId &&
    prev.title === next.title &&
    prev.selected === next.selected &&
    prev.time === next.time &&
    prev.menuOpen === next.menuOpen &&
    prev.action === next.action &&
    prev.onContextMenu === next.onContextMenu &&
    prev.onOpenSession === next.onOpenSession &&
    prev.onReveal === next.onReveal &&
    sameSessionStatus(prev.status, next.status)
  )
}

/**
 * 裹上 memo 的会话行
 *
 * 流式期间每次活动都会重渲染整片区域，未变的行若跟着重算，长列表就会在每次活动
 * 时付出与行数成正比的代价
 */
export const SessionRowView = memo(SessionRowViewImpl, sameRowViewProps)
