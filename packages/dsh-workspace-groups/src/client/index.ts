/**
 * 工作区分组插件的浏览器半边
 *
 * 注册进侧边栏 shell 的 `sidebar.workspaces` 区域。该插槽是 `single` 类型：
 * 同一优先级重复注册会抛错，且**数值更低的优先级渲染**。官方 ui-workspace
 * 用默认优先级 0，本包以 `priority: -1` 成为渲染者
 *
 * 不声明任何子插槽：`sidebar.workspaces.directoryFlow` 已被 ui-workspace 声明，
 * 而一个插槽只能有一个声明者，重复声明会直接抛错。阶段一不提供
 * 「新增工作区」入口，因此也不需要那个洞
 *
 * 文案走两条官方路径：本包自己的 `workspaceGroups` 命名空间由
 * `locale.register` 注册，组件从插槽注入的 `t` 座位取用（渲染期绑定，
 * 语言切换后自动重新渲染）；会话行那三项官方操作的文案与相对时间直接绑
 * 官方 `workspace` 命名空间，官方改文案时本包逐键跟随
 *
 * @module @your-scope/dsh-workspace-groups/client
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
// 仅用于引入 ui-renderer 的客户端类型增强（ctx.slots 等）
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// 仅用于引入 sidebar 的插槽声明增强（sidebar.workspaces 的 SlotMap 条目）
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// 仅用于引入官方 workspace 语言包的键域声明（LocaleNamespaceMap）与
// ctx.uiWorkspace 的服务类型——本包复用官方文案与官方动作，靠这份声明让
// 官方改键名时在 tsc 阶段就暴露，而不是运行期显示原始键名
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { REMOTE_CONTRIBUTION, SERVICE, callRemote } from './remote.ts'
import type { Group, WorkspaceGroupsSnapshot } from './remote.ts'
import { registerCompareTab } from './compare.tsx'
import { NS, en, zh } from './locales.ts'
import { officialSessionLabels, timeLabel } from './official.ts'
import type { RegionActions, OfficialSessionActions } from './actions.ts'
import { WorkspaceGroupsRegion } from './components/WorkspaceGroupsRegion.tsx'
import { insertStyles } from './styles.ts'

/** 浏览器半边声明的服务依赖 */
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'remote']

/**
 * 对照模式开关
 *
 * `true` 时左侧 `sidebar.workspaces` 交还官方 ui-workspace，本区域改挂进
 * `dsh-better-sidebar` 的右侧栏 tab，便于和官方渲染同屏比对；
 * `false` 时维持 `priority: -1` 接替左侧区域
 *
 * 之所以是编译期常量而不是配置项：这是开发期的对照开关，
 * 不是要交付给用户的能力，配置化反而要多一套 schema 与文档
 */
//const COMPARE_MODE = false
const COMPARE_MODE = true

