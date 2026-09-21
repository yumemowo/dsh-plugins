/**
 * 工作区分组插件的浏览器半边
 *
 * 注册进侧边栏 shell 的 `sidebar.workspaces` 区域。该插槽是 `single` 类型：
 * 同一优先级重复注册会抛错，且**数值更低的优先级渲染**。官方 ui-workspace
 * 用默认优先级 0，本包以 `priority: -1` 成为渲染者
 *
 * 本包自己不声明任何子插槽：`sidebar.workspaces.directoryFlow` 已被
 * ui-workspace 声明，而一个插槽只能有一个声明者，重复声明会直接抛错
 * 「添加工作区」因此复用官方那个洞：接替父插槽只是不再渲染官方组件，官方
 * 那条注册仍留在 ledger 里，洞的声明与占用者（native / browse 目录选择器）
 * 都还在，本包直接取它的占用者渲染
 *
 * 文案走两条官方路径：本包自己的 `workspaceGroups` 命名空间由
 * `locale.register` 注册，组件从插槽注入的 `t` 座位取用（渲染期绑定
 * 语言切换后自动重新渲染）；会话行的固定名（空白行显示官方「新会话」）
 * 那三项官方操作的文案、以及相对时间都直接绑官方 `workspace` 命名空间
 * 官方改文案时本包逐键跟随
 *
 * 新建会话不自行拼流程，而是走官方导航服务 `ctx.uiWorkspace`：它复用目标
 * 工作区已有的空白会话，与官方 WorkspaceBrowser 的「新建」是同一条路径
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
// 仅用于引入 ui-renderer 的客户端类型增强（ctx.slots 等）
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// 仅用于引入 sidebar 的插槽声明增强（sidebar.workspaces 的 SlotMap 条目）
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// 仅用于引入官方 workspace 语言包的键域声明（LocaleNamespaceMap）与
// ctx.uiWorkspace 的服务类型——本包复用官方文案与官方动作，靠这份声明让
// 官方改键名时在 tsc 阶段就暴露，而不是运行期显示原始键名
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { REMOTE_CONTRIBUTION, SERVICE, callRemote, normalizeSnapshot } from './remote.ts'
import { EMPTY_PICKER_STATE } from '../pickerState.ts'
import type { WorkspaceGroupsSnapshot } from './remote.ts'
import { registerCompareTab } from './compare.tsx'
import { NS, en, zh } from './locales.ts'
import { officialAddLabels, officialSessionLabels, timeLabel } from './official.ts'
import type { RegionActions, AddWorkspaceActions, OfficialSessionActions } from './actions.ts'
import { directoryFlowOccupant, directoryFlowSource } from './directoryFlow.ts'
import { hostInfoSource } from './hostInfo.ts'
import { WorkspaceGroupsRegion } from './components/WorkspaceGroupsRegion.tsx'
import { insertStyles } from './styles.ts'

/** 浏览器半边声明的服务依赖 */
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'remote']

/** 远程面缺失或依赖不全时的空快照：两个字段都空，界面退化成全部平铺 */
const EMPTY_SNAPSHOT: WorkspaceGroupsSnapshot = {
  byWorkspace: {},
  workspaceGroups: [],
  picker: EMPTY_PICKER_STATE,
}

/**
 * 对照模式开关
 *
 * `true` 时左侧 `sidebar.workspaces` 交还官方 ui-workspace，本区域改挂进
 * `dsh-better-sidebar` 的右侧栏 tab，便于和官方渲染同屏比对；
 * `false` 时维持 `priority: -1` 接替左侧区域
 *
 * 之所以是编译期常量而不是配置项：这是开发期的对照开关
 * 不是要交付给用户的能力，配置化反而要多一套 schema 与文档
 */
