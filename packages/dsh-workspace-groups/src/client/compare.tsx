/**
 * 对照模式：把分组区域放进 `dsh-better-sidebar` 的右侧栏 tab
 *
 * 官方 `ui-workspace` 只有 `apply` 一个出口，`WorkspaceBrowser` 并未导出，因此无法在别处复现官方渲染
 * 唯一能同屏对照的做法是反过来：左侧 `sidebar.workspaces` 交还官方，本区域改挂到右侧栏当 tab
 *
 * `dsh-better-sidebar` 是第三方包，不在本仓库的依赖图里
 * 所以这里只按结构声明它的最小接口，不 import 它的类型——类型检查不需要装那个包
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionPendingInteractionSnapshot, UiSession } from '@deepseek-ai/dsh-client-ui-session/client'
import type { LocaleRuntime, LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { RegionActions, WorkspaceState } from './actions.ts'
import { NS } from './locales.ts'
import { directoryFlowSource } from './directoryFlow.ts'
import { hostInfoSource } from './hostInfo.ts'
import type { HostInfo } from './hostInfo.ts'
import { WorkspaceGroupsRegion } from './components/WorkspaceGroupsRegion.tsx'

/** 注册进 better-sidebar 的 tab 身份，同时也是 `openTab` 的 `type` */
export const COMPARE_TAB_ID = 'workspace-groups:compare'

/**
 * better-sidebar 的 tab 描述符（结构声明，只取本包用到的字段）
 *
 * 真实描述符还有 `badge` / `settings` / `createTab` 等字段；这里只声明
 * 本包会传的那几个，多出来的字段由 better-sidebar 自行处理
 */
interface CompareTabDescriptor {
  id: string
  title: string | (() => string)
  description?: string | (() => string)
  order?: number
  single?: boolean
  component: (props: { ctx: Context }) => ReactElement
}

/** better-sidebar 暴露给外部插件的服务面（结构声明） */
interface BetterSidebarLike {
  registerTab(descriptor: CompareTabDescriptor): () => void
  openTab(seed: { type: string; target?: 'right' | 'bottom' }): void
}

/** 可被订阅的快照源；`ctx.sessions.list` 与 `ctx.workspaces.list` 都满足 */
interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/**
 * 把一个快照源包成区域组件要的选择器 hook
 *
 * 本函数自身不得调用 hook：调用方会把它包进 useMemo 缓存，缓存命中时工厂不重跑
 * 外层 hook 调用随之消失，hook 数量在两次渲染间不一致会直接触发 React #300
 * 订阅与读取因此全部留在返回的选择器内部，每次渲染无条件调用
 * @returns 与官方插槽同形的选择器 hook
 */
function useSnapshotSelector<T>(source: SnapshotSource<T>): <S>(select: (state: T) => S) => S {
  return function useSelector<S>(select: (state: T) => S): S {
    // 订阅与读取都包一层箭头函数：快照源的这两个方法可能是类的实例方法（依赖 this）
    // 直接把方法引用交给 React 会丢失接收者
    const subscribe = useCallback((onChange: () => void) => source.subscribe(onChange), [source])
    const getSnapshot = useCallback(() => source.getSnapshot(), [source])
    const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return select(state)
  }
}

/**
 * 语言快照的订阅源
 *
 * 对照模式没有 shell 的插槽座位，语言切换要靠这里主动订阅：`useSyncExternalStore`
 * 拿到的 `revision` 一变，本组件带着新的翻译函数重渲染
 */
function localeSource(locale: LocaleRuntime): SnapshotSource<LocaleSnapshot> {
  return {
    getSnapshot: () => locale.getSnapshot(),
    subscribe: (listener) => locale.subscribe(listener),
  }
}

