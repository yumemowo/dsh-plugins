/**
 * 一个工作区区块，标题行 + 撑开体（子工作区、会话分组、平铺的未归组会话、空态）
 *
 * 折叠状态由区域组件按 key 持有，这里只消费布尔值，因此不同工作区、不同分组之间的开合互不影响
 *
 * 段序是「子工作区 → 会话分组 → 平铺会话」，先文件夹后文件是资源管理器的惯性，而会话分组里也可能放子工作区，因此它夹在两者之间
 * 子工作区本身仍是一个完整的工作区块，由 `renderChildWorkspace` 交回，深度任意层都不必在这里知道层级
 */
import type { ReactElement, ReactNode } from 'react'
import { ExpandableBody } from './components/ExpandableBody.tsx'
import { GroupSection } from './GroupSection.tsx'
import { WorkspaceRow } from './WorkspaceRow.tsx'
import type { WorkspaceRowProps } from './WorkspaceRow.tsx'

import { useLocale } from '../useLocale.ts'
import { compareSessionRows } from '../data/sessions.ts'
import type { SessionRow, WorkspaceLayout } from '../data/types.ts'
import styles from './components/rows.module.css'

/** 本工作区块体内会话分组的操作，作用于哪个分组由参数指明 */
export interface WorkspaceGroupActions {
  onToggle: (groupId: string) => void
  onRename: (section: { id: string; label: string }) => void
  onDelete: (section: { id: string; label: string }) => void
  onCreateSession: (section: { id: string; label: string }) => void
}

export interface WorkspaceSectionProps {
  /** 工作区标题行的全部输入，整体交给 `WorkspaceRow`，撑开体的开合也读它的 `expanded` */
  row: WorkspaceRowProps
  layout: WorkspaceLayout
  /** 分组的展开态查询，展开键的构成由区域组件持有 */
  isGroupExpanded: (groupId: string) => boolean
  /** 该工作区块在层级里的深度，从 0 起，缩进由它换算 */
  depth: number
  groupActions: WorkspaceGroupActions
  /** 把一个会话行渲染成元素，渲染方式由区域组件决定（是否带归组菜单） */
  renderSession: (row: SessionRow) => ReactNode
  /** 把一个子工作区渲染成一个完整的工作区块，深度由区域组件自己算 */
  renderChildWorkspace: (workspaceId: string) => ReactNode
}

export function WorkspaceSection({
  row,
  layout,
  isGroupExpanded,
  depth,
  groupActions,
  renderSession,
  renderChildWorkspace,
}: WorkspaceSectionProps): ReactElement {
  const { labels } = useLocale()
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
  return (
    <section className={styles.workspace} style={indent}>
      <WorkspaceRow {...row} />
      <ExpandableBody open={row.expanded}>
        <div className={styles.workspaceBody}>
          {/* 子工作区排在会话分组之前，与分组内部同一顺序，文件夹在前 */}
          {childIds.length === 0 ? null : (
            <div className={styles.nest}>{childIds.map(renderChildWorkspace)}</div>
          )}
          {/* 只有用户建过分组时才渲染分组结构 */}
          {layout.groups.map((section) => (
            <GroupSection
              key={section.id}
              section={section}
              expanded={isGroupExpanded(section.id)}
              onToggle={() => groupActions.onToggle(section.id)}
              onRename={() => groupActions.onRename({ id: section.id, label: section.label })}
              onDelete={() => groupActions.onDelete({ id: section.id, label: section.label })}
              onCreateSession={() =>
                groupActions.onCreateSession({ id: section.id, label: section.label })
              }
              renderChildWorkspace={renderChildWorkspace}
            >
              {[...section.sessions].sort(compareSessionRows).map(renderSession)}
            </GroupSection>
          ))}
          {/* 未归组的会话平铺在工作区下，不套任何分组头
              指示器不占行内流，会话行的标题因此落在同级容器的图标列上，与会话分组头、子工作区行都不重合 */}
          {layout.loose.length === 0 ? null : (
            <div className={styles.sessions}>
              {[...layout.loose].sort(compareSessionRows).map(renderSession)}
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
