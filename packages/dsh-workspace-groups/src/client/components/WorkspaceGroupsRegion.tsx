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
import { useCallback, useEffect, useState } from 'react'
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
import { sessionStatus } from '../data/status.ts'
import type { SessionStatus } from '../data/status.ts'
import type { GroupNameDraft, SessionRow, WorkspaceNameDraft } from '../data/types.ts'
import { SessionRowMenu } from './SessionRowMenu.tsx'
import { SessionRowView } from './SessionRowView.tsx'
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
    official: resolveOfficial,
    tWorkspace,
    t,
  } = props

  const labels = regionLabels(t, tWorkspace)

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

  const currentSessionId = sessions.current === undefined ? undefined : String(sessions.current)

  // 行尾相对时间的基准时刻。官方在渲染时直接取 Date.now()（没有任何 ticker），
  // 这里取同一做法：时间文案的精度是分钟级，跟着别的重渲染刷新足够
  const now = Date.now()

  // 官方动作与文案的解析时机放在渲染期：渲染器会缓存注册项的 inject 结果，
  // 在 inject 里读服务会冻结在首次渲染那一刻，而官方 ui-workspace 的加载
  // 顺序不受本包约束
  const official = resolveOfficial?.()

  /**
   * 一个会话行要显示的状态位
   *
   * 待交互种类从快照里按会话 id 取；空闲返回 undefined，槽位仍占位
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

  /** 执行一次改动并刷新本地快照 */
  const apply = useCallback(
    (action: Promise<void>) => {
      void action.then(() => reload())
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
    apply(renameWorkspace(workspaceRename.workspaceId, name))
  }

  /**
   * 删除工作区
   *
   * 先删注册再清分组元数据：工作区没了，它名下的分组再也不会被渲染，
   * 留着就是读不到的记录；反过来的话，删组成功而删工作区失败会把分组
   * 提前丢掉。清理由既有的 `deleteGroup` 承担，不新增宿主接口
   */
  const commitWorkspaceDelete = (): void => {
    if (workspaceDelete === null) return
    const { workspaceId } = workspaceDelete
    setWorkspaceDelete(null)
    const orphanGroups = groups[workspaceId] ?? []
    apply(
      deleteWorkspace(workspaceId).then(async () => {
        for (const group of orphanGroups) await deleteGroup(workspaceId, group.id)
      }),
    )
  }

  /**
   * 在一个工作区里新建会话
   *
   * 官方在新建前展开工作区，否则新会话会落在折叠区里看不见；分组行的 `+`
   * 同理要把分组一起展开。建好之后再把会话归入指定分组（`groupId` 为空串
   * 表示不归组，即工作区行的 `+`）
   * @param workspaceId - 目标工作区
   * @param groupId - 新会话要归入的分组；空串表示留在未归组区
   */
  const createSessionIn = (workspaceId: string, groupId: string): void => {
    setCollapsedWorkspaces((prev) => ({ ...prev, [workspaceId]: false }))
    // 展开而不是取反：分组本就展开时，切换会把它收起来，新会话反而看不见
    if (groupId !== '') {
      setCollapsedGroups((prev) => ({ ...prev, [`${workspaceId}:${groupId}`]: false }))
    }
    void startSession(workspaceId)
      .then((sessionId) =>
        groupId === '' ? undefined : apply(moveSession(workspaceId, sessionId, groupId)),
      )
      .catch(() => {
        // 建会话失败由会话控制器自己提示；这里不再弹一次，避免同一错误报两遍
      })
  }

  /** 归组菜单选中项：取消分组，或移入 `group:<id>` 指名的分组 */
  const selectSessionGroup = (workspaceId: string, sessionId: string, id: string): void => {
    if (id === 'ungroup') {
      apply(moveSession(workspaceId, sessionId, ''))
      return
    }
    if (id.startsWith('group:')) {
      apply(moveSession(workspaceId, sessionId, id.slice('group:'.length)))
    }
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
    newGroup: labels.newGroup,
    rename: labels.renameWorkspace,
    delete: labels.deleteWorkspace,
  }

  // 窄栏只保留展开入口，与官方组件的 rail 行为一致
  if (!wide) {
    return <WorkspaceRail label={labels.title} onExpand={expandSidebar} />
  }

  const rowsByWorkspace = groupSessionsByWorkspace(sessions, workspaces, archivedSessionIds)
  // 不属于任何工作区的会话；只有存在时才渲染末尾的「未分组」区段
  const stray = straySessions(sessions, workspaces, archivedSessionIds)
  const ungroupedCollapsed = collapsedWorkspaces[UNGROUPED_KEY] === true

  return (
    <div className="wg-root">
      <div className="wg-list">
        {workspaces.map((workspace) => {
          const workspaceId = String(workspace.workspaceId)
          const layout = buildLayout(rowsByWorkspace.get(workspaceId) ?? [], groups[workspaceId] ?? [])
          const collapsed = collapsedWorkspaces[workspaceId] === true

          /** 工作区内带会话操作菜单的会话行 */
          const renderSession = (row: SessionRow): ReactElement => (
            <SessionRowMenu
              key={row.id}
              row={row}
              selected={row.id === currentSessionId}
              status={statusOf(row)}
              time={timeOf(row)}
              grouping={{
                sections: layout.groups,
                currentGroupId: groupIdOfSession(layout.groups, row.id),
                groupLabel: labels.moveToGroup,
                ungroupLabel: labels.ungroup,
                onSelect: (id) => selectSessionGroup(workspaceId, row.id, id),
              }}
              official={official}
              onOpen={() => openSession(row.id)}
              actionsLabel={labels.sessionActions}
              t={t}
            />
          )

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
                rename: labels.renameGroup,
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
              renderSession={renderSession}
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
            {ungroupedCollapsed ? null : (
              <div className="wg-workspace-body">
                {/* 这些会话不属于任何工作区，没有分组可归，因此菜单里只有
                    官方三项（归组项无处落）。宿主未提供官方服务时菜单会是
                    空的，那时直接渲染无菜单的行，不留点不动的省略号 */}
                <div className="wg-sessions">
                  {stray.map((row) =>
                    official === undefined ? (
                      <SessionRowView
                        key={row.id}
                        row={row}
                        selected={row.id === currentSessionId}
                        status={statusOf(row)}
                        time={timeOf(row)}
                        onOpen={() => openSession(row.id)}
                      />
                    ) : (
                      <SessionRowMenu
                        key={row.id}
                        row={row}
                        selected={row.id === currentSessionId}
                        status={statusOf(row)}
                        time={timeOf(row)}
                        official={official}
                        onOpen={() => openSession(row.id)}
                        actionsLabel={labels.sessionActions}
                        t={t}
                      />
                    ),
                  )}
                </div>
              </div>
            )}
          </section>
        )}
        <div className="wg-note">{labels.unimplemented}</div>
      </div>
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
