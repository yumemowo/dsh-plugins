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

/** 一个待编辑的工作区名，指名编辑对象与当前草稿。 */
interface WorkspaceNameDraft {
  workspaceId: string
  value: string
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

/** 工作区行「更多操作」菜单的条目文案。 */
export interface WorkspaceMenuInput {
  /** 「新建分组」项文案。 */
  newGroupLabel: string
  /** 「重命名工作区」项文案。 */
  renameLabel: string
  /** 「删除工作区」项文案。 */
  deleteLabel: string
}

/** 工作区菜单条目 id；与 `WorkspaceRow` 的分派一一对应。 */
const WORKSPACE_MENU = {
  newGroup: 'new-group',
  rename: 'rename',
  delete: 'delete',
} as const

/**
 * 构造工作区「更多操作」菜单的条目。
 *
 * 两项官方操作的相对顺序与官方一致（重命名在前、删除在后）；本包自有的
 * 「新建分组」排在最前，它是三项里唯一的建造型操作。删除项带 `danger`
 * 标记，与官方删除工作区一样由菜单原语渲染危险语义。
 * @param input - 三项文案。
 * @returns Menu items 列表。
 */
export function buildWorkspaceMenuItems(input: WorkspaceMenuInput): readonly MenuItem[] {
  return [
    {
      id: WORKSPACE_MENU.newGroup,
      label: input.newGroupLabel,
      icon: React.createElement(IconPlusOutline16, {}),
    },
    {
      id: WORKSPACE_MENU.rename,
      label: input.renameLabel,
      icon: React.createElement(IconEditOutline16, {}),
    },
    {
      id: WORKSPACE_MENU.delete,
      label: input.deleteLabel,
      icon: React.createElement(IconTrashOutline16, {}),
      danger: true,
    },
  ]
}

/** 会话行「更多操作」菜单的文案。 */
interface SessionRowMenuLabels {
  sessionActions: string
  moveToGroup: string
  ungroup: string
}

/**
 * 会话行的外壳：状态位列、标题与可选的行尾操作位。
 *
 * 官方会话行首列放状态点；本包暂不渲染状态，只保留同宽的占位列，
 * 这样标题与工作区标题的横向关系与官方一致。`action` 缺省时不渲染行尾
 * 操作位——未分组桶里的会话不属于任何工作区，没有可用的归组操作。
 */
function SessionRowView(props: {
  row: SessionRow
  selected: boolean
  menuOpen?: boolean
  action?: React.ReactNode
  onOpen: () => void
}): React.ReactElement {
  const { row, selected, action, onOpen } = props
  return React.createElement(
    'div',
    {
      // 菜单展开时行上挂标记：锚点按钮只靠 :hover 显示，菜单还开着时
      // 指针一旦移开按钮就会消失，标记让样式把它留住。
      className:
        'wg-row' +
        (selected ? ' wg-row-selected' : '') +
        (props.menuOpen === true ? ' wg-row-menu-open' : ''),
      role: 'button',
      tabIndex: 0,
      title: row.title,
      onClick: onOpen,
      onKeyDown: (event: React.KeyboardEvent) => {
        // 只有行自身获得焦点时才响应；否则行内按钮上的 Enter/Space
        // 会先触发按钮动作、再冒泡到这里把会话也打开。
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      },
    },
    React.createElement('span', { className: 'wg-slot' }),
    React.createElement('span', { className: 'wg-row-title' }, row.title),
    action === undefined
      ? null
      : React.createElement(
          'span',
          { className: 'wg-slot', onClick: (event: React.MouseEvent) => event.stopPropagation() },
          action,
        ),
  )
}

/**
 * 带「更多操作」菜单的会话行。
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
  return React.createElement(SessionRowView, {
    row,
    selected,
    menuOpen,
    onOpen,
    action: React.createElement(Menu, {
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
  })
}

/**
 * `aria-label` 与 tooltip 共用一个文案的 16px 行内按钮。
 *
 * 官方行内按钮几何来自 ui-workspace 的 CSS Module，primitives 没有等价的
 * 16px 行内按钮，因此保留本地 16px 几何；图标本身取 primitives 导出。
 * 显隐由 `.wg-row-action` 统一负责，调用方不需要再传额外类名。
 */
function IconButton(props: {
  title: string
  icon: React.ReactElement
  onClick: () => void
}): React.ReactElement {
  return React.createElement(
    'button',
    {
      type: 'button',
      className: 'wg-row-action',
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

/** 工作区标题行的文案与无障碍标签。 */
interface WorkspaceRowLabels {
  /** 工作区「更多操作」按钮的无障碍标签，取工作区名。 */
  actions: (name: string) => string
  /** 新建会话按钮的无障碍标签，取工作区名。 */
  newSession: (name: string) => string
  /** 菜单里的「新建分组」项。 */
  newGroup: string
  /** 菜单里的「重命名工作区」项。 */
  rename: string
  /** 菜单里的「删除工作区」项。 */
  delete: string
}

/**
 * 一个工作区标题行。
 *
 * 行内操作与官方工作区行同形：`...` 打开管理菜单（新建分组 / 重命名 /
 * 删除），`+` 直接在该工作区新建会话。静止时显示文件夹（开/闭随展开态），
 * 悬停时让位给三角箭头，两个槽常驻同一 16px 列，因此切换时标题不位移。
 *
 * 「新建分组」不像「新建会话」那样高频，因此不占行内位置，收进菜单。
 *
 * 未分组桶没有工作区归属，四个回调都不传，行尾操作位整体不渲染。
 */
function WorkspaceRow(props: {
  title: string
  collapsed: boolean
  folderActive: boolean
  onToggle: () => void
  onCreateSession?: () => void
  onNewGroup?: () => void
  onRename?: () => void
  onDelete?: () => void
  labels: WorkspaceRowLabels
}): React.ReactElement {
  const { title, collapsed, folderActive, labels } = props
  const [menuOpen, setMenuOpen] = React.useState(false)
  const manageable =
    props.onNewGroup !== undefined || props.onRename !== undefined || props.onDelete !== undefined

  const actions: React.ReactNode[] = []
  if (manageable) {
    actions.push(
      React.createElement(Menu, {
        key: 'menu',
        open: menuOpen,
        onClose: () => setMenuOpen(false),
        onSelect: (id: string) => {
          setMenuOpen(false)
          if (id === WORKSPACE_MENU.newGroup) props.onNewGroup?.()
          else if (id === WORKSPACE_MENU.rename) props.onRename?.()
          else if (id === WORKSPACE_MENU.delete) props.onDelete?.()
        },
        portal: true,
        closeOnPointerLeave: true,
        anchor: React.createElement(
          'button',
          {
            type: 'button',
            className: 'wg-row-action',
            title: labels.actions(title),
            'aria-label': labels.actions(title),
            onClick: (event: React.MouseEvent) => {
              event.stopPropagation()
              setMenuOpen((v) => !v)
            },
          },
          React.createElement(IconEllipsisOutline16, {}),
        ),
        items: buildWorkspaceMenuItems({
          newGroupLabel: labels.newGroup,
          renameLabel: labels.rename,
          deleteLabel: labels.delete,
        }),
      }),
    )
  }
  if (props.onCreateSession !== undefined) {
    actions.push(
      React.createElement(IconButton, {
        key: 'new-session',
        title: labels.newSession(title),
        icon: React.createElement(IconPlusOutline16, {}),
        onClick: props.onCreateSession,
      }),
    )
  }

  return React.createElement(
    'div',
    {
      className: 'wg-workspace-head' + (menuOpen ? ' wg-row-menu-open' : ''),
      role: 'button',
      tabIndex: 0,
      onClick: props.onToggle,
      onKeyDown: (event: React.KeyboardEvent) => {
        // 只响应行自身；行内按钮上的 Enter/Space 不应连带折叠工作区。
        if (event.target !== event.currentTarget) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        props.onToggle()
      },
    },
    React.createElement(
      'span',
      { className: `wg-slot wg-folder${folderActive ? ' wg-folder-active' : ''}` },
      collapsed
        ? React.createElement(IconFolderClose16, {})
        : React.createElement(IconFolderOpen16, {}),
    ),
    React.createElement(
      'span',
      { className: 'wg-slot wg-chevron' },
      React.createElement(IconTriangleRightFill14, {
        className: `wg-arrow${collapsed ? '' : ' wg-arrow-open'}`,
      }),
    ),
    React.createElement('span', { className: 'wg-workspace-title' }, title),
    actions.length === 0
      ? null
      : React.createElement('span', { className: 'wg-row-actions' }, ...actions),
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
  /** 重命名工作区。 */
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  /** 删除工作区注册；文件夹与会话记录保留。 */
  deleteWorkspace: (workspaceId: string) => Promise<void>
  /** 界面文案。 */
  labels: {
    title: string
    newGroup: string
    /** 新建会话按钮的无障碍标签；工作区名由调用方传入。 */
    newSessionIn: (name: string) => string
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
    /** 工作区「更多操作」按钮的无障碍标签；工作区名由调用方传入。 */
    workspaceActions: (name: string) => string
    /** 「重命名工作区」菜单项与对话框标题。 */
    renameWorkspace: string
    /** 「删除工作区」菜单项、对话框标题与确认按钮。 */
    deleteWorkspace: string
    /** 删除工作区的说明文案；工作区名由调用方传入。 */
    confirmDeleteWorkspace: (name: string) => string
    /** 工作区名输入框的占位与无障碍标签。 */
    workspaceNamePrompt: string
    /** 与既有工作区重名时的提示；名称由调用方传入。 */
    workspaceConflict: (name: string) => string
    /** 无工作区归属的会话区段标题。 */
    ungrouped: string
    /** 对照 tab 在 better-sidebar 里的一行说明。 */
    compareTabDescription: string
    empty: string
    unimplemented: string
  }
}

/**
 * 单行输入对话框：建组、改名与工作区重命名共用。
 *
 * 输入法组合期间的 Enter 属于候选词确认，不能当提交用。
 */
function NameDialog(props: {
  title: string
  value: string
  placeholder: string
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  confirmDisabled: boolean
  error?: React.ReactNode
  onValueChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}): React.ReactElement {
  const composing = React.useRef(false)
  return React.createElement(
    Modal,
    {
      open: true,
      onClose: props.onClose,
      closeLabel: props.closeLabel,
      title: props.title,
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { variant: 'outline', onClick: props.onClose }, props.cancelLabel),
        React.createElement(
          Button,
          {
            variant: 'primary',
            disabled: props.confirmDisabled,
            onClick: props.onConfirm,
          },
          props.confirmLabel,
        ),
      ),
    },
    React.createElement(Input, {
      value: props.value,
      'aria-label': props.placeholder,
      placeholder: props.placeholder,
      autoFocus: true,
      onFocus: (event) => event.target.select(),
      onChange: (event) => props.onValueChange(event.currentTarget.value),
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
    props.error === undefined || props.error === null
      ? null
      : React.createElement('div', { className: 'wg-dialog-error', role: 'alert' }, props.error),
  )
}

/**
 * 破坏性操作的确认框。
 *
 * 用普通 `Modal` 而不是 `RiskConfirmation`：后者带警告图标与勾选框，而
 * 删除分组只解散分组、删除工作区只移除注册，都达不到需要勾选确认的破坏
 * 级别。危险语义由确认按钮的 `wg-danger-action` 承载（错误色 token，
 * 同官方删除按钮做法）。
 */
function DeleteDialog(props: {
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  onConfirm: () => void
  onClose: () => void
}): React.ReactElement {
  return React.createElement(
    Modal,
    {
      open: true,
      onClose: props.onClose,
      closeLabel: props.closeLabel,
      title: props.title,
      ...(props.description === undefined ? {} : { description: props.description }),
      footer: React.createElement(
        React.Fragment,
        null,
        React.createElement(Button, { variant: 'outline', onClick: props.onClose }, props.cancelLabel),
        React.createElement(
          Button,
          {
            variant: 'outline',
            className: 'wg-danger-action',
            onClick: props.onConfirm,
          },
          props.confirmLabel,
        ),
      ),
    },
  )
}

/** 未分组桶在工作区状态表里占用的键；它没有真实的 workspaceId。 */
const UNGROUPED_KEY = ''

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
 *
 * 不属于任何工作区的会话（例如工作区被删除后遗留的会话）收进末尾一个
 * 隐式的「未分组」区段——那是工作区一级的容器，与本包在工作区内刻意
 * 不造「未分组分组」的取舍无关。
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
    renameWorkspace,
    deleteWorkspace,
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
  // 建组与改名共用一个对话框：groupId 为空串时是新建。
  const [nameDraft, setNameDraft] = React.useState<GroupNameDraft | null>(null)
  const [groupDelete, setGroupDelete] = React.useState<{ workspaceId: string; groupId: string; label: string } | null>(null)
  const [workspaceRename, setWorkspaceRename] = React.useState<WorkspaceNameDraft | null>(null)
  const [workspaceDelete, setWorkspaceDelete] = React.useState<{ workspaceId: string; label: string } | null>(null)

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

  const closeGroupDelete = (): void => setGroupDelete(null)

  const commitGroupDelete = (): void => {
    const target = groupDelete
    if (target === null) return
    closeGroupDelete()
    apply(deleteGroup(target.workspaceId, target.groupId))
  }

  const closeWorkspaceRename = (): void => setWorkspaceRename(null)

  /** 工作区当前的名字；用于判断改名是否真的改变了内容。 */
  const renamedFrom = (draft: WorkspaceNameDraft): string => {
    const workspace = workspaces.find((item) => String(item.workspaceId) === draft.workspaceId)
    return workspace === undefined ? '' : workspace.title
  }

  const commitWorkspaceRename = (): void => {
    const draft = workspaceRename
    if (draft === null) return
    const name = draft.value.trim()
    if (name === '' || name === renamedFrom(draft)) return
    closeWorkspaceRename()
    apply(renameWorkspace(draft.workspaceId, name))
  }

  const closeWorkspaceDelete = (): void => setWorkspaceDelete(null)

  /**
   * 删除工作区。
   *
   * 先删注册再清分组元数据：工作区没了，它名下的分组再也不会被渲染，
   * 留着就是读不到的记录；反过来的话，删组成功而删工作区失败会把分组
   * 提前丢掉。清理由既有的 `deleteGroup` 承担，不新增宿主接口。
   */
  const commitWorkspaceDelete = (): void => {
    const target = workspaceDelete
    if (target === null) return
    closeWorkspaceDelete()
    const orphanGroups = groups[target.workspaceId] ?? []
    apply(
      deleteWorkspace(target.workspaceId).then(async () => {
        for (const group of orphanGroups) await deleteGroup(target.workspaceId, group.id)
      }),
    )
  }

  /** 待改的工作区名是否与另一个工作区撞名。 */
  const renameConflict =
    workspaceRename === null
      ? undefined
      : workspaces.find(
          (item) =>
            String(item.workspaceId) !== workspaceRename.workspaceId &&
            item.title === workspaceRename.value.trim(),
        )?.title

  const renameName = workspaceRename === null ? '' : workspaceRename.value.trim()
  const renameDisabled =
    workspaceRename === null ||
    renameName === '' ||
    renameName === renamedFrom(workspaceRename) ||
    renameConflict !== undefined

  const workspaceRowLabels: WorkspaceRowLabels = {
    actions: labels.workspaceActions,
    newSession: labels.newSessionIn,
    newGroup: labels.newGroup,
    rename: labels.renameWorkspace,
    delete: labels.deleteWorkspace,
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
  // 不属于任何工作区的会话；只有存在时才渲染末尾的「未分组」区段。
  const stray = straySessions(sessions, workspaces, archivedSessionIds)

  const sessionMenuLabels: SessionRowMenuLabels = {
    sessionActions: labels.sessionActions,
    moveToGroup: labels.moveToGroup,
    ungroup: labels.ungroup,
  }

  /** 工作区内带归组菜单的会话行。 */
  const sessionRow = (workspaceId: string, sections: readonly GroupSection[]) =>
    (row: SessionRow): React.ReactElement =>
      React.createElement(SessionRowMenu, {
        key: row.id,
        row,
        selected: row.id === currentSessionId,
        sections,
        currentGroupId: groupIdOfSession(sections, row.id),
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
        labels: sessionMenuLabels,
      })

  /** 折叠状态取反；默认展开，因此只有显式 true 才算折叠。 */
  const toggleCollapsed = (key: string): void =>
    setCollapsedWorkspaces((prev) => ({ ...prev, [key]: prev[key] !== true }))

  const workspaceHead = (workspace: WorkspaceView): React.ReactElement => {
    const workspaceId = String(workspace.workspaceId)
    const collapsed = collapsedWorkspaces[workspaceId] === true
    return React.createElement(WorkspaceRow, {
      title: workspace.title,
      collapsed,
      // 官方只在「展开且含当前会话」时把文件夹染成强调色。
      folderActive:
        !collapsed && containsSession(rowsByWorkspace.get(workspaceId) ?? [], currentSessionId),
      onToggle: () => toggleCollapsed(workspaceId),
      onCreateSession: () => {
        // 官方在新建前展开工作区，否则新会话会落在折叠区里看不见。
        setCollapsedWorkspaces((prev) => ({ ...prev, [workspaceId]: false }))
        startSession(workspaceId)
      },
      onNewGroup: () => setNameDraft({ workspaceId, groupId: '', value: '' }),
      onRename: () => setWorkspaceRename({ workspaceId, value: workspace.title }),
      onDelete: () => setWorkspaceDelete({ workspaceId, label: workspace.title }),
      labels: workspaceRowLabels,
    })
  }

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
        const collapsed = collapsedWorkspaces[workspaceId] === true
        const hasAnyRow = layout.groups.length > 0 || layout.loose.length > 0
        const looseRow = sessionRow(workspaceId, layout.groups)

        return React.createElement(
          'section',
          { key: workspaceId, className: 'wg-workspace' },
          workspaceHead(workspace),
          collapsed
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
                        onClick: () => setCollapsedGroups((prev) => ({ ...prev, [key]: prev[key] !== true })),
                        onKeyDown: (event: React.KeyboardEvent) => {
                          // 同上：忽略行内按钮冒泡上来的按键。
                          if (event.target !== event.currentTarget) return
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
                        onClick: () =>
                          setNameDraft({ workspaceId, groupId: section.id, value: section.label }),
                      }),
                      React.createElement(IconButton, {
                        title: labels.deleteGroup,
                        icon: React.createElement(IconTrashOutline16, {}),
                        onClick: () =>
                          setGroupDelete({
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
                          ...section.sessions.map(looseRow),
                        ),
                  )
                }),
                // 未归组的会话平铺在工作区下，不套任何分组头。
                layout.loose.length === 0
                  ? null
                  : React.createElement('div', { className: 'wg-sessions' }, ...layout.loose.map(looseRow)),
                hasAnyRow
                  ? null
                  : React.createElement('div', { className: 'wg-empty' }, labels.empty),
              ),
        )
      }),
      // 未分组桶排在全部工作区之后，与官方一致；空则整段不渲染。
      stray.length === 0
        ? null
        : React.createElement(
            'section',
            { key: UNGROUPED_KEY, className: 'wg-workspace' },
            React.createElement(WorkspaceRow, {
              title: labels.ungrouped,
              collapsed: collapsedWorkspaces[UNGROUPED_KEY] === true,
              folderActive:
                collapsedWorkspaces[UNGROUPED_KEY] !== true &&
                containsSession(stray, currentSessionId),
              onToggle: () => toggleCollapsed(UNGROUPED_KEY),
              labels: workspaceRowLabels,
            }),
            collapsedWorkspaces[UNGROUPED_KEY] === true
              ? null
              : React.createElement(
                  'div',
                  { className: 'wg-workspace-body' },
                  React.createElement(
                    'div',
                    { className: 'wg-sessions' },
                    // 这些会话不属于任何工作区，没有可用的归组操作，故不带行尾菜单。
                    ...stray.map((row) =>
                      React.createElement(SessionRowView, {
                        key: row.id,
                        row,
                        selected: row.id === currentSessionId,
                        onOpen: () => openSession(row.id),
                      }),
                    ),
                  ),
                ),
          ),
      React.createElement('div', { className: 'wg-note' }, labels.unimplemented),
    ),
    // 对话框挂在列表之外：它们都是 portal 到 body 的浮层，放进 overflow
    // 容器只会多一层无用的裁剪上下文。
    nameDraft === null
      ? null
      : React.createElement(NameDialog, {
          title: nameDraft.groupId === '' ? labels.newGroup : labels.renameGroup,
          value: nameDraft.value,
          placeholder: labels.groupNamePrompt,
          confirmLabel: labels.confirmLabel,
          cancelLabel: labels.cancelLabel,
          closeLabel: labels.closeLabel,
          confirmDisabled: nameDraft.value.trim() === '',
          onValueChange: (value) => setNameDraft({ ...nameDraft, value }),
          onConfirm: commitNameDraft,
          onClose: closeNameDialog,
        }),
    workspaceRename === null
      ? null
      : React.createElement(NameDialog, {
          title: labels.renameWorkspace,
          value: workspaceRename.value,
          placeholder: labels.workspaceNamePrompt,
          confirmLabel: labels.confirmLabel,
          cancelLabel: labels.cancelLabel,
          closeLabel: labels.closeLabel,
          confirmDisabled: renameDisabled,
          error: renameConflict === undefined ? null : labels.workspaceConflict(renameConflict),
          onValueChange: (value) => setWorkspaceRename({ ...workspaceRename, value }),
          onConfirm: commitWorkspaceRename,
          onClose: closeWorkspaceRename,
        }),
    groupDelete === null
      ? null
      : React.createElement(DeleteDialog, {
          title: labels.deleteGroup,
          description: labels.confirmDeleteGroup(groupDelete.label),
          confirmLabel: labels.deleteGroup,
          cancelLabel: labels.cancelLabel,
          closeLabel: labels.closeLabel,
          onConfirm: commitGroupDelete,
          onClose: closeGroupDelete,
        }),
    workspaceDelete === null
      ? null
      : React.createElement(DeleteDialog, {
          title: labels.deleteWorkspace,
          description: labels.confirmDeleteWorkspace(workspaceDelete.label),
          confirmLabel: labels.deleteWorkspace,
          cancelLabel: labels.cancelLabel,
          closeLabel: labels.closeLabel,
          onConfirm: commitWorkspaceDelete,
          onClose: closeWorkspaceDelete,
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

  return result
}

/**
 * 收集不属于任何工作区的会话行。
 *
 * 删除工作区只移除注册，会话记录会原样保留；官方把这些无所属的会话收进
 * 末尾一个隐式的「未分组」区段，这里取同一做法，避免删除工作区后会话在
 * 侧边栏彻底消失。可见性过滤与工作区内一致：子代理、已归档与非当前的空白
 * 会话都不出现。
 * @param sessions - 会话列表快照。
 * @param workspaces - 全部工作区视图。
 * @param archivedSessionIds - 注册表全局的归档会话集合。
 * @returns 按会话列表顺序排列的无所属会话行。
 */
export function straySessions(
  sessions: SessionListState,
  workspaces: readonly WorkspaceView[],
  archivedSessionIds: readonly string[] = [],
): SessionRow[] {
  const byId = sessions.byId as Record<string, SessionSummary | undefined>
  const archived = new Set(archivedSessionIds.map(String))
  const current = sessions.current === undefined ? undefined : String(sessions.current)

  // 工作区认领过的会话即便不可见（归档等）也不算无所属，否则归档会话会
  // 从工作区里「掉」进未分组桶。
  const accounted = new Set<string>()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) {
      const key = String(id)
      if (byId[key] !== undefined) accounted.add(key)
    }
  }

  const rows: SessionRow[] = []
  for (const id of sessions.ids) {
    const key = String(id)
    const summary = byId[key]
    if (summary === undefined || accounted.has(key)) continue
    if (!isSessionVisible(summary, current, archived)) continue
    rows.push(toRow(summary))
  }
  return rows
}
