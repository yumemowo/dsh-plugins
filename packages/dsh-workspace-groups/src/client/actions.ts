/**
 * 区域所需的宿主数据与动作契约
 *
 * 数据走 shell 注入的全局 hook，动作与文案由插件入口闭合而成，因此区域组件不依赖 `ctx`
 * 既能渲染进 `sidebar.workspaces` 插槽，也能被对照模式挂进右侧栏 tab
 */
import type { ComponentType } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { WorkspaceGroupsSnapshot } from './remote.ts'
import type { HostInfo } from './hostInfo.ts'
import type { GroupChoice } from './data/types.ts'
import type { OfficialAddLabels, OfficialSessionLabels, SidebarTranslate, WorkspaceTranslate } from './official.ts'

/** 工作区状态快照里区域用到的部分 */
export interface WorkspaceState {
  items: readonly WorkspaceView[]
  archivedSessionIds: readonly string[]
}

/**
 * 官方 `sidebar.workspaces.directoryFlow` 洞的占用者面
 *
 * 官方 ui-workspace 声明了这个子洞（single 类型），目录选择器插件的浏览器半边注册进它
 * `-native` 是驱动 OS 选择器的无渲染占用者，`-browse` 是应用内浏览对话框
 * 本包接替父插槽后那条注册仍在 ledger 里，洞的声明与占用者因此都还在
 * 可以直接借用官方的整段 picking 交互，而不是自己再实现一遍
 */
export interface DirectoryFlowOccupant {
  /** 占用者组件；除 owner 会话外还接收下面那份 inject 面 */
  component: ComponentType<DirectoryFlowOwner>
  /**
   * 占用者自己的 inject 面
   *
   * 随 props 一起交给它，与渲染器给插槽注册项传播 inject 的做法一致：
   * native 那份读 `pick`
   * browse 那份读 `listDirectory` / `createDirectory` 与自己的 `t`
   * 占用者因此不需要知道自己被谁渲染
   */
  inject: () => Record<string, unknown>
}

/**
 * directoryFlow 洞的占用者读数
 *
 * 渲染器会把注册项的 inject 结果缓存整个注册生命周期，所以这里是函数而不是值
 * 而目录选择器插件的加载顺序不受本包约束，延迟到渲染期读才拿得到在场的占用者
 */
export type DirectoryFlowResolver = () => DirectoryFlowOccupant | undefined

/**
 * directoryFlow 洞的 owner 会话：一次 picking 请求与一个结果
 *
 * 与官方 `DirectoryFlowOwnerProps` 同形，占用者按这套 props 渲染
 */
export interface DirectoryFlowOwner {
  /** 为真表示请求了一次 picking 交互；翻回 false 即撤回请求 */
  open: boolean
  /** 为真表示 owner 正在采纳选中的路径，占用者据此禁用提交入口 */
  busy: boolean
  /** 用户选中了一个目录（宿主绝对路径） */
  onPicked: (path: string) => void
  /** 用户放弃了这次交互 */
  onCancel: () => void
  /** 交互本身失败（选择器缺失、列目录被拒） */
  onError: (message: string) => void
}

/** 侧边栏 shell 注入的全局数据 hook */
export interface RegionDataHooks {
  /** 全局工作区快照选择器；归档集合与工作区行来自同一份快照 */
  useWorkspaces: (selector: (state: WorkspaceState) => unknown) => unknown
  /** 全局会话列表选择器 */
  useSessions: (selector: (state: SessionListState) => unknown) => unknown
  /** 会话级待交互快照选择器：等待审批 / 计划审阅 / 等待回答 */
  useSessionPendingInteraction: (
    selector: (state: SessionPendingInteractionSnapshot) => unknown,
  ) => unknown
  /**
   * directoryFlow 洞是否被占用
   *
   * 目录选择器插件的加载顺序不受本包约束，入口按钮要跟着它出现，因此占用与否必须可订阅
   * 与官方 `DirectoryPickingInjected` 同一套做法：源放在 inject 面的 `hooks` 隔间里，由渲染器绑成这个选择器
   */
  useDirectoryFlow: (selector: (occupied: boolean) => unknown) => unknown
  /**
   * 宿主固定事实（home 目录）的选择器
   *
   * 工作区悬停卡片要像官方一样把 home 下的路径缩写成 `~`
   * 与官方 `WorkspaceBrowserInjected` 的 `hostInfo` 同一个源 —— `ctx.remote.$host`
   * 连接重置时重新读，同样经 inject 面的 `hooks` 隔间绑成选择器
   */
  useHostInfo: (selector: (info: HostInfo) => unknown) => unknown
}

