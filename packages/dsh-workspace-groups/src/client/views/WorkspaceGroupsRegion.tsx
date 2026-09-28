/**
 * 侧边栏的工作区浏览区域
 *
 * 这是 `sidebar.workspaces` 的接替者，该插槽是 single 类型，本包以 `priority: -1` 注册从而成为渲染者
 * 官方 ui-workspace 的同名注册仍留在注册表中但不再渲染
 *
 * 本模块负责状态与编排：折叠态、全部浮层草稿，以及把快照切成每个工作区的布局
 * 行的外观与菜单分别由 views/ 下的组件负责
 *
 * 只有用户创建的分组才有分组头，未归组的会话直接平铺在工作区下，与原生会话列表一致
 * 折叠状态按「工作区」与「工作区+分组」分别记录，因此不同工作区、不同分组之间互不影响
 *
 * 不属于任何工作区的会话（例如工作区被删除后遗留的会话）收进末尾一个隐式的「未分组」区段
 * 那是工作区一级的容器，与本包在工作区内刻意不造「未分组分组」的取舍无关
 *
 * 这一层按「数据源 / 派生 / 交互状态 / 命令 / 渲染」分段，段间有分节标记
 * 八个 hook 的消费方只有本文件的 `WorkspaceGroupsRegion`，因此与容器同处一个文件；
 * 三块渲染区各是 views/ 下的一个模块，只声明自己真正消费的那几格形状
 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, RefObject } from 'react'
import { EMPTY_PICKER_STATE } from '../../pickerState.ts'
import type { AddWorkspaceActions, OfficialSessionActions, RegionActions, RegionDataHooks } from '../actions.ts'
import { buildRootLayout, virtualWorkspaceIdOf } from '../data/layout.ts'
import { descendantsOf, deriveNesting, nearestAncestorForPath } from '../data/nest.ts'
import type { Nesting } from '../data/nest.ts'
import { focusedLayout, focusedWorkspaceIds, pickerSections, resolveFocus, rootPickerEntries } from '../data/picker.ts'
import type { PickerEntry } from '../data/picker.ts'
import { searchSessions } from '../data/search.ts'
import type { SearchMatch, SessionSearchResult } from '../data/search.ts'
import {
  compareSessionRows,
  flatRowsInFocus,
  flatSessionRows,
  groupSessionsByWorkspace,
  mainSessionId,
  straySessions,
} from '../data/sessions.ts'
import type { RootLayout, SessionRow } from '../data/types.ts'
import type { HostInfo } from '../hostInfo.ts'
import { regionLabels } from '../labels.ts'
import type { RegionLabels } from '../labels.ts'
import type { RegionTranslate } from '../locales.ts'
import { PARENT_GROUP_ITEM, VIRTUAL_WORKSPACE_ITEM, VIRTUAL_WORKSPACE_PREFIX, parseParentGroupId } from '../menus.tsx'
import { normalizeSnapshot } from '../remote.ts'
import type { WorkspaceGroupsSnapshot } from '../remote.ts'
import { rootVirtualKey } from '../../rootEntry.ts'
import { useFlipMarker } from '../useFlipMarker.ts'
import { indicatorOf, modeOf } from '../store/viewMode.ts'
import type { ViewModeStoreHandle } from '../store/viewMode.ts'
import { RegionLocaleProvider } from '../useLocale.ts'
import { LocalViewOptionsProvider } from '../useLocalViewOptions.ts'
import type { LocalViewOptions } from '../useLocalViewOptions.ts'
import type { RegionLocale } from '../useLocale.ts'
import { RegionDialogs } from './RegionDialogs.tsx'
import type { MergeDraft, RegionDialogActions, RegionOverlay } from './RegionDialogs.tsx'
import { RegionHeaderArea, RegionRailHeader } from './RegionHeaderArea.tsx'
import type { RegionHeaderCommands, RegionHeaderOverlays } from './RegionHeaderArea.tsx'
import { RegionListArea } from './RegionListArea.tsx'
import type {
  RegionListCommands,
  RegionListEdits,
  SessionRowScope,
  WorkspaceNodeScope,
} from './RegionListArea.tsx'
import { useSearch } from './SearchControl.tsx'
import type { SearchState } from './SearchControl.tsx'
import { WorkspaceRail } from './WorkspaceRail.tsx'
import styles from './WorkspaceGroupsRegion.module.css'

// ── 本文件的形状 ──

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

/** 全局快照与宿主数据 hook 的读数，只随快照与座位变化 */
interface RegionSources {
  labels: RegionLabels
  workspaces: readonly WorkspaceView[]
  archivedSessionIds: readonly string[]
  sessions: SessionListState
  statusSnapshot: SessionStatusSnapshot
  home: string | undefined
  /** 官方三项会话操作与相对时间，官方服务不在场时缺省 */
  official: OfficialSessionActions | undefined
  /** directoryFlow 洞是否被占用，决定「添加工作区」入口是否出现 */
  flowOccupied: boolean
}

