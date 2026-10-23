/**
 * 一个展示范围内的会话行：序列给的那些行 + 一条溢出按钮
 *
 * 「展示范围」与 `data/collapse.ts` 同义：一个工作区的未归组会话、工作区内的一个会话分组，或末尾的「未分组」桶
 *
 * 这里不再自己折叠。范围里露哪几条、还差几条被收起，都由 `data/outline.ts` 算好——
 * 那是同一件事的第二份实现，而两份实现对不上时界面会静默错位：行少一条没人报错，
 * 拖拽的落点行与实际渲染的行对不上也不会报错。这一层因此只做两件事：
 * 按序列给的顺序渲染行，把溢出按钮的文案与点击接上。
 *
 * 展开态仍在这里取（`useSessionScopes`）：它是本段的交互状态，序列只消费它的结果
 *
 * 从搜索结果打开一条会话时那条行可能正被折起来，此处照官方口径把本段撑开
 * 结果行的意图是「去看这条会话」，行不在文档里就无从滚进可视区
 */
import { Fragment, useEffect } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { SessionScopeRef } from '../data/collapse.ts'
import type { OutlineRow } from '../data/outline.ts'
import type { SessionRow } from '../data/types.ts'
import { useLocale } from '../hooks/useLocale.ts'
import { useResetScopeOnCollapse, useSessionScopes } from '../hooks/useSessionScopes.ts'
import styles from './components/rows.module.css'

export interface SessionListProps {
  /** 本段在哪个范围内，展开态按它定位 */
  scope: SessionScopeRef
  /**
   * 本段的全部行，由序列交出，顺序即渲染顺序
   *
   * 其中既有会话行，最多还有一条 `overflow`
   */
  rows: readonly OutlineRow[]
  /** 所在容器（工作区或会话分组）当前是否展开 */
  open: boolean
  /**
   * 本段一共几条会话
   *
   * 序列只交出「露出来的那几条」，判断揭示目标是否被收起需要知道总数
   */
  total: number
  /** 待揭示的会话 id，它被折起来时本段整体撑开 */
  revealSessionId: string | undefined
  /** 把一行渲染成元素，菜单上下文由调用方决定 */
  renderSession: (row: SessionRow) => ReactNode
}

export function SessionList({
  scope,
  rows,
  open,
  total,
  revealSessionId,
  renderSession,
}: SessionListProps): ReactElement {
  const { labels } = useLocale()
  const { toggle, expand } = useSessionScopes()
  useResetScopeOnCollapse(scope, open)

  const sessions = rows.filter((row) => row.kind === 'session')
  const overflow = rows.find((row) => row.kind === 'overflow')
  const expanded = overflow?.scopeExpanded === true
  // 露出来的条数少于总数，说明本段正收着；此时揭示目标若不在露出的那些里就该撑开
  const hiddenReveal =
    overflow !== undefined &&
    revealSessionId !== undefined &&
    sessions.length < total &&
    !sessions.some((row) => row.sessionId === revealSessionId)

  // 写进同一个展开态而不是另起一层覆盖：按钮随后照常可以把它收回去
  useEffect(() => {
    if (hiddenReveal) expand(scope)
    // scope 每次渲染都是新对象，键由它算出来因此只盯键
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenReveal, revealSessionId, expand])

  return (
    <>
      {sessions.map((row) =>
        row.row === undefined ? null : (
          <Fragment key={row.key}>{renderSession(row.row)}</Fragment>
        ),
      )}
      {/* 一条也不多时整条按钮不渲染，与官方一致 */}
      {overflow === undefined ? null : (
        <button
          type="button"
          className={styles.sessionOverflow}
          // 与行一起参与所在撑开体的逐个淡入
          data-wg-stagger=""
          aria-expanded={expanded}
          onClick={() => toggle(scope)}
        >
          {expanded ? labels.collapseSessions : labels.expandSessions(overflow.hiddenCount)}
        </button>
      )}
    </>
  )
}
