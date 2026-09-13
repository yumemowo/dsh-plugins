import * as React from 'react'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { Group } from './remote.ts'

/**
 * 一个会话在列表中的渲染行。
 *
 * 只承载展示所需的事实，避免把整份 Session 快照复制进 UI 层。
 */
export interface SessionRow {
  id: string
  title: string
  blank: boolean
  running: boolean
  completed: boolean
  updatedAt: number
}

/** 用户创建的一个分组。 */
export interface GroupSection {
  id: string
  label: string
  sessions: SessionRow[]
}

/**
 * 一个工作区的渲染布局。
 *
 * `loose` 是不属于任何分组的会话：它们平铺在工作区下，没有分组头。
 * 只有用户真正创建过分组，才会出现分组结构。
 */
export interface WorkspaceLayout {
  groups: GroupSection[]
  loose: SessionRow[]
}

/** 会话是否为子代理来源；侧边栏不展示这些行。 */
function isSubagent(summary: SessionSummary): boolean {
  return summary.origin === 'subagent'
}

/**
 * 判定一个会话是否应该出现在侧边栏。
 *
 * 与官方组件保持一致：子代理来源永久隐藏；已归档的会话隐藏
 *（归档集是注册表全局的，会话仍留在 `sessionIds` 里以便取消归档时恢复位置）；
 * 空白会话只保留当前选中的那一条，作为「新会话」占位行。
 * @param summary - 会话摘要。
 * @param current - 当前选中的会话 id。
 * @param archived - 注册表全局的归档集合。
 * @returns 是否展示。
 */
function isSessionVisible(
  summary: SessionSummary,
  current: string | undefined,
  archived: ReadonlySet<string>,
): boolean {
  if (isSubagent(summary)) return false
  if (archived.has(String(summary.id))) return false
  return summary.blank !== true || String(summary.id) === current
}

/**
 * 向用户询问一段文本。
 *
 * 阶段一用最朴素的 `prompt`，不引入产品内的对话框组件。
 * @param message - 提示语。
 * @param initial - 预填值。
 * @returns 用户输入，取消时返回 null。
 */
function askText(message: string, initial?: string): string | null {
  const fn = (globalThis as { prompt?: (text: string, value?: string) => string | null }).prompt
  if (typeof fn !== 'function') return null
  return initial === undefined ? fn(message) : fn(message, initial)
}

/** 向用户确认一次破坏性操作。 */
function confirmAction(message: string): boolean {
  const fn = (globalThis as { confirm?: (text: string) => boolean }).confirm
  return typeof fn === 'function' ? fn(message) : false
}

/** 把一个会话摘要投影成渲染行。 */
function toRow(summary: SessionSummary): SessionRow {
  return {
    id: String(summary.id),
    title: summary.displayTitle,
    blank: summary.blank === true,
    running: summary.running === true,
    completed: summary.completed === true,
    updatedAt: summary.updatedAt,
  }
}

/**
 * 把工作区的会话按分组元数据切成「分组」与「未归组」两部分。
 *
 * 分组里记录的会话若已不在列表中（被归档或删除），会被静默跳过；
 * 未归组的会话按传入顺序平铺。这样即使元数据与真实列表出现偏差，界面也不会丢行。
 * @param sessions - 工作区当前可见的会话。
 * @param groups - 该工作区的分组定义。
 * @returns 分组段与未归组行。
 */
export function buildLayout(sessions: readonly SessionRow[], groups: readonly Group[]): WorkspaceLayout {
  const byId = new Map(sessions.map((row) => [row.id, row]))
  const claimed = new Set<string>()
  const sections: GroupSection[] = []

  for (const group of groups) {
    const rows: SessionRow[] = []
    for (const id of group.sessionIds) {
      const row = byId.get(id)
      // 元数据里存在的会话可能已经归档；列表是事实来源，跳过即可。
      if (row === undefined || claimed.has(id)) continue
      claimed.add(id)
      rows.push(row)
    }
    sections.push({ id: group.id, label: group.name, sessions: rows })
  }

  return { groups: sections, loose: sessions.filter((row) => !claimed.has(row.id)) }
}

/**
 * 判定一个会话当前所属的分组。
 * @param sections - 已切分好的分组段。
 * @param sessionId - 目标会话。
 * @returns 所属分组 id；不属于任何分组时返回空串。
 */
