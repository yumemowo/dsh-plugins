/**
 * 一个工作区区块，标题行 + 撑开体（子工作区、会话分组、平铺的未归组会话、空态）
 *
 * 折叠状态由区域组件按 key 记录在浏览器本地 store 里，这里只消费算好的布尔值，因此不同工作区、不同分组之间的开合互不影响
 *
 * 段序是「子工作区 → 会话分组 → 平铺会话」，先文件夹后文件是资源管理器的惯性，而会话分组里也可能放子工作区，因此它夹在两者之间
 * 子工作区本身仍是一个完整的工作区块，由 `renderChildWorkspace` 交回，深度任意层都不必在这里知道层级
 */
import type { ReactElement, ReactNode } from 'react'
import { ExpandableBody } from './components/ExpandableBody.tsx'
import { GroupSection } from './GroupSection.tsx'
import { SessionList } from './SessionList.tsx'
import { WorkspaceRow } from './WorkspaceRow.tsx'
import type { WorkspaceRowDnd, WorkspaceRowProps } from './WorkspaceRow.tsx'

import { useExpansion } from '../hooks/useExpansion.ts'
import { useLocale } from '../hooks/useLocale.ts'
import { useDnd, useOrderRow } from '../hooks/useDnd.ts'
import {
  regionProps,
  scopeProps,
  workspaceRegionKey,
  looseKey,
  workspaceBodyKey,
  workspaceHeadKey,
} from '../data/protocol.ts'
import type { OrderDragging } from '../data/protocol.ts'
import type { SessionRow, WorkspaceLayout } from '../data/types.ts'
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
  layout: WorkspaceLayout
  /** 该工作区块在层级里的深度，从 0 起，缩进由它换算 */
  depth: number
  /**
   * 会话行的排序比较器
   *
   * 由区域组件按「置顶会话显示方式」选定后下发：置顶要在各分组内也排到最前时，它会把置顶名次收进去
   * 三种段落（分组内、未归组段、平铺列表）共用同一个
   */
  compareRows: (a: SessionRow, b: SessionRow) => number
  /** 本工作区体内始终展示并占额度的会话行 id */
  alwaysVisibleSessionIds: ReadonlySet<string>
  /** 折叠判定的基准时刻，与行尾相对时间取同一刻 */
  now: number
  /** 待揭示的会话 id，转交给两段会话列表 */
  revealSessionId: string | undefined
  groupActions: WorkspaceGroupActions
  /**
   * 组内会话分组的排序接线
   *
   * 缺省表示这一片不参与分组排序，分组头因此只接会话归组的落点
   */
  orderDragging?: OrderDragging | undefined
  /**
   * 这一条工作区行的拖拽接线
   *
   * 缺省表示这一行不可拖起，但仍是别的落点的接收方（它自己的区域属性恒在）
   */
  workspaceDragging?: OrderDragging | undefined
  /** 把一个会话行渲染成元素，渲染方式由区域组件决定（是否带归组菜单） */
  renderSession: (row: SessionRow) => ReactNode
  /** 把一个子工作区渲染成一个完整的工作区块，深度由区域组件自己算 */
  renderChildWorkspace: (workspaceId: string) => ReactNode
}

export function WorkspaceSection({
  workspaceId,
  row,
  layout,
  depth,
  compareRows,
  alwaysVisibleSessionIds,
  now,
  revealSessionId,
  groupActions,
  orderDragging,
  workspaceDragging,
  renderSession,
  renderChildWorkspace,
}: WorkspaceSectionProps): ReactElement {
  const { labels } = useLocale()
  const expansion = useExpansion()
  const { dndZoneProps } = useDnd()
  const childIds = layout.children ?? []
  const hasAnyRow =
    layout.groups.length > 0 || layout.loose.length > 0 || childIds.length > 0
  /**
   * 缩进层级，每一层让出一个 16px 图标列，第 0 层取官方的 8px
   *
   * 下发的是最终层级（含「在虚拟分组里」「被放进会话分组」那两格），样式表直接拿去乘
   * 不在 CSS 里做容器累加，把一个变量定义成「它自己 + 1」是循环引用，浏览器会整条丢掉
   */
  const indent = { '--wg-depth': String(depth) } as Record<string, string>
  /**
   * 未归组那一段的落点区域
   *
   * 只挂在未归组会话自己那一段上
   *
   * 不挂在整个工作区块上——那样各分组头会落进它的面积，而命中层走到第一个带区域键的元素就停，
   * 指针停在分组头上时会先命中那个分组，不再考虑到这一格上
   *
   * 它同时是「移出分组」的落点：拖到这一段空白上就是回到未归组
   */
  const looseZone = dndZoneProps(looseKey(workspaceId))

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
          {/* 子工作区排在会话分组之前，与分组内部同一顺序，文件夹在前 */}
          {childIds.length === 0 ? null : (
            <div className={styles.nest}>{childIds.map(renderChildWorkspace)}</div>
          )}
          {/* 只有用户建过分组时才渲染分组结构
              组内会话与未归组那一段各是一个展示范围，额度与展开态互不影响 */}
          {layout.groups.map((section) => {
            const groupExpanded = expansion.isGroupExpanded({
              workspaceId,
              groupId: section.id,
            })
            return (
              <GroupSection
                key={section.id}
                section={section}
                workspaceId={workspaceId}
                expanded={groupExpanded}
                onToggle={() =>
                  expansion.toggleGroup({ workspaceId, groupId: section.id })
                }
                onRename={() =>
                  groupActions.onRename({ id: section.id, label: section.label })
                }
                onDelete={() =>
                  groupActions.onDelete({ id: section.id, label: section.label })
                }
                onCreateSession={() =>
                  groupActions.onCreateSession({ id: section.id, label: section.label })
                }
                orderDragging={orderDragging}
                renderChildWorkspace={renderChildWorkspace}
              >
                <SessionList
                  scope={{ kind: 'group', workspaceId, groupId: section.id }}
                  rows={[...section.sessions].sort(compareRows)}
                  alwaysVisibleSessionIds={alwaysVisibleSessionIds}
                  now={now}
                  open={groupExpanded}
                  revealSessionId={revealSessionId}
                  renderSession={renderSession}
                />
              </GroupSection>
            )
          })}
          {/* 未归组的会话平铺在工作区下，不套任何分组头
              指示器不占行内流，会话行的标题因此落在同级容器的图标列上，与会话分组头、子工作区行都不重合 */}
          {layout.loose.length === 0 ? null : (
            <div className={styles.sessions} {...looseZone}>
              <SessionList
                scope={{ kind: 'loose', workspaceId }}
                rows={[...layout.loose].sort(compareRows)}
                alwaysVisibleSessionIds={alwaysVisibleSessionIds}
                now={now}
                open={row.expanded}
                revealSessionId={revealSessionId}
                renderSession={renderSession}
              />
            </div>
          )}
          {hasAnyRow ? null : (
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