/** 区域组件需要的动作 */
export interface RegionActions {
  /**
   * 打开一个会话
   */
  openSession: (sessionId: string) => void
  /**
   * 在指定工作区开一个新会话
   *
   * 走官方导航服务的 `openWorkspace`：它复用该工作区已有的空白会话，没有才新建
   * 并把它选中打开，后发的新建请求会取代先发的
   *
   * 返回会话 id 而不是空，是因为调用方要在建好之后把它摆到本次创建指定的位置（分组内或未分组）
   * 归组走既有的 `moveSession`，不另造「在分组内建会话」的宿主接口
   * 返回 undefined 表示这次导航已被更晚的一次取代：会话虽已建好但不打开，调用方因此也不摆位置
   * @param workspaceId - 新会话所属工作区
   * @returns 新建或复用的会话 id；被取代时为 undefined
   */
  startSession: (workspaceId: string) => Promise<string | undefined>
  /** 读取分组快照 */
  loadGroups: () => Promise<WorkspaceGroupsSnapshot>
  /** 远程数据面就绪后回调一次；返回反注册函数 */
  onReady: (listener: () => void) => () => void
  /** 在工作区下新建会话分组；返回替换用的完整快照 */
  createGroup: (workspaceId: string, name: string) => Promise<WorkspaceGroupsSnapshot>
  /** 重命名会话分组；返回替换用的完整快照 */
  renameGroup: (workspaceId: string, groupId: string, name: string) => Promise<WorkspaceGroupsSnapshot>
  /** 删除会话分组，组内会话回到未归组；返回替换用的完整快照 */
  deleteGroup: (workspaceId: string, groupId: string) => Promise<WorkspaceGroupsSnapshot>
  /**
   * 把会话移入分组；空串表示移出分组
   *
   * 返回替换用的完整快照，而不是让调用方再拉一次：宿主每个变更方法本来就回整份快照（见宿主 `service.ts`）
   * 直接采用它既少一次往返，也让「摆位置」与「本地状态反映新位置」之间没有空档
   */
  moveSession: (
    workspaceId: string,
    sessionId: string,
    groupId: GroupChoice,
  ) => Promise<WorkspaceGroupsSnapshot>
  /** 在根节点新建工作区分组；返回替换用的完整快照 */
  createVirtualWorkspace: (name: string) => Promise<WorkspaceGroupsSnapshot>
  /** 重命名工作区分组；返回替换用的完整快照 */
  renameVirtualWorkspace: (groupId: string, name: string) => Promise<WorkspaceGroupsSnapshot>
  /** 删除工作区分组，组内工作区回到未归组；返回替换用的完整快照 */
  deleteVirtualWorkspace: (groupId: string) => Promise<WorkspaceGroupsSnapshot>
  /** 把工作区移入分组；空串表示移出分组 */
  moveWorkspace: (workspaceId: string, groupId: GroupChoice) => Promise<WorkspaceGroupsSnapshot>
  /**
   * 把一个工作区从所有工作区分组里摘除
   *
   * 删除工作区时调用：工作区没了，它留下的归属记录再也不会被渲染
   */
  forgetWorkspace: (workspaceId: string) => Promise<WorkspaceGroupsSnapshot>
  /**
   * 聚焦一个根节点条目，并把它记入最近使用
   *
   * 条目既可能是工作区也可能是工作区分组，因此参数是条目键而不是 id
   * 键自带类别前缀，不会被两套 id 的取值混淆
   * @param key - 条目键；空串表示退回「全部」
   */
  focusEntry: (key: string) => Promise<WorkspaceGroupsSnapshot>
  /** 切换一个根节点条目的置顶；置顶与取消置顶是同一个方法 */
  togglePinned: (key: string) => Promise<WorkspaceGroupsSnapshot>
  /** 重命名工作区 */
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  /** 删除工作区注册；文件夹与会话记录保留 */
  deleteWorkspace: (workspaceId: string) => Promise<void>
  /**
   * 搜索结果的条数上限
   *
   * 取官方会话控制器上的 `searchResultLimit`：它是 `session.search` 线上响应契约固定下来的同一个数
   * 本包的结果虽然全部来自本地，也照它截断，界面因此与官方一致
   */
  searchResultLimit: number
  /**
   * 官方 `workspace` 命名空间的翻译函数
   *
   * 由插件入口 `locale.bind('workspace')` 得到。绑定结果是稳定引用，且在调用时才读当前语言
   * 被缓存的是函数而非投影后的文案表，因此可以安全地随 inject 结果一起缓存，语言切换后调用它自然读到新语言
   * 本包命名空间的 `t` 走插槽座位（见 `WorkspaceGroupsProps`），官方这份不占座位
   */
  tWorkspace: WorkspaceTranslate
  /**
   * 官方 `sidebar` 命名空间的翻译函数
   *
   * 容器行的右键菜单要复用官方新建会话按钮的动词短语（`session.new.label`），那个键在 `sidebar` 命名空间里
   * 与 `tWorkspace` 同为稳定引用、调用时才读当前语言
   */
  tSidebar: SidebarTranslate
  /**
   * 官方三项会话操作与相对时间的解析器
   *
   * 是函数而不是值：渲染器会把注册项的 inject 结果缓存整个注册生命周期，因此在 inject 里读到的服务会冻结在首次渲染那一刻
   * 而官方 `ui-workspace` 的加载顺序并不受本包约束，延迟到渲染时解析才能拿到真正在场的服务
   *
   * 解析结果为空表示宿主没有加载官方 `ui-workspace`（本包用它供的 `useWorkspaces` 等全局 hook，正常情况下必然在场）
   * 此时菜单里那三项与行尾时间整体不渲染，而不是留下点不动的入口
   */
  official?: (() => OfficialSessionActions | undefined) | undefined
  /**
   * 「添加工作区」所需的官方服务面
   *
   * 与 `official` 同为延迟解析器
   * 解析结果为空表示本包没读到官方 directoryFlow 洞的占用者（宿主没装目录选择器，或官方注册不在场）
   * 此时入口按钮不渲染，不留点不动的死按钮
   */
  addWorkspace?: (() => AddWorkspaceActions | undefined) | undefined
}

