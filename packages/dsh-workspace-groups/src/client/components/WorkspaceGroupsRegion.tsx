/**
 * 侧边栏的工作区浏览区域
 *
 * 这是 `sidebar.workspaces` 的接替者，该插槽是 single 类型，本包以 `priority: -1` 注册从而成为渲染者
 * 官方 ui-workspace 的同名注册仍留在注册表中但不再渲染
 *
 * 本模块只负责状态与编排：折叠态、四个对话框的草稿，以及把快照切成每个工作区的布局
 * 行的外观与菜单分别由 components/ 下的组件负责
 *
 * 只有用户创建的分组才有分组头，未归组的会话直接平铺在工作区下，与原生会话列表一致
 * 折叠状态按「工作区」与「工作区+分组」分别记录，因此不同工作区、不同分组之间互不影响
 *
 * 不属于任何工作区的会话（例如工作区被删除后遗留的会话）收进末尾一个隐式的「未分组」区段
 * 那是工作区一级的容器，与本包在工作区内刻意不造「未分组分组」的取舍无关
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { normalizeSnapshot } from '../remote.ts'
import type { WorkspaceGroupsSnapshot } from '../remote.ts'
import type { HostInfo } from '../hostInfo.ts'
import type { RegionActions, RegionDataHooks } from '../actions.ts'
import { regionLabels } from '../labels.ts'
import type { RegionTranslate } from '../locales.ts'
import {
  buildLayout,
  buildRootLayout,
  containsSession,
  groupIdOfSession,
  virtualWorkspaceIdOf,
} from '../data/layout.ts'
import {
  descendantsOf,
  deriveNesting,
  nearestAncestorForPath,
} from '../data/nest.ts'
import {
  compareSessionRows,
  flatRowsInFocus,
  flatSessionRows,
  groupSessionsByWorkspace,
  mainSessionId,
  straySessions,
} from '../data/sessions.ts'
import {
  focusedLayout,
  focusedWorkspaceIds,
  pickerSections,
  resolveFocus,
  rootPickerEntries,
} from '../data/picker.ts'
import type { PickerEntry } from '../data/picker.ts'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ViewModeStoreHandle } from '../viewMode.ts'
import { WorkspacePickerMenu } from './WorkspacePickerMenu.tsx'
import { ViewOptionsMenu } from './ViewOptionsMenu.tsx'
import { EMPTY_PICKER_STATE } from '../../pickerState.ts'
import { rootVirtualKey } from '../../rootEntry.ts'
import { searchSessions } from '../data/search.ts'
import type { SearchMatch } from '../data/search.ts'
import { rowStatusDot, sessionStatuses } from '../data/status.ts'
import type { SessionStatus } from '../data/status.ts'
import { abbreviateHomePath } from '../utils/pathUtils.ts'
import { useFlipMarker } from '../useFlipMarker.ts'
import type {
  GroupNameDraft,
  SessionRow,
  VirtualWorkspaceNameDraft,
  WorkspaceNameDraft,
} from '../data/types.ts'
import { SessionRowMenu } from './SessionRowMenu.tsx'
import type { SessionGroupingContext } from './SessionRowMenu.tsx'
import { CollapsibleBody } from './CollapsibleBody.tsx'
import { SessionRowView } from './SessionRowView.tsx'
import { RegionHeader, RegionRailHeader } from './RegionHeader.tsx'
import { SearchResults, useSearch } from './SearchControl.tsx'
import { WorkspaceRail } from './WorkspaceRail.tsx'
import { WorkspaceRow } from './WorkspaceRow.tsx'
import type { WorkspaceRowLabels } from './WorkspaceRow.tsx'
import { WorkspaceSection } from './WorkspaceSection.tsx'
import { VirtualWorkspaceSection } from './VirtualWorkspaceSection.tsx'
import {
  PARENT_GROUP_ITEM,
  VIRTUAL_WORKSPACE_ITEM,
  VIRTUAL_WORKSPACE_PREFIX,
  parseParentGroupId,
} from '../menus.tsx'
import type { ParentGroupMenuInput, VirtualWorkspaceMenuInput } from '../menus.tsx'
import { DeleteDialog } from './dialogs/DeleteDialog.tsx'
import { ListDialog } from './dialogs/ListDialog.tsx'
import { NameDialog } from './dialogs/NameDialog.tsx'

/** 未分组桶在工作区状态表里占用的键，它没有真实的 workspaceId */
const UNGROUPED_KEY = ''

/** 平铺列表不渲染时交出的空行集，恒定同一份引用，避免每次渲染换新数组 */
const EMPTY_ROWS: readonly SessionRow[] = []

/**
 * 一次待确认的「把新增的子工作区放进父所在的分组」
 *
 * 只有新增工作区这一条路径用它，新工作区落在某个工作区之下，而那个父恰好只在一个分组里时
 * 问一句要不要顺手放进去。父有多个分组时不问——该选哪个不是这里能替用户定的
 */
interface MergeDraft {
  /** 目标分组所属的父工作区 */
  parentId: string
  /** 目标分组 */
  groupId: string
  /** 父工作区名，用于文案 */
  parentLabel: string
  /** 分组名，用于文案 */
  groupLabel: string
  /** 新增工作区的名字，用于文案 */
  childLabel: string
  /** 要放进该分组的工作区 */
  workspaceIds: string[]
}

/** 组件消费的 props，全局数据 hook + 注入的动作 + store 座位 + 两个文案座位 + shell 的宽窄状态 */
export type WorkspaceGroupsProps = RegionDataHooks &
  RegionActions &
  PropsStore<ViewModeStoreHandle> & {
    /** shell 折叠状态：宽栏渲染完整内容，窄栏只渲染展开入口 */
    wide: boolean
    /** 窄栏图标请求展开侧边栏 */
    expandSidebar: () => void
    /** 本包命名空间的翻译座位，由插槽在渲染期绑定当前语言 */
    t: RegionTranslate
  }

