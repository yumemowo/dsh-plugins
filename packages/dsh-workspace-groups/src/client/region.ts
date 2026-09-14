import * as React from 'react'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { MenuActionItem, MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  Button,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
  IconPlusOutline16,
  IconTrashOutline16,
  IconTriangleRightFill14,
  Input,
  Menu,
  Modal,
} from './runtime.ts'
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
 * 一个待编辑的分组名，指名编辑对象与当前草稿。
 *
 * 新建时 `groupId` 为空串，确认后走 `createGroup`；否则走 `renameGroup`。
 */
interface GroupNameDraft {
  workspaceId: string
  groupId: string
  value: string
}

/** 分组名对话框与删除确认框需要的文案。 */
interface GroupDialogLabels {
  newGroup: string
  renameGroup: string
  groupNamePrompt: string
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  deleteGroup: string
  /** 删除分组的说明文案；分组名由调用方传入，模板里的 `{name}` 由语言包替换。 */
  confirmDeleteGroup: (name: string) => string
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

/** 会话「更多操作」菜单里分组项的选项集。 */
export interface GroupMenuInput {
  /** 按工作区视图顺序排列的全部分组（未过滤）。 */
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id；空串表示未归组。 */
  currentGroupId: string
  /** 「分组」一级项文案。 */
  label: string
  /** 「取消分组」文案。 */
  ungroupLabel: string
}

/**
 * 构造会话「更多操作」菜单里的分组一级项。
 *
 * 二级子菜单保持传入（即工作区视图）的分组顺序，并剔除当前会话所在的
 * 分组——把自己移动到自己是无意义的操作。没有任何可选项时该项禁用。
 * @param input - 分组选项集。
 * @returns 可放进 Menu items 的分组项；分组不存在时也返回占位项以稳定菜单独纬度。
 */
export function buildGroupMenuItem(input: GroupMenuInput): MenuActionItem {
  const { sections, currentGroupId, label } = input
  const candidates = sections
    .filter((section) => section.id !== currentGroupId)
    .map((section) => ({ id: `group:${section.id}`, label: section.label }))
  return {
    id: 'group',
    label,
    disabled: candidates.length === 0,
    submenu: candidates,
  }
}

/**
 * 构造会话「更多操作」菜单的完整条目。
 *
 * 一级菜单为：分组（二级展开）、其下的「取消分组」（仅当会话已归组）。
 * 分组没有任何可选项时「分组」仍占位但禁用，菜单结构不因数据为空而跳动。
 * @param input - 分组选项集。
 * @returns Menu items 列表。
 */
export function buildSessionMenuItems(input: GroupMenuInput): readonly MenuItem[] {
  const items: MenuItem[] = [buildGroupMenuItem(input)]
  if (input.currentGroupId !== '') {
    items.push({
      id: 'ungroup',
      label: input.ungroupLabel,
    })
  }
  return items
}

/** 会话行「更多操作」菜单的文案。 */
interface SessionRowMenuLabels {
  sessionActions: string
  moveToGroup: string
  ungroup: string
}

/**
 * 带菜单的会话行。
 *
 * 菜单开合状态收敛在本组件内：行组件在 map 回调里生成，把 useState 留在
 * 行内会让每行无条件多挂一组 hook 状态，独立组件则按需挂载。
 */
function SessionRowMenu(props: {
  row: SessionRow
  selected: boolean
  sections: readonly GroupSection[]
  currentGroupId: string
  onOpen: () => void
  onSelect: (id: string) => void
  labels: SessionRowMenuLabels
}): React.ReactElement {
  const { row, selected, sections, currentGroupId, onOpen, onSelect, labels } = props
  const [menuOpen, setMenuOpen] = React.useState(false)
  return React.createElement(
    'div',
    {
      className: 'wg-row' + (selected ? ' wg-row-selected' : ''),
      role: 'button',
      tabIndex: 0,
      title: row.title,
      onClick: onOpen,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      },
    },
    // 官方会话行首列放状态点；本包暂不渲染状态，只保留同宽的占位列，
    // 这样标题与工作区标题的横向关系与官方一致。
    React.createElement('span', { className: 'wg-slot' }),
    React.createElement('span', { className: 'wg-row-title' }, row.title),
    React.createElement(
      'span',
      { className: 'wg-slot', onClick: (event: React.MouseEvent) => event.stopPropagation() },
      React.createElement(Menu, {
        open: menuOpen,
        onClose: () => setMenuOpen(false),
        onSelect: (id: string) => {
          setMenuOpen(false)
          onSelect(id)
        },
        // portal 进 document.body：本区域的列表容器 overflow 裁剪会把
        // 就近渲染的菜单裁掉。二级面板的方向由宿主挂的 body 标记控制
        // （见 index.ts），这里不感知宿主差异。
        portal: true,
        closeOnPointerLeave: true,
        anchor: React.createElement(
          'button',
          {
            type: 'button',
            className: 'wg-row-action',
            title: labels.sessionActions,
            'aria-label': labels.sessionActions,
            onClick: (event: React.MouseEvent) => {
              event.stopPropagation()
              setMenuOpen((v) => !v)
            },
          },
          React.createElement(IconEllipsisOutline16, {}),
        ),
        items: buildSessionMenuItems({
          sections,
          currentGroupId,
          label: labels.moveToGroup,
          ungroupLabel: labels.ungroup,
        }),
      }),
    ),
  )
}