/**
 * 「添加工作区」直接转调的官方接口
 *
 * 采纳走官方工作区控制器的 `create`，选中后在建好的工作区里开新会话
 * 两处都是官方 WorkspaceBrowser 内部调的同一批接口，因此官方改行为时本包自动跟随，不另造 RPC
 */
export interface AddWorkspaceActions {
  /** 把选中的宿主机目录登记为工作区 */
  createWorkspace: (path: string) => Promise<{ workspaceId: string }>
  /** 在指定工作区里开一个新会话并打开它 */
  startSession: (workspaceId: string) => void
  /** directoryFlow 洞占用者的解析器 */
  occupant: DirectoryFlowResolver
  /** 入口与错误框的文案 */
  labels: OfficialAddLabels
}

/**
 * 官方 `ui-workspace` 提供的会话操作
 *
 * 直接转调官方服务与控制器（`ctx.uiWorkspace` / `ctx.sessions`），不自行实现，官方改行为时本包自动跟随
 */
export interface OfficialSessionActions {
  /** 官方菜单「重命名」；宿主负责弹出输入与提交 */
  renameSession: (sessionId: string, title: string) => Promise<void>
  /** 官方菜单「分叉会话」；官方会打开分叉出的子会话 */
  forkSession: (sessionId: string) => void
  /** 官方菜单「归档会话」 */
  archiveSession: (sessionId: string) => Promise<void>
  /** 官方三项操作与重命名对话框的文案 */
  labels: OfficialSessionLabels
  /**
   * 格式化为官方风格的相对时间
   * @param updatedAt - 会话最近更新时间（epoch ms）
   * @param now - 当前时刻（epoch ms）
   */
  relativeTime: (updatedAt: number, now: number) => string
}