export function WorkspaceGroupsRegion(props: WorkspaceGroupsProps): ReactElement | null {
  const {
    wide,
    expandSidebar,
    useWorkspaces,
    useSessions,
    useSessionStatus,
    useDirectoryFlow,
    useHostInfo,
    openSession,
    startSession,
    onReady,
    loadGroups,
    createGroup,
    renameGroup,
    deleteGroup,
    moveSession,
    createVirtualWorkspace,
    renameVirtualWorkspace,
    deleteVirtualWorkspace,
    moveWorkspace,
    nestWorkspaces,
    unnestWorkspaces,
    setNested,
    forgetWorkspace,
    focusEntry,
    togglePinned,
    renameWorkspace,
    deleteWorkspace,
    searchResultLimit,
    official: resolveOfficial,
    addWorkspace: resolveAddWorkspace,
    tWorkspace,
    tSidebar,
    t,
    useStore,
    actions,
  } = props

  // 展示方式读走选择器 hook、写走 actions，与官方 ui-workspace 的 groupBy 同一套
  const viewMode = useStore((state) => state.mode)
  const setViewMode = actions.setMode

  // 文案表按三个翻译座位缓存：它每次渲染都是新对象
  // 里面的函数（如 sessionActions）会直接传给行组件，每渲染新建一份会让整片列表的 memo 失效
  // 缓存的是投影结果而不是译文——三个 t 都在调用时才读当前语言，因此语言切换后重新调用拿到的仍是新译文
  const labels = useMemo(() => regionLabels(t, tWorkspace, tSidebar), [t, tWorkspace, tSidebar])

  const workspaces = useWorkspaces((state) => state.items) as readonly WorkspaceView[]
  // 归档集是注册表全局的，归档会话仍留在工作区的 sessionIds 里，必须显式过滤，否则已归档的会话会继续出现在列表里
  const archivedSessionIds = useWorkspaces(
    (state) => state.archivedSessionIds,
  ) as readonly string[]
  const sessions = useSessions((state) => state) as SessionListState
  // 待交互 / 运行 / 完成提醒是同一个事实源的三个字段，等待审批时会话可能并不在 running，因此必须单独读，不能从会话摘要里推
  const statusSnapshot = useSessionStatus((state) => state) as SessionStatusSnapshot
  const [snapshot, setSnapshot] = useState<WorkspaceGroupsSnapshot>({
    byWorkspace: {},
    nesting: {},
    workspaceGroups: [],
    picker: EMPTY_PICKER_STATE,
    nested: true,
  })
  /** 下拉菜单的开合，菜单面板与触发器分处两个组件，状态因此留在这一层 */
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerTrigger = useRef<HTMLButtonElement>(null)
  /** 视图选项面板的开合与触发器，与下拉菜单同一套分工 */
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const viewOptionsTrigger = useRef<HTMLButtonElement>(null)
  /** 关闭嵌套的二次确认框，打开时列出会被解除嵌套的工作区 */
  const [nestedConfirmOpen, setNestedConfirmOpen] = useState(false)
  /**
   * 待确认的「把子工作区一并放进分组」
   *
   * 两种来源共用同一个框，把已经归组的工作区移进分组，以及新增工作区后问它要不要跟随父
   * 两者问的其实是同一件事——要不要把一棵子树的归属一起改写
   */
  const [mergeDraft, setMergeDraft] = useState<MergeDraft | null>(null)
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  // 工作区分组与工作区的折叠态各记一份，键的构成也各自独立，因此两层开合互不影响
  const [collapsedVirtualWorkspaces, setCollapsedVirtualWorkspaces] = useState<
    Record<string, boolean>
  >({})
  // 建组与改名共用一个对话框，groupId 为空串时是新建
  const [nameDraft, setNameDraft] = useState<GroupNameDraft | null>(null)
  const [groupDelete, setGroupDelete] = useState<{
    workspaceId: string
    groupId: string
    label: string
  } | null>(null)
  const [workspaceRename, setWorkspaceRename] = useState<WorkspaceNameDraft | null>(null)
  const [workspaceDelete, setWorkspaceDelete] = useState<{
    workspaceId: string
    label: string
  } | null>(null)
  // 建组与改名共用一个对话框，groupId 为空串时是新建（与 `nameDraft` 同构）
  const [virtualWorkspaceDraft, setVirtualWorkspaceDraft] =
    useState<VirtualWorkspaceNameDraft | null>(null)
  const [virtualWorkspaceDelete, setVirtualWorkspaceDelete] = useState<{
    groupId: string
    label: string
  } | null>(null)
  /** 从搜索结果打开、等待滚进可视区的那一行，滚动完成后由行自己回报清除 */
  const [revealSessionId, setRevealSessionId] = useState<string | undefined>(undefined)

  /**
   * 量出区域右缘到窗口右缘的距离，据此决定悬停卡片是否要翻向左侧——
   * 对照模式下区域挂右侧栏、贴着窗口右缘，官方卡片固定向右展开会开到屏幕外
   */
  const flipRef = useFlipMarker()

  const currentSessionId = mainSessionId(sessions)

  // 搜索状态留在这里而不是 header 内部，窄栏入口要触发宽栏输入框的聚焦
  // 这一跨形态的联动需要一个共同宿主
  const search = useSearch(wide, expandSidebar)

  // 行尾相对时间的基准时刻。官方在渲染时直接取 Date.now()（没有任何 ticker）
  // 这里取同一做法：时间文案的精度是分钟级，跟着别的重渲染刷新足够
  const now = Date.now()

  /**
   * 根节点上的工作区布局
   *
   * 工作区 id 按宿主顺序排（`workspaces` 本身就是那个顺序），因此没有建过工作区分组时 `loose` 就是全部工作区
   * 这一层不改变任何行的位置——界面与没有这个功能时完全一致
   */
  const workspaceIds = useMemo(
    () => workspaces.map((workspace) => String(workspace.workspaceId)),
    [workspaces],
  )
  /**
   * workspaceId → 工作区视图
   *
   * 根节点按 id 排布（分组里记的也是 id），渲染每行时都要按 id 取回视图
   * 流式期间每次活动都会重渲染整片区域，逐个 `find` 会让这一层退化成与工作区数平方成正比。索引只随工作区快照重建一次
   */
  const workspaceById = useMemo(() => {
    const index = new Map<string, WorkspaceView>()
    for (const workspace of workspaces) index.set(String(workspace.workspaceId), workspace)
    return index
  }, [workspaces])

  /** 取一个工作区的 cwd，缺省表示它没有可用路径，那个工作区因此不会被嵌套 */
  const pathOfWorkspace = (workspaceId: string): string | undefined =>
    workspaceById.get(workspaceId)?.path

  /**
   * workspaceId → 它所属的虚拟工作区分组 id，空串表示不在任何虚拟工作区里
   *
   * 虚拟工作区归属由根节点布局交出，那一层已经把「哪些工作区在哪个虚拟分组里」算过一遍
   */
  const virtualOfWorkspace = useMemo(() => {
    const index = new Map<string, string>()
    for (const section of snapshot.workspaceGroups) {
      for (const workspaceId of section.workspaceIds) index.set(workspaceId, section.id)
    }
    return (workspaceId: string): string => index.get(workspaceId) ?? ''
  }, [snapshot.workspaceGroups])

  /**
   * 子工作区嵌套的推导
   *
   * 路径关系不落盘，每次都从 cwd 现推，落盘的归属只决定「渲染在哪个分组里」，是否成父子恒由路径决定
   * 开关关着时推导结果里每个工作区都是自己那个容器的顶层，界面因此与没有这个特性时完全一致
   */
  const nesting = useMemo(
    () =>
      deriveNesting({
        enabled: snapshot.nested,
        workspaceIds,
        pathOf: pathOfWorkspace,
        virtualOf: virtualOfWorkspace,
        bindingOf: (workspaceId) => snapshot.nesting[workspaceId],
        groupIdsOf: (workspaceId) =>
          new Set((snapshot.byWorkspace[workspaceId] ?? []).map((group) => group.id)),
      }),
    // pathOf 随 workspaceById 变
    [snapshot, workspaceIds, workspaceById, virtualOfWorkspace],
  )

  /**
   * 根节点布局
   *
   * 开启嵌套时每一段只列该容器里的顶层工作区，被嵌套的那些在父工作区体内渲染
   * 关掉时每个工作区都散回自己那个虚拟分组（或根节点），与没有这个特性时逐行一致
   */
  const rootLayout = useMemo(
    () => buildRootLayout(workspaceIds, snapshot.workspaceGroups, nesting),
    [workspaceIds, snapshot.workspaceGroups, nesting],
  )

  /**
   * 新增工作区采纳成功后，按层级关系判断要不要问一句「放进父所在的分组」
   *
   * 新工作区此刻还没进列表，因此这里按路径找它最短的直接父工作区，而不是按 id
   * 父不存在、或父自己没在任何一个分组里时不问，默认的嵌套渲染已经把它放在父下面了，放进分组不是必需的
   *
   * 这是一条从「添加工作区」那个组件回传的事实，所以走回调而不是读渲染期的状态
   */
  const onWorkspaceAdopted = useCallback(
    (workspaceId: string, path: string): void => {
      if (!snapshot.nested) return
      const parentId = nearestAncestorForPath(
        workspaceIds,
        pathOfWorkspace,
        virtualOfWorkspace,
        path,
        virtualOfWorkspace(workspaceId),
      )
      if (parentId === undefined) return
      const parent = workspaceById.get(parentId)
      const directGroups = snapshot.byWorkspace[parentId] ?? []
      // 只在父恰好有一个分组时替用户选定它，有多个时该选哪个不是这里能替用户定的
      if (directGroups.length !== 1) return
      const group = directGroups[0]
      if (group === undefined) return
      setMergeDraft({
        parentId,
        groupId: group.id,
        parentLabel: parent?.title ?? parentId,
        groupLabel: group.name,
        childLabel: workspaceById.get(workspaceId)?.title ?? workspaceId,
        workspaceIds: [workspaceId],
      })
    },
    [snapshot.nested, snapshot.byWorkspace, workspaceIds, workspaceById],
  )

  /**
   * 下拉菜单里的条目与三个分区
   *
   * 与列表取自同一次切分，因此「全部」分区的顺序与刚才那一屏逐行对应
   * 开启嵌套时子工作区也列出并按层级缩进，它们可能已被置顶，不列出来那些记录就成了指向不存在条目的死条目
   */
  const pickerEntries = useMemo(
    () => rootPickerEntries(rootLayout, workspaceById, snapshot.nested ? nesting : undefined),
    [rootLayout, workspaceById, nesting, snapshot.nested],
  )
  const picker = useMemo(
    () => pickerSections(pickerEntries, snapshot.picker),
    [pickerEntries, snapshot.picker],
  )
  /**
   * 当前聚焦的条目
   *
   * 解析不到（聚焦的条目已经被删掉或解散）时当作没有聚焦，记录比列表活得久，直接按那个键过滤会让列表整片空掉，而第二行还写着一个已经不存在的名字
   */
  const resolvedFocus = resolveFocus(pickerEntries, snapshot.picker.focused)
  /** 第二行显示的文案，没有聚焦时是「全部工作区」 */
  const currentFocus = resolvedFocus?.label ?? labels.picker.all
  /**
   * 聚焦生效后的根节点布局
   *
   * 聚焦一个工作区分组时列表里不再重复渲染组头（第二行已经写着组名），因此这一层只交出组内工作区
   */
  const listLayout = useMemo(
    () => focusedLayout(rootLayout, pickerEntries, snapshot.picker.focused),
    [rootLayout, pickerEntries, snapshot.picker.focused],
  )
  /** 真的聚焦在某一片内容上时，「未分组」区段整段隐藏，聚焦就是「只看这一个」 */
  const focused = resolvedFocus !== undefined

  // 官方动作与文案的解析时机放在渲染期，渲染器会缓存注册项的 inject 结果
  // 在 inject 里读服务会冻结在首次渲染那一刻，而官方 ui-workspace 的加载顺序不受本包约束
  const official = resolveOfficial?.()
  // 「添加工作区」同样延迟到渲染期解析，它要读官方 directoryFlow 洞的占用者
  // 而目录选择器插件的加载顺序不受本包约束，订阅占用情况让入口跟着占用者出现
  const flowOccupied = useDirectoryFlow((occupied) => occupied) as boolean
  const addWorkspace = flowOccupied ? resolveAddWorkspace?.(onWorkspaceAdopted) : undefined

  /**
   * 一个会话行的全部状态，供行首那个点与悬停卡片共同消费
   *
   * 待交互种类从快照里按会话 id 取
   * 在这里算是为了让状态位与时间文案作为内容稳定的 prop 参与行级 memo 的比对
   * 被 memo 挡下的行不会重算，按渲染当刻取时间会停住
   *
   * 卡片要连空闲也列一条，行首则不画点——那一层取舍由 `data/status.ts` 的 `rowStatusDot` 承担
   * 两个消费方因此不会各推导一套
   * @returns 按优先级排列的状态
   */
  const statusesOf = (row: SessionRow): SessionStatus[] =>
    sessionStatuses(row, statusSnapshot.get(row.id as SessionId)?.pendingInteraction?.kind, labels.status)

  /**
   * 一个会话行行尾要显示的相对时间
   *
   * 官方对空白（新建中）会话行不显示时间，这里沿用同一取舍
   * @returns 相对时间文案，不显示时为 undefined
   */
  const timeOf = (row: SessionRow): string | undefined =>
    row.blank || official === undefined ? undefined : official.relativeTime(row.updatedAt, now)

  /**
   * 一个会话行悬停卡片里的相对时间
   *
   * 与行尾那份的区别只有一层：距离要套官方的「…前」模板（见 `officialHoverLabels`）
   * 官方同样分两个函数——行上那份是 `timeLabel`，卡片那份是 `hoverTimeLabel`
   * @returns 相对时间文案，空白行不显示时为 undefined
   */
  const hoverTimeOf = (row: SessionRow): string | undefined =>
    row.blank || official === undefined
      ? undefined
      : labels.hover.timeAgo(row.updatedAt, now)

  /** 悬停卡片只在官方文案在场时挂：缺了它卡片只是个空壳 */
  const hoverLabels = official === undefined ? undefined : labels.hover

  // 宿主 home 用于把工作区目录缩写成 `~`。走全局标准 hook 而不是 inject
  // 渲染器会缓存注册项的 inject 结果整个注册周期，在 inject 里读会冻结在首次渲染那一刻
  const home = useHostInfo((info: HostInfo) => info.home) as string | undefined

  /** 被打开的那一行滚进可视区后清掉标记，避免它在后续重新挂载时再滚一次 */
  const acknowledgeReveal = useCallback((sessionId: string) => {
    setRevealSessionId((current) => (current === sessionId ? undefined : current))
  }, [])

  // 本次搜索的结果页。计算是纯的且输入都来自快照，因此跟着这些输入走 memo：
  // 流式期间每次活动都会重渲染整片区域，不缓存就要在每次活动重扫一遍全部会话
  const searchResult = useMemo(
    () =>
      searchSessions(
        sessions,
        workspaces,
        snapshot.byWorkspace,
        archivedSessionIds,
        search.normalized,
        searchResultLimit,
        statusSnapshot,
      ),
    [
      sessions,
      workspaces,
      snapshot.byWorkspace,
      archivedSessionIds,
      search.normalized,
      searchResultLimit,
      statusSnapshot,
    ],
  )

  /**
   * 从搜索结果打开一条会话
   *
   * 打开之前先把这条会话所在的两层折叠打开并清掉搜索：结果行点下去的意图是「去看这条会话」
   * 而它可能正躺在收起的工作区或分组里，不展开就落在一个看不见的行上
   * 这正是官方 `revealSessionId` 承担的那段编排——官方在那里由组件订阅会话树自行展开
   * 本包把展开状态放在本组件里，因此在打开前直接写这两份状态
   *
   * 清掉查询还有一层意义：结果列表随即被常规列表取代，标记的那一行才真的存在
   */
  const openSearchResult = (match: SearchMatch): void => {
    const workspaceId = match.workspace?.id
    if (workspaceId === undefined) {
      // 无所属工作区的会话落在末尾的隐式「未分组」区段里，同样要先展开
      setCollapsedWorkspaces((prev) =>
        prev[UNGROUPED_KEY] === true ? { ...prev, [UNGROUPED_KEY]: false } : prev,
      )
    } else {
      // 工作区本身可能还躺在一个收起的工作区分组里，与外层两层一样要先展开，否则揭示的那一行落在看不见的地方
      const rootGroupId = virtualWorkspaceIdOf(rootLayout.groups, workspaceId)
      if (rootGroupId !== '') {
        setCollapsedVirtualWorkspaces((prev) =>
          prev[rootGroupId] === true ? { ...prev, [rootGroupId]: false } : prev,
        )
      }
      // 工作区自己可能是嵌在父工作区体内的子工作区，从根节点那一层起逐层展开它所有的祖先
      // 只展开它自己会让那一行落在收起的父折叠体里，用户看不到它
      const lineage = [workspaceId, ...nesting.ancestorsOf(workspaceId)]
      setCollapsedWorkspaces((prev) => {
        let next = prev
        for (const id of lineage) {
          if (next[id] !== true) continue
          next = { ...next, [id]: false }
        }
        return next
      })
      if (match.group !== undefined) {
        const key = `${workspaceId}:${match.group.id}`
        setCollapsedGroups((prev) => (prev[key] === true ? { ...prev, [key]: false } : prev))
      }
    }
    setRevealSessionId(match.row.id)
    search.clear()
    openSession(match.row.id)
  }

  const reload = useCallback(() => {
    let cancelled = false
    loadGroups()
      .then((next) => {
        if (!cancelled) setSnapshot(normalizeSnapshot(next))
      })
      .catch(() => {
        // 元数据不可用时退化为「全部分组消失」，会话仍按未归组平铺
        // 工作区仍平铺在根节点上，界面可用
        if (!cancelled) {
          setSnapshot({
            byWorkspace: {},
            nesting: {},
            workspaceGroups: [],
            picker: EMPTY_PICKER_STATE,
            nested: true,
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [loadGroups])

  useEffect(() => reload(), [reload])

  // 首次拉取可能早于远程数据面就绪（requireApi 抛错被上面的 catch 吞掉）
  // 就绪信号到达时重拉一次，否则已落盘的分组要等下一次改动才会出现
  useEffect(() => onReady(() => reload()), [onReady, reload])

  /**
   * 执行一次改动，并用宿主回传的快照替换本地状态
   *
   * 宿主每个变更方法都回整份快照（见宿主 `service.ts`），直接采用它就不必再拉一次
   * 也避免「改动已生效、本地状态还是旧的」这段空档
   *
   * 失败要留下痕迹：分组元数据的写入不可见，一次静默失败只会表现为「什么都没发生」
   * 界面与元数据的偏差却一直留着。失败时退回重拉一次，让本地状态与宿主对齐
   */
  const apply = useCallback(
    (action: Promise<WorkspaceGroupsSnapshot>) => {
      void action.then(
        (next) => setSnapshot(normalizeSnapshot(next)),
        (reason: unknown) => {
          console.error('workspace-groups: group change failed', reason)
          reload()
        },
      )
    },
    [reload],
  )

  /** 折叠状态取反，默认展开，因此只有显式 true 才算折叠 */
  const toggleWorkspace = useCallback((key: string) => {
    setCollapsedWorkspaces((prev) => ({ ...prev, [key]: prev[key] !== true }))
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: prev[key] !== true }))
  }, [])

  const toggleVirtualWorkspace = useCallback((key: string) => {
    setCollapsedVirtualWorkspaces((prev) => ({ ...prev, [key]: prev[key] !== true }))
  }, [])

  /** 提交建组或改名，空名与取消都不写 */
  const commitNameDraft = (): void => {
    if (nameDraft === null) return
    const name = nameDraft.value.trim()
    if (name === '') return
    setNameDraft(null)
    apply(
      nameDraft.groupId === ''
        ? createGroup(nameDraft.workspaceId, name)
        : renameGroup(nameDraft.workspaceId, nameDraft.groupId, name),
    )
  }

  const commitGroupDelete = (): void => {
    if (groupDelete === null) return
    setGroupDelete(null)
    apply(deleteGroup(groupDelete.workspaceId, groupDelete.groupId))
  }

  /**
   * 提交工作区分组的建组或改名，空名与取消都不写
   *
   * 新建时把草稿里指定的工作区一并放进去：入口就在那个工作区行上
   * 点完立刻看到它进了新分组，比「建完再把工作区拖进去」少一步，也不会出现「建完分组却不知道它在哪」的空档
   * 归属与建组分两次写，因此建组成功而归组失败时，会留下一个空分组——那是可恢复的状态，下次移入即可
   *
   * 勾了「切换到新工作区」时，建完之后再把视图聚焦到新分组上，新建的分组排在列表最末，当前视野多半看不到
   * 不切过去就等于「建了但不知道建到哪去了」
   * 新分组的 id 只能从宿主回的快照里取（它就是最后那一个），因此聚焦要接在它后面
   * 改动仍然全部由宿主回快照，客户端不自己拼下一步的状态
   */
  const commitVirtualWorkspaceDraft = (): void => {
    if (virtualWorkspaceDraft === null) return
    const name = virtualWorkspaceDraft.value.trim()
    if (name === '') return
    const { groupId, workspaceId } = virtualWorkspaceDraft
    const follow = virtualWorkspaceDraft.followFocus === true
    setVirtualWorkspaceDraft(null)
    if (groupId !== '') {
      apply(renameVirtualWorkspace(groupId, name))
      return
    }
    /** 建完（并可选地移入）之后，按需把视图聚焦到新分组 */
    const finish = async (next: WorkspaceGroupsSnapshot): Promise<WorkspaceGroupsSnapshot> => {
      // 新建的分组排在最末，宿主回的是整份快照，取它新增的那一个
      const created = next.workspaceGroups[next.workspaceGroups.length - 1]
      if (created === undefined) return next
      let after = next
      if (workspaceId !== undefined) after = await moveWorkspace(workspaceId, created.id)
      if (!follow) return after
      return focusEntry(rootVirtualKey(created.id))
    }
    apply(createVirtualWorkspace(name).then(finish))
  }


  const commitVirtualWorkspaceDelete = (): void => {
    if (virtualWorkspaceDelete === null) return
    setVirtualWorkspaceDelete(null)
    apply(deleteVirtualWorkspace(virtualWorkspaceDelete.groupId))
  }

  /** 工作区当前的名字，用于判断改名是否真的改变了内容 */
  const renamedFrom = (draft: WorkspaceNameDraft): string => {
    const workspace = workspaces.find((item) => String(item.workspaceId) === draft.workspaceId)
    return workspace === undefined ? '' : workspace.title
  }

  const commitWorkspaceRename = (): void => {
    if (workspaceRename === null) return
    const name = workspaceRename.value.trim()
    if (name === '' || name === renamedFrom(workspaceRename)) return
    setWorkspaceRename(null)
    // 不经过 `apply`，改名不动分组元数据，官方控制器返回的是工作区视图而不是分组快照
    // `apply` 因此只收「回整份快照」的改动。失败仍要留下痕迹
    void renameWorkspace(workspaceRename.workspaceId, name).catch((reason: unknown) => {
      console.error('workspace-groups: workspace rename failed', reason)
    })
  }

  /**
   * 删除工作区
   *
   * 先删注册再清分组元数据：工作区没了，它名下的会话分组与根节点归属记录都再也不会被渲染，留着就是读不到的记录
   * 反过来的话，清理成功而删工作区失败会把分组提前丢掉
   * 两处清理由既有的 `deleteGroup` / `forgetWorkspace` 承担，不新增宿主接口
   *
   * 每一步都回整份快照，取最后一步的那份即可，删工作区本身不动分组元数据，因此最终状态就是最后一次清理的结果（没有分组可清时退回删工作区前的本地值）
   */
  const commitWorkspaceDelete = (): void => {
    if (workspaceDelete === null) return
    const { workspaceId } = workspaceDelete
    setWorkspaceDelete(null)
    const orphanGroups = snapshot.byWorkspace[workspaceId] ?? []
    apply(
      deleteWorkspace(workspaceId).then(async () => {
        // 先把这个工作区从根节点的归属里摘掉：干净的分组不该永久挂着一个已删除的 id
        let next = await forgetWorkspace(workspaceId)
        for (const group of orphanGroups) next = await deleteGroup(workspaceId, group.id)
        return next
      }),
    )
  }

  /**
   * 在一个工作区里新建会话
   *
   * 官方在新建前展开工作区，否则新会话会落在折叠区里看不见，分组行的 `+` 同理要把分组一起展开
   *
   * 建好之后无条件把会话摆到本次创建指定的位置：`groupId` 为空串表示工作区行的 `+`，会话归入未归组区
   * 这一步不能只在指定了分组时做——官方会复用该工作区已有的空白会话，那条会话可能正留在某个分组里
   * 复用时不把它摘出来就会停在原分组
   * @param groupId - 新会话要归入的分组，空串表示归入未归组区
   */
  const createSessionIn = (workspaceId: string, groupId: string): void => {
    setCollapsedWorkspaces((prev) => ({ ...prev, [workspaceId]: false }))
    // 展开而不是取反，分组本就展开时，切换会把它收起来，新会话反而看不见
    if (groupId !== '') {
      setCollapsedGroups((prev) => ({ ...prev, [`${workspaceId}:${groupId}`]: false }))
    }
    void startSession(workspaceId)
      .then((sessionId) => {
        // 被更晚的导航取代时没有会话要摆位置
        if (sessionId === undefined) return undefined
        return apply(moveSession(workspaceId, sessionId, groupId))
      })
      .catch(() => {
        // 建会话失败由会话控制器自己提示，这里不再弹一次，避免同一错误报两遍
      })
  }

  /**
   * 归组菜单选中项：取消分组，或移入 `group:<id>` 指名的分组
   *
   * 是 `useCallback` 而不是每次渲染新建：它会随归组上下文传到每一行
   * 行级 memo 按引用比对，每渲染新建一个会让整片列表的 memo 失效
   */
  const selectSessionGroup = useCallback(
    (workspaceId: string, sessionId: string, id: string): void => {
      if (id === 'ungroup') {
        apply(moveSession(workspaceId, sessionId, ''))
        return
      }
      if (id.startsWith('group:')) {
        apply(moveSession(workspaceId, sessionId, id.slice('group:'.length)))
      }
    },
    [apply, moveSession],
  )

  /**
   * header 入口：新建一个工作区分组
   *
   * 入口在区域顶部、与具体工作区无关，因此建出的是空分组（新分组会渲染在列表最前，用户随即能往里移工作区）
   * 工作区行菜单里那个同名项则把「建组 + 移入当前工作区」压成一步，两者是同一动作的两种入口，不是两套实现
   *
   * 是 `useCallback` 而不是每次渲染新建，它随 inject 结果传给 header，每渲染新建一份会让 header 每帧都判定为变过
   */
  const startVirtualWorkspaceCreate = useCallback(() => {
    setVirtualWorkspaceDraft({ groupId: '', value: '' })
  }, [])

  /**
   * 工作区行「移动到…」子菜单与「移出工作区分组」一级项的选中项
   *
   * 三个分支：新建一个分组并把该工作区放进去、移出当前分组
   * 或移入 `vw:<id>` 指名的分组。与 `selectSessionGroup` 一样是 `useCallback`：
   * 它会随菜单上下文传到每一行，行级 memo 按引用比对
   */
  const selectVirtualWorkspace = useCallback(
    (workspaceId: string, id: string): void => {
      if (id === VIRTUAL_WORKSPACE_ITEM.create) {
        setVirtualWorkspaceDraft({ groupId: '', workspaceId, value: '' })
        return
      }
      if (id === VIRTUAL_WORKSPACE_ITEM.ungroup) {
        apply(moveWorkspace(workspaceId, ''))
        return
      }
      if (id.startsWith(VIRTUAL_WORKSPACE_PREFIX)) {
        apply(moveWorkspace(workspaceId, id.slice(VIRTUAL_WORKSPACE_PREFIX.length)))
      }
    },
    [apply, moveWorkspace],
  )

  /**
   * 取一个工作区名下「已经放进某个分组」的后代
   *
   * 未放进任何分组的后代由路径推导自动跟随父的位置，因此不需要改写归属
   * 已经放进某个分组的要跟着父一起换组，否则它们会在分组边界上脱离父的层级
   */
  const groupedDescendantsOf = (workspaceId: string): string[] =>
    descendantsOf(workspaceIds, pathOfWorkspace, virtualOfWorkspace, workspaceId).filter(
      (candidate) => nesting.bindingOf(candidate) !== undefined,
    )

  /**
   * 计算一个工作区当前的缩进层级
   *
   * 取的是 nesting 推导交出的 `levelOf`，而不是数 cwd 祖先
   * 被放进会话分组的那个要多让一格（中间夹着分组头），两者在那种情况下相差 1
   * @returns 从 0 起的层级
   */
  const depthOf = (workspaceId: string): number => nesting.levelOf(workspaceId)

  /**
   * 把一个工作区（连同它名下的子工作区）放进某个祖先工作区的会话分组
   *
   * 「父」由选中那个分组决定，不是自动取最近祖先，放进谁的分组谁就是父
   *
   * 归属记在子工作区自己的记录上，因此这里交出的是要写归属的那批 id：
   * 工作区自己不写（它是被放进分组的那一个），它名下的子工作区要一并跟随，否则层级会在分组边界上断开
   *
   * 分两次写，先把它放进分组，再把跟随的子工作区放进去
   * 第二次失败时会留下「父已进组、子还在外面」的状态——那是可恢复的，下次再移一次即可，不必为此加补偿事务
   */
  const selectParentGroup = useCallback(
    (workspaceId: string, id: string): void => {
      if (id === PARENT_GROUP_ITEM.ungroup) {
        apply(unnestWorkspaces([workspaceId]))
        return
      }
      const target = parseParentGroupId(id)
      if (target === undefined) return
      // 整棵子树跟着走，保持层级关系，父进哪个分组，它名下已经放进别处分组的子工作区一并换过去
      // 未放进任何分组的那些由路径推导自动跟随，不必写
      // 两步分开写，因此父已进组、子还留在原组是一段可恢复的中间态——下次移一次即可
      const followers = groupedDescendantsOf(workspaceId)
      // 每一步都要走 `apply`，它把宿主回的整份快照写进本地状态
      // 直接 `void nestWorkspaces(...)` 会把那次写入的结果丢掉，界面因此停在旧快照上——
      // 归属其实已经落盘，看起来却像「移入没有生效」
      apply(
        nestWorkspaces([workspaceId], target.parentId, target.groupId).then((next) =>
          followers.length === 0
            ? next
            : nestWorkspaces(followers, target.parentId, target.groupId),
        ),
      )
    },
    [apply, nestWorkspaces],
  )

  /**
   * 视图选项里的嵌套开关
   *
   * 开启直接写，关闭要先过二次确认，并把会被解除嵌套的工作区逐个列出来
   * 这一层是「用户点了一下」与「真的写盘」之间的分派，真正的写入在 {@link commitNestedOff}
   *
   * 确认框只列放进某个分组的那些，未放进分组的子工作区本来就只是按路径推导出来的展示层级
   * 开关一关它们自然回落到根节点，开关一开又回来，不需要也不该被写进确认范围
   */
  const requestNestedToggle = (): void => {
    if (!snapshot.nested) {
      apply(setNested(true))
      return
    }
    setNestedConfirmOpen(true)
  }

  /** 关闭嵌套，宿主会把全部落盘的归属一并清空，因此这里只需把开关写下去 */
  const commitNestedOff = (): void => {
    setNestedConfirmOpen(false)
    apply(setNested(false))
  }

  /**
   * 提交一次「放进父所在的分组」
   *
   * 选「放进去」时写这次归属，选「不放进去」时什么都不做——新工作区仍按路径推导渲染在父下面
   * @param merge - 为真表示把新工作区放进那个分组
   */
  const commitMerge = (merge: boolean): void => {
    if (mergeDraft === null) return
    const draft = mergeDraft
    setMergeDraft(null)
    if (!merge) return
    apply(nestWorkspaces(draft.workspaceIds, draft.parentId, draft.groupId))
  }

  /**
   * 菜单选中一个条目，聚焦它
   *
   * 聚焦要落盘（它是最近使用的记录源），因此走 `apply` 收宿主回的整份快照
   * 菜单随即收起——它的作用就是把用户送到那一片内容上，留着只会挡住刚聚焦的列表
   */
  const selectFocus = (key: string): void => {
    setPickerOpen(false)
    if (key === snapshot.picker.focused) return
    apply(focusEntry(key))
  }

  /** 菜单行尾的置顶按钮：切换该条目的置顶，菜单保持打开 */
  const selectPinned = (key: string): void => {
    apply(togglePinned(key))
  }

  /**
   * 菜单某一行「重命名」：按条目类别转到既有的两个改名对话框
   *
   * 不新造对话框也不新造宿主接口，工作区分组与工作区各自已经有一条改名路径：
   * 分组走本包的 `renameVirtualWorkspace`，工作区走官方控制器
   * 菜单只是把它们的入口搬到手边。菜单随即收起，接下来是对话框，它不该被面板压住
   */
  const renamePickerEntry = (entry: PickerEntry): void => {
    setPickerOpen(false)
    if (entry.kind === 'virtual') {
      setVirtualWorkspaceDraft({ groupId: entry.id, value: entry.label })
      return
    }
    setWorkspaceRename({ workspaceId: entry.id, value: entry.label })
  }

  /**
   * 菜单某一行「删除」：与行内 `...` 菜单走同一个确认框
   *
   * 确认框的对象按条目类别取，删除动作本身仍是既有的那两个提交函数，因此两条入口下「删掉什么」的语义不会漂移
   */
  const deletePickerEntry = (entry: PickerEntry): void => {
    setPickerOpen(false)
    if (entry.kind === 'virtual') {
      setVirtualWorkspaceDelete({ groupId: entry.id, label: entry.label })
      return
    }
    setWorkspaceDelete({ workspaceId: entry.id, label: entry.label })
  }

  // 待改的工作区名是否与另一个工作区撞名
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
    newSessionItem: labels.newSessionItem,
    newGroup: labels.newGroup,
    // 与官方工作区菜单一致：菜单项用通用动词，对话框标题才点明对象
    rename: labels.rename,
    delete: labels.deleteWorkspace,
  }

  /**
   * 某个工作区行上那份「移动工作区分组」菜单的选项集
   *
   * 归属与可选分组都随行而变，因此不能与 `workspaceRowLabels` 一起缓存
   * 每行一份新对象，行级 memo 因此按内容比对（`sameVirtualWorkspaceMenu`）
   * @returns 该行的分组选项集
   */
  const virtualWorkspaceMenuOf = (workspaceId: string): VirtualWorkspaceMenuInput => ({
    sections: rootLayout.groups,
    currentGroupId: virtualWorkspaceIdOf(rootLayout.groups, workspaceId),
    // 菜单项用带省略号的那份：点下去还要再填一次名字
    newLabel: labels.newVirtualWorkspaceMenu,
    moveToLabel: labels.moveToVirtualWorkspace,
    ungroupLabel: labels.ungroupWorkspace,
  })

  /**
   * 某个工作区行上那份「移动到分组…」菜单的选项集
   *
   * 候选是它 cwd 路径上的任意一个现存祖先，放进谁的分组谁就是父——因此不是一个自动选定的最近祖先
   * 只有真的有分组可进时这一项才出现，父工作区名下没有分组时它整项渲染成禁用，不留一个点不动的热区
   *
   * 祖先按从近到远列出，与列表里的层级顺序一致
   */
  const parentGroupMenuOf = (workspaceId: string): ParentGroupMenuInput | undefined => {
    const current = nesting.bindingOf(workspaceId)
    const candidates = nesting.ancestorsOf(workspaceId).map((parentId) => {
      const parent = workspaceById.get(parentId)
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
  }

  /**
   * 当前被放进某个分组的子工作区，按列表里的顺序
   *
   * 关掉嵌套时它就是会被解除嵌套的那批，因此确认框的名单与提示都从这一份来
   */
  const groupedChildIds = useMemo(
    () => nesting === undefined ? [] : workspaceIds.filter((id) => nesting.bindingOf(id) !== undefined),
    [nesting, workspaceIds],
  )
  /** 上面那批的显示名，工作区已被删掉时退回 id，名单因此不会出现空行 */
  const groupedChildLabels = useMemo(
    () => groupedChildIds.map((id) => workspaceById.get(id)?.title ?? id),
    [groupedChildIds, workspaceById],
  )

  // 窄栏，官方在这里也只留搜索与「添加工作区」两个入口（外加 shell 的展开入口）
  if (!wide) {
    return (
      <>
        <RegionRailHeader
          addWorkspace={addWorkspace}
          search={{ state: search, labels: labels.search }}
          newVirtualWorkspace={{
            label: labels.newVirtualWorkspace,
            onCreate: startVirtualWorkspaceCreate,
          }}
          t={t}
        />
        <WorkspaceRail label={labels.title} onExpand={expandSidebar} />
      </>
    )
  }

  const rowsByWorkspace = groupSessionsByWorkspace(
    sessions,
    workspaces,
    archivedSessionIds,
    statusSnapshot,
  )
  // 不属于任何工作区的会话，只有存在时才渲染末尾的「未分组」区段
  // 聚焦时整段不出现（`focusedLayout` 只交出被聚焦的那一片），因此这里也不必为它留位
  const stray = straySessions(sessions, workspaces, archivedSessionIds, statusSnapshot)
  const ungroupedCollapsed = collapsedWorkspaces[UNGROUPED_KEY] === true
  const searching = search.normalized !== ''

  /**
   * 渲染一个会话行
   *
   * 空白行的名字取语言包的固定名（官方 `session.new`），并且像官方一样不挂行尾菜单
   * 它只是「准备开始一个新会话」的占位，没有会话可重命名或归档
   * `grouping` 缺省表示该行没有分组可归（「未分组」桶或平铺列表）
   *
   * 传下去的字段都是原语或稳定引用，动作传的是未绑定的函数本身，行级 memo 要按字段比对，任何一处每渲染新建都会让它整片失效
   *
   * 提到工作区区块之外：平铺列表要渲染同样的行，两条路径因此共用一套状态点、悬停卡片与空白行取舍
   */
  const renderSession = (
    row: SessionRow,
    grouping?: SessionGroupingContext,
    flat = false,
  ): ReactElement => {
    // 只有被打开的那一行带揭示请求，它的闭包每渲染新建一份，因此每次重渲染会让这一行重渲染一次——行滚进可视区并回报后标记即被清掉
    // 这个代价只落在该行上
    const reveal = row.id === revealSessionId ? () => acknowledgeReveal(row.id) : undefined
    // 状态只推导一次，行首那个点与卡片那几条取自同一份结果
    const statuses = statusesOf(row)
    const status = rowStatusDot(row, statuses)
    if (row.blank) {
      return (
        <SessionRowView
          key={row.id}
          sessionId={row.id}
          title={labels.newSession}
          selected={row.id === currentSessionId}
          status={status}
          time={timeOf(row)}
          statuses={statuses}
          hoverTime={hoverTimeOf(row)}
          hoverLabels={hoverLabels}
          flat={flat}
          onOpenSession={openSession}
          onReveal={reveal}
        />
      )
    }
    return (
      <SessionRowMenu
        key={row.id}
        row={row}
        title={row.title}
        selected={row.id === currentSessionId}
        status={status}
        time={timeOf(row)}
        statuses={statuses}
        hoverTime={hoverTimeOf(row)}
        hoverLabels={hoverLabels}
        grouping={grouping}
        official={official}
        actionsLabel={labels.sessionActions}
        flat={flat}
        onOpenSession={openSession}
        t={t}
        onReveal={reveal}
      />
    )
  }

  /**
   * 会话 id → 它所属的工作区 id，无所属的会话不在其中
   *
   * 平铺列表按聚焦范围过滤时要用它：只有归属能回答「这一行属于哪一片内容」
   * 索引一次建好，逐行去各工作区的名单里找会退化成与工作区数平方成正比
   */
  const workspaceOfSession = ((): Map<string, string> => {
    const index = new Map<string, string>()
    for (const [workspaceId, rows] of rowsByWorkspace) {
      for (const row of rows) index.set(row.id, workspaceId)
    }
    return index
  })()

  /**
   * 平铺列表的行
   *
   * 成员集合与工作区归属无关，因此「未分组」桶里的会话也在其中，且顺序与分组视图共用一套
   * 聚焦时按归属收窄，聚焦工作区分组取的是归属全集而不是分组视图那份渲染层级
   */
  const flatRows =
    viewMode !== 'flat'
      ? EMPTY_ROWS
      : flatRowsInFocus(
          flatSessionRows(sessions, archivedSessionIds, statusSnapshot),
          workspaceOfSession,
          focusedWorkspaceIds(rootLayout, pickerEntries, snapshot.picker.focused),
        ).sort(compareSessionRows)

  /**
   * 渲染一个工作区区块，以及它体内按 cwd 路径挂着的子工作区
   *
   * 递归由这里一层承担，子工作区仍是一个完整的工作区块，只是从父工作区的折叠体里长出来
   * 它自己属于哪个容器、往下又有哪些子工作区都问 {@link nesting}，深度因此不必沿递归手工累加
   *
   * 行级 memo 的前提是 props 身份稳定，因此这里传下去的都是原语或内容稳定值
   * @param workspaceId - 目标工作区 id，不在快照里时返回 null
   * @returns 该工作区的区块元素
   */
  const renderWorkspace = (workspaceId: string): ReactElement | null => {
    const workspace = workspaceById.get(workspaceId)
    // 布局只包含快照里存在的工作区，因此这里不会落空，防御一下避免类型断言
    if (workspace === undefined) return null
    const layout = buildLayout(
      rowsByWorkspace.get(workspaceId) ?? [],
      snapshot.byWorkspace[workspaceId] ?? [],
      // 组内子工作区，放进这个分组、且父是当前工作区的那些。它们自己可能还有后代，渲染时逐层向下取
      (groupId) => nesting.groupedChildIdsOf(workspaceId, groupId),
      nesting.looseChildIdsOf(workspaceId),
    )
    const collapsed = collapsedWorkspaces[workspaceId] === true

    /** 这个工作区体内的一个子工作区，它自己也是一个完整的工作区块 */
    const renderChild = (childId: string): ReactNode => renderWorkspace(childId)

    return (
      <WorkspaceSection
        key={workspaceId}
        title={workspace.title}
        collapsed={collapsed}
        // 官方只在「展开且含当前会话」时把文件夹染成强调色
        folderActive={
          !collapsed &&
          containsSession(rowsByWorkspace.get(workspaceId) ?? [], currentSessionId)
        }
        layout={layout}
        depth={depthOf(workspaceId)}
        isGroupCollapsed={(groupId) =>
          collapsedGroups[`${workspaceId}:${groupId}`] === true
        }
        labels={workspaceRowLabels}
        virtualWorkspace={virtualWorkspaceMenuOf(workspaceId)}
        parentGroup={parentGroupMenuOf(workspaceId)}
        onSelectParentGroup={(id) => selectParentGroup(workspaceId, id)}
        emptyLabel={labels.empty}
        sessionsLabel={labels.sessions}
        hover={{
          label: workspace.title,
          path: abbreviateHomePath(workspace.path, home),
          created: labels.hover.created(Date.parse(workspace.createdAt)),
        }}
        hoverCopy={workspace.path}
        hoverLabels={hoverLabels}
        groupActionLabels={{
          actions: labels.groupActions,
          newSessionItem: labels.newSessionItem,
          rename: labels.rename,
          delete: labels.deleteGroup,
          newSession: labels.newSessionInGroup,
        }}
        onToggle={() => toggleWorkspace(workspaceId)}
        onCreateSession={() => createSessionIn(workspaceId, '')}
        onNewGroup={() => setNameDraft({ workspaceId, groupId: '', value: '' })}
        onRenameWorkspace={() => setWorkspaceRename({ workspaceId, value: workspace.title })}
        onDeleteWorkspace={() => setWorkspaceDelete({ workspaceId, label: workspace.title })}
        // 「移动工作区分组」入口：把该工作区放进某个根节点分组，或先建一个再放
        onSelectVirtualWorkspace={(id) => selectVirtualWorkspace(workspaceId, id)}
        renderChildWorkspace={renderChild}
        onToggleGroup={(groupId) => toggleGroup(`${workspaceId}:${groupId}`)}
        onRenameGroup={(section) =>
          setNameDraft({ workspaceId, groupId: section.id, value: section.label })
        }
        onDeleteGroup={(section) =>
          setGroupDelete({ workspaceId, groupId: section.id, label: section.label })
        }
        onCreateSessionInGroup={(section) => createSessionIn(workspaceId, section.id)}
        renderSession={(row) =>
          renderSession(row, {
            workspaceId,
            sections: layout.groups,
            currentGroupId: groupIdOfSession(layout.groups, row.id),
            groupLabel: labels.moveToGroup,
            ungroupLabel: labels.ungroup,
            onSelectGroup: selectSessionGroup,
          })
        }
      />
    )
  }

  /**
   * 列表底部那两条说明
   *
   * 提到渲染分支之外：嵌套开关是根节点级的设置，平铺列表下也要说明它被关掉了
   */
  const notes = (
    <>
      {snapshot.nested ? null : (
        <div className="wg-note wg-note-nested" role="status">
          {`${labels.nested.disabledNote} ${labels.nested.reEnableHint}`}
        </div>
      )}
      <div className="wg-note">{labels.unimplemented}</div>
    </>
  )

  return (
    <div className="wg-root" ref={flipRef}>
      <RegionHeader
        title={labels.title}
        focusedLabel={currentFocus}
        titleHidden={searching}
        picker={{
          open: pickerOpen,
          triggerRef: pickerTrigger,
          onToggle: () => setPickerOpen((open) => !open),
          changeLabel: labels.picker.change,
        }}
        addWorkspace={addWorkspace}
        search={{ state: search, labels: labels.search }}
        viewOptions={{
          label: labels.add.viewOptions,
          open: viewOptionsOpen,
          triggerRef: viewOptionsTrigger,
          onToggle: () => setViewOptionsOpen((open) => !open),
        }}
        newVirtualWorkspace={{
          label: labels.newVirtualWorkspace,
          onCreate: startVirtualWorkspaceCreate,
        }}
        t={t}
      />
      <ViewOptionsMenu
        open={viewOptionsOpen && !searching}
        triggerRef={viewOptionsTrigger}
        label={labels.add.viewOptions}
        nesting={{
          enabled: snapshot.nested,
          label: labels.nested.setting,
          onToggle: requestNestedToggle,
        }}
        mode={viewMode}
        viewMode={labels.viewMode}
        onSelectMode={setViewMode}
        onClose={() => setViewOptionsOpen(false)}
      />
      {/* 搜索展开时标题整块让位（指针事件也关掉），面板若还开着就悬在一片与它无关的
          结果列表上：收起来，与让位一致 */}
      <WorkspacePickerMenu
        open={pickerOpen && !searching}
        triggerRef={pickerTrigger}
        focused={snapshot.picker.focused}
        sections={picker}
        labels={labels.picker}
        onClose={() => setPickerOpen(false)}
        onSelect={selectFocus}
        onTogglePinned={selectPinned}
        onRename={renamePickerEntry}
        onDelete={deletePickerEntry}
      />
      {searching ? (
        <SearchResults
          result={searchResult}
          limit={searchResultLimit}
          currentSessionId={currentSessionId}
          statusOf={(match) => rowStatusDot(match.row, statusesOf(match.row))}
          ungrouped={labels.ungrouped}
          labels={labels.search}
          onOpen={openSearchResult}
        />
      ) : viewMode === 'flat' ? (
        /* 平铺：全部可见会话在同一条列表里，与官方「单列表」（groupBy: 'flat'）一致 */
        <div className="wg-list wg-panel">
          <div className="wg-flat-list">
            {flatRows.map((row) => renderSession(row, undefined, true))}
          </div>
          {flatRows.length === 0 ? <div className="wg-empty">{labels.empty}</div> : null}
          {notes}
        </div>
      ) : (
        /* 按工作区：工作区分组段 + 未归组工作区 + 末尾的「未分组」桶 */
        <div className="wg-list wg-panel">
          {/* 工作区分组段排在前面，未归组的工作区平铺在其后、不带区段头
              没有建过分组时 rootLayout.groups 为空、全部工作区都在 loose 里
              这一层因此不改变任何行的位置 */}
          {listLayout.groups.map((section) => (
            <VirtualWorkspaceSection
              key={section.id}
              section={section}
              collapsed={collapsedVirtualWorkspaces[section.id] === true}
              emptyLabel={labels.virtualWorkspaceEmpty}
              labels={{
                actions: labels.virtualWorkspaceActions,
                // 菜单项用通用动词，与工作区行、会话分组行同一分工
                // 只有对话框标题才点明对象（`renameVirtualWorkspace`，见下方 NameDialog）
                rename: labels.rename,
                delete: labels.deleteVirtualWorkspace,
              }}
              onToggle={() => toggleVirtualWorkspace(section.id)}
              onRename={() =>
                setVirtualWorkspaceDraft({ groupId: section.id, value: section.label })
              }
              onDelete={() =>
                setVirtualWorkspaceDelete({ groupId: section.id, label: section.label })
              }
            >
              {section.roots.map(renderWorkspace)}
            </VirtualWorkspaceSection>
          ))}
          {listLayout.loose.map(renderWorkspace)}
          {/* 未分组桶排在全部工作区之后，与官方一致
            * 空则整段不渲染
            * 聚焦时整段隐藏：这些会话不属于任何一个工作区，聚焦到某一片内容时与它们无关 */}
          {stray.length === 0 || focused ? null : (
            <section className="wg-workspace">
              <WorkspaceRow
                title={labels.ungrouped}
                collapsed={ungroupedCollapsed}
                folderActive={!ungroupedCollapsed && containsSession(stray, currentSessionId)}
                onToggle={() => toggleWorkspace(UNGROUPED_KEY)}
                labels={workspaceRowLabels}
              />
              <CollapsibleBody open={!ungroupedCollapsed}>
                <div className="wg-workspace-body">
                  {/* 这些会话不属于任何工作区，没有分组可归，因此菜单里只有官方三项（归组项无处落）
                    * 宿主未提供官方服务时菜单会是空的，那时直接渲染无菜单的行，不留点不动的省略号 */}
                  <div className="wg-sessions">
                    {stray.map((row) => {
                      // 状态只推导一次，行首那个点与卡片那几条取自同一份结果
                      const statuses = statusesOf(row)
                      const status = rowStatusDot(row, statuses)
                      const reveal =
                        row.id === revealSessionId ? () => acknowledgeReveal(row.id) : undefined
                      return official === undefined || row.blank ? (
                        <SessionRowView
                          key={row.id}
                          sessionId={row.id}
                          title={row.blank ? labels.newSession : row.title}
                          selected={row.id === currentSessionId}
                          status={status}
                          time={timeOf(row)}
                          statuses={statuses}
                          hoverTime={hoverTimeOf(row)}
                          hoverCopy={row.blank ? undefined : row.title}
                          hoverLabels={hoverLabels}
                          onOpenSession={openSession}
                          onReveal={reveal}
                        />
                      ) : (
                        <SessionRowMenu
                          key={row.id}
                          row={row}
                          title={row.title}
                          selected={row.id === currentSessionId}
                          status={status}
                          time={timeOf(row)}
                          statuses={statuses}
                          hoverTime={hoverTimeOf(row)}
                          hoverLabels={hoverLabels}
                          official={official}
                          onOpenSession={openSession}
                          actionsLabel={labels.sessionActions}
                          t={t}
                          onReveal={reveal}
                        />
                      )
                    })}
                  </div>
                </div>
              </CollapsibleBody>
            </section>
          )}
          {notes}
        </div>
      )}
      {/* 对话框挂在列表之外
        * 它们都是 portal 到 body 的浮层，放进 overflow
          容器只会多一层无用的裁剪上下文 */}
      {nameDraft === null ? null : (
        <NameDialog
          title={nameDraft.groupId === '' ? labels.newGroup : labels.renameGroup}
          value={nameDraft.value}
          placeholder={labels.groupNamePrompt}
          // 新建走通用词的「确定」，改名用官方 workspace 语言包的短动词，与官方改名对话框同词
          confirmLabel={nameDraft.groupId === '' ? t('ok') : official?.labels.rename ?? t('ok')}
          t={t}
          confirmDisabled={nameDraft.value.trim() === ''}
          onValueChange={(value) => setNameDraft({ ...nameDraft, value })}
          onConfirm={commitNameDraft}
          onClose={() => setNameDraft(null)}
        />
      )}
      {virtualWorkspaceDraft === null ? null : (
        <NameDialog
          title={
            virtualWorkspaceDraft.groupId === ''
              ? labels.newVirtualWorkspace
              : labels.renameVirtualWorkspace
          }
          value={virtualWorkspaceDraft.value}
          placeholder={labels.virtualWorkspaceNamePrompt}
          // 新建走通用词的「确定」，改名用官方 workspace 语言包的短动词，与官方改名对话框同词
          confirmLabel={
            virtualWorkspaceDraft.groupId === '' ? t('ok') : official?.labels.rename ?? t('ok')
          }
          t={t}
          confirmDisabled={virtualWorkspaceDraft.value.trim() === ''}
          // 「切换到新工作区」只在当前不是「显示全部工作区」时才给：
          // 已经看着全部内容时没有可切的目的地，勾了也无事可做。改名时不出现（它不新建东西）
          check={
            virtualWorkspaceDraft.groupId !== '' || !focused
              ? undefined
              : {
                  label: labels.picker.followFocus,
                  checked: virtualWorkspaceDraft.followFocus === true,
                  onChange: (followFocus) =>
                    setVirtualWorkspaceDraft({ ...virtualWorkspaceDraft, followFocus }),
                }
          }
          onValueChange={(value) => setVirtualWorkspaceDraft({ ...virtualWorkspaceDraft, value })}
          onConfirm={commitVirtualWorkspaceDraft}
          onClose={() => setVirtualWorkspaceDraft(null)}
        />
      )}
      {virtualWorkspaceDelete === null ? null : (
        <DeleteDialog
          title={labels.deleteVirtualWorkspace}
          description={labels.confirmDeleteVirtualWorkspace(virtualWorkspaceDelete.label)}
          confirmLabel={labels.deleteVirtualWorkspace}
          t={t}
          onConfirm={commitVirtualWorkspaceDelete}
          onClose={() => setVirtualWorkspaceDelete(null)}
        />
      )}
      {workspaceRename === null ? null : (
        <NameDialog
          title={labels.renameWorkspace}
          value={workspaceRename.value}
          placeholder={labels.workspaceNamePrompt}
          confirmLabel={official?.labels.rename ?? t('ok')}
          t={t}
          confirmDisabled={renameDisabled}
          error={renameConflict === undefined ? null : labels.workspaceConflict(renameConflict)}
          onValueChange={(value) => setWorkspaceRename({ ...workspaceRename, value })}
          onConfirm={commitWorkspaceRename}
          onClose={() => setWorkspaceRename(null)}
        />
      )}
      {groupDelete === null ? null : (
        <DeleteDialog
          title={labels.deleteGroup}
          description={labels.confirmDeleteGroup(groupDelete.label)}
          confirmLabel={labels.deleteGroup}
          t={t}
          onConfirm={commitGroupDelete}
          onClose={() => setGroupDelete(null)}
        />
      )}
      {workspaceDelete === null ? null : (
        <DeleteDialog
          title={labels.deleteWorkspace}
          description={labels.confirmDeleteWorkspace(workspaceDelete.label)}
          confirmLabel={labels.deleteWorkspace}
          t={t}
          onConfirm={commitWorkspaceDelete}
          onClose={() => setWorkspaceDelete(null)}
        />
      )}
      {nestedConfirmOpen ? (
        <ListDialog
          title={labels.nested.disableTitle}
          description={labels.nested.disableDesc}
          items={groupedChildLabels}
          confirmLabel={labels.nested.disable}
          danger
          t={t}
          onConfirm={commitNestedOff}
          onClose={() => setNestedConfirmOpen(false)}
        />
      ) : null}
      {mergeDraft === null ? null : (
        <ListDialog
          title={labels.nested.addTitle}
          description={labels.nested.addDesc(
            mergeDraft.childLabel,
            mergeDraft.parentLabel,
            mergeDraft.groupLabel,
          )}
          items={mergeDraft.workspaceIds.map((id) => workspaceById.get(id)?.title ?? id)}
          confirmLabel={labels.nested.mergeConfirm}
          alt={{ label: labels.nested.mergeSkip, onSelect: () => commitMerge(false) }}
          t={t}
          onConfirm={() => commitMerge(true)}
          onClose={() => commitMerge(false)}
        />
      )}
    </div>
  )
}
