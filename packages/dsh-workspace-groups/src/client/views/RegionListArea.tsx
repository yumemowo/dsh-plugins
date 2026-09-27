/**
 * 列表区：搜索态、平铺态与按工作区分组态三条分支
 *
 * 工作区区块的递归由 `WorkspaceNode` 承担，子工作区仍是一个完整的工作区块，只是从父工作区的折叠体里长出来
 * 它自己属于哪个容器、往下又有哪些子工作区都问 `nesting`，深度因此不必沿递归手工累加
 * 行级 memo 的前提是 props 身份稳定，因此传下去的都是原语或内容稳定值
 *
 * 会话行元素由 `sessionRowElement` 统一构造：工作区内的行与未分组桶里的行共用同一套状态位、
 * 悬停卡片与空白行取舍，两处只在菜单与归组上下文上不同
 *
 * 这一层只声明自己真正消费的那几格：折叠态、揭示标记、派生布局与四个语义回调
 * 区域容器持有的是更大的交互状态与布局，逐字段转发会让这里跟着别人一起变，因此按形状收窄
 */
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { ReactElement } from 'react'
import type { OfficialSessionActions } from '../actions.ts'
import { buildLayout, containsSession, groupIdOfSession, virtualWorkspaceIdOf } from '../data/layout.ts'
import type { Nesting } from '../data/nest.ts'
import { relativeTimeOfRow, statusViewOfRow } from '../data/rows.ts'
import type { SearchMatch, SessionSearchResult } from '../data/search.ts'
import type { RootLayout, SessionRow, ViewMode } from '../data/types.ts'
import type { RegionLabels } from '../labels.ts'
import type { RegionTranslate } from '../locales.ts'
import type { ParentGroupMenuInput, VirtualWorkspaceMenuInput } from '../menus.tsx'
import type { OfficialHoverLabels } from '../official.ts'
import type { WorkspaceGroupsSnapshot } from '../remote.ts'
import { abbreviateHomePath } from '../utils/pathUtils.ts'
import { CollapsibleBody } from './components/CollapsibleBody.tsx'
import { SearchResults } from './SearchControl.tsx'
import { SessionRowMenu } from './SessionRowMenu.tsx'
import type { SessionGroupingContext } from './SessionRowMenu.tsx'
import { SessionRowView } from './SessionRowView.tsx'
import { VirtualWorkspaceSection } from './VirtualWorkspaceSection.tsx'
import { WorkspaceRow } from './WorkspaceRow.tsx'
import type { WorkspaceRowLabels } from './WorkspaceRow.tsx'
import { WorkspaceSection } from './WorkspaceSection.tsx'

/** 渲染一个会话行所需的稳定上下文 */
export interface SessionRowScope {
  labels: RegionLabels
  currentSessionId: string | undefined
  official: OfficialSessionActions | undefined
  hoverLabels: OfficialHoverLabels | undefined
  statusSnapshot: SessionStatusSnapshot
  /** 行尾与卡片相对时间的基准时刻，渲染当刻取一次 */
  now: number
  revealSessionId: string | undefined
  acknowledgeReveal: (sessionId: string) => void
  openSession: (sessionId: string) => void
  t: RegionTranslate
}

/** 列表侧消费的派生布局 */
export interface RegionListLayout {
  /** 聚焦生效后的根节点布局 */
  listLayout: RootLayout
  /** 未经聚焦裁剪的根节点布局，工作区行的「移动工作区分组」菜单按它的分组段列出候选 */
  rootLayout: RootLayout
  nesting: Nesting
  workspaceById: ReadonlyMap<string, WorkspaceView>
  /** 真的聚焦在某一片内容上时，「未分组」区段整段隐藏 */
  focused: boolean
}

/** 列表侧消费的折叠态与揭示标记 */
export interface RegionListUiState {
  collapsedWorkspaces: Record<string, boolean>
  collapsedGroups: Record<string, boolean>
  collapsedVirtualWorkspaces: Record<string, boolean>
  /** 从搜索结果打开、等待滚进可视区的那一行 */
  revealSessionId: string | undefined
  /** 被打开的那一行滚进可视区后清掉标记 */
  acknowledgeReveal: (sessionId: string) => void
  /** 折叠状态取反，默认展开，因此只有显式 true 才算折叠 */
  toggleWorkspace: (key: string) => void
  toggleGroup: (key: string) => void
  toggleVirtualWorkspace: (key: string) => void
}

/**
 * 列表侧能打开的编辑入口
 *
 * 收的是「编辑哪个对象」而不是状态 setter，浮层形状因此对列表不可见
 */