export function groupIdOfSession(sections: readonly GroupSection[], sessionId: string): string {
  for (const section of sections) {
    if (section.sessions.some((row) => row.id === sessionId)) return section.id
  }
  return ''
}

/** 一个会话行在分组选择器里的取值：分组 id，或空串表示不属于任何分组。 */
export type GroupChoice = string

/** 会话行的分组选择器回调。 */
export type MoveHandler = (sessionId: string, groupId: GroupChoice) => void

/** 16px 线性图标，颜色继承自父级。 */
function Icon({ path }: { path: string }): React.ReactElement {
  return React.createElement(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('path', { d: path }),
  )
}

const CHEVRON_PATH = 'M6 3.5L10.5 8L6 12.5'
const PLUS_PATH = 'M8 3.5v9M3.5 8h9'
const PENCIL_PATH = 'M11.5 3.5l1 1-7 7-1.5.5.5-1.5 7-7z'
const CROSS_PATH = 'M4.5 4.5l7 7M11.5 4.5l-7 7'
// 会话用气泡图标，与「新建分组」的加号区分开。
const NEW_SESSION_PATH = 'M3 4.5h10v6.5H7.5L4.5 13.5v-2.5H3z'

/** 28px 圆形图标按钮，悬停显示。 */
function IconButton(props: {
  title: string
  path: string
  onClick: () => void
  className?: string
}): React.ReactElement {
  return React.createElement(
    'button',
    {
      type: 'button',
      className: `wg-icon-button${props.className === undefined ? '' : ` ${props.className}`}`,
      title: props.title,
      'aria-label': props.title,
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation()
        props.onClick()
      },
    },
    React.createElement(Icon, { path: props.path }),
  )
}

/** 组件消费的 props：侧边栏 shell 的宿主共享 + 全局数据 hook + 注入的动作与文案。 */
export interface WorkspaceGroupsProps {
  /** shell 折叠状态：宽栏渲染完整内容，窄栏只渲染展开入口。 */
  wide: boolean
  /** 窄栏图标请求展开侧边栏。 */
  expandSidebar: () => void
  /** 全局工作区快照选择器；归档集合与工作区行来自同一份快照。 */
  useWorkspaces: (
    selector: (state: {
      items: readonly WorkspaceView[]
      archivedSessionIds: readonly string[]
    }) => unknown,
  ) => unknown
  /** 全局会话列表选择器。 */
  useSessions: (selector: (state: SessionListState) => unknown) => unknown
  /** 打开一个会话。 */
  openSession: (sessionId: string) => void
  /** 在指定工作区创建一个新会话。 */
  startSession: (workspaceId: string) => void
  /** 读取分组快照。 */
  loadGroups: () => Promise<Record<string, Group[]>>
  /** 新建分组。 */
  createGroup: (workspaceId: string, name: string) => Promise<void>
  /** 重命名分组。 */
  renameGroup: (workspaceId: string, groupId: string, name: string) => Promise<void>
  /** 删除分组；组内会话回到未归组。 */
  deleteGroup: (workspaceId: string, groupId: string) => Promise<void>
  /** 把会话移入分组；空串表示移出分组。 */
  moveSession: (workspaceId: string, sessionId: string, groupId: GroupChoice) => Promise<void>
  /** 界面文案。 */
  labels: {
    title: string
    newGroup: string
    newSession: string
    groupNamePrompt: string
    renameGroup: string
    deleteGroup: string
    confirmDeleteGroup: string
    moveTo: string
    ungroupedOption: string
    empty: string
    unimplemented: string
  }
}

/**
 * 侧边栏的工作区浏览区域。
 *
 * 这是 `sidebar.workspaces` 的接替者：该插槽是 single 类型，本包以
 * `priority: -1` 注册从而成为渲染者，官方 ui-workspace 的同名注册仍留在
 * 注册表中但不再渲染。
 *
 * 只有用户创建的分组才有分组头；未归组的会话直接平铺在工作区下，
 * 与原生会话列表一致。折叠状态按「工作区」与「工作区+分组」分别记录，
 * 因此不同工作区、不同分组之间互不影响。
 */
