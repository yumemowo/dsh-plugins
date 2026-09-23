/**
 * 一个工作区区块，标题行 + 折叠体（子工作区、会话分组、平铺的未归组会话、空态）
 *
 * 折叠状态由区域组件按 key 持有，这里只消费布尔值，因此不同工作区、不同分组之间的开合互不影响
 *
 * 段序是「子工作区 → 会话分组 → 平铺会话」，先文件夹后文件是资源管理器的惯性，而会话分组里也可能放子工作区，因此它夹在两者之间
 * 子工作区本身仍是一个完整的工作区块，由 `renderChildWorkspace` 交回，深度任意层都不必在这里知道层级
 */
import type { ReactElement, ReactNode } from 'react'
import { CollapsibleBody } from './CollapsibleBody.tsx'
import { GroupSection } from './GroupSection.tsx'
import { WorkspaceRow } from './WorkspaceRow.tsx'
import type { WorkspaceHoverData, WorkspaceRowLabels, WorkspaceRowProps } from './WorkspaceRow.tsx'

import type { OfficialHoverLabels } from '../official.ts'
import type { SessionRow, WorkspaceLayout } from '../data/types.ts'

export interface WorkspaceSectionProps {
  title: string
  collapsed: boolean
  folderActive: boolean
  layout: WorkspaceLayout
  /** 分组的折叠态查询，折叠键的构成由区域组件持有 */
  isGroupCollapsed: (groupId: string) => boolean
  /** 分组头与工作区行共用的文案 */
  labels: WorkspaceRowLabels
  /**
   * 该工作区行上的「移动工作区分组」选项集
   *
   * 与 `labels` 分开传，文案对所有行相同，归属却逐行不同
   */
  virtualWorkspace: WorkspaceRowProps['virtualWorkspace']
  /** 该行「移动工作区分组」子菜单的选中分派 */
  onSelectVirtualWorkspace: (id: string) => void
  /**
   * 该工作区行上的「移动到分组…」选项集
   *
   * 与 `virtualWorkspace` 平级但进的是不同层级的容器，这个进父工作区体内的会话分组
   */
  parentGroup?: WorkspaceRowProps['parentGroup'] | undefined
  /** 该行「移动到分组」子菜单的选中分派 */
  onSelectParentGroup: (id: string) => void
  emptyLabel: string
  /** 未归组会话那一段的小标题，只在需要与会话分组/子工作区区分时才渲染 */
  sessionsLabel: string
  /** 分组行行尾操作位的文案 */
  groupActionLabels: {
    /** `...` 按钮的无障碍标签，取分组名 */
    actions: (name: string) => string
    /** 「新建会话」菜单项 */
    newSessionItem: string
    /** 「重命名分组」菜单项 */
    rename: string
    /** 「删除分组」菜单项 */
    delete: string
    /** `+` 按钮的无障碍标签，取分组名 */
    newSession: (name: string) => string
  }
  /** 工作区行悬停卡片的正文，缺省表示不挂卡片 */
  hover?: WorkspaceHoverData | undefined
  /** 悬停卡片可复制的内容，取完整目录路径 */
  hoverCopy?: string | undefined
  /** 悬停卡片的文案，缺省表示官方文案不在场，卡片整体不挂 */
  hoverLabels?: OfficialHoverLabels | undefined
  /** 该工作区块在层级里的深度，从 0 起，缩进由它换算 */
  depth: number
  onToggle: () => void
  onCreateSession: () => void
  onNewGroup: () => void
  onRenameWorkspace: () => void
  onDeleteWorkspace: () => void
  onToggleGroup: (groupId: string) => void
  onRenameGroup: (section: { id: string; label: string }) => void
  onDeleteGroup: (section: { id: string; label: string }) => void
  /** 在该分组新建会话 */
  onCreateSessionInGroup: (section: { id: string; label: string }) => void
  /** 把一个会话行渲染成元素，渲染方式由区域组件决定（是否带归组菜单） */
  renderSession: (row: SessionRow) => ReactNode
  /** 把一个子工作区渲染成一个完整的工作区块，深度由区域组件自己算 */
  renderChildWorkspace: (workspaceId: string) => ReactNode
}