/** 分组快照与它的读写路径 */
interface SnapshotFeed {
  snapshot: WorkspaceGroupsSnapshot
  setSnapshot: (next: WorkspaceGroupsSnapshot) => void
  /** 重拉一次快照 */
  reload: () => () => void
  /** 执行一次「宿主回整份快照」的改动 */
  apply: (action: Promise<WorkspaceGroupsSnapshot>) => void
}

/** 工作区与根节点的派生布局 */
interface RegionLayout {
  workspaceIds: string[]
  workspaceById: ReadonlyMap<string, WorkspaceView>
  /** 取一个工作区的 cwd，缺省表示它没有可用路径，那个工作区因此不会被嵌套 */
  pathOfWorkspace: (workspaceId: string) => string | undefined
  /** workspaceId → 它所属的虚拟工作区分组 id，空串表示不在任何虚拟工作区里 */
  virtualOfWorkspace: (workspaceId: string) => string
  nesting: Nesting
  rootLayout: RootLayout
  pickerEntries: PickerEntry[]
  picker: ReturnType<typeof pickerSections>
  resolvedFocus: PickerEntry | undefined
  /** 第二行显示的文案，没有聚焦时是「全部工作区」 */
  currentFocus: string
  /** 聚焦生效后的根节点布局 */
  listLayout: RootLayout
  /** 真的聚焦在某一片内容上时，「未分组」区段整段隐藏 */
  focused: boolean
  /** 当前被放进某个分组的子工作区，按列表里的顺序 */
  groupedChildIds: readonly string[]
  /** 上面那批的显示名，工作区已被删掉时退回 id，名单因此不会出现空行 */
  groupedChildLabels: readonly string[]
}

/**
 * 区域内的全部交互状态
 *
 * 八个互斥浮层收在一个 `overlay` 槽里，任意时刻至多开一个由类型保证
 * 三个折叠态各记一份，键的构成也各自独立，因此两层开合互不影响
 * 这一层不做任何决策，只交出状态与它们的读写入口
 */