/** 右侧栏 tab 的 tab 体：套上与侧边栏一致的内边距后渲染区域 */
function CompareTabBody({
  ctx,
  hostInfo,
  actions,
  locale,
}: {
  /**
   * better-sidebar 交给 tab 的那个 context
   *
   * 不能从它读服务依赖以外的东西：它不是本包的 fiber，没有 inject 本包声明的服务
   * cordis 服务代理对未 inject 的属性直接抛错（`cannot get property "remote" without inject`）
   * `ctx.remote` 这类读取必须由调用方在本包自己的 context 上先解析好再传进来
   */
  ctx: Context
  /**
   * 宿主固定事实源
   *
   * 由 `registerCompareTab` 在本包自己的 context 上起（那里 inject 了 `remote`），这里只消费
   */
  hostInfo: SnapshotSource<HostInfo>
  actions: RegionActions
  locale: LocaleRuntime
}): ReactElement {
  const sessions = ctx.get('sessions') as { list: SnapshotSource<SessionListState> } | undefined
  const workspaces = ctx.get('workspaces') as
    | { list: SnapshotSource<WorkspaceState> }
    | undefined
  // 待交互快照归 ui-session 所有，不挂在 sessions 控制器上
  // 对照模式没有 shell 的标准 hook 注入，因此这里自己把它的源包成同形的选择器
  const uiSession = ctx.get('uiSession') as UiSession | undefined
  // directoryFlow 洞的占用源在插槽注册表上；右侧栏 tab 同样没有 shell 注入的 useDirectoryFlow，因此也自己包一层
  const slots = ctx.get('slots') as Parameters<typeof directoryFlowSource>[0] | undefined
  // 文案座位在渲染期现取：插槽那条路径由 shell 注入，这里没有 shell，因此自己绑命名空间，并订阅语言快照让切换语言后重新渲染
  const useLocaleSource = useMemo(() => useSnapshotSelector(localeSource(locale)), [locale])
  useLocaleSource((snapshot) => snapshot.revision)
  const t = locale.bind(NS)

  const useSessions = useMemo(
    () => useSnapshotSelector(sessions?.list ?? EMPTY_SESSIONS),
    [sessions],
  )
  const useWorkspaces = useMemo(
    () => useSnapshotSelector(workspaces?.list ?? EMPTY_WORKSPACES),
    [workspaces],
  )
  const useSessionPendingInteraction = useMemo(
    () => useSnapshotSelector(uiSession?.pendingInteractions ?? EMPTY_PENDING),
    [uiSession],
  )
  const useDirectoryFlowSource = useMemo(
    () => useSnapshotSelector(slots === undefined ? EMPTY_FLOW : directoryFlowSource(slots)),
    [slots],
  )
  const useDirectoryFlow = useCallback(
    (selector: (occupied: boolean) => unknown) => useDirectoryFlowSource(selector),
    [useDirectoryFlowSource],
  )

  // 宿主 home 与 directoryFlow 同理：它也是 inject 面 hooks 隔间里的一个源（见 index.ts）
  // 对照模式没有 shell 注入，因此在这里包成同形的选择器
  // 源本身由 registerCompareTab 在本包自己的 context 上起好
  // tab 这个 context 读不到 ctx.remote（见上面 ctx 的说明）
  const useHostInfoSource = useMemo(() => useSnapshotSelector(hostInfo), [hostInfo])
  const useHostInfo = useCallback(
    (selector: (info: HostInfo) => unknown) => useHostInfoSource(selector),
    [useHostInfoSource],
  )

  return (
    <div className="wg-tab">
      <WorkspaceGroupsRegion
        {...actions}
        t={t}
        // 右侧栏没有 shell 的折叠态：始终按宽栏渲染，展开请求是空操作
        wide
        expandSidebar={() => {}}
        useWorkspaces={useWorkspaces}
        useSessions={useSessions}
        useSessionPendingInteraction={useSessionPendingInteraction}
        useDirectoryFlow={useDirectoryFlow as never}
        useHostInfo={useHostInfo as never}
      />
    </div>
  )
}

/** 依赖缺失时的空快照，保证 hook 调用次数恒定且渲染不炸 */
const EMPTY_SESSION_STATE = { ids: [], byId: {}, phase: 'ready' } as unknown as SessionListState
const EMPTY_WORKSPACE_STATE: WorkspaceState = { items: [], archivedSessionIds: [] }
const EMPTY_PENDING_STATE: SessionPendingInteractionSnapshot = new Map()

