/**
 * 一个工作区区块：标题行 + 撑开体
 *
 * 只搭外壳，体内那些行由调用方按序列渲染好整批交进来。
 * 折叠状态由区域组件按 key 记录在浏览器本地 store 里，这里只消费算好的布尔值，因此不同工作区、不同分组之间的开合互不影响
 */
import type { ReactElement, ReactNode } from 'react'
import { ExpandableBody } from './components/ExpandableBody.tsx'
import { WorkspaceRow } from './WorkspaceRow.tsx'
import type { WorkspaceRowDnd, WorkspaceRowProps } from './WorkspaceRow.tsx'

import { useLocale } from '../hooks/useLocale.ts'
import { useDnd, useOrderRow } from '../hooks/useDnd.ts'
import {
  regionProps,
  scopeProps,
  workspaceRegionKey,
  workspaceBodyKey,
  workspaceHeadKey,
} from '../data/protocol.ts'
import type { OrderDragging } from '../data/protocol.ts'
import type { OutlineRow } from '../data/outline.ts'
import styles from './components/rows.module.css'

/** 本工作区块体内会话分组的操作，作用于哪个分组由参数指明；开合不在这里，它走 `useExpansion` */
export interface WorkspaceGroupActions {
  onRename: (section: { id: string; label: string }) => void
  onDelete: (section: { id: string; label: string }) => void
  onCreateSession: (section: { id: string; label: string }) => void
}

export interface WorkspaceSectionProps {
  /** 本区块是哪个工作区，组内分组的开合要按它定位 */
  workspaceId: string
  /** 工作区标题行的全部输入，整体交给 `WorkspaceRow`，撑开体的开合也读它的 `expanded` */
  row: WorkspaceRowProps
  /** 本工作区题头行，缩进层级写在它身上 */
  head: OutlineRow
  /** 体内有没有东西：一条也没有时露空态，撑开体因此仍然要渲染 */
  hasBody: boolean
  /** 已渲染好的体内行，按序列顺序：子工作区、会话分组、未归组那一段 */
  children: ReactNode
  /**
   * 这一条工作区行的拖拽接线
   *
   * 缺省表示这一行不可拖起，但仍是别的落点的接收方（它自己的区域属性恒在）
   */
  workspaceDragging?: OrderDragging | undefined
}

export function WorkspaceSection({
  workspaceId,
  row,
  head,
  hasBody,
  children,
  workspaceDragging,
}: WorkspaceSectionProps): ReactElement {
  const { labels } = useLocale()
  const { dndZoneProps } = useDnd()
  /**
   * 缩进层级，每一层让出一个 16px 图标列，第 0 层取官方的 8px
   *
   * 下发的是最终层级（含「在虚拟分组里」「被放进会话分组」那两格），样式表直接拿去乘
   * 不在 CSS 里做容器累加，把一个变量定义成「它自己 + 1」是循环引用，浏览器会整条丢掉
   */
  const indent = { '--wg-depth': String(head.depth) } as Record<string, string>

  /**
   * 本工作区标题行的拖拽接线
   *
   * 行自己既是落点区域也是同层换位的参照行，因此一格顶两格
   * 未分组桶那一行没有拖拽接线，走的仍是可选的这一格
   */
  const workspaceOrder = useOrderRow(
    workspaceHeadKey(workspaceId),
    workspaceId,
    workspaceDragging === undefined ? undefined : () => workspaceDragging.buildDragPlan(workspaceId),
  )
  const rowDnd: WorkspaceRowDnd = {
    zone: workspaceOrder.zone,
    rowAttribute: workspaceOrder.rowAttribute,
    drag: workspaceOrder.drag,
    dragging: workspaceOrder.dragging,
  }

  return (
    // 这一块是工作区的整体：标题行与它体内的子工作区、会话分组都在其中。
    // 标的是「标题格对应的整块」——指针停在标题行或体内空白上时框因此套住整块，
    // 与虚拟分组那一块同形；体内的子工作区行是落点的子集，框把它们一并圈进来
    <section
      className={styles.workspace}
      style={indent}
      {...scopeProps()}
      {...regionProps(workspaceRegionKey(workspaceId))}
    >
      <WorkspaceRow {...row} dnd={rowDnd} />
      <ExpandableBody open={row.expanded}>
        <div className={styles.workspaceBody} {...dndZoneProps(workspaceBodyKey(workspaceId))}>
          {hasBody ? (
            children
          ) : (
            // 空态也是撑开体里要露面的子元素，与行一样参与逐个淡入
            <div className={styles.empty} data-wg-stagger="">
              {labels.empty}
            </div>
          )}
        </div>
      </ExpandableBody>
    </section>
  )
}
