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

/**
 * 判定一组会话行里是否有当前选中的那条。
 *
 * 官方用它决定展开状态下的工作区文件夹是否染成强调色。
 * @param rows - 该工作区可见的会话行。
 * @param currentSessionId - 当前选中的会话 id。
 * @returns 是否包含当前会话。
 */
export function containsSession(rows: readonly SessionRow[], currentSessionId: string | undefined): boolean {
  if (currentSessionId === undefined) return false
  return rows.some((row) => row.id === currentSessionId)
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

/**
 * 填充式图标，取自官方 `@deepseek-ai/dsh-client-ui-primitives`
 *（shell 的基线模块表里有这个命名空间，但本包不引它的值导出，
 * 因此在这里内联同一份路径数据，避免多一份实例）。
 */
function FilledIcon(props: {
  paths: readonly string[]
  size?: number
  opacity?: readonly number[]
  className?: string
}): React.ReactElement {
  const size = props.size ?? 16
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: `0 0 ${size} ${size}`,
      fill: 'none',
      className: props.className,
      'aria-hidden': true,
    },
    ...props.paths.map((d, index) =>
      React.createElement('path', {
        key: index,
        d,
        fill: 'currentColor',
        ...(props.opacity?.[index] === undefined ? {} : { opacity: props.opacity[index] }),
      }),
    ),
  )
}

const PLUS_PATH = 'M8 3.5v9M3.5 8h9'
const PENCIL_PATH = 'M11.5 3.5l1 1-7 7-1.5.5.5-1.5 7-7z'
const CROSS_PATH = 'M4.5 4.5l7 7M11.5 4.5l-7 7'
// 会话用气泡图标，与「新建分组」的加号区分开。
const NEW_SESSION_PATH = 'M3 4.5h10v6.5H7.5L4.5 13.5v-2.5H3z'
// 窄栏展开入口用线性箭头，与行内的实心三角区分。
const CHEVRON_PATH = 'M6 3.5L10.5 8L6 12.5'

/** 官方 `IconFolderClose16` 的路径数据。 */
const FOLDER_CLOSE_PATHS = [
  'M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z',
]

/** 官方 `IconFolderOpen16` 的路径数据；第二条是 0.2 透明度的内层封面。 */
const FOLDER_OPEN_PATHS = [
  'M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z',
  'M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z',
]

/** 官方 `IconTriangleRightFill14` 的路径数据。 */
const TRIANGLE_RIGHT_PATHS = [
  'M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z',
]

/** 官方 `IconEllipsisOutline16` 的三个圆点。 */
const ELLIPSIS_PATHS = [
  'M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z',
  'M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z',
  'M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z',
]

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
    /** 会话行尾操作位的无障碍标签。 */
    sessionActions: string
    /** 对照 tab 在 better-sidebar 里的一行说明。 */
    compareTabDescription: string
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
    labels,
  } = props
  // `moveSession` 暂时没有渲染出口：会话行尾先只放省略号占位，
  // 归组入口回到产品内菜单时再接上，宿主接口与 props 契约保持不动。

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
        // 官方只在「展开且含当前会话」时把文件夹染成强调色。
        const folderActive =
          !workspaceCollapsed &&
          containsSession(rowsByWorkspace.get(workspaceId) ?? [], currentSessionId)

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
            // 官方会话行首列放状态点；本包暂不渲染状态，只保留同宽的占位列，
            // 这样标题与工作区标题的横向关系与官方一致。
            React.createElement('span', { className: 'wg-slot' }),
            React.createElement('span', { className: 'wg-row-title' }, row.title),
            // 行尾操作位：目前只有省略号占位，分组下拉框暂不出现。
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'wg-slot wg-row-action',
                title: labels.sessionActions,
                'aria-label': labels.sessionActions,
                onClick: (event: React.MouseEvent) => event.stopPropagation(),
              },
              React.createElement(FilledIcon, { paths: ELLIPSIS_PATHS }),
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
            // 静止时显示文件夹（开/闭随展开态），悬停时让位给三角箭头；
            // 两个槽都常驻同一 16px 列，切换时标题不位移。
            React.createElement(
              'span',
              {
                className: `wg-slot wg-folder${folderActive ? ' wg-folder-active' : ''}`,
              },
              React.createElement(FilledIcon, {
                paths: workspaceCollapsed ? FOLDER_CLOSE_PATHS : FOLDER_OPEN_PATHS,
                ...(workspaceCollapsed ? {} : { opacity: [1, 0.2] }),
              }),
            ),
            React.createElement(
              'span',
              { className: 'wg-slot wg-chevron' },
              React.createElement(FilledIcon, {
                paths: TRIANGLE_RIGHT_PATHS,
                size: 14,
                className: `wg-arrow${workspaceCollapsed ? '' : ' wg-arrow-open'}`,
              }),
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
                        { className: 'wg-slot' },
                        React.createElement(FilledIcon, {
                          paths: TRIANGLE_RIGHT_PATHS,
                          size: 14,
                          className: `wg-arrow${sectionCollapsed ? '' : ' wg-arrow-open'}`,
                        }),
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