export function WorkspaceGroupsRegion(props: WorkspaceGroupsProps): React.ReactElement | null {
  const {
    wide,
    expandSidebar,
    useWorkspaces,
    useSessions,
    openSession,
    startSession,
    loadGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    moveSession,
    labels,
  } = props

  const workspaces = useWorkspaces((state) => state.items) as readonly WorkspaceView[]
  // 归档集是注册表全局的：归档会话仍留在工作区的 sessionIds 里，
  // 必须显式过滤，否则已归档的会话会继续出现在列表里。
  const archivedSessionIds = useWorkspaces(
    (state) => state.archivedSessionIds,
  ) as readonly string[]
  const sessions = useSessions((state) => state) as SessionListState
  const [groups, setGroups] = React.useState<Record<string, Group[]>>({})
  const [collapsedWorkspaces, setCollapsedWorkspaces] = React.useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<string, boolean>>({})

  const currentSessionId = sessions.current === undefined ? undefined : String(sessions.current)

  const reload = React.useCallback(() => {
    let cancelled = false
    loadGroups()
      .then((next) => {
        if (!cancelled) setGroups(next)
      })
      .catch(() => {
        // 元数据不可用时退化为「全部分组消失」，会话仍按未归组平铺，界面可用。
        if (!cancelled) setGroups({})
      })
    return () => {
      cancelled = true
    }
  }, [loadGroups])

  React.useEffect(() => reload(), [reload])

  /** 执行一次改动并刷新本地快照。 */
  const apply = React.useCallback(
    (action: Promise<void>) => {
      void action.then(() => reload())
    },
    [reload],
  )

  // 窄栏只保留展开入口，与官方组件的 rail 行为一致。
  if (!wide) {
    return React.createElement(
      'div',
      { className: 'wg-rail' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wg-rail-button',
          title: labels.title,
          onClick: expandSidebar,
        },
        React.createElement(Icon, { path: CHEVRON_PATH }),
      ),
    )
  }

  const rowsByWorkspace = groupSessionsByWorkspace(sessions, workspaces, archivedSessionIds)

  return React.createElement(
    'div',
    { className: 'wg-root' },
    React.createElement(
      'div',
      { className: 'wg-list' },
      ...workspaces.map((workspace) => {
        const workspaceId = String(workspace.workspaceId)
        const workspaceGroups = groups[workspaceId] ?? []
        const layout = buildLayout(rowsByWorkspace.get(workspaceId) ?? [], workspaceGroups)
        const workspaceCollapsed = collapsedWorkspaces[workspaceId] === true
        const hasAnyRow = layout.groups.length > 0 || layout.loose.length > 0

        /** 每个会话的分组选择项：不属于任何分组 + 本工作区全部分组。 */
        const options = [
          { id: '', label: labels.ungroupedOption },
          ...workspaceGroups.map((group) => ({ id: group.id, label: group.name })),
        ]

        const sessionRow = (row: SessionRow): React.ReactElement =>
          React.createElement(
            'div',
            {
              key: row.id,
              className: 'wg-row' + (row.id === currentSessionId ? ' wg-row-selected' : ''),
              role: 'button',
              tabIndex: 0,
              title: row.title,
              onClick: () => openSession(row.id),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                openSession(row.id)
              },
            },
            React.createElement('span', { className: 'wg-row-title' }, row.title),
            // 归组入口：沿用原生 select 语义，样式上只在行悬停/聚焦时出现。
            React.createElement(
              'select',
              {
                className: 'wg-assign',
                title: labels.moveTo,
                'aria-label': labels.moveTo,
                value: groupIdOfSession(layout.groups, row.id),
                onClick: (event: React.MouseEvent) => event.stopPropagation(),
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
                  apply(moveSession(workspaceId, row.id, event.target.value))
                },
              },
              ...options.map((option) =>
                React.createElement('option', { key: option.id, value: option.id }, option.label),
              ),
            ),
          )

        return React.createElement(
          'section',
          { key: workspaceId, className: 'wg-workspace' },
          React.createElement(
            'div',
            {
              className: 'wg-workspace-head',
              role: 'button',
              tabIndex: 0,
              onClick: () =>
                setCollapsedWorkspaces((prev) => ({ ...prev, [workspaceId]: prev[workspaceId] !== true })),
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setCollapsedWorkspaces((prev) => ({
                  ...prev,
                  [workspaceId]: prev[workspaceId] !== true,
                }))
              },
            },
            React.createElement(
              'span',
              {
                className: `wg-chevron${workspaceCollapsed ? '' : ' wg-chevron-open'}`,
              },
              React.createElement(Icon, { path: CHEVRON_PATH }),
            ),
            React.createElement('span', { className: 'wg-workspace-title' }, workspace.title),
            React.createElement(IconButton, {
              title: labels.newSession,
              path: NEW_SESSION_PATH,
              className: 'wg-hover-action',
              onClick: () => startSession(workspaceId),
            }),
            React.createElement(IconButton, {
              title: labels.newGroup,
              path: PLUS_PATH,
              className: 'wg-hover-action',
              onClick: () => {
                const name = askText(labels.groupNamePrompt)
                if (name === null || name.trim() === '') return
                apply(createGroup(workspaceId, name.trim()))
              },
            }),
          ),
          workspaceCollapsed
            ? null
            : React.createElement(
                'div',
                { className: 'wg-workspace-body' },
                // 只有用户建过分组时才渲染分组结构。
                ...layout.groups.map((section) => {
                  const key = `${workspaceId}:${section.id}`
                  const sectionCollapsed = collapsedGroups[key] === true
                  return React.createElement(
                    'div',
                    { key: section.id, className: 'wg-group' },
                    React.createElement(
                      'div',
                      {
                        className: 'wg-group-head',
                        role: 'button',
                        tabIndex: 0,
                        onClick: () =>
                          setCollapsedGroups((prev) => ({ ...prev, [key]: prev[key] !== true })),
                        onKeyDown: (event: React.KeyboardEvent) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setCollapsedGroups((prev) => ({ ...prev, [key]: prev[key] !== true }))
                        },
                      },
                      React.createElement(
                        'span',
                        {
                          className: `wg-chevron${sectionCollapsed ? '' : ' wg-chevron-open'}`,
                        },
                        React.createElement(Icon, { path: CHEVRON_PATH }),
                      ),
                      React.createElement(
                        'span',
                        { className: 'wg-group-label' },
                        `${section.label} (${section.sessions.length})`,
                      ),
                      React.createElement(IconButton, {
                        title: labels.renameGroup,
                        path: PENCIL_PATH,
                        className: 'wg-hover-action',
                        onClick: () => {
                          const name = askText(labels.renameGroup, section.label)
                          if (name === null || name.trim() === '') return
                          apply(renameGroup(workspaceId, section.id, name.trim()))
                        },
                      }),
                      React.createElement(IconButton, {
                        title: labels.deleteGroup,
                        path: CROSS_PATH,
                        className: 'wg-hover-action',
                        onClick: () => {
                          if (!confirmAction(`${labels.confirmDeleteGroup}\n\n${section.label}`)) return
                          apply(deleteGroup(workspaceId, section.id))
                        },
                      }),
                    ),
                    sectionCollapsed
                      ? null
                      : React.createElement(
                          'div',
                          { className: 'wg-sessions' },
                          ...section.sessions.map(sessionRow),
                        ),
                  )
                }),
                // 未归组的会话平铺在工作区下，不套任何分组头。
                layout.loose.length === 0
                  ? null
                  : React.createElement(
                      'div',
                      { className: 'wg-sessions' },
                      ...layout.loose.map(sessionRow),
                    ),
                hasAnyRow
                  ? null
                  : React.createElement('div', { className: 'wg-empty' }, labels.empty),
              ),
        )
      }),
      React.createElement('div', { className: 'wg-note' }, labels.unimplemented),
    ),
  )
}