/**
 * `aria-label` 与 tooltip 共用一个文案的 16px 行内按钮。
 *
 * 官方行内按钮几何来自 ui-workspace 的 CSS Module，primitives 没有等价的
 * 16px 行内按钮，因此保留本地 16px 几何；图标本身取 primitives 导出。
 */
function IconButton(props: {
  title: string
  icon: React.ReactElement
  onClick: () => void
  className?: string
}): React.ReactElement {
  return React.createElement(
    'button',
    {
      type: 'button',
      className: `wg-row-action${props.className === undefined ? '' : ` ${props.className}`}`,
      title: props.title,
      'aria-label': props.title,
      onClick: (event: React.MouseEvent) => {
        event.stopPropagation()
        props.onClick()
      },
    },
    props.icon,
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
  /** 远程数据面就绪后回调一次；返回反注册函数。 */
  onReady: (listener: () => void) => () => void
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
    /** 分组名输入框的占位与无障碍标签。 */
    groupNamePrompt: string
    /** 分组名对话框的标题（重命名时用）。 */
    renameGroup: string
    /** 对话框确认按钮。 */
    confirmLabel: string
    /** 对话框取消按钮。 */
    cancelLabel: string
    /** 对话框关闭按钮的无障碍标签。 */
    closeLabel: string
    deleteGroup: string
    /** 删除分组的说明文案；分组名由调用方传入，模板里的 `{name}` 由语言包替换。 */
    confirmDeleteGroup: (name: string) => string
    /** 会话行尾操作位的无障碍标签。 */
    sessionActions: string
    /** 「分组」一级菜单项文案。 */
    moveToGroup: string
    /** 「取消分组」一级菜单项文案。 */
    ungroup: string
    /** 对照 tab 在 better-sidebar 里的一行说明。 */
    compareTabDescription: string
    empty: string
    unimplemented: string
  }
}

/**
 * 分组名对话框：新建与重命名共用。
 *
 * 输入法组合期间的 Enter 属于候选词确认，不能当提交用。
 */
function GroupNameDialog(props: {
  draft: GroupNameDraft
  onDraftChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
  labels: GroupDialogLabels
}): React.ReactElement {
  const composing = React.useRef(false)
  const { draft, labels } = props
  return React.createElement(
    Modal,
    {
      open: true,
      onClose: props.onClose,
      closeLabel: labels.closeLabel,
      title: draft.groupId === '' ? labels.newGroup : labels.renameGroup,
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { variant: 'outline', onClick: props.onClose }, labels.cancelLabel),
        React.createElement(
          Button,
          {
            variant: 'primary',
            disabled: draft.value.trim() === '',
            onClick: props.onConfirm,
          },
          labels.confirmLabel,
        ),
      ),
    },
    React.createElement(Input, {
      value: draft.value,
      'aria-label': labels.groupNamePrompt,
      placeholder: labels.groupNamePrompt,
      autoFocus: true,
      onFocus: (event) => event.target.select(),
      onChange: (event) => props.onDraftChange(event.currentTarget.value),
      onCompositionStart: () => {
        composing.current = true
      },
      onCompositionEnd: () => {
        composing.current = false
      },
      onKeyDown: (event) => {
        if (event.key !== 'Enter' || composing.current) return
        event.preventDefault()
        props.onConfirm()
      },
    }),
  )
}

/**
 * 删除分组确认。
 *
 * 用普通 `Modal` 而不是 `RiskConfirmation`：后者带警告图标与勾选框，而删除
 * 分组只解散分组、不动会话本身，达不到需要勾选确认的破坏级别。危险语义由
 * 确认按钮的 `wg-danger-action` 承载（错误色 token，同官方删除按钮做法）。
 */