/**
 * 会话行的显示顺序：新建中的空白会话排最前，其余按最近更新倒序
 *
 * 空白会话是刚点出来的那条占位行，还没有自己的内容与时间，排在所属区段（分组内或未归组区）的最前才符合「刚新建的就是这条」的预期
 * 它一旦启用就回到与其他会话同一套排序里
 * @returns 供 `Array.prototype.sort` 使用的比较值
 */
function compareSessionRows(a: SessionRow, b: SessionRow): number {
  if (a.blank !== b.blank) return a.blank ? -1 : 1
  return b.updatedAt - a.updatedAt
}

export function WorkspaceSection({
  title,
  collapsed,
  folderActive,
  layout,
  isGroupCollapsed,
  labels,
  virtualWorkspace,
  onSelectVirtualWorkspace,
  parentGroup,
  onSelectParentGroup,
  emptyLabel,
  sessionsLabel,
  groupActionLabels,
  hover,
  hoverCopy,
  hoverLabels,
  depth,
  onToggle,
  onCreateSession,
  onNewGroup,
  onRenameWorkspace,
  onDeleteWorkspace,
  onToggleGroup,
  onRenameGroup,
  onDeleteGroup,
  onCreateSessionInGroup,
  renderSession,
  renderChildWorkspace,
}: WorkspaceSectionProps): ReactElement {
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
    <section className="wg-workspace" style={indent}>
      <WorkspaceRow
        title={title}
        collapsed={collapsed}
        folderActive={folderActive}
        onToggle={onToggle}
        onCreateSession={onCreateSession}
        onNewGroup={onNewGroup}
        onRename={onRenameWorkspace}
        onDelete={onDeleteWorkspace}
        hover={hover}
        hoverCopy={hoverCopy}
        hoverLabels={hoverLabels}
        labels={labels}
        virtualWorkspace={virtualWorkspace}
        onSelectVirtualWorkspace={onSelectVirtualWorkspace}
        parentGroup={parentGroup}
        onSelectParentGroup={onSelectParentGroup}
      />
      <CollapsibleBody open={!collapsed}>
        <div className="wg-workspace-body">
          {/* 子工作区排在会话分组之前，与分组内部同一顺序，文件夹在前 */}
          {childIds.length === 0 ? null : (
            <div className="wg-nest">{childIds.map(renderChildWorkspace)}</div>
          )}
          {/* 只有用户建过分组时才渲染分组结构 */}
          {layout.groups.map((section) => (
            <GroupSection
              key={section.id}
              section={section}
              collapsed={isGroupCollapsed(section.id)}
              onToggle={() => onToggleGroup(section.id)}
              onRename={() => onRenameGroup({ id: section.id, label: section.label })}
              onDelete={() => onDeleteGroup({ id: section.id, label: section.label })}
              onCreateSession={() =>
                onCreateSessionInGroup({ id: section.id, label: section.label })
              }
              labels={groupActionLabels}
              renderChildWorkspace={renderChildWorkspace}
              sessionsLabel={sessionsLabel}
            >
              {[...section.sessions].sort(compareSessionRows).map(renderSession)}
            </GroupSection>
          ))}
          {/* 未归组的会话平铺在工作区下，不套任何分组头
              同一段里还有子工作区或会话分组时，两者的行文字左缘处在同一条竖线上
              这时给会话这一段加一个小标题并拉开间距，否则读不出哪几行是会话 */}
          {layout.loose.length === 0 ? null : (
            <div className="wg-sessions">
              {childIds.length > 0 || layout.groups.length > 0 ? (
                <div className="wg-sessions-title" data-wg-stagger="">
                  {sessionsLabel}
                </div>
              ) : null}
              {[...layout.loose].sort(compareSessionRows).map(renderSession)}
            </div>
          )}
          {hasAnyRow ? null : (
            // 空态也是折叠体里要露面的子元素，与行一样参与逐个淡入
            <div className="wg-empty" data-wg-stagger="">
              {emptyLabel}
            </div>
          )}
        </div>
      </CollapsibleBody>
    </section>
  )
}