/**
 * 按工作区区号把会话列表切成段落，供每个工作区各自分组。
 *
 * 归档、子代理与空白会话按 {@link isSessionVisible} 过滤，
 * 因此归档过的会话不会出现在侧边栏。
 * @param sessions - 会话列表快照。
 * @param workspaces - 工作区视图，按宿主顺序。
 * @param archivedSessionIds - 注册表全局的归档会话集合。
 * @returns 每个工作区可见的会话行，保持工作区自身的顺序。
 */
export function groupSessionsByWorkspace(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
): Map<string, SessionRow[]> {
  const result = new Map<string, SessionRow[]>()
  const byId = sessions.byId as Record<string, SessionSummary | undefined>
  const archived = new Set(archivedSessionIds.map(String))
  const current = sessions.current === undefined ? undefined : String(sessions.current)

  for (const workspace of workspaces) {
    const rows: SessionRow[] = []
    for (const id of workspace.sessionIds) {
      const summary = byId[String(id)]
      if (summary === undefined) continue
      if (!isSessionVisible(summary, current, archived)) continue
      rows.push(toRow(summary))
    }
    result.set(String(workspace.workspaceId), rows)
  }

  // 不属于任何工作区的会话没有侧边栏归属，保持隐藏而不是塞进某个工作区。
  return result
}
