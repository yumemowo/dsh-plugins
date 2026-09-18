/**
 * 侧边栏的工作区浏览区域
 *
 * 这是 `sidebar.workspaces` 的接替者：该插槽是 single 类型，本包以
 * `priority: -1` 注册从而成为渲染者，官方 ui-workspace 的同名注册仍留在
 * 注册表中但不再渲染
 *
 * 本模块只负责状态与编排：折叠态、四个对话框的草稿、以及把快照切成每个
 * 工作区的布局；行的外观与菜单分别由 components/ 下的组件负责
 *
 * 只有用户创建的分组才有分组头；未归组的会话直接平铺在工作区下，与原生
 * 会话列表一致。折叠状态按「工作区」与「工作区+分组」分别记录，因此不同
 * 工作区、不同分组之间互不影响
 *
 * 不属于任何工作区的会话（例如工作区被删除后遗留的会话）收进末尾一个隐式
 * 的「未分组」区段——那是工作区一级的容器，与本包在工作区内刻意不造
 * 「未分组分组」的取舍无关
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { Group } from '../remote.ts'
import type { RegionActions, RegionDataHooks } from '../actions.ts'
import { regionLabels } from '../labels.ts'
import type { RegionTranslate } from '../locales.ts'
import { buildLayout, containsSession, groupIdOfSession } from '../data/layout.ts'
import { groupSessionsByWorkspace, straySessions } from '../data/sessions.ts'
import { searchSessions } from '../data/search.ts'
import type { SearchMatch } from '../data/search.ts'
import { sessionStatus } from '../data/status.ts'
import type { SessionStatus } from '../data/status.ts'
import type { GroupNameDraft, SessionRow, WorkspaceNameDraft } from '../data/types.ts'
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
import { DeleteDialog } from './dialogs/DeleteDialog.tsx'
import { NameDialog } from './dialogs/NameDialog.tsx'

/** 未分组桶在工作区状态表里占用的键；它没有真实的 workspaceId */
const UNGROUPED_KEY = ''

