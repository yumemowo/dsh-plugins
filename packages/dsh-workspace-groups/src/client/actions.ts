/**
 * 区域所需的宿主数据与动作契约
 *
 * 数据走 shell 注入的全局 hook，动作与文案由插件入口闭合而成：区域组件因此
 * 不依赖 `ctx`，既能在 `sidebar.workspaces` 插槽里渲染，也能被对照模式
 * 挂进右侧栏 tab
 */
import type { ComponentType } from 'react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { Group } from './remote.ts'
import type { GroupChoice } from './data/types.ts'
import type { OfficialAddLabels, OfficialSessionLabels, WorkspaceTranslate } from './official.ts'

/** 工作区状态快照里区域用到的部分 */
export interface WorkspaceState {
  items: readonly WorkspaceView[]
  archivedSessionIds: readonly string[]
}

/**
 * 官方 `sidebar.workspaces.directoryFlow` 洞的占用者面
 *
 * 官方 ui-workspace 声明了这个子洞（single 类型），目录选择器插件的浏览器
 * 半边注册进它：`-native` 是驱动 OS 选择器的无渲染占用者，`-browse` 是应用内
 * 浏览对话框。本包接替父插槽后那条注册仍在 ledger 里，洞的声明与占用者因此
 * 都还在，可以直接借用官方的整段 picking 交互，而不是自己再实现一遍
 */
export interface DirectoryFlowOccupant {
  /** 占用者组件；除 owner 会话外还接收下面那份 inject 面 */
  component: ComponentType<DirectoryFlowOwner>
  /**
   * 占用者自己的 inject 面
   *
   * 随 props 一起交给它，与渲染器给插槽注册项传播 inject 的做法一致：native
   * 那份读 `pick`，browse 那份读 `listDirectory` / `createDirectory` 与自己的
   * `t`。占用者因此不需要知道自己被谁渲染
   */
  inject: () => Record<string, unknown>
}

/**
 * directoryFlow 洞的占用者读数
 *
 * 是函数而不是值：渲染器会把注册项的 inject 结果缓存整个注册生命周期，
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
   * 目录选择器插件的加载顺序不受本包约束，入口按钮要跟着它出现，因此占用
   * 与否必须可订阅。与官方 `DirectoryPickingInjected` 同一套做法：源放在
   * inject 面的 `hooks` 隔间里，由渲染器绑成这个选择器
   */
  useDirectoryFlow: (selector: (occupied: boolean) => unknown) => unknown
}

/** 区域组件需要的动作 */
export interface RegionActions {
  /** 打开一个会话 */
  openSession: (sessionId: string) => void
  /**
   * 在指定工作区创建一个新会话
   *
   * 返回新会话 id 而不是空：分组行的 `+` 要在建好之后把会话归入自己的分组，
   * 归组走既有的 `moveSession`，不另造「在分组内建会话」的宿主接口
   * @param workspaceId - 新会话所属工作区
   * @returns 新会话 id
   */
  startSession: (workspaceId: string) => Promise<string>
  /** 读取分组快照 */
  loadGroups: () => Promise<Record<string, Group[]>>
  /** 远程数据面就绪后回调一次；返回反注册函数 */
  onReady: (listener: () => void) => () => void
  /** 新建分组 */
  createGroup: (workspaceId: string, name: string) => Promise<void>
  /** 重命名分组 */
  renameGroup: (workspaceId: string, groupId: string, name: string) => Promise<void>
  /** 删除分组；组内会话回到未归组 */
  deleteGroup: (workspaceId: string, groupId: string) => Promise<void>
  /** 把会话移入分组；空串表示移出分组 */
  moveSession: (workspaceId: string, sessionId: string, groupId: GroupChoice) => Promise<void>
  /** 重命名工作区 */
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  /** 删除工作区注册；文件夹与会话记录保留 */
  deleteWorkspace: (workspaceId: string) => Promise<void>
  /**
   * 官方 `workspace` 命名空间的翻译函数
   *
   * 由插件入口 `locale.bind('workspace')` 得到。绑定结果是稳定引用，且**在
   * 调用时才读当前语言**，因此可以安全地随 inject 结果一起缓存——被缓存的
   * 是函数而非投影后的文案表，语言切换后调用它自然读到新语言。本包命名空间
   * 的 `t` 走插槽座位（见 `WorkspaceGroupsProps`），官方这份不占座位。
   */
  tWorkspace: WorkspaceTranslate
  /**
   * 官方三项会话操作与相对时间的解析器
   *
   * 是函数而不是值：渲染器会把注册项的 inject 结果缓存整个注册生命周期，
   * 在 inject 里读到的服务会冻结在首次渲染那一刻，而官方 `ui-workspace`
   * 的加载顺序并不受本包约束。延迟到渲染时解析才能拿到真正在场的服务，
   *
   * 解析结果为空表示宿主没有加载官方 `ui-workspace`（本包用它供的
   * `useWorkspaces` 等全局 hook，正常情况下必然在场）；此时菜单里那三项与
   * 行尾时间整体不渲染，而不是留下点不动的入口
   */
  official?: (() => OfficialSessionActions | undefined) | undefined
  /**
   * 「添加工作区」所需的官方服务面
   *
   * 与 `official` 同为延迟解析器。解析结果为空表示本包没读到官方
   * directoryFlow 洞的占用者（宿主没装目录选择器，或官方注册不在场）：
   * 此时入口按钮不渲染，回归本包阶段一的行为
   */
  addWorkspace?: (() => AddWorkspaceActions | undefined) | undefined
}

/**
 * 「添加工作区」直接转调的官方接口
 *
 * 采纳走官方工作区控制器的 `create`，选中后在建好的工作区里开新会话——
 * 两处都是官方 WorkspaceBrowser 内部调的同一批接口，因此官方改行为时本包
 * 自动跟随，不另造 RPC
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
 * 直接转调官方服务与控制器（`ctx.uiWorkspace` / `ctx.sessions`），不自行
 * 实现：官方改行为时本包自动跟随
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