function GroupDeleteDialog(props: {
  label: string
  onConfirm: () => void
  onClose: () => void
  labels: GroupDialogLabels
}): React.ReactElement {
  const { labels } = props
  return React.createElement(
    Modal,
    {
      open: true,
      onClose: props.onClose,
      closeLabel: labels.closeLabel,
      title: labels.deleteGroup,
      description: labels.confirmDeleteGroup(props.label),
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { variant: 'outline', onClick: props.onClose }, labels.cancelLabel),
        React.createElement(
          Button,
          {
            variant: 'outline',
            className: 'wg-danger-action',
            onClick: props.onConfirm,
          },
          labels.deleteGroup,
        ),
      ),
    },
  )
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
    onReady,
    loadGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    moveSession,
    labels,
  } = props
  // `moveSession` 由会话行菜单的分组/取消分组项调用；这里不需要额外渲染出口。

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
  // 建组与改名共用一个对话框：groupId 为空串时是新建。
  const [nameDraft, setNameDraft] = React.useState<GroupNameDraft | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<{ workspaceId: string; groupId: string; label: string } | null>(null)

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

  // 首次拉取可能早于远程数据面就绪（requireApi 抛错被上面的 catch 吞掉），
  // 就绪信号到达时重拉一次，否则已落盘的分组要等下一次改动才会出现。
  React.useEffect(() => onReady(() => reload()), [onReady, reload])

  /** 执行一次改动并刷新本地快照。 */
  const apply = React.useCallback(
    (action: Promise<void>) => {
      void action.then(() => reload())
    },
    [reload],
  )

  const closeNameDialog = (): void => setNameDraft(null)

  /** 提交建组或改名；空名与取消都不写。 */
  const commitNameDraft = (): void => {
    const draft = nameDraft
    if (draft === null) return
    const name = draft.value.trim()
    if (name === '') return
    setNameDraft(null)
    apply(
      draft.groupId === ''
        ? createGroup(draft.workspaceId, name)
        : renameGroup(draft.workspaceId, draft.groupId, name),
    )
  }

  const closeDeleteDialog = (): void => setDeleteTarget(null)

  const commitDelete = (): void => {
    const target = deleteTarget
    if (target === null) return
    closeDeleteDialog()
    apply(deleteGroup(target.workspaceId, target.groupId))
  }

  const dialogLabels: GroupDialogLabels = {
    newGroup: labels.newGroup,
    renameGroup: labels.renameGroup,
    groupNamePrompt: labels.groupNamePrompt,
    confirmLabel: labels.confirmLabel,
    cancelLabel: labels.cancelLabel,
    closeLabel: labels.closeLabel,
    deleteGroup: labels.deleteGroup,
    confirmDeleteGroup: labels.confirmDeleteGroup,
  }
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
          'aria-label': labels.title,
          onClick: expandSidebar,
        },
        React.createElement(IconPanelLeftOutline16, {}),
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

        const sessionRow = (row: SessionRow): React.ReactElement => {
          const currentGroupId = groupIdOfSession(layout.groups, row.id)
          return React.createElement(SessionRowMenu, {
            key: row.id,
            row,
            selected: row.id === currentSessionId,
            sections: layout.groups,
            currentGroupId,
            onOpen: () => openSession(row.id),
            onSelect: (id: string) => {
              if (id === 'ungroup') {
                apply(moveSession(workspaceId, row.id, ''))
                return
              }
              if (id.startsWith('group:')) {
                apply(moveSession(workspaceId, row.id, id.slice('group:'.length)))
              }
            },
            labels: {
              sessionActions: labels.sessionActions,
              moveToGroup: labels.moveToGroup,
              ungroup: labels.ungroup,
            },
          })
        }
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
              workspaceCollapsed
                ? React.createElement(IconFolderClose16, {})
                : React.createElement(IconFolderOpen16, {}),
            ),
            React.createElement(
              'span',
              { className: 'wg-slot wg-chevron' },
              React.createElement(IconTriangleRightFill14, {
                className: `wg-arrow${workspaceCollapsed ? '' : ' wg-arrow-open'}`,
              }),
            ),
            React.createElement('span', { className: 'wg-workspace-title' }, workspace.title),
            React.createElement(IconButton, {
              title: labels.newSession,
              icon: React.createElement(IconNewChatOutline16, {}),
              className: 'wg-hover-action',
              onClick: () => startSession(workspaceId),
            }),
            React.createElement(IconButton, {
              title: labels.newGroup,
              icon: React.createElement(IconPlusOutline16, {}),
              className: 'wg-hover-action',
              onClick: () =>
                setNameDraft({ workspaceId, groupId: '', value: '' }),
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
                        React.createElement(IconTriangleRightFill14, {
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
                        icon: React.createElement(IconEditOutline16, {}),
                        className: 'wg-hover-action',
                        onClick: () =>
                          setNameDraft({ workspaceId, groupId: section.id, value: section.label }),
                      }),
                      React.createElement(IconButton, {
                        title: labels.deleteGroup,
                        icon: React.createElement(IconTrashOutline16, {}),
                        className: 'wg-hover-action',
                        onClick: () =>
                          setDeleteTarget({
                            workspaceId,
                            groupId: section.id,
                            label: section.label,
                          }),
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
    // 对话框挂在列表之外：两个都是 portal 到 body 的浮层，放进 overflow
    // 容器只会多一层无用的裁剪上下文。
    nameDraft === null
      ? null
      : React.createElement(GroupNameDialog, {
          draft: nameDraft,
          onDraftChange: (value) => setNameDraft({ ...nameDraft, value }),
          onConfirm: commitNameDraft,
          onClose: closeNameDialog,
          labels: dialogLabels,
        }),
    deleteTarget === null
      ? null
      : React.createElement(GroupDeleteDialog, {
          label: deleteTarget.label,
          onConfirm: commitDelete,
          onClose: closeDeleteDialog,
          labels: dialogLabels,
        }),
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