export interface RegionListEdits {
  onNewGroup: (workspaceId: string) => void
  onRenameWorkspace: (workspaceId: string, title: string) => void
  onDeleteWorkspace: (workspaceId: string, label: string) => void
  onRenameGroup: (workspaceId: string, groupId: string, label: string) => void
  onDeleteGroup: (workspaceId: string, groupId: string, label: string) => void
  onRenameVirtualWorkspace: (groupId: string, label: string) => void
  onDeleteVirtualWorkspace: (groupId: string, label: string) => void
}

/** 列表侧消费的命令，四个都随行下发，因此是稳定引用 */
export interface RegionListCommands {
  selectSessionGroup: (workspaceId: string, sessionId: string, id: string) => void
  selectVirtualWorkspace: (workspaceId: string, id: string) => void
  selectParentGroup: (workspaceId: string, id: string) => void
  createSessionIn: (workspaceId: string, groupId: string) => void
}

/**
 * 一个工作区块递归渲染时共用的稳定上下文
 *
 * 布局、交互状态与编辑入口各自成格传的是窄形状而不是逐字段转发：递归层真正用到的只是其中几格
 * 全部字段都放进来会让每个消费方都以为自己能改任何东西
 */
export interface WorkspaceNodeScope {
  snapshot: WorkspaceGroupsSnapshot
  layout: RegionListLayout
  ui: RegionListUiState
  edits: RegionListEdits
  commands: RegionListCommands
  /** 会话 id → 该工作区的会话行，只随会话快照重建 */
  rowsByWorkspace: ReadonlyMap<string, readonly SessionRow[]>
  currentSessionId: string | undefined
  home: string | undefined
  labels: RegionLabels
  workspaceRowLabels: WorkspaceRowLabels
  session: SessionRowScope
}

interface RegionListAreaProps {
  viewMode: ViewMode
  searching: boolean
  searchResult: SessionSearchResult
  searchResultLimit: number
  onOpenSearchResult: (match: SearchMatch) => void
  /** 递归层与这一层共用同一份上下文，由容器合成一次后整份传下来 */
  scope: WorkspaceNodeScope
  flatRows: readonly SessionRow[]
  stray: readonly SessionRow[]
  ungroupedCollapsed: boolean
  onToggleUngrouped: () => void
}

export function RegionListArea(props: RegionListAreaProps): ReactElement {
  const { scope } = props
  const { labels, session, currentSessionId } = scope

  if (props.searching) {
    return (
      <SearchResults
        result={props.searchResult}
        limit={props.searchResultLimit}
        currentSessionId={currentSessionId}
        statusOf={(match) => statusViewOfRow(match.row, session.statusSnapshot, labels.status).dot}
        ungrouped={labels.ungrouped}
        labels={labels.search}
        onOpen={props.onOpenSearchResult}
      />
    )
  }

  if (props.viewMode === 'flat') {
    return (
      /* 平铺：全部可见会话在同一条列表里，与官方「单列表」（groupBy: 'flat'）一致 */
      <div className="wg-list wg-panel">
        <div className="wg-flat-list">
          {props.flatRows.map((row) => sessionRowElement(row, session, undefined, true))}
        </div>
        {props.flatRows.length === 0 ? <div className="wg-empty">{labels.empty}</div> : null}
        <RegionNotes nested={scope.snapshot.nested} labels={labels} />
      </div>
    )
  }

  return (
    /* 按工作区：工作区分组段 + 未归组工作区 + 末尾的「未分组」桶 */
    <div className="wg-list wg-panel">
      {/* 工作区分组段排在前面，未归组的工作区平铺在其后、不带区段头
          没有建过分组时 rootLayout.groups 为空、全部工作区都在 loose 里
          这一层因此不改变任何行的位置 */}
      {scope.layout.listLayout.groups.map((section) => (
        <VirtualWorkspaceSection
          key={section.id}
          section={section}
          collapsed={scope.ui.collapsedVirtualWorkspaces[section.id] === true}
          emptyLabel={labels.virtualWorkspaceEmpty}
          labels={{
            actions: labels.virtualWorkspaceActions,
            // 菜单项用通用动词，与工作区行、会话分组行同一分工
            // 只有对话框标题才点明对象（`renameVirtualWorkspace`，见 RegionDialogs）
            rename: labels.rename,
            delete: labels.deleteVirtualWorkspace,
          }}
          onToggle={() => scope.ui.toggleVirtualWorkspace(section.id)}
          onRename={() => scope.edits.onRenameVirtualWorkspace(section.id, section.label)}
          onDelete={() => scope.edits.onDeleteVirtualWorkspace(section.id, section.label)}
        >
          {section.roots.map((workspaceId) => (
            <WorkspaceNode key={workspaceId} workspaceId={workspaceId} scope={scope} />
          ))}
        </VirtualWorkspaceSection>
      ))}
      {scope.layout.listLayout.loose.map((workspaceId) => (
        <WorkspaceNode key={workspaceId} workspaceId={workspaceId} scope={scope} />
      ))}
      {/* 未分组桶排在全部工作区之后，与官方一致
        * 空则整段不渲染
        * 聚焦时整段隐藏：这些会话不属于任何一个工作区，聚焦到某一片内容时与它们无关 */}
      {props.stray.length === 0 || scope.layout.focused ? null : (
        <section className="wg-workspace">
          <WorkspaceRow
            title={labels.ungrouped}
            collapsed={props.ungroupedCollapsed}
            folderActive={
              !props.ungroupedCollapsed &&
              containsSession(props.stray, currentSessionId)
            }
            onToggle={props.onToggleUngrouped}
            labels={scope.workspaceRowLabels}
          />
          <CollapsibleBody open={!props.ungroupedCollapsed}>
            <div className="wg-workspace-body">
              {/* 这些会话不属于任何工作区，没有分组可归，因此菜单里只有官方三项（归组项无处落）
                * 宿主未提供官方服务时菜单会是空的，那时直接渲染无菜单的行，不留点不动的省略号 */}
              <div className="wg-sessions">
                {props.stray.map((row) => ungroupedRowElement(row, session))}
              </div>
            </div>
          </CollapsibleBody>
        </section>
      )}
      <RegionNotes nested={scope.snapshot.nested} labels={labels} />
    </div>
  )
}

