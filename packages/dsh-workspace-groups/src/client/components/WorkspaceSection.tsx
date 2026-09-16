/**
 * 一个工作区区块：标题行 + 折叠体（分组、平铺的未归组会话、空态）
 *
 * 折叠状态由区域组件按 key 持有，这里只消费布尔值，因此不同工作区、
 * 不同分组之间的开合互不影响
 */
import type { ReactElement, ReactNode } from "react";
import { GroupSection } from "./GroupSection.tsx";
import { WorkspaceRow } from "./WorkspaceRow.tsx";
import type { WorkspaceRowLabels } from "./WorkspaceRow.tsx";
import type { SessionRow, WorkspaceLayout } from "../data/types.ts";

export interface WorkspaceSectionProps {
  title: string;
  collapsed: boolean;
  folderActive: boolean;
  layout: WorkspaceLayout;
  /** 分组的折叠态查询；折叠键的构成由区域组件持有 */
  isGroupCollapsed: (groupId: string) => boolean;
  /** 分组头与工作区行共用的文案 */
  labels: WorkspaceRowLabels;
  emptyLabel: string;
  /** 分组行行尾操作位的文案 */
  groupActionLabels: {
    /** `...` 按钮的无障碍标签，取分组名 */
    actions: (name: string) => string;
    /** 「重命名分组」菜单项 */
    rename: string;
    /** 「删除分组」菜单项 */
    delete: string;
    /** `+` 按钮的无障碍标签，取分组名 */
    newSession: (name: string) => string;
  };
  onToggle: () => void;
  onCreateSession: () => void;
  onNewGroup: () => void;
  onRenameWorkspace: () => void;
  onDeleteWorkspace: () => void;
  onToggleGroup: (groupId: string) => void;
  onRenameGroup: (section: { id: string; label: string }) => void;
  onDeleteGroup: (section: { id: string; label: string }) => void;
  /** 在该分组新建会话 */
  onCreateSessionInGroup: (section: { id: string; label: string }) => void;
  /** 把一个会话行渲染成元素；渲染方式由区域组件决定（是否带归组菜单） */
  renderSession: (row: SessionRow) => ReactNode;
}

/**
 * 会话行的显示顺序：新建中的空白会话排最前，其余按最近更新倒序
 *
 * 空白会话是刚点出来的那条占位行，还没有自己的内容与时间，排在所属区段
 *（分组内或未归组区）的最前才符合「刚新建的就是这条」的预期；它一旦启用
 * 就回到与其他会话同一套排序里
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
  emptyLabel,
  groupActionLabels,
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
}: WorkspaceSectionProps): ReactElement {
  const hasAnyRow = layout.groups.length > 0 || layout.loose.length > 0;
  return (
    <section className="wg-workspace">
      <WorkspaceRow
        title={title}
        collapsed={collapsed}
        folderActive={folderActive}
        onToggle={onToggle}
        onCreateSession={onCreateSession}
        onNewGroup={onNewGroup}
        onRename={onRenameWorkspace}
        onDelete={onDeleteWorkspace}
        labels={labels}
      />
      {collapsed ? null : (
        <div className="wg-workspace-body">
          {/* 只有用户建过分组时才渲染分组结构 */}
          {layout.groups.map((section) => (
            <GroupSection
              key={section.id}
              section={section}
              collapsed={isGroupCollapsed(section.id)}
              onToggle={() => onToggleGroup(section.id)}
              onRename={() =>
                onRenameGroup({ id: section.id, label: section.label })
              }
              onDelete={() =>
                onDeleteGroup({ id: section.id, label: section.label })
              }
              onCreateSession={() =>
                onCreateSessionInGroup({ id: section.id, label: section.label })
              }
              labels={groupActionLabels}
            >
              {[...section.sessions].sort(compareSessionRows).map(renderSession)}
            </GroupSection>
          ))}
          {/* 未归组的会话平铺在工作区下，不套任何分组头 */}
          {layout.loose.length === 0 ? null : (
            <div className="wg-sessions">
              {[...layout.loose].sort(compareSessionRows).map(renderSession)}
            </div>
          )}
          {hasAnyRow ? null : <div className="wg-empty">{emptyLabel}</div>}
        </div>
      )}
    </section>
  );
}
