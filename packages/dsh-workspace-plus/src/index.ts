/**
 * 工作区分组插件的宿主半边
 *
 * 职责：
 *  1. 通过 `ctx.storageDomain` 打开分组域
 *     落在 `$DSH_HOME/storages/workspace_plus.json`
 *  2. 把实现注册为 `ctx.workspacePlus` 服务
 *  3. 挂上 `typertRemote` 绑定，使 `./typert` 清单能把它经网关暴露给浏览器
 *
 * 浏览器半边另有出口（`exports["./client"]`），由 Web 客户端加载，注册进侧边栏的 `sidebar.workspaces` 区域
 *
 * @module @yumemowo/dsh-workspace-plus
 */
import type { Context } from '@deepseek-ai/cordis'
import { createWorkspaceGroupsService } from './service.ts'
import type { WorkspaceGroupsService } from './service.ts'

/** 插件名，用于 fiber 诊断与日志前缀 */
export const name = 'workspace-plus'

/** 分组存储依赖宿主已挂载的存储域设施 */
export const inject = ['storageDomain']

export type {
  Group,
  PickerSnapshot,
  VirtualWorkspace,
  WorkspaceGroupsSnapshot,
  WorkspaceNesting,
} from './spec.ts'
export type { WorkspaceGroupsService } from './service.ts'

/**
 * 插件入口
 */
export function apply(ctx: Context): void {
  // 域打开是异步的，而 apply 是同步的，先提供一个转发到打开结果的外观对象，这样服务在 Cordis 眼里立即可用，调用方无需感知打开时序
  const service = createWorkspaceGroupsService(ctx)

  const facade: WorkspaceGroupsService = {
    list: async () => (await service).list(),
    createGroup: async (workspaceId, groupName) => (await service).createGroup(workspaceId, groupName),
    renameGroup: async (workspaceId, groupId, groupName) =>
      (await service).renameGroup(workspaceId, groupId, groupName),
    deleteGroup: async (workspaceId, groupId) => (await service).deleteGroup(workspaceId, groupId),
    moveSession: async (workspaceId, sessionId, groupId) =>
      (await service).moveSession(workspaceId, sessionId, groupId),
    createVirtualWorkspace: async (groupName) => (await service).createVirtualWorkspace(groupName),
    renameVirtualWorkspace: async (groupId, groupName) =>
      (await service).renameVirtualWorkspace(groupId, groupName),
    deleteVirtualWorkspace: async (groupId) => (await service).deleteVirtualWorkspace(groupId),
    moveWorkspace: async (workspaceId, groupId) =>
      (await service).moveWorkspace(workspaceId, groupId),
    nestWorkspaces: async (workspaceIds, parentWorkspaceId, groupId) =>
      (await service).nestWorkspaces(workspaceIds, parentWorkspaceId, groupId),
    unnestWorkspaces: async (workspaceIds) => (await service).unnestWorkspaces(workspaceIds),
    setNested: async (enabled) => (await service).setNested(enabled),
    forgetWorkspace: async (workspaceId) => (await service).forgetWorkspace(workspaceId),
    focusEntry: async (key) => (await service).focusEntry(key),
    togglePinned: async (key) => (await service).togglePinned(key),
  }

  // typert-loader 按这份绑定把 facade 的方法挂到网关上
  Object.defineProperty(facade, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service: facade, serviceKey: 'workspacePlus', namespace: 'workspacePlus' },
  })

  ctx.provide('workspacePlus', facade)
  ctx.logger.info('workspace-plus host half loaded')
}