/**
 * 插件入口
 * @param ctx - 客户端根 context
 */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions | undefined
  const workspaces = ctx.get('workspaces') as IWorkspaces | undefined
  const locale = ctx.get('locale') as LocaleRuntime | undefined
  if (locale === undefined) return

  // 两种注册形式：带类型合并的整表形式按内置语言 id 传字典
  ctx.effect(
    () => locale.register(NS, { zh, en }),
    'workspace-groups: dictionaries',
  )

  /**
   * 远程命名空间就绪信号
   *
   * 区域组件的首次拉取可能早于 `$mount` 完成；就绪时这里发布一次，
   * 订阅者借此重试此前被就绪性拒绝的加载
   */
  const readyListeners = new Set<() => void>()
  const onReady = (listener: () => void): (() => void) => {
    // 先挂订阅再看状态，避免「检查时未就绪、发布前刚就绪」的窗口漏报
    if (groupsApi !== undefined) {
      listener()
      return () => {}
    }
    readyListeners.add(listener)
    return () => {
      readyListeners.delete(listener)
    }
  }

  /** 挂载本包自己的 remote 命名空间；成功后取回可调用的方法表 */
  let groupsApi: Record<string, (...args: never[]) => Promise<never>> | undefined
  ctx.effect(
    () => {
      let disposed = false
      void ctx.remote.$mount(REMOTE_CONTRIBUTION as never).then(() => {
        if (disposed) return
        // 服务键按 descriptor 的 namespace 注册（remote.<namespace>），
        // 不是包名——typert 网关以 namespace 归组安装方法表
        groupsApi = ctx.get(`remote.${SERVICE}`) as typeof groupsApi
        for (const listener of [...readyListeners]) listener()
        readyListeners.clear()
      })
      return () => {
        disposed = true
      }
    },
    'workspace-groups: remote mount',
  )

  // 官方 `workspace` 命名空间的翻译函数：绑定结果是稳定引用，且**在调用时
  // 才读当前语言**，因此可以放心地随 inject 结果或渲染期解析一起缓存——
  // 被缓存的是函数，不是投影后的文案表，语言切换后调用它自然读到新语言。
  const tWorkspace = locale.bind('workspace')

  const requireApi = (): Record<string, (...args: never[]) => Promise<never>> => {
    if (groupsApi === undefined) throw new Error('workspace-groups remote is not ready')
    return groupsApi
  }

  const loadGroups = async (): Promise<Record<string, Group[]>> => {
    const snapshot = await callRemote<WorkspaceGroupsSnapshot>(requireApi(), 'list')
    return snapshot.byWorkspace
  }

  /**
   * 官方三项会话操作的复用面
   *
   * 动作直接调官方服务（`ctx.uiWorkspace` 的分叉/归档、`ctx.sessions` 绑定的
   * 重命名）——这三处正是官方会话菜单内部调用的同一批接口，因此官方改行为
   * 时本包自动跟随。文案与相对时间在这里按调用时的语言投影：本函数由区域
   * 组件在每次渲染时调用（见 `RegionActions.official`），因此语言切换后
   * 重新投影，不会冻结在注册那一刻
   *
   * 官方 `ui-workspace` 不在场时返回 undefined：本包的区域本来就依赖它供的
   * `useWorkspaces` 全局 hook，正常情况下它必然加载；真缺失时菜单里那三项与
   * 行尾时间整体不渲染，不留点不动的入口
   * @returns 官方动作；官方服务或控制器缺失时为 undefined
   */
  const officialActions = (): OfficialSessionActions | undefined => {
    const uiWorkspace = ctx.get('uiWorkspace') as
      | {
          forkSession: (sessionId: string) => Promise<void>
          archiveSession: (sessionId: string) => Promise<void>
        }
      | undefined
    if (uiWorkspace === undefined || sessions === undefined) return undefined

    return {
      // 重命名没有走 uiWorkspace：官方把这条留在会话对象上，菜单里也是
      // 同一个入口。走 binding 而不是另造 RPC，接受规范化与错误语义。
      renameSession: async (sessionId, title) => {
        const face = sessions.binding(sessionId as never)?.session
        if (face === undefined) throw new Error(`unknown session "${sessionId}"`)
        const result = await face.rename(title)
        if (!result.ok) throw new Error(result.error.message)
      },
      // 官方菜单把 fork 的失败咽掉（分叉失败不该弹错），这里保持同一行为。
      forkSession: (sessionId) => {
        void uiWorkspace.forkSession(sessionId).catch(() => {})
      },
      archiveSession: (sessionId) => uiWorkspace.archiveSession(sessionId),
      labels: officialSessionLabels(tWorkspace),
      relativeTime: (updatedAt, now) => timeLabel(updatedAt, now, tWorkspace),
    }
  }

  const injected = (): RegionActions => {
    if (sessions === undefined || workspaces === undefined) {
      // 依赖缺失时给出空实现：组件仍可渲染，只是没有可操作的动作。
      return {
        openSession: () => {},
        startSession: () => {},
        onReady: () => () => {},
        loadGroups: async () => ({}),
        createGroup: async () => {},
        renameGroup: async () => {},
        deleteGroup: async () => {},
        moveSession: async () => {},
        renameWorkspace: async () => {},
        deleteWorkspace: async () => {},
        tWorkspace,
      }
    }
    return {
      openSession: (sessionId: string) => {
        sessions.open(sessionId as never)
      },
      startSession: (workspaceId: string) => {
        void sessions.create({ workspaceId: workspaceId as never }).then((created) => {
          sessions.open(created)
        })
      },
      onReady,
      loadGroups,
      createGroup: (workspaceId, name) =>
        callRemote(requireApi(), 'createGroup', [workspaceId, name]).then(() => undefined),
      renameGroup: (workspaceId, groupId, name) =>
        callRemote(requireApi(), 'renameGroup', [workspaceId, groupId, name]).then(() => undefined),
      deleteGroup: (workspaceId, groupId) =>
        callRemote(requireApi(), 'deleteGroup', [workspaceId, groupId]).then(() => undefined),
      // 选择器用空串表示「不属于任何分组」，宿主接口用 null 表达同一含义。
      moveSession: (workspaceId, sessionId, groupId) =>
        callRemote(requireApi(), 'moveSession', [
          workspaceId,
          sessionId,
          groupId === '' ? null : groupId,
        ]).then(() => undefined),
      // 工作区自身的改名与删除直接走官方工作区控制器，不另造 RPC：
      // 删除只移除注册，文件夹与会话记录都由宿主保留。
      renameWorkspace: (workspaceId, title) =>
        workspaces.rename(workspaceId as never, title).then(() => undefined),
      deleteWorkspace: (workspaceId) => workspaces.delete(workspaceId as never),
      tWorkspace,
      // 传解析器而不是值：渲染时才去读 ctx.uiWorkspace（见 RegionActions）。
      official: officialActions,
    }
  }

  // 样式随插件挂载注入；卸载由模块系统的样式记账处理，无需显式移除。
  insertStyles()

  /**
   * 二级菜单面板的展开方向标记
   *
   * 对照模式下区域在右侧栏、贴近窗口右缘，官方 Menu 的二级面板固定
   * 向右展开会开出屏幕外，样式表只在该标记下把面板翻向左侧。
   * 用编译期常量做参考而不是运行期测量：宿主列由 COMPARE_MODE 唯一
   * 决定，插件卸载时 effect 收尾会摘掉标记
   */
  ctx.effect(
    () => {
      if (typeof document === 'undefined' || !COMPARE_MODE) return () => {}
      document.body.setAttribute('data-wg-menu-flip', '')
      return () => {
        document.body.removeAttribute('data-wg-menu-flip')
      }
    },
    'workspace-groups: menu flip marker',
  )

  // 对照模式：把左侧 `sidebar.workspaces` 交还官方 ui-workspace，
  // 本区域改挂进 dsh-better-sidebar 的右侧栏 tab，好和官方渲染同屏比对。
  if (COMPARE_MODE) {
    ctx.effect(
      () => registerCompareTab(ctx, injected(), locale),
      'workspace-groups: compare tab',
    )
    return
  }

  // 接替模式：priority: -1 —— 覆盖官方 ui-workspace（其优先级为默认 0）。
  // `locale: NS` 让 shell 在渲染期注入本包命名空间的 `t` 座位；官方
  // `workspace` 语言包不另占座位，由 officialActions 自行 bind（见那里）。
  ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register(
      { name: 'sidebar.workspaces', priority: -1, inject: injected, locale: NS },
      WorkspaceGroupsRegion as never,
    ),
  )
}

export type { SessionListState }