// export const COMPARE_MODE = false
export const COMPARE_MODE = true

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
   * 区域组件的首次拉取可能早于 `$mount` 完成；就绪时这里发布一次
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
      /** `$mount` 的卸载函数；挂载完成前一直是 undefined */
      let unmount: (() => Promise<void>) | undefined
      void ctx.remote
        .$mount(REMOTE_CONTRIBUTION as never)
        .then((dispose) => {
          // 卸载早于挂载落地时必须当场退回这次挂载：`$mount` 的 effect 挂在
          // 网关自己那一侧的 context 上（不是本包 fiber），丢掉卸载函数等于
          // 让它永久留着，热重载后的第二次挂载会撞上「已挂载」而整体失效
          if (disposed) {
            void dispose()
            return
          }
          unmount = dispose
          // 服务键按 descriptor 的 namespace 注册（remote.<namespace>）
          // 不是包名——typert 网关以 namespace 归组安装方法表
          groupsApi = ctx.get(`remote.${SERVICE}`) as typeof groupsApi
          for (const listener of [...readyListeners]) listener()
          readyListeners.clear()
        })
        .catch((reason: unknown) => {
          // 挂载失败必须留下可查的痕迹：它让分组整体不可用，不接住这次
          // rejection 的话日志里什么都没有
          ctx.logger.warn('workspace-groups: remote mount failed')
          ctx.logger.warn(reason)
        })
      return () => {
        disposed = true
        groupsApi = undefined
        // 卸载是异步的；调用方不必等它，但必须发起
        void unmount?.()
      }
    },
    'workspace-groups: remote mount',
  )

  // 官方 `workspace` 命名空间的翻译函数：绑定结果是稳定引用，且**在调用时
  // 才读当前语言**，因此可以放心地随 inject 结果或渲染期解析一起缓存——
  // 被缓存的是函数，不是投影后的文案表，语言切换后调用它自然读到新语言
  const tWorkspace = locale.bind('workspace')
  // 容器行右键菜单里的「新建会话」取官方 sidebar 新建按钮的动词短语，那个键
  // 在 `sidebar` 命名空间；绑定语义同上
  const tSidebar = locale.bind('sidebar')

  const requireApi = (): Record<string, (...args: never[]) => Promise<never>> => {
    if (groupsApi === undefined) throw new Error('workspace-groups remote is not ready')
    return groupsApi
  }

  /**
   * 上一次解析出的官方动作对象及其依据的服务
   *
   * 官方 `ui-workspace` 是单例，同一个服务期间复用同一个对象即可
   */
  let cachedOfficial: { service: UiWorkspace; value: OfficialSessionActions } | undefined

  /**
   * 调一个宿主方法并取回完整形状的快照
   *
   * 每个方法都回整份快照，因此收口在这里统一补齐缺格：浏览器半边热重载会换到
   * 新客户端，而宿主半边要重启 `dsh` 才换，中间那段窗口里收到的是旧形状
   *（没有 `workspaceGroups`），缺格不补会在遍历时抛错、把整片区域打挂
   * @param method - 宿主方法名
   * @param args - 该方法的参数
   * @returns 两个字段都在的快照
   */
  const callSnapshot = async (
    method: string,
    args: unknown[] = [],
  ): Promise<WorkspaceGroupsSnapshot> => {
    return normalizeSnapshot(await callRemote<unknown>(requireApi(), method, args))
  }

  const loadGroups = (): Promise<WorkspaceGroupsSnapshot> => callSnapshot('list')

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
    const uiWorkspace = ctx.get('uiWorkspace') as UiWorkspace | undefined
    if (uiWorkspace === undefined || sessions === undefined) return undefined

    // 服务没换人时复用同一个对象：这一格会传进行级 memo 的比对，每次渲染新建一个会
    // 让每一行都判定为变过
    if (cachedOfficial !== undefined && cachedOfficial.service === uiWorkspace) {
      return cachedOfficial.value
    }

    const value: OfficialSessionActions = {
      // 重命名没有走 uiWorkspace：官方把这条留在会话对象上，菜单里也是
      // 同一个入口。走 binding 而不是另造 RPC，接受规范化与错误语义
      renameSession: async (sessionId, title) => {
        const face = sessions.binding(sessionId as never)?.session
        if (face === undefined) throw new Error(`unknown session "${sessionId}"`)
        const result = await face.rename(title)
        if (!result.ok) throw new Error(result.error.message)
      },
      // 官方菜单把 fork 的失败咽掉（分叉失败不该弹错），这里保持同一行为
      forkSession: (sessionId) => {
        void uiWorkspace.forkSession(sessionId as never).catch(() => {})
      },
      archiveSession: (sessionId) => uiWorkspace.archiveSession(sessionId as never),
      // 文案在**取用时**才投影，不是在造这个对象时：绑定结果在调用时才读当前
      // 语言，写成取值器就能既复用对象、又让切换语言后的下一次读取拿到新译文
      get labels() {
        return officialSessionLabels(tWorkspace)
      },
      relativeTime: (updatedAt, now) => timeLabel(updatedAt, now, tWorkspace),
    }
    cachedOfficial = { service: uiWorkspace, value }
    return value
  }

  /**
   * 「添加工作区」的复用面
   *
   * 采纳调官方工作区控制器的 `create`，选中后调官方 `uiWorkspace.startSession`
   * 在新工作区里开会话——两处正是官方 WorkspaceBrowser 内部调的同一批接口
   * picking 交互整段借用官方 `sidebar.workspaces.directoryFlow` 洞的占用者：
   * 本包接替父插槽并未清除官方那条注册，因此洞的声明与占用者都还在（见
   * `directoryFlow.ts`）
   *
   * 与 `officialActions` 同为延迟到渲染期的解析器。解析结果为空表示本包没读到
   * 占用者（宿主没装目录选择器插件）：此时入口按钮整体不渲染，不留点不动的
   * 死按钮
   * @returns 添加工作区的动作；控制器或洞占用者缺失时为 undefined
   */
  const addWorkspaceActions = (): AddWorkspaceActions | undefined => {
    if (workspaces === undefined) return undefined
    if (directoryFlowOccupant(ctx.slots) === undefined) return undefined
    const uiWorkspace = ctx.get('uiWorkspace') as UiWorkspace | undefined
    return {
      createWorkspace: (path) => workspaces.create({ path }),
      // 官方在采纳成功后立刻在新工作区开会话；uiWorkspace 缺失时退化为只添加
      // 不替它找一个「差不多」的替代入口
      startSession: (workspaceId) => uiWorkspace?.startSession(workspaceId as never),
      // 传解析器而不是当次读数：占用者可能在两次渲染之间换人
      occupant: () => directoryFlowOccupant(ctx.slots),
      labels: officialAddLabels(tWorkspace),
    }
  }

  /**
   * 注入面
   *
   * 除动作外还带一个 `hooks` 隔间：渲染器会把里面的每个源绑成
   * `use<Source>` 选择器 hook 交给组件（`directoryFlow` → `useDirectoryFlow`
   * `hostInfo` → `useHostInfo`），官方 `WorkspaceBrowserInjected` 用的就是这套
   * 机制。洞的占用情况因此是可订阅的，目录选择器插件晚于本包加载时入口按钮照样
   * 会出现；宿主的 home 也同理可订阅（首个 ready 帧到达前是空的）
   */
  type InjectedFace = RegionActions & {
    hooks: {
      directoryFlow: ReturnType<typeof directoryFlowSource>
      hostInfo: ReturnType<typeof hostInfoSource>
    }
  }

  const injected = (): InjectedFace => {
    const hooks = {
      directoryFlow: directoryFlowSource(ctx.slots),
      hostInfo: hostInfoSource(ctx),
    }
    if (sessions === undefined || workspaces === undefined) {
      // 依赖缺失时给出空实现：组件仍可渲染，只是没有可操作的动作
      return {
        openSession: () => {},
        startSession: async () => {
          throw new Error('workspace-groups requires the workspace and session controllers')
        },
        onReady: () => () => {},
        loadGroups: async () => EMPTY_SNAPSHOT,
        createGroup: async () => EMPTY_SNAPSHOT,
        renameGroup: async () => EMPTY_SNAPSHOT,
        deleteGroup: async () => EMPTY_SNAPSHOT,
        moveSession: async () => EMPTY_SNAPSHOT,
        createVirtualWorkspace: async () => EMPTY_SNAPSHOT,
        renameVirtualWorkspace: async () => EMPTY_SNAPSHOT,
        deleteVirtualWorkspace: async () => EMPTY_SNAPSHOT,
        moveWorkspace: async () => EMPTY_SNAPSHOT,
        forgetWorkspace: async () => EMPTY_SNAPSHOT,
        focusEntry: async () => EMPTY_SNAPSHOT,
        togglePinned: async () => EMPTY_SNAPSHOT,
        renameWorkspace: async () => {},
        deleteWorkspace: async () => {},
        // 会话控制器缺失时退回线上契约里那个固定值（见 RegionActions）
        searchResultLimit: 20,
        tWorkspace,
        tSidebar,
        hooks,
      }
    }
    return {
      openSession: (sessionId: string) => {
        sessions.open(sessionId as never)
      },
      startSession: async (workspaceId: string) => {
        // 新建会话整段走官方导航服务：`openWorkspace` 复用该工作区已有的空白
        // 会话，没有才新建（官方 WorkspaceBrowser 的「新建」也是这条路径）
        // 因此连点两次不会攒出两条空会话；它内部还用 `ctx.layout` 起了导航
        // 守卫，点完立刻切走时这次新建会被取代，与官方行为一致
        //
        // 它返回 void，会话 id 因此从 `beforeOpen` 回调里取：官方只在这轮
        // 导航仍有效时才回调，被取代时回调不触发，id 停在 undefined
        const uiWorkspace = ctx.get('uiWorkspace') as UiWorkspace | undefined
        if (uiWorkspace === undefined) {
          throw new Error('workspace-groups requires the uiWorkspace service')
        }
        let target: string | undefined
        await uiWorkspace.openWorkspace(workspaceId as never, (sessionId) => {
          target = String(sessionId)
        })
        return target
      },
      onReady,
      loadGroups,
      createGroup: (workspaceId, name) => callSnapshot('createGroup', [workspaceId, name]),
      renameGroup: (workspaceId, groupId, name) =>
        callSnapshot('renameGroup', [workspaceId, groupId, name]),
      deleteGroup: (workspaceId, groupId) => callSnapshot('deleteGroup', [workspaceId, groupId]),
      // 选择器用空串表示「不属于任何分组」，宿主接口用 null 表达同一含义
      moveSession: (workspaceId, sessionId, groupId) =>
        callSnapshot('moveSession', [workspaceId, sessionId, groupId === '' ? null : groupId]),
      createVirtualWorkspace: (name) => callSnapshot('createVirtualWorkspace', [name]),
      renameVirtualWorkspace: (groupId, name) =>
        callSnapshot('renameVirtualWorkspace', [groupId, name]),
      deleteVirtualWorkspace: (groupId) => callSnapshot('deleteVirtualWorkspace', [groupId]),
      moveWorkspace: (workspaceId, groupId) =>
        callSnapshot('moveWorkspace', [workspaceId, groupId === '' ? null : groupId]),
      forgetWorkspace: (workspaceId) => callSnapshot('forgetWorkspace', [workspaceId]),
      focusEntry: (key) => callSnapshot('focusEntry', [key]),
      togglePinned: (key) => callSnapshot('togglePinned', [key]),
      // 工作区自身的改名与删除直接走官方工作区控制器，不另造 RPC：
      // 删除只移除注册，文件夹与会话记录都由宿主保留
      renameWorkspace: (workspaceId, title) =>
        workspaces.rename(workspaceId as never, title).then(() => undefined),
      deleteWorkspace: (workspaceId) => workspaces.delete(workspaceId as never),
      // 结果条数上限直接读官方控制器上的那一格，不自己定一个数：它就是线上
      // 响应契约里的上限，官方改它时本包自动跟随
      searchResultLimit: sessions.searchResultLimit,
      tWorkspace,
      tSidebar,
      // 传解析器而不是值：渲染时才去读 ctx.uiWorkspace（见 RegionActions）
      official: officialActions,
      // 同为解析器：它还要去读官方 directoryFlow 洞的占用者
      addWorkspace: addWorkspaceActions,
      hooks,
    }
  }

  // 样式随插件挂载注入；卸载由模块系统的样式记账处理，无需显式移除
  insertStyles()

  // 对照模式：把左侧 `sidebar.workspaces` 交还官方 ui-workspace
  // 本区域改挂进 dsh-better-sidebar 的右侧栏 tab，好和官方渲染同屏比对
  if (COMPARE_MODE) {
    ctx.effect(
      () => registerCompareTab(ctx, injected(), locale),
      'workspace-groups: compare tab',
    )
    return
  }

  // 接替模式：priority: -1 —— 覆盖官方 ui-workspace（其优先级为默认 0）
  // `locale: NS` 让 shell 在渲染期注入本包命名空间的 `t` 座位；官方
  // `workspace` 语言包不另占座位，由 officialActions 自行 bind（见那里）
  ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register(
      { name: 'sidebar.workspaces', priority: -1, inject: injected, locale: NS },
      WorkspaceGroupsRegion as never,
    ),
  )
}

export type { SessionListState }