/** 组件消费的 props：全局数据 hook + 注入的动作 + 两个文案座位 + shell 的宽窄状态 */
export type WorkspaceGroupsProps = RegionDataHooks &
  RegionActions & {
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
    useSessionPendingInteraction,
    useDirectoryFlow,
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
    searchResultLimit,
    official: resolveOfficial,
    addWorkspace: resolveAddWorkspace,
    tWorkspace,
    tSidebar,
    t,
  } = props

  // 文案表按三个翻译座位缓存：它每次渲染都是新对象，里面的函数（如
  // sessionActions）会直接传给行组件，每渲染新建一份会让整片列表的 memo 失效。
  // 缓存的是投影结果而不是译文——三个 t 都在**调用时**才读当前语言，因此语言
  // 切换后重新调用拿到的仍是新译文
  const labels = useMemo(() => regionLabels(t, tWorkspace, tSidebar), [t, tWorkspace, tSidebar])

  const workspaces = useWorkspaces((state) => state.items) as readonly WorkspaceView[]
  // 归档集是注册表全局的：归档会话仍留在工作区的 sessionIds 里，
  // 必须显式过滤，否则已归档的会话会继续出现在列表里
  const archivedSessionIds = useWorkspaces(
    (state) => state.archivedSessionIds,
  ) as readonly string[]
  const sessions = useSessions((state) => state) as SessionListState
  // 待交互快照与会话列表是两个独立事实源：等待审批/回答时会话可能并不在
  // running，因此必须单独读，不能从会话摘要里推
  const pendingInteractions = useSessionPendingInteraction(
    (state) => state,
  ) as SessionPendingInteractionSnapshot
  const [groups, setGroups] = useState<Record<string, Group[]>>({})
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  // 建组与改名共用一个对话框：groupId 为空串时是新建
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
  /** 从搜索结果打开、等待滚进可视区的那一行；滚动完成后由行自己回报清除 */
  const [revealSessionId, setRevealSessionId] = useState<string | undefined>(undefined)

  const currentSessionId = sessions.current === undefined ? undefined : String(sessions.current)

  // 搜索状态留在这里而不是 header 内部：窄栏入口要触发宽栏输入框的聚焦，
  // 这一跨形态的联动需要一个共同宿主
  const search = useSearch(wide, expandSidebar)

  // 行尾相对时间的基准时刻。官方在渲染时直接取 Date.now()（没有任何 ticker），
  // 这里取同一做法：时间文案的精度是分钟级，跟着别的重渲染刷新足够
  const now = Date.now()

  // 官方动作与文案的解析时机放在渲染期：渲染器会缓存注册项的 inject 结果，
  // 在 inject 里读服务会冻结在首次渲染那一刻，而官方 ui-workspace 的加载
  // 顺序不受本包约束
  const official = resolveOfficial?.()
  // 「添加工作区」同样延迟到渲染期解析：它要读官方 directoryFlow 洞的占用者，
  // 而目录选择器插件的加载顺序不受本包约束。订阅占用情况让入口跟着占用者出现
  const flowOccupied = useDirectoryFlow((occupied) => occupied) as boolean
  const addWorkspace = flowOccupied ? resolveAddWorkspace?.() : undefined

  /**
   * 一个会话行要显示的状态位
   *
   * 待交互种类从快照里按会话 id 取；空闲返回 undefined，槽位仍占位。在这里算是为了
   * 让状态位与时间文案作为内容稳定的 prop 参与行级 memo 的比对：被 memo 挡下的行不会
   * 重算，按渲染当刻取时间会停住
   * @param row - 会话渲染行
   * @returns 状态位或 undefined
   */
  const statusOf = (row: SessionRow): SessionStatus | undefined =>
    sessionStatus(row, pendingInteractions.get(row.id as SessionId)?.kind, labels.status)

  /**
   * 一个会话行行尾要显示的相对时间
   *
   * 官方对空白（新建中）会话行不显示时间，这里沿用同一取舍
   * @param row - 会话渲染行
   * @returns 相对时间文案；不显示时为 undefined
   */
  const timeOf = (row: SessionRow): string | undefined =>
    row.blank || official === undefined ? undefined : official.relativeTime(row.updatedAt, now)

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
        groups,
        archivedSessionIds,
        search.normalized,
        searchResultLimit,
      ),
    [sessions, workspaces, groups, archivedSessionIds, search.normalized, searchResultLimit],
  )

  /**
   * 从搜索结果打开一条会话
   *
   * 打开之前先把这条会话所在的两层折叠打开并清掉搜索：结果行点下去的意图是
   * 「去看这条会话」，而它可能正躺在收起的工作区或分组里，不展开就落在一个
   * 看不见的行上。这正是官方 `revealSessionId` 承担的那段编排——官方在那里
   * 由组件订阅会话树自行展开，本包把展开状态放在本组件里，因此在打开前直接
   * 写这两份状态
   *
   * 清掉查询还有一层意义：结果列表随即被常规列表取代，标记的那一行才真的存在
   * @param match - 被点开的那条结果
   */
  const openSearchResult = (match: SearchMatch): void => {
    const workspaceId = match.workspace?.id
    if (workspaceId === undefined) {
      // 无所属工作区的会话落在末尾的隐式「未分组」区段里，同样要先展开
      setCollapsedWorkspaces((prev) =>
        prev[UNGROUPED_KEY] === true ? { ...prev, [UNGROUPED_KEY]: false } : prev,
      )
    } else {
      setCollapsedWorkspaces((prev) =>
        prev[workspaceId] === true ? { ...prev, [workspaceId]: false } : prev,
      )
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
        if (!cancelled) setGroups(next)
      })
      .catch(() => {
        // 元数据不可用时退化为「全部分组消失」，会话仍按未归组平铺，界面可用
        if (!cancelled) setGroups({})
      })
    return () => {
      cancelled = true
    }
  }, [loadGroups])

  useEffect(() => reload(), [reload])

  // 首次拉取可能早于远程数据面就绪（requireApi 抛错被上面的 catch 吞掉），
  // 就绪信号到达时重拉一次，否则已落盘的分组要等下一次改动才会出现
  useEffect(() => onReady(() => reload()), [onReady, reload])

  /**
   * 执行一次改动，并用宿主回传的快照替换本地状态
   *
   * 宿主每个变更方法都回整份快照（见宿主 `service.ts`），直接采用它就不必再拉
   * 一次，也避免「改动已生效、本地状态还是旧的」这段空档
   *
   * 失败要留下痕迹：分组元数据的写入不可见，一次静默失败只会表现为「什么都
   * 没发生」，界面与元数据的偏差却一直留着。失败时退回重拉一次，让本地状态
   * 与宿主对齐
   */
  const apply = useCallback(
    (action: Promise<Record<string, Group[]>>) => {
      void action.then(
        (next) => setGroups(next),
        (reason: unknown) => {
          console.error('workspace-groups: group change failed', reason)
          reload()
        },
      )
    },
    [reload],
  )

  /** 折叠状态取反；默认展开，因此只有显式 true 才算折叠 */
  const toggleWorkspace = useCallback((key: string) => {
    setCollapsedWorkspaces((prev) => ({ ...prev, [key]: prev[key] !== true }))
  }, [])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: prev[key] !== true }))
  }, [])

  /** 提交建组或改名；空名与取消都不写 */
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

  /** 工作区当前的名字；用于判断改名是否真的改变了内容 */
  const renamedFrom = (draft: WorkspaceNameDraft): string => {
    const workspace = workspaces.find((item) => String(item.workspaceId) === draft.workspaceId)
    return workspace === undefined ? '' : workspace.title
  }

  const commitWorkspaceRename = (): void => {
    if (workspaceRename === null) return
    const name = workspaceRename.value.trim()
    if (name === '' || name === renamedFrom(workspaceRename)) return
    setWorkspaceRename(null)
    // 不经过 `apply`：改名不动分组元数据，官方控制器返回的是工作区视图而不是
    // 分组快照，`apply` 因此只收「回整份快照」的改动。失败仍要留下痕迹
    void renameWorkspace(workspaceRename.workspaceId, name).catch((reason: unknown) => {
      console.error('workspace-groups: workspace rename failed', reason)
    })
  }

  /**
   * 删除工作区
   *
   * 先删注册再清分组元数据：工作区没了，它名下的分组再也不会被渲染，
   * 留着就是读不到的记录；反过来的话，删组成功而删工作区失败会把分组
   * 提前丢掉。清理由既有的 `deleteGroup` 承担，不新增宿主接口
   *
   * 每一步都回整份快照，取最后一步的那份即可：删工作区本身不动分组元数据，
   * 因此最终状态就是最后一次删组的结果（没有分组可清时退回删工作区前的本地值）
   */
  const commitWorkspaceDelete = (): void => {
    if (workspaceDelete === null) return
    const { workspaceId } = workspaceDelete
    setWorkspaceDelete(null)
    const orphanGroups = groups[workspaceId] ?? []
    apply(
      deleteWorkspace(workspaceId).then(async () => {
        let snapshot: Record<string, Group[]> = groups
        for (const group of orphanGroups) snapshot = await deleteGroup(workspaceId, group.id)
        return snapshot
      }),
    )
  }

  /**
   * 在一个工作区里新建会话
   *
   * 官方在新建前展开工作区，否则新会话会落在折叠区里看不见；分组行的 `+`
   * 同理要把分组一起展开
   *
   * 建好之后无条件把会话摆到本次创建指定的位置：`groupId` 为空串表示工作区行
   * 的 `+`，会话归入未归组区。这一步不能只在指定了分组时做——官方会复用该
   * 工作区已有的空白会话，那条会话可能正留在某个分组里，复用时不把它摘出来
   * 就会停在原分组
   * @param workspaceId - 目标工作区
   * @param groupId - 新会话要归入的分组；空串表示归入未归组区
   */
  const createSessionIn = (workspaceId: string, groupId: string): void => {
    setCollapsedWorkspaces((prev) => ({ ...prev, [workspaceId]: false }))
    // 展开而不是取反：分组本就展开时，切换会把它收起来，新会话反而看不见
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
        // 建会话失败由会话控制器自己提示；这里不再弹一次，避免同一错误报两遍
      })
  }

  /**
   * 归组菜单选中项：取消分组，或移入 `group:<id>` 指名的分组
   *
   * 是 `useCallback` 而不是每次渲染新建：它会随归组上下文传到每一行，行级 memo
   * 按引用比对，每渲染新建一个会让整片列表的 memo 失效
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

  // 窄栏：官方在这里也只留搜索与「添加工作区」两个入口（外加 shell 的展开入口）
  if (!wide) {
    return (
      <>
        <RegionRailHeader
          addWorkspace={addWorkspace}
          search={{ state: search, labels: labels.search }}
          t={t}
        />
        <WorkspaceRail label={labels.title} onExpand={expandSidebar} />
      </>
    )
  }

  const rowsByWorkspace = groupSessionsByWorkspace(sessions, workspaces, archivedSessionIds)
  // 不属于任何工作区的会话；只有存在时才渲染末尾的「未分组」区段
  const stray = straySessions(sessions, workspaces, archivedSessionIds)
  const ungroupedCollapsed = collapsedWorkspaces[UNGROUPED_KEY] === true
  const searching = search.normalized !== ''

  return (
    <div className="wg-root">
      <RegionHeader
        title={labels.title}
        addWorkspace={addWorkspace}
        search={{ state: search, labels: labels.search }}
        viewOptionsLabel={labels.add.viewOptions}
        t={t}
      />
      {searching ? (
        <SearchResults
          result={searchResult}
          limit={searchResultLimit}
          currentSessionId={currentSessionId}
          statusOf={(match) => statusOf(match.row)}
          ungrouped={labels.ungrouped}
          labels={labels.search}
          onOpen={openSearchResult}
        />
      ) : (
        <div className="wg-list wg-panel">
          {workspaces.map((workspace) => {
            const workspaceId = String(workspace.workspaceId)
            const layout = buildLayout(rowsByWorkspace.get(workspaceId) ?? [], groups[workspaceId] ?? [])
            const collapsed = collapsedWorkspaces[workspaceId] === true

            /**
             * 渲染一个会话行
             *
             * 空白行的名字取语言包的固定名（官方 `session.new`），并且像官方一样
             * 不挂行尾菜单——它只是「准备开始一个新会话」的占位，没有会话可重命名
             * 或归档。`grouping` 缺省表示该行没有分组可归（「未分组」桶）
             *
             * 传下去的字段都是原语或稳定引用，动作传的是未绑定的函数本身：行级
             * memo 要按字段比对，任何一处每渲染新建都会让它整片失效
             */
            const renderSession = (
              row: SessionRow,
              grouping?: SessionGroupingContext,
            ): ReactElement => {
              // 只有被打开的那一行带揭示请求；它的闭包每渲染新建一份，因此每次
              // 重渲染会让这一行重渲染一次——行滚进可视区并回报后标记即被清掉，
              // 这个代价只落在该行上
              const reveal =
                row.id === revealSessionId ? () => acknowledgeReveal(row.id) : undefined
              if (row.blank) {
                return (
                  <SessionRowView
                    key={row.id}
                    sessionId={row.id}
                    title={labels.newSession}
                    selected={row.id === currentSessionId}
                    status={statusOf(row)}
                    time={timeOf(row)}
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
                  status={statusOf(row)}
                  time={timeOf(row)}
                  grouping={grouping}
                  official={official}
                  actionsLabel={labels.sessionActions}
                  onOpenSession={openSession}
                  t={t}
                  onReveal={reveal}
                />
              )
            }

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
                isGroupCollapsed={(groupId) =>
                  collapsedGroups[`${workspaceId}:${groupId}`] === true
                }
                labels={workspaceRowLabels}
                emptyLabel={labels.empty}
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
          })}
          {/* 未分组桶排在全部工作区之后，与官方一致；空则整段不渲染 */}
          {stray.length === 0 ? null : (
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
                  {/* 这些会话不属于任何工作区，没有分组可归，因此菜单里只有
                      官方三项（归组项无处落）。宿主未提供官方服务时菜单会是
                      空的，那时直接渲染无菜单的行，不留点不动的省略号 */}
                  <div className="wg-sessions">
                    {stray.map((row) =>
                      official === undefined || row.blank ? (
                        <SessionRowView
                          key={row.id}
                          sessionId={row.id}
                          title={row.blank ? labels.newSession : row.title}
                          selected={row.id === currentSessionId}
                          status={statusOf(row)}
                          time={timeOf(row)}
                          onOpenSession={openSession}
                          onReveal={
                            row.id === revealSessionId ? () => acknowledgeReveal(row.id) : undefined
                          }
                        />
                      ) : (
                        <SessionRowMenu
                          key={row.id}
                          row={row}
                          title={row.title}
                          selected={row.id === currentSessionId}
                          status={statusOf(row)}
                          time={timeOf(row)}
                          official={official}
                          onOpenSession={openSession}
                          actionsLabel={labels.sessionActions}
                          t={t}
                          onReveal={
                            row.id === revealSessionId ? () => acknowledgeReveal(row.id) : undefined
                          }
                        />
                      ),
                    )}
                  </div>
                </div>
              </CollapsibleBody>
            </section>
          )}
          <div className="wg-note">{labels.unimplemented}</div>
        </div>
      )}
      {/* 对话框挂在列表之外：它们都是 portal 到 body 的浮层，放进 overflow
          容器只会多一层无用的裁剪上下文 */}
      {nameDraft === null ? null : (
        <NameDialog
          title={nameDraft.groupId === '' ? labels.newGroup : labels.renameGroup}
          value={nameDraft.value}
          placeholder={labels.groupNamePrompt}
          // 新建走通用词的「确定」；改名用官方 workspace 语言包的短动词，与官方改名对话框同词
          confirmLabel={nameDraft.groupId === '' ? t('ok') : official?.labels.rename ?? t('ok')}
          t={t}
          confirmDisabled={nameDraft.value.trim() === ''}
          onValueChange={(value) => setNameDraft({ ...nameDraft, value })}
          onConfirm={commitNameDraft}
          onClose={() => setNameDraft(null)}
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
    </div>
  )
}
