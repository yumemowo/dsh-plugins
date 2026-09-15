/**
 * 区域所需的宿主数据与动作契约
 *
 * 数据走 shell 注入的全局 hook，动作与文案由插件入口闭合而成：区域组件因此
 * 不依赖 `ctx`，既能在 `sidebar.workspaces` 插槽里渲染，也能被对照模式
 * 挂进右侧栏 tab
 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionPendingInteractionSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { Group } from './remote.ts'
import type { GroupChoice } from './data/types.ts'
import type { OfficialSessionLabels, WorkspaceTranslate } from './official.ts'

/** 工作区状态快照里区域用到的部分 */
export interface WorkspaceState {
  items: readonly WorkspaceView[]
  archivedSessionIds: readonly string[]
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
}

/** 区域组件需要的动作 */
export interface RegionActions {
  /** 打开一个会话 */
  openSession: (sessionId: string) => void
  /** 在指定工作区创建一个新会话 */
  startSession: (workspaceId: string) => void
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
