/**
 * 区域所需的宿主数据与动作契约。
 *
 * 数据走 shell 注入的全局 hook，动作与文案由插件入口闭合而成：区域组件因此
 * 不依赖 `ctx`，既能在 `sidebar.workspaces` 插槽里渲染，也能被对照模式
 * 挂进右侧栏 tab。
 */
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { Group } from './remote.ts'
import type { GroupChoice } from './data/types.ts'
import type { RegionLabels } from './labels.ts'

/** 工作区状态快照里区域用到的部分。 */
export interface WorkspaceState {
  items: readonly WorkspaceView[]
  archivedSessionIds: readonly string[]
}

/** 侧边栏 shell 注入的全局数据 hook。 */
export interface RegionDataHooks {
  /** 全局工作区快照选择器；归档集合与工作区行来自同一份快照。 */
  useWorkspaces: (selector: (state: WorkspaceState) => unknown) => unknown
  /** 全局会话列表选择器。 */
  useSessions: (selector: (state: SessionListState) => unknown) => unknown
}

/** 区域组件需要的动作与文案。 */
export interface RegionActions {
  /** 打开一个会话。 */
  openSession: (sessionId: string) => void
  /** 在指定工作区创建一个新会话。 */
  startSession: (workspaceId: string) => void
  /** 读取分组快照。 */
  loadGroups: () => Promise<Record<string, Group[]>>
  /** 远程数据面就绪后回调一次；返回反注册函数。 */
  onReady: (listener: () => void) => () => void
  /** 新建分组。 */
  createGroup: (workspaceId: string, name: string) => Promise<void>
  /** 重命名分组。 */
  renameGroup: (workspaceId: string, groupId: string, name: string) => Promise<void>
  /** 删除分组；组内会话回到未归组。 */
  deleteGroup: (workspaceId: string, groupId: string) => Promise<void>
  /** 把会话移入分组；空串表示移出分组。 */
  moveSession: (workspaceId: string, sessionId: string, groupId: GroupChoice) => Promise<void>
  /** 重命名工作区。 */
  renameWorkspace: (workspaceId: string, title: string) => Promise<void>
  /** 删除工作区注册；文件夹与会话记录保留。 */
  deleteWorkspace: (workspaceId: string) => Promise<void>
  /** 界面文案。 */
  labels: RegionLabels
}