/**
 * 一个工作区区块，以及它体内按 cwd 路径挂着的子工作区
 *
 * 递归由这一个组件承担，子工作区仍是一个完整的工作区块，只是从父工作区的折叠体里长出来
 * 它自己属于哪个容器、往下又有哪些子工作区都问 `nesting`，深度因此不必沿递归手工累加
 *
 * 行级 memo 的前提是 props 身份稳定，因此这里传下去的都是原语或内容稳定值
 */
function WorkspaceNode({
  workspaceId,
  scope,
}: {
  workspaceId: string
  scope: WorkspaceNodeScope
}): ReactElement | null {
  const { snapshot, layout, ui, edits, commands, rowsByWorkspace, labels } = scope
  const workspace = layout.workspaceById.get(workspaceId)
  // 布局只包含快照里存在的工作区，因此这里不会落空，防御一下避免类型断言
  if (workspace === undefined) return null
  const collapsed = ui.collapsedWorkspaces[workspaceId] === true
  const built = buildLayout(
    rowsByWorkspace.get(workspaceId) ?? [],
    snapshot.byWorkspace[workspaceId] ?? [],
    // 组内子工作区，放进这个分组、且父是当前工作区的那些。它们自己可能还有后代，渲染时逐层向下取
    (groupId) => layout.nesting.groupedChildIdsOf(workspaceId, groupId),
    layout.nesting.looseChildIdsOf(workspaceId),
  )

  /**
   * 该工作区行上那份「移动工作区分组」菜单的选项集
   *
   * 归属与可选分组都随行而变，因此不能与 `workspaceRowLabels` 一起缓存
   * 每行一份新对象，行级 memo 因此按内容比对（`sameGroupSections`）
   */
  const virtualWorkspaceMenu: VirtualWorkspaceMenuInput = {
    sections: layout.rootLayout.groups,
    currentGroupId: virtualWorkspaceIdOf(layout.rootLayout.groups, workspaceId),
    // 菜单项用带省略号的那份：点下去还要再填一次名字
    newLabel: labels.newVirtualWorkspaceMenu,
    moveToLabel: labels.moveToVirtualWorkspace,
    ungroupLabel: labels.ungroupWorkspace,
  }

  /**
   * 该工作区行上那份「移动到分组…」菜单的选项集
   *
   * 候选是它 cwd 路径上的任意一个现存祖先，放进谁的分组谁就是父——因此不是一个自动选定的最近祖先
   * 只有真的有分组可进时这一项才出现，父工作区名下没有分组时它整项渲染成禁用，不留一个点不动的热区
   * 祖先按从近到远列出，与列表里的层级顺序一致
   */
  const parentGroupMenu = ((): ParentGroupMenuInput | undefined => {
    const current = layout.nesting.bindingOf(workspaceId)
    const candidates = layout.nesting.ancestorsOf(workspaceId).map((parentId) => {
      const parent = layout.workspaceById.get(parentId)
      return {
        parentId,
        parentLabel: parent?.title ?? parentId,
        groups: (snapshot.byWorkspace[parentId] ?? []).map((group) => ({
          id: group.id,
          label: group.name,
        })),
      }
    })
    const movable = candidates.some((ancestor) => ancestor.groups.length > 0)
    // 既没有可移入的目标、也不在任何一个分组里时整项不渲染，留着就是一个点不动的死入口
    // 这与「虚拟工作区分组」那一项不同——那一项的子菜单里总有一个「新建」可点
    if (!movable && current === undefined) return undefined
    return {
      candidates,
      currentGroupId: current?.groupId ?? '',
      moveToLabel: labels.nested.moveToGroup,
      ungroupLabel: labels.nested.ungroupChild,
    }
  })()

  return (
    <WorkspaceSection
      key={workspaceId}
      row={{
        title: workspace.title,
        collapsed,
        // 官方只在「展开且含当前会话」时把文件夹染成强调色
        folderActive:
          !collapsed &&
          containsSession(rowsByWorkspace.get(workspaceId) ?? [], scope.currentSessionId),
        labels: scope.workspaceRowLabels,
        virtualWorkspace: virtualWorkspaceMenu,
        parentGroup: parentGroupMenu,
        // 「移动工作区分组」入口：把该工作区放进某个根节点分组，或先建一个再放
        onSelectVirtualWorkspace: (id) => commands.selectVirtualWorkspace(workspaceId, id),
        onSelectParentGroup: (id) => commands.selectParentGroup(workspaceId, id),
        hover: {
          label: workspace.title,
          path: abbreviateHomePath(workspace.path, scope.home),
          created: labels.hover.created(Date.parse(workspace.createdAt)),
        },
        hoverCopy: workspace.path,
        hoverLabels: scope.session.hoverLabels,
        onToggle: () => ui.toggleWorkspace(workspaceId),
        onCreateSession: () => commands.createSessionIn(workspaceId, ''),
        onNewGroup: () => edits.onNewGroup(workspaceId),
        onRename: () => edits.onRenameWorkspace(workspaceId, workspace.title),
        onDelete: () => edits.onDeleteWorkspace(workspaceId, workspace.title),
      }}
      layout={built}
      depth={layout.nesting.levelOf(workspaceId)}
      isGroupCollapsed={(groupId) => ui.collapsedGroups[`${workspaceId}:${groupId}`] === true}
      emptyLabel={labels.empty}
      sessionsLabel={labels.sessions}
      groupActionLabels={{
        actions: labels.groupActions,
        newSessionItem: labels.newSessionItem,
        rename: labels.rename,
        delete: labels.deleteGroup,
        newSession: labels.newSessionInGroup,
      }}
      groupActions={{
        onToggle: (groupId) => ui.toggleGroup(`${workspaceId}:${groupId}`),
        onRename: (section) => edits.onRenameGroup(workspaceId, section.id, section.label),
        onDelete: (section) => edits.onDeleteGroup(workspaceId, section.id, section.label),
        onCreateSession: (section) => commands.createSessionIn(workspaceId, section.id),
      }}
      renderChildWorkspace={(childId) => (
        <WorkspaceNode key={childId} workspaceId={childId} scope={scope} />
      )}
      renderSession={(row) =>
        sessionRowElement(row, scope.session, {
          workspaceId,
          sections: built.groups,
          currentGroupId: groupIdOfSession(built.groups, row.id),
          groupLabel: labels.moveToGroup,
          ungroupLabel: labels.ungroup,
          onSelectGroup: commands.selectSessionGroup,
        })
      }
    />
  )
}