interface RegionUiState {
  overlay: RegionOverlay | null
  /** 打开一个浮层，或置空收起；同一时刻只有这一格 */
  openOverlay: (overlay: RegionOverlay | null) => void
  /** 下拉菜单的开合，菜单面板与触发器分处两个组件，状态因此留在这一层 */
  pickerOpen: boolean
  setPickerOpen: (next: boolean | ((open: boolean) => boolean)) => void
  pickerTrigger: RefObject<HTMLButtonElement>
  /** 视图选项面板的开合与触发器，与下拉菜单同一套分工 */
  viewOptionsOpen: boolean
  setViewOptionsOpen: (next: boolean | ((open: boolean) => boolean)) => void
  viewOptionsTrigger: RefObject<HTMLButtonElement>
  expandedWorkspaces: Record<string, boolean>
  setExpandedWorkspaces: (next: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  expandedGroups: Record<string, boolean>
  setExpandedGroups: (next: (prev: Record<string, boolean>) => Record<string, boolean>) => void
  expandedVirtualWorkspaces: Record<string, boolean>
  setExpandedVirtualWorkspaces: (
    next: (prev: Record<string, boolean>) => Record<string, boolean>,
  ) => void
  /** 从搜索结果打开、等待滚进可视区的那一行，滚动完成后由行自己回报清除 */
  revealSessionId: string | undefined
  setRevealSessionId: (next: string | undefined | ((current: string | undefined) => string | undefined)) => void
  /** 折叠状态取反，默认展开，因此只有显式 false 才算折叠 */
  toggleWorkspace: (key: string) => void
  toggleGroup: (key: string) => void
  toggleVirtualWorkspace: (key: string) => void
  /** 被打开的那一行滚进可视区后清掉标记，避免它在后续重新挂载时再滚一次 */
  acknowledgeReveal: (sessionId: string) => void
}

/** 工作区新增的跟随追问与搜索结果页 */
interface RegionSearchActions {
  /** 解析出来的「添加工作区」入口，未被占用时缺省 */
  addWorkspace: AddWorkspaceActions | undefined
  /** 本次搜索的结果页 */
  searchResult: SessionSearchResult
  /** 从搜索结果打开一条会话，先把它的两层折叠展开并清掉查询 */
  openSearchResult: (match: SearchMatch) => void
}

/** 未分组桶在工作区状态表里占用的键，它没有真实的 workspaceId */
const UNGROUPED_KEY = ''

/** 平铺列表不渲染时交出的空行集，恒定同一份引用，避免每次渲染换新数组 */
const EMPTY_ROWS: readonly SessionRow[] = []

// ── 数据源 ──

/**
 * 读取全部全局数据源
 *
 * 四个 hook 都走 shell 注入的全局选择器，因此这一层不依赖 `ctx`
 * 文案表按三个翻译座位缓存：它每次渲染都是新对象，里面的函数会直接传给行组件
 * 缓存的是投影结果而不是译文——三个 `t` 都在调用时才读当前语言，因此语言切换后重新调用拿到的仍是新译文
 */
function useRegionSources(props: WorkspaceGroupsProps): RegionSources {
  const {
    t,
    tWorkspace,
    tSidebar,
    useWorkspaces,
    useSessions,
    useSessionStatus,
    useDirectoryFlow,
    useHostInfo,
  } = props

  const labels = useMemo(() => regionLabels(t, tWorkspace, tSidebar), [t, tWorkspace, tSidebar])

  const workspaces = useWorkspaces((state) => state.items) as readonly WorkspaceView[]
  // 归档集是注册表全局的，归档会话仍留在工作区的 sessionIds 里，必须显式过滤，否则已归档的会话会继续出现在列表里
  const archivedSessionIds = useWorkspaces((state) => state.archivedSessionIds) as readonly string[]
  const sessions = useSessions((state) => state) as SessionListState
  // 待交互 / 运行 / 完成提醒是同一个事实源的三个字段，等待审批时会话可能并不在 running，因此必须单独读，不能从会话摘要里推
  const statusSnapshot = useSessionStatus((state) => state) as SessionStatusSnapshot
  const flowOccupied = useDirectoryFlow((occupied) => occupied) as boolean
  // 宿主 home 用于把工作区目录缩写成 `~`。走全局标准 hook 而不是 inject
  // 渲染器会缓存注册项的 inject 结果整个注册周期，在 inject 里读会冻结在首次渲染那一刻
  const home = useHostInfo((info: HostInfo) => info.home) as string | undefined

  // 官方动作与文案的解析时机放在渲染期，渲染器会缓存注册项的 inject 结果
  // 在 inject 里读服务会冻结在首次渲染那一刻，而官方 ui-workspace 的加载顺序不受本包约束
  const official = props.official?.()

  return {
    labels,
    workspaces,
    archivedSessionIds,
    sessions,
    statusSnapshot,
    home,
    official,
    flowOccupied,
  }
}

/**
 * 把 store 座位投影成视图选项偏好
 *
 * 读走选择器 hook、写走 actions，与官方 ui-workspace 的 groupBy 同一套
 * 两个字段是「加过的」可选格：持久化引擎读盘时整份替换状态，早于该字段写入的那份 JSON 里没有它
 * 引擎不给合并钩子，因此一律经 {@link modeOf} / {@link indicatorOf} 归一，不直接读字段
 * @param props - 区域 props，只用它的 store 座位两格
 * @returns 当前值与两个写入口
 */
function useLocalViewOptionsValue(props: WorkspaceGroupsProps): LocalViewOptions {
  const { useStore, actions } = props
  const mode = modeOf(useStore((state) => state))
  const indicator = indicatorOf(useStore((state) => state))
  const setMode = actions.setMode
  const setIndicator = actions.setIndicator
  // value 身份要稳定：它经 context 交给每一行，每次渲染新建会让行级 memo 全部失效
  return useMemo(
    () => ({ mode, indicator, setMode, setIndicator }),
    [mode, indicator, setMode, setIndicator],
  )
}

// ── 快照 ──

/**
 * 分组快照的加载与改动
 *
 * 宿主每个变更方法都回整份快照（见宿主 `service.ts`），直接采用它就不必再拉一次
 * 失败要留下痕迹：分组元数据的写入不可见，一次静默失败只会表现为「什么都没发生」
 * 界面与元数据的偏差却一直留着。失败时退回重拉一次，让本地状态与宿主对齐
 */
function useSnapshotFeed(
  loadGroups: RegionActions['loadGroups'],
  onReady: RegionActions['onReady'],
): SnapshotFeed {
  const [snapshot, setSnapshot] = useState<WorkspaceGroupsSnapshot>({
    byWorkspace: {},
    nesting: {},
    workspaceGroups: [],
    picker: EMPTY_PICKER_STATE,
    nested: true,
  })

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

  return { snapshot, setSnapshot, reload, apply }
}

// ── 派生布局 ──

/**
 * 把工作区快照与分组元数据切成渲染布局
 *
 * 工作区 id 按宿主顺序排（`workspaces` 本身就是那个顺序），因此没有建过工作区分组时 `loose` 就是全部工作区
 * 这一层不改变任何行的位置——界面与没有这个功能时完全一致
 * 子工作区的父子关系不落盘，每次都从 cwd 现推，落盘的归属只决定「渲染在哪个分组里」
 */
function useRegionLayout(
  workspaces: readonly WorkspaceView[],
  snapshot: WorkspaceGroupsSnapshot,
  labels: RegionLabels,
): RegionLayout {
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
  const focused = resolvedFocus !== undefined

  /**
   * 当前被放进某个分组的子工作区，按列表里的顺序
   *
   * 关掉嵌套时它就是会被解除嵌套的那批，因此确认框的名单与提示都从这一份来
   */
  const groupedChildIds = useMemo(
    () => workspaceIds.filter((id) => nesting.bindingOf(id) !== undefined),
    [nesting, workspaceIds],
  )
  const groupedChildLabels = useMemo(
    () => groupedChildIds.map((id) => workspaceById.get(id)?.title ?? id),
    [groupedChildIds, workspaceById],
  )

  return {
    workspaceIds,
    workspaceById,
    pathOfWorkspace,
    virtualOfWorkspace,
    nesting,
    rootLayout,
    pickerEntries,
    picker,
    resolvedFocus,
    currentFocus,
    listLayout,
    focused,
    groupedChildIds,
    groupedChildLabels,
  }
}

// ── 交互状态 ──

function useRegionUiState(): RegionUiState {
  const [overlay, openOverlay] = useState<RegionOverlay | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerTrigger = useRef<HTMLButtonElement>(null)
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false)
  const viewOptionsTrigger = useRef<HTMLButtonElement>(null)
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [expandedVirtualWorkspaces, setExpandedVirtualWorkspaces] = useState<
    Record<string, boolean>
  >({})
  const [revealSessionId, setRevealSessionId] = useState<string | undefined>(undefined)

