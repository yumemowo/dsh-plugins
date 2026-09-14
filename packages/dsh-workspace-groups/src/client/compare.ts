/**
 * 对照模式：把分组区域放进 `dsh-better-sidebar` 的右侧栏 tab。
 *
 * 官方 `ui-workspace` 只有 `apply` 一个出口，`WorkspaceBrowser` 并未导出，
 * 因此无法在别处复现官方渲染。唯一能同屏对照的做法是反过来：
 * 左侧 `sidebar.workspaces` 交还官方，本区域改挂到右侧栏当 tab。
 *
 * `dsh-better-sidebar` 是第三方包，不在本仓库的依赖图里，所以这里只按
 * 结构声明它的最小接口，不 import 它的类型——类型检查不需要装那个包。
 *
 * @module @your-scope/dsh-workspace-groups/client/compare
 */
import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { WorkspaceGroupsRegion } from './region.ts'
import type { WorkspaceGroupsProps } from './region.ts'

/** 注册进 better-sidebar 的 tab 身份，同时也是 `openTab` 的 `type`。 */
export const COMPARE_TAB_ID = 'workspace-groups:compare'

/** 区域组件需要的、由外部注入的动作与文案（不含两侧数据 hook 与宽窄状态）。 */
export type RegionActions = Omit<
  WorkspaceGroupsProps,
  'wide' | 'expandSidebar' | 'useWorkspaces' | 'useSessions'
>

/**
 * better-sidebar 的 tab 描述符（结构声明，只取本包用到的字段）。
 *
 * 真实描述符还有 `badge` / `settings` / `createTab` 等字段；这里只声明
 * 本包会传的那几个，多出来的字段由 better-sidebar 自行处理。
 */
interface CompareTabDescriptor {
  id: string
  title: string | (() => string)
  description?: string | (() => string)
  order?: number
  single?: boolean
  component: (props: { ctx: Context }) => React.ReactNode
}

/** better-sidebar 暴露给外部插件的服务面（结构声明）。 */
interface BetterSidebarLike {
  registerTab(descriptor: CompareTabDescriptor): () => void
  openTab(seed: { type: string; target?: 'right' | 'bottom' }): void
}

/** 可被订阅的快照源；`ctx.sessions.list` 与 `ctx.workspaces.list` 都满足。 */
interface SnapshotSource<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** 区域需要的两侧快照形状，取自官方插槽原有的数据来源。 */
type WorkspaceState = {
  items: readonly WorkspaceView[]
  archivedSessionIds: readonly string[]
}

/**
 * 把一个快照源包成区域组件要的选择器 hook。
 *
 * 本函数自身不得调用 hook：调用方会把它包进 useMemo 缓存，缓存命中时
 * 工厂不重跑，外层 hook 调用随之消失，hook 数量在两次渲染间不一致会直接
 * 触发 React #300。订阅与读取因此全部留在返回的选择器内部，每次渲染
 * 无条件调用。
 * @param source - 快照源。
 * @returns 与官方插槽同形的选择器 hook。
 */
function useSnapshotSelector<T>(source: SnapshotSource<T>): <S>(select: (state: T) => S) => S {
  return function useSelector<S>(select: (state: T) => S): S {
    // 订阅与读取都包一层箭头函数：快照源的这两个方法可能是类的实例方法
    // （依赖 this），直接把方法引用交给 React 会丢失接收者。
    const subscribe = React.useCallback((onChange: () => void) => source.subscribe(onChange), [source])
    const getSnapshot = React.useCallback(() => source.getSnapshot(), [source])
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return select(state)
  }
}

/** 右侧栏 tab 的 tab 体：套上与侧边栏一致的内边距后渲染区域。 */
function CompareTabBody(props: { ctx: Context; actions: RegionActions }): React.ReactElement {
  const sessions = props.ctx.get('sessions') as { list: SnapshotSource<SessionListState> } | undefined
  const workspaces = props.ctx.get('workspaces') as
    | { list: SnapshotSource<WorkspaceState> }
    | undefined

  const useSessions = React.useMemo(
    () => useSnapshotSelector(sessions?.list ?? EMPTY_SESSIONS),
    [sessions],
  )
  const useWorkspaces = React.useMemo(
    () => useSnapshotSelector(workspaces?.list ?? EMPTY_WORKSPACES),
    [workspaces],
  )

  return React.createElement(
    'div',
    { className: 'wg-tab' },
    React.createElement(WorkspaceGroupsRegion, {
      ...props.actions,
      // 右侧栏没有 shell 的折叠态：始终按宽栏渲染，展开请求是空操作。
      wide: true,
      expandSidebar: () => {},
      useWorkspaces,
      useSessions,
    } as unknown as WorkspaceGroupsProps),
  )
}

/** 依赖缺失时的空快照，保证 hook 调用次数恒定且渲染不炸。 */
const EMPTY_SESSION_STATE = { ids: [], byId: {}, phase: 'ready' } as unknown as SessionListState
const EMPTY_WORKSPACE_STATE: WorkspaceState = { items: [], archivedSessionIds: [] }

// getSnapshot 必须返回稳定引用：useSyncExternalStore 用 Object.is 比较，
// 每次新建对象会被判定为"一直在变"，直接渲染死循环。
const EMPTY_SESSIONS: SnapshotSource<SessionListState> = {
  getSnapshot: () => EMPTY_SESSION_STATE,
  subscribe: () => () => {},
}

const EMPTY_WORKSPACES: SnapshotSource<WorkspaceState> = {
  getSnapshot: () => EMPTY_WORKSPACE_STATE,
  subscribe: () => () => {},
}

/**
 * 把分组区域注册成 better-sidebar 的一个右侧栏 tab。
 *
 * better-sidebar 会把每个 `registerTab` 描述符同步注册进 DSH 原生右侧栏，
 * 因此外部插件用同一个 `registerTab` 就能得到右侧栏 tab，无需接触
 * `ctx.sidebarRightTabs`。
 *
 * `betterSidebar` 缺失时静默跳过：宿主半边与存储不受影响，
 * 只是对照界面不出现。
 * @param ctx - 客户端根 context。
 * @param actions - 注入的动作与文案。
 * @returns 反注册回调。
 */
export function registerCompareTab(ctx: Context, actions: RegionActions): () => void {
  // 注册可能发生在 betterSidebar 出现之后，因此把 disposer 放在外面：
  // 卸载时无论回调是否已经跑过都能正确收尾。
  let disposeTab: (() => void) | undefined

  const fiber = ctx.inject(['betterSidebar'], (injected) => {
    const service = injected.get('betterSidebar') as BetterSidebarLike | undefined
    if (service === undefined) return

    disposeTab = service.registerTab({
      id: COMPARE_TAB_ID,
      title: () => actions.labels.title,
      description: () => actions.labels.compareTabDescription,
      order: 200,
      single: true,
      component: (tabProps) => React.createElement(CompareTabBody, { ctx: tabProps.ctx, actions }),
    })

    // 挂载后尝试直接打开：没有活动会话时 openTab 会静默返回，
    // 用户仍可从 + 菜单/引导页手动打开。
    try {
      service.openTab({ type: COMPARE_TAB_ID, target: 'right' })
    } catch {
      // 列尚未挂载时打开失败是预期的，忽略。
    }
  })

  return () => {
    disposeTab?.()
    disposeTab = undefined
    void fiber.dispose()
  }
}