/**
 * 一个会话行行尾与卡片要用的时间文案
 *
 * 两处只在格式化函数上不同：行尾是官方的紧凑形态，卡片要套「…前」模板
 * 官方服务不在场时两者都不渲染，卡片那份也因此跟着缺席
 */
function rowTimes(row: SessionRow, context: SessionRowScope): {
  time: string | undefined
  hoverTime: string | undefined
} {
  const { official, labels, now } = context
  return {
    time: relativeTimeOfRow(row, official?.relativeTime, now),
    hoverTime: relativeTimeOfRow(row, official === undefined ? undefined : labels.hover.timeAgo, now),
  }
}

/**
 * 渲染一个会话行
 *
 * 空白行的名字取语言包的固定名（官方 `session.new`），并且像官方一样不挂行尾菜单
 * 它只是「准备开始一个新会话」的占位，没有会话可重命名或归档
 * `grouping` 缺省表示该行没有分组可归（平铺列表）
 *
 * 传下去的字段都是原语或稳定引用，动作传的是未绑定的函数本身，行级 memo 要按字段比对，任何一处每渲染新建都会让它整片失效
 * @param flat - 平铺列表里的行，行首没有状态位时整格不占位
 */
export function sessionRowElement(
  row: SessionRow,
  context: SessionRowScope,
  grouping?: SessionGroupingContext,
  flat = false,
): ReactElement {
  // 只有被打开的那一行带揭示请求，它的闭包每渲染新建一份，因此每次重渲染会让这一行重渲染一次——行滚进可视区并回报后标记即被清掉
  // 这个代价只落在该行上
  const reveal =
    row.id === context.revealSessionId ? () => context.acknowledgeReveal(row.id) : undefined
  // 状态只推导一次，行首那个点与卡片那几条取自同一份结果
  const view = statusViewOfRow(row, context.statusSnapshot, context.labels.status)
  const { time, hoverTime } = rowTimes(row, context)
  if (row.blank) {
    return (
      <SessionRowView
        key={row.id}
        sessionId={row.id}
        title={context.labels.newSession}
        selected={row.id === context.currentSessionId}
        status={view.dot}
        time={time}
        statuses={view.statuses}
        hoverTime={hoverTime}
        hoverLabels={context.hoverLabels}
        flat={flat}
        onOpenSession={context.openSession}
        onReveal={reveal}
      />
    )
  }
  return (
    <SessionRowMenu
      key={row.id}
      row={row}
      title={row.title}
      selected={row.id === context.currentSessionId}
      status={view.dot}
      time={time}
      statuses={view.statuses}
      hoverTime={hoverTime}
      hoverLabels={context.hoverLabels}
      grouping={grouping}
      official={context.official}
      actionsLabel={context.labels.sessionActions}
      flat={flat}
      onOpenSession={context.openSession}
      t={context.t}
      onReveal={reveal}
    />
  )
}