  const toggleWorkspace = useCallback((key: string) => {
    setExpandedWorkspaces((prev) => ({ ...prev, [key]: prev[key] === false }))
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: prev[key] === false }))
  }, [])

  const toggleVirtualWorkspace = useCallback((key: string) => {
    setExpandedVirtualWorkspaces((prev) => ({ ...prev, [key]: prev[key] === false }))
  }, [])

  const acknowledgeReveal = useCallback((sessionId: string) => {
    setRevealSessionId((current) => (current === sessionId ? undefined : current))
  }, [])

  return {
    overlay,
    openOverlay,
    pickerOpen,
    setPickerOpen,
    pickerTrigger,
    viewOptionsOpen,
    setViewOptionsOpen,
    viewOptionsTrigger,
    expandedWorkspaces,
    setExpandedWorkspaces,
    expandedGroups,
    setExpandedGroups,
    expandedVirtualWorkspaces,
    setExpandedVirtualWorkspaces,
    revealSessionId,
    setRevealSessionId,
    toggleWorkspace,
    toggleGroup,
    toggleVirtualWorkspace,
    acknowledgeReveal,
  }
}

// ── 命令：搜索与新增工作区 ──

/**
 * 搜索结果页与「添加工作区」入口
 *
 * 这一层把两件事凑齐：结果页按快照缓存，采纳回调要读整片列表的层级关系
 * 两者都随工作区与分组快照变化，因此与区域其余部分共用同一份读数
 */
function useRegionSearch(
  props: WorkspaceGroupsProps,
  sources: RegionSources,
  layout: RegionLayout,
  snapshot: WorkspaceGroupsSnapshot,
  ui: RegionUiState,
  search: SearchState,
): RegionSearchActions {
  const { sessions, workspaces, archivedSessionIds, statusSnapshot } = sources
  const { searchResultLimit, openSession } = props

  /**
   * 新增工作区采纳成功后，按层级关系判断要不要问一句「放进父所在的分组」
   *
   * 新工作区此刻还没进列表，因此这里按路径找它最短的直接父工作区，而不是按 id
   * 父不存在、或父自己没在任何一个分组里时不问，默认的嵌套渲染已经把它放在父下面了，放进分组不是必需的
   */
  const onWorkspaceAdopted = useCallback(
    (workspaceId: string, path: string): void => {
      if (!snapshot.nested) return
      const parentId = nearestAncestorForPath(
        layout.workspaceIds,
        layout.pathOfWorkspace,
        layout.virtualOfWorkspace,
        path,
        layout.virtualOfWorkspace(workspaceId),
      )
      if (parentId === undefined) return
      const parent = layout.workspaceById.get(parentId)
      const directGroups = snapshot.byWorkspace[parentId] ?? []
      // 只在父恰好有一个分组时替用户选定它，有多个时该选哪个不是这里能替用户定的
      if (directGroups.length !== 1) return
      const group = directGroups[0]
      if (group === undefined) return
      const draft: MergeDraft = {
        parentId,
        groupId: group.id,
        parentLabel: parent?.title ?? parentId,
        groupLabel: group.name,
        childLabel: layout.workspaceById.get(workspaceId)?.title ?? workspaceId,
        workspaceIds: [workspaceId],
      }
      ui.openOverlay({ kind: 'merge', ...draft })
    },
    [snapshot.nested, snapshot.byWorkspace, layout.workspaceIds, layout.workspaceById],
  )

  // 「添加工作区」延迟到渲染期解析，它要读官方 directoryFlow 洞的占用者
  // 而目录选择器插件的加载顺序不受本包约束，订阅占用情况让入口跟着占用者出现
  const addWorkspace = sources.flowOccupied
    ? props.addWorkspace?.(onWorkspaceAdopted)
    : undefined

  /**
   * 本次搜索的结果页。计算是纯的且输入都来自快照，因此跟着这些输入走 memo：
   * 流式期间每次活动都会重渲染整片区域，不缓存就要在每次活动重扫一遍全部会话
   */
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
      ui.setExpandedWorkspaces((prev) =>
        prev[UNGROUPED_KEY] === false ? { ...prev, [UNGROUPED_KEY]: true } : prev,
      )
    } else {
      // 工作区本身可能还躺在一个收起的工作区分组里，与外层两层一样要先展开，否则揭示的那一行落在看不见的地方
      const rootGroupId = virtualWorkspaceIdOf(layout.rootLayout.groups, workspaceId)
      if (rootGroupId !== '') {
        ui.setExpandedVirtualWorkspaces((prev) =>
          prev[rootGroupId] === false ? { ...prev, [rootGroupId]: true } : prev,
        )
      }
      // 工作区自己可能是嵌在父工作区体内的子工作区，从根节点那一层起逐层展开它所有的祖先
      // 只展开它自己会让那一行落在收起的父撑开体里，用户看不到它
      const lineage = [workspaceId, ...layout.nesting.ancestorsOf(workspaceId)]
      ui.setExpandedWorkspaces((prev) => {
        let next = prev
        for (const id of lineage) {
          if (next[id] !== false) continue
          next = { ...next, [id]: true }
        }
        return next
      })
      if (match.group !== undefined) {
        const key = `${workspaceId}:${match.group.id}`
        ui.setExpandedGroups((prev) => (prev[key] === false ? { ...prev, [key]: true } : prev))
      }
    }
    ui.setRevealSessionId(match.row.id)
    search.clear()
    openSession(match.row.id)
  }

  return { addWorkspace, searchResult, openSearchResult }
}