// getSnapshot 必须返回稳定引用：useSyncExternalStore 用 Object.is 比较
// 每次新建对象会被判定为「一直在变」，直接渲染死循环
const EMPTY_SESSIONS: SnapshotSource<SessionListState> = {
  getSnapshot: () => EMPTY_SESSION_STATE,
  subscribe: () => () => {},
}

const EMPTY_WORKSPACES: SnapshotSource<WorkspaceState> = {
  getSnapshot: () => EMPTY_WORKSPACE_STATE,
  subscribe: () => () => {},
}

const EMPTY_PENDING: SnapshotSource<SessionPendingInteractionSnapshot> = {
  getSnapshot: () => EMPTY_PENDING_STATE,
  subscribe: () => () => {},
}

// 插槽注册表缺失时的空占用源：恒为「没人占用」，入口按钮因此不渲染
const EMPTY_FLOW: SnapshotSource<boolean> = {
  getSnapshot: () => false,
  subscribe: () => () => {},
}

// 远端面缺失时的空宿主事实：home 未知，工作区卡片因此只显示原始路径（见 utils/pathUtils.ts 的缺省行为）
// 留这份兜底是因为 `remote` 虽在本包的 inject 列表里，服务本身仍可能没人提供
const EMPTY_HOST_INFO: SnapshotSource<HostInfo> = {
  getSnapshot: () => ({ home: undefined }),
  subscribe: () => () => {},
}

/**
 * 把分组区域注册成 better-sidebar 的一个右侧栏 tab
 *
 * better-sidebar 会把每个 `registerTab` 描述符同步注册进 DSH 原生右侧栏
 * 外部插件用同一个 `registerTab` 就能得到右侧栏 tab，无需接触 `ctx.sidebarRightTabs`
 *
 * `betterSidebar` 缺失时静默跳过：宿主半边与存储不受影响，只是对照界面不出现
 * @param ctx - 客户端根 context（本包自己的，已 inject `remote`）
 * @returns 反注册回调
 */
export function registerCompareTab(
  ctx: Context,
  actions: RegionActions,
  locale: LocaleRuntime,
): () => void {
  // 宿主固定事实源在本包自己的 context 上起：`ctx.remote` 要求 remote 在本 context 的 inject 列表里
  // 而 tab 拿到的那个 context 不是本包的 fiber
  // 在它上面读 `ctx.remote` 会直接抛「cannot get property "remote" without inject」
  // 源起好后随组件传下去，tab 体只消费
  // `get` 不抛（属性代理才抛），因此用它判断服务是否真的有人提供
  const remote = ctx.get('remote')
  const hostInfo = remote === undefined ? EMPTY_HOST_INFO : hostInfoSource(ctx)

  // 注册可能发生在 betterSidebar 出现之后，因此把 disposer 放在外面：卸载时无论回调是否已经跑过都能正确收尾
  let disposeTab: (() => void) | undefined

  const fiber = ctx.inject(['betterSidebar'], (injected) => {
    const service = injected.get('betterSidebar') as BetterSidebarLike | undefined
    if (service === undefined) return

    disposeTab = service.registerTab({
      id: COMPARE_TAB_ID,
      // 标题与说明是 thunk：每次取用时现读当前语言，切换语言后无需重注册
      // 标题是官方已有的键，说明是本包自有键，各取自己的命名空间
      title: () => locale.bind('workspace')('section.workspaces'),
      description: () => locale.bind(NS)('compareTabDescription'),
      order: 200,
      single: true,
      component: (tabProps) => (
        <CompareTabBody
          ctx={tabProps.ctx}
          hostInfo={hostInfo}
          actions={actions}
          locale={locale}
        />
      ),
    })

    // 挂载后尝试直接打开：没有活动会话时 openTab 会静默返回，用户仍可从 + 菜单/引导页手动打开
    try {
      service.openTab({ type: COMPARE_TAB_ID, target: 'right' })
    } catch {
      // 列尚未挂载时打开失败是预期的，忽略
    }
  })

  return () => {
    disposeTab?.()
    disposeTab = undefined
    void fiber.dispose()
  }
}
