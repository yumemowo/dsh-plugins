/**
 * 一个展示范围内的会话行：折叠后的若干行 + 一条溢出按钮
 *
 * 「展示范围」与 `data/collapse.ts` 同义：一个工作区的未归组会话、工作区内的一个会话分组，或末尾的「未分组」桶
 * 每个范围一份展开态，因此展开一个分组不影响另一个工作区那一段
 *
 * 展开态是浏览器内的临时界面状态，与官方那条溢出按钮一样不落盘
 * 所在容器收起时把它一并收回，否则收起来再展开，上一轮「展开其余 n 个」的效果还在，读起来像列表自己变长了
 *
 * 从搜索结果打开一条会话时，那条行可能正被折起来，此处照官方口径把整个范围撑开
 * 结果行的意图是「去看这条会话」，行不在文档里就无从滚进可视区
 *
 * 额度与折叠判据都在 `data/collapse.ts`，这里只做三件界面上的事：拿住展开态，识别揭示目标，给出按钮的文案与点击
 * 行的元素由调用方渲染（工作区内的行与「未分组」桶里的行菜单不同），因此组件只按 id 排布它们
 */
import { useEffect, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { collapseSessionRows } from '../data/collapse.ts'
import type { SessionRow } from '../data/types.ts'
import { useLocale } from '../hooks/useLocale.ts'
import styles from './components/rows.module.css'

export interface SessionListProps {
  /** 本范围内的全部会话行，顺序由调用方按本范围的比较器排好 */
  rows: readonly SessionRow[]
  /** 本范围内始终展示并占额度的行 id，折叠据此把它们排除在额度之外 */
  alwaysVisibleSessionIds: ReadonlySet<string>
  /** 折叠判定的基准时刻，与行尾相对时间取同一刻 */
  now: number
  /** 所在容器（工作区或会话分组）当前是否展开 */
  open: boolean
  /** 待揭示的会话 id，它被折起来时本范围整体撑开 */
  revealSessionId: string | undefined
  /** 把一行渲染成元素，菜单上下文由调用方决定 */
  renderSession: (row: SessionRow) => ReactNode
}

export function SessionList({
  rows,
  alwaysVisibleSessionIds,
  now,
  open,
  revealSessionId,
  renderSession,
}: SessionListProps): ReactElement {
  const { labels } = useLocale()
  const [expanded, setExpanded] = useState(false)

  // 容器一收起就回到折叠态：展开态不落盘，跨一次收起 / 展开留着没有意义
  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])

  const collapsed = collapseSessionRows(rows, alwaysVisibleSessionIds, now)
  const overflowing = collapsed.hiddenCount > 0
  // 揭示目标正躺在被收起的那些行里：撑开本范围，与官方把该范围的额度置成无限同一取舍
  const hiddenReveal =
    overflowing &&
    revealSessionId !== undefined &&
    !collapsed.rows.some((row) => row.id === revealSessionId) &&
    rows.some((row) => row.id === revealSessionId)

  // 写进同一个展开态而不是另起一层覆盖：按钮随后照常可以把它收回去
  useEffect(() => {
    if (hiddenReveal) setExpanded(true)
  }, [hiddenReveal, revealSessionId])

  const shown = expanded && overflowing ? rows : collapsed.rows

  return (
    <>
      {shown.map(renderSession)}
      {/* 一条也不多时整条按钮不渲染，与官方一致 */}
      {overflowing ? (
        <button
          type="button"
          className={styles.sessionOverflow}
          // 与行一起参与所在撑开体的逐个淡入
          data-wg-stagger=""
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? labels.collapseSessions : labels.expandSessions(collapsed.hiddenCount)}
        </button>
      ) : null}
    </>
  )
}