// ── 命令：建删改 ──

/** 分组与工作区的建删改，以及新会话的落位与归组 */
interface RegionGroupActions {
  commitGroupNameDraft: () => void
  commitGroupDelete: () => void
  commitVirtualWorkspaceNameDraft: () => void
  commitVirtualWorkspaceDelete: () => void
  commitWorkspaceRename: () => void
  commitWorkspaceDelete: () => void
  createSessionIn: (workspaceId: string, groupId: string) => void
  selectSessionGroup: (workspaceId: string, sessionId: string, id: string) => void
}

/**
 * 分组与工作区的建删改
 *
 * 每个提交函数都从草稿状态里取值，写盘前先收起对话框，再让宿主回的整份快照接管界面
 * 工作区改名是唯一的例外：它走官方控制器，回的是工作区视图，因此不进 `apply`
 */
function useRegionGroupActions(
  props: WorkspaceGroupsProps,
  snapshot: WorkspaceGroupsSnapshot,
  ui: RegionUiState,
  apply: (action: Promise<WorkspaceGroupsSnapshot>) => void,
): RegionGroupActions {
  const { createGroup, renameGroup, deleteGroup, moveSession, moveWorkspace, createVirtualWorkspace,
    renameVirtualWorkspace, deleteVirtualWorkspace, forgetWorkspace, renameWorkspace,
    deleteWorkspace, focusEntry, startSession } = props

  /** 提交建组或改名，空名与取消都不写 */
  const commitGroupNameDraft = (): void => {
    const draft = ui.overlay
    if (draft?.kind !== 'group-name') return
    const name = draft.value.trim()
    if (name === '') return
    ui.openOverlay(null)
    apply(
      draft.groupId === ''
        ? createGroup(draft.workspaceId, name)
        : renameGroup(draft.workspaceId, draft.groupId, name),
    )
  }

  const commitGroupDelete = (): void => {
    const draft = ui.overlay
    if (draft?.kind !== 'group-delete') return
    ui.openOverlay(null)
    apply(deleteGroup(draft.workspaceId, draft.groupId))
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
  const commitVirtualWorkspaceNameDraft = (): void => {
    const draft = ui.overlay
    if (draft?.kind !== 'virtual-workspace-name') return
    const name = draft.value.trim()
    if (name === '') return
    const { groupId, workspaceId } = draft
    const follow = draft.followFocus === true
    ui.openOverlay(null)
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
    const draft = ui.overlay
    if (draft?.kind !== 'virtual-workspace-delete') return
    ui.openOverlay(null)
    apply(deleteVirtualWorkspace(draft.groupId))
  }

  const commitWorkspaceRename = (): void => {
    const draft = ui.overlay
    if (draft?.kind !== 'workspace-rename') return
    const name = draft.value.trim()
    if (name === '') return
    ui.openOverlay(null)
    // 不经过 `apply`，改名不动分组元数据，官方控制器返回的是工作区视图而不是分组快照
    // `apply` 因此只收「回整份快照」的改动。失败仍要留下痕迹
    void renameWorkspace(draft.workspaceId, name).catch((reason: unknown) => {
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
    const draft = ui.overlay
    if (draft?.kind !== 'workspace-delete') return
    const { workspaceId } = draft
    ui.openOverlay(null)
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
    ui.setExpandedWorkspaces((prev) => ({ ...prev, [workspaceId]: true }))
    // 展开而不是取反，分组本就展开时，切换会把它收起来，新会话反而看不见
    if (groupId !== '') {
      ui.setExpandedGroups((prev) => ({ ...prev, [`${workspaceId}:${groupId}`]: true }))
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

  return {
    commitGroupNameDraft,
    commitGroupDelete,
    commitVirtualWorkspaceNameDraft,
    commitVirtualWorkspaceDelete,
    commitWorkspaceRename,
    commitWorkspaceDelete,
    createSessionIn,
    selectSessionGroup,
  }
}

// ── 命令：归组与嵌套 ──

/** 工作区分组的移动与嵌套开关 */
interface RegionNestActions {
  startVirtualWorkspaceCreate: () => void
  selectVirtualWorkspace: (workspaceId: string, id: string) => void
  selectParentGroup: (workspaceId: string, id: string) => void
  requestNestedToggle: () => void
  commitNestedOff: () => void
  commitMerge: (merge: boolean) => void
}

/**
 * 工作区归组与子工作区嵌套
 *
 * 三者改的都是同一份落盘归属：工作区放进哪个工作区分组、放进哪个祖先的会话分组、整块开关
 * 因此共用一份布局读数，写入一律经 `apply` 收宿主回的整份快照
 */
function useRegionNestActions(
  props: WorkspaceGroupsProps,
  snapshot: WorkspaceGroupsSnapshot,
  layout: RegionLayout,
  ui: RegionUiState,
  apply: (action: Promise<WorkspaceGroupsSnapshot>) => void,
): RegionNestActions {
  const { moveWorkspace, nestWorkspaces, unnestWorkspaces, setNested } = props

  /**
   * header 入口：新建一个工作区分组
   *
   * 入口在区域顶部、与具体工作区无关，因此建出的是空分组（新分组会渲染在列表最前，用户随即能往里移工作区）
   * 工作区行菜单里那个同名项则把「建组 + 移入当前工作区」压成一步，两者是同一动作的两种入口，不是两套实现
   *
   * 是 `useCallback` 而不是每次渲染新建，它随 inject 结果传给 header，每渲染新建一份会让 header 每帧都判定为变过
   */
  const startVirtualWorkspaceCreate = useCallback(() => {
    ui.openOverlay({ kind: 'virtual-workspace-name', groupId: '', value: '' })
  }, [ui.openOverlay])

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
        ui.openOverlay({ kind: 'virtual-workspace-name', groupId: '', workspaceId, value: '' })
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
    [apply, moveWorkspace, ui.openOverlay],
  )

  /**
   * 取一个工作区名下「已经放进某个分组」的后代
   *
   * 未放进任何分组的后代由路径推导自动跟随父的位置，因此不需要改写归属
   * 已经放进某个分组的要跟着父一起换组，否则它们会在分组边界上脱离父的层级
   */
  const groupedDescendantsOf = (workspaceId: string): string[] =>
    descendantsOf(
      layout.workspaceIds,
      layout.pathOfWorkspace,
      layout.virtualOfWorkspace,
      workspaceId,
    ).filter((candidate) => layout.nesting.bindingOf(candidate) !== undefined)

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
    [apply, nestWorkspaces, layout.workspaceIds, layout.pathOfWorkspace, layout.virtualOfWorkspace, layout.nesting],
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
    ui.openOverlay({ kind: 'nested-off' })
  }

  /** 关闭嵌套，宿主会把全部落盘的归属一并清空，因此这里只需把开关写下去 */
  const commitNestedOff = (): void => {
    ui.openOverlay(null)
    apply(setNested(false))
  }

  /**
   * 提交一次「放进父所在的分组」
   *
   * 选「放进去」时写这次归属，选「不放进去」时什么都不做——新工作区仍按路径推导渲染在父下面
   * @param merge - 为真表示把新工作区放进那个分组
   */
  const commitMerge = (merge: boolean): void => {
    const draft = ui.overlay
    if (draft?.kind !== 'merge') return
    ui.openOverlay(null)
    if (!merge) return
    apply(nestWorkspaces(draft.workspaceIds, draft.parentId, draft.groupId))
  }

  return {
    startVirtualWorkspaceCreate,
    selectVirtualWorkspace,
    selectParentGroup,
    requestNestedToggle,
    commitNestedOff,
    commitMerge,
  }
}

// ── 命令：选择器面板 ──

/** 选择器面板的选中、置顶与行尾两项操作 */
interface RegionPickerActions {
  selectFocus: (key: string) => void
  selectPinned: (key: string) => void
  renamePickerEntry: (entry: PickerEntry) => void
  deletePickerEntry: (entry: PickerEntry) => void
}

/**
 * 选择器面板上的四项操作
 *
 * 聚焦要落盘并收起面板
 * 置顶保持面板打开（用户多半还有下一项要置顶），改名与删除把面板收起，交回既有的对话框
 */
function useRegionPickerActions(
  props: WorkspaceGroupsProps,
  snapshot: WorkspaceGroupsSnapshot,
  ui: RegionUiState,
  apply: (action: Promise<WorkspaceGroupsSnapshot>) => void,
): RegionPickerActions {
  const { focusEntry, togglePinned } = props

  /**
   * 菜单选中一个条目，聚焦它
   *
   * 聚焦要落盘（它是最近使用的记录源），因此走 `apply` 收宿主回的整份快照
   * 菜单随即收起——它的作用就是把用户送到那一片内容上，留着只会挡住刚聚焦的列表
   */
  const selectFocus = (key: string): void => {
    ui.setPickerOpen(false)
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
    ui.setPickerOpen(false)
    if (entry.kind === 'virtual') {
      ui.openOverlay({
        kind: 'virtual-workspace-name',
        groupId: entry.id,
        value: entry.label,
      })
      return
    }
    ui.openOverlay({ kind: 'workspace-rename', workspaceId: entry.id, value: entry.label })
  }

  /**
   * 菜单某一行「删除」：与行内 `...` 菜单走同一个确认框
   *
   * 确认框的对象按条目类别取，删除动作本身仍是既有的那两个提交函数，因此两条入口下「删掉什么」的语义不会漂移
   */
  const deletePickerEntry = (entry: PickerEntry): void => {
    ui.setPickerOpen(false)
    if (entry.kind === 'virtual') {
      ui.openOverlay({ kind: 'virtual-workspace-delete', groupId: entry.id, label: entry.label })
      return
    }
    ui.openOverlay({ kind: 'workspace-delete', workspaceId: entry.id, label: entry.label })
  }

  return { selectFocus, selectPinned, renamePickerEntry, deletePickerEntry }
}

// ── 容器 ──

export function WorkspaceGroupsRegion(props: WorkspaceGroupsProps): ReactElement | null {
  const { wide, expandSidebar, openSession, searchResultLimit, t } = props

  const sources = useRegionSources(props)
  const { labels, workspaces, archivedSessionIds,
    sessions, statusSnapshot, home, official } = sources
  const localViewOptions = useLocalViewOptionsValue(props)
  const { mode: viewMode, indicator } = localViewOptions
  const { snapshot, apply } = useSnapshotFeed(props.loadGroups, props.onReady)
  const layout = useRegionLayout(workspaces, snapshot, labels)
  const ui = useRegionUiState()

  // 搜索状态留在这里而不是 header 内部，窄栏入口要触发宽栏输入框的聚焦
  // 这一跨形态的联动需要一个共同宿主
  const search = useSearch(wide, expandSidebar)
  const currentSessionId = mainSessionId(sessions)

  // 行尾相对时间的基准时刻。官方在渲染时直接取 Date.now()（没有任何 ticker）
  // 这里取同一做法：时间文案的精度是分钟级，跟着别的重渲染刷新足够
  const now = Date.now()

  const { addWorkspace, searchResult, openSearchResult } = useRegionSearch(
    props, sources, layout, snapshot, ui, search,
  )
  const groupActions = useRegionGroupActions(props, snapshot, ui, apply)
  const nestActions = useRegionNestActions(props, snapshot, layout, ui, apply)
  const pickerActions = useRegionPickerActions(props, snapshot, ui, apply)

  // 量出区域右缘到窗口右缘的距离，据此决定悬停卡片是否要翻向左侧——
  // 对照模式下区域挂右侧栏、贴着窗口右缘，官方卡片固定向右展开会开到屏幕外
  const flipRef = useFlipMarker()

  // 文案表与翻译函数合成一个稳定的 value：行级 memo 按引用比对 props，每次渲染新建会让每一行都判定为变过
  const locale: RegionLocale = useMemo(() => ({ t, labels }), [t, labels])

  // 窄栏，官方在这里也只留搜索与「添加工作区」两个入口（外加 shell 的展开入口）
  if (!wide) {
    return (
      <RegionLocaleProvider value={locale}>
        <RegionRailHeader
          addWorkspace={addWorkspace}
          search={search}
          newVirtualWorkspace={{ onCreate: nestActions.startVirtualWorkspaceCreate }}
        />
        <WorkspaceRail label={labels.title} onExpand={expandSidebar} />
      </RegionLocaleProvider>
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
  const searching = search.normalized !== ''

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
          focusedWorkspaceIds(layout.rootLayout, layout.pickerEntries, snapshot.picker.focused),
        ).sort(compareSessionRows)

  const session: SessionRowScope = {
    currentSessionId,
    official,
    statusSnapshot,
    now,
    revealSessionId: ui.revealSessionId,
    acknowledgeReveal: ui.acknowledgeReveal,
    openSession,
  }

  // 列表侧收的是「编辑哪个对象」，浮层的形状因此不出这一层
  const edits: RegionListEdits = {
    onNewGroup: (workspaceId) =>
      ui.openOverlay({ kind: 'group-name', workspaceId, groupId: '', value: '' }),
    onRenameWorkspace: (workspaceId, title) =>
      ui.openOverlay({ kind: 'workspace-rename', workspaceId, value: title }),
    onDeleteWorkspace: (workspaceId, label) =>
      ui.openOverlay({ kind: 'workspace-delete', workspaceId, label }),
    onRenameGroup: (workspaceId, groupId, label) =>
      ui.openOverlay({ kind: 'group-name', workspaceId, groupId, value: label }),
    onDeleteGroup: (workspaceId, groupId, label) =>
      ui.openOverlay({ kind: 'group-delete', workspaceId, groupId, label }),
    onRenameVirtualWorkspace: (groupId, label) =>
      ui.openOverlay({ kind: 'virtual-workspace-name', groupId, value: label }),
    onDeleteVirtualWorkspace: (groupId, label) =>
      ui.openOverlay({ kind: 'virtual-workspace-delete', groupId, label }),
  }

  const commands: RegionListCommands = {
    selectSessionGroup: groupActions.selectSessionGroup,
    selectVirtualWorkspace: nestActions.selectVirtualWorkspace,
    selectParentGroup: nestActions.selectParentGroup,
    createSessionIn: groupActions.createSessionIn,
  }

  // 递归层需要的布局与交互状态是整份 `layout` / `ui` 的子集，靠结构类型直接交给它们
  const scope: WorkspaceNodeScope = {
    snapshot,
    layout,
    ui,
    edits,
    commands,
    rowsByWorkspace,
    currentSessionId,
    home,
    session,
  }

  const headerOverlays: RegionHeaderOverlays = {
    picker: {
      open: ui.pickerOpen,
      triggerRef: ui.pickerTrigger,
      onToggle: () => ui.setPickerOpen((open) => !open),
      onClose: () => ui.setPickerOpen(false),
    },
    viewOptions: {
      open: ui.viewOptionsOpen,
      triggerRef: ui.viewOptionsTrigger,
      onToggle: () => ui.setViewOptionsOpen((open) => !open),
      onClose: () => ui.setViewOptionsOpen(false),
    },
  }

  const headerCommands: RegionHeaderCommands = {
    onSelectFocus: pickerActions.selectFocus,
    onTogglePinned: pickerActions.selectPinned,
    onRenameEntry: pickerActions.renamePickerEntry,
    onDeleteEntry: pickerActions.deletePickerEntry,
    startVirtualWorkspaceCreate: nestActions.startVirtualWorkspaceCreate,
  }

  const dialogActions: RegionDialogActions = {
    commitGroupNameDraft: groupActions.commitGroupNameDraft,
    commitGroupDelete: groupActions.commitGroupDelete,
    commitVirtualWorkspaceNameDraft: groupActions.commitVirtualWorkspaceNameDraft,
    commitVirtualWorkspaceDelete: groupActions.commitVirtualWorkspaceDelete,
    commitWorkspaceRename: groupActions.commitWorkspaceRename,
    commitWorkspaceDelete: groupActions.commitWorkspaceDelete,
    commitNestedOff: nestActions.commitNestedOff,
    commitMerge: nestActions.commitMerge,
  }

  return (
    <RegionLocaleProvider value={locale}>
      <LocalViewOptionsProvider value={localViewOptions}>
        {/* 指示器样式挂在根节点上，列表里每一行读同一个值，不必逐行下发 */}
        <div className={styles.root} ref={flipRef} data-wg-indicator={indicator}>
          <RegionHeaderArea
            layout={layout}
            overlays={headerOverlays}
            commands={headerCommands}
            searching={searching}
            nestingEnabled={snapshot.nested}
            onToggleNested={nestActions.requestNestedToggle}
            focusedKey={snapshot.picker.focused}
            addWorkspace={addWorkspace}
            search={search}
          />
          <RegionListArea
            searching={searching}
            searchResult={searchResult}
            searchResultLimit={searchResultLimit}
            onOpenSearchResult={openSearchResult}
            scope={scope}
            flatRows={flatRows}
            stray={stray}
            ungroupedExpanded={ui.expandedWorkspaces[UNGROUPED_KEY] !== false}
            onToggleUngrouped={() => ui.toggleWorkspace(UNGROUPED_KEY)}
          />
          {/* 对话框挂在列表之外
            * 它们都是 portal 到 body 的浮层，放进 overflow
              容器只会多一层无用的裁剪上下文 */}
          <RegionDialogs
            overlay={ui.overlay}
            setOverlay={ui.openOverlay}
            layout={layout}
            workspaces={workspaces}
            official={official}
            actions={dialogActions}
          />
        </div>
      </LocalViewOptionsProvider>
    </RegionLocaleProvider>
  )
}