/**
 * 渲染未分组桶里的一个会话行
 *
 * 这些会话不属于任何工作区，没有分组可归，因此菜单里只有官方三项（归组项无处落）
 * 宿主未提供官方服务时菜单会是空的，那时直接渲染无菜单的行，不留点不动的省略号
 * 与工作区内的行分开成两处：那里的行按分组上下文渲染，这里的行没有那层上下文
 */
export function ungroupedRowElement(row: SessionRow, context: SessionRowScope): ReactElement {
  const view = statusViewOfRow(row, context.statusSnapshot, context.labels.status)
  const reveal =
    row.id === context.revealSessionId ? () => context.acknowledgeReveal(row.id) : undefined
  const { time, hoverTime } = rowTimes(row, context)
  if (context.official === undefined || row.blank) {
    return (
      <SessionRowView
        key={row.id}
        sessionId={row.id}
        title={row.blank ? context.labels.newSession : row.title}
        selected={row.id === context.currentSessionId}
        status={view.dot}
        time={time}
        statuses={view.statuses}
        hoverTime={hoverTime}
        hoverCopy={row.blank ? undefined : row.title}
        hoverLabels={context.hoverLabels}
        onOpenSession={context.openSession}
        onReveal={reveal}
      />
    )
  }
  return (
    <SessionRowMenu
      key={row.id}
      row={row}
      title={row.title}
      selected={row.id === context.currentSessionId}
      status={view.dot}
      time={time}
      statuses={view.statuses}
      hoverTime={hoverTime}
      hoverLabels={context.hoverLabels}
      official={context.official}
      onOpenSession={context.openSession}
      actionsLabel={context.labels.sessionActions}
      t={context.t}
      onReveal={reveal}
    />
  )
}

/**
 * 列表底部那两条说明
 *
 * 嵌套开关是根节点级的设置，平铺列表下也要说明它被关掉了
 */
function RegionNotes({
  nested,
  labels,
}: {
  nested: boolean
  labels: RegionLabels
}): ReactElement {
  return (
    <>
      {nested ? null : (
        <div className="wg-note wg-note-nested" role="status">
          {`${labels.nested.disabledNote} ${labels.nested.reEnableHint}`}
        </div>
      )}
      <div className="wg-note">{labels.unimplemented}</div>
    </>
  )
}
