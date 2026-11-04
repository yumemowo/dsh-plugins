/**
 * 工作区分组插件的宿主半边
 *
 * 职责：
 *  1. 通过 `ctx.storageDomain` 打开分组域
 *     落在 `$DSH_HOME/storages/workspace_plus.json`
 *  2. 把实现注册为 `ctx.workspacePlus` 服务
 *  3. 挂上 `typertRemote` 绑定，使 `./typert` 清单能把它经网关暴露给浏览器
 *  4. 分叉出的会话跟着源会话落进同一个分组
 *
 * 浏览器半边另有出口（`exports["./client"]`），由 Web 客户端加载，注册进侧边栏的 `sidebar.workspaces` 区域
 */
import type { Context } from '@deepseek-ai/cordis'
// 引入 dsh-session 的事件声明，ctx.on 才认得 'session/created' 这个事件名；纯类型导入，产物里没有这一句
import type {} from '@deepseek-ai/dsh-session'
import { Config } from './config.ts'
import type { WorkspacePlusConfig } from './config.ts'
import { placeForkedSession } from './forkPlacement.ts'
import type { CreatedSession, SessionOwners } from './forkPlacement.ts'
import { createWorkspaceGroupsService } from './service.ts'
import type { WorkspaceGroupsService } from './service.ts'
import { createSnapshotFeed } from './snapshotFeed.ts'

/** 插件名，用于 fiber 诊断与日志前缀 */
export const name = 'workspace-plus'

/**
 * 分组存储依赖宿主已挂载的存储域设施
 *
 * 工作区注册表可选：它只在分叉落位时用来判断「这个会话是否已经属于某个工作区」
 * 缺席时那一步跳过，分组本身的读写不依赖它
 */
export const inject = ['storageDomain']

/** 行配置 schema，对外导出以供加载器校验 `config` */
export { Config }
export type { WorkspacePlusConfig }

export type { EntryAddress, RootEntryAddress } from './rootEntry.ts'
export type {
  Group,
  PickerSnapshot,
  VirtualWorkspace,
  WorkspaceGroupsSnapshot,
  WorkspaceNesting,
} from './spec.ts'
export type { WorkspaceGroupsService } from './service.ts'
export type { CreatedSession, ForkPlacementInput, SessionOwners } from './forkPlacement.ts'
export type { SnapshotChange } from './snapshotFeed.ts'

/**
 * 把分叉出的会话落进源会话所在的分组
 *
 * 判据与写入在 `forkPlacement.ts` 里，这里只把会话创建那一刻接上去
 *
 * 监听器全程异步并把 rejection 接住：`session/created` 的同步抛出会否决这次会话创建并连带回滚
 * 归组失败因此只留痕，不让分叉本身失败
 *
 * @param ctx - 宿主 context
 * @param service - 分组服务的异步入口
 */
function watchForkedSessions(
  ctx: Context,
  service: Promise<WorkspaceGroupsService>,
): void {
  ctx.effect(
    () =>
      ctx.on('session/created', (session: CreatedSession) => {
        void placeForkedSession(
          service,
          ctx.get('workspaceRegistry') as SessionOwners | undefined,
          session,
        ).catch((reason: unknown) => {
          // 用 error 而不是 warn：cordis 的 exporter 按阈值过滤，warn 的级别在默认配置下会被丢弃
          ctx.logger.error('workspace-plus: fork placement failed', reason)
        })
      }),
    'workspace-plus: fork placement',
  )
}

/**
 * 插件入口
 * @param ctx - 插件自身的 context，作用域限于本行
 * @param config - 已按 {@link Config} 校验过的行配置
 */
export function apply(ctx: Context, config: WorkspacePlusConfig = Config({})): void {
  // 快照的写入信号通道：写入侧（域变更订阅）与读取侧（服务方法）共用同一个实例
  const feed = createSnapshotFeed()
  // 域打开是异步的，而 apply 是同步的，先提供一个转发到打开结果的外观对象，这样服务在 Cordis 眼里立即可用，调用方无需感知打开时序
  const service = createWorkspaceGroupsService(ctx, config, feed)

  const facade: WorkspaceGroupsService = {
    list: async () => (await service).list(),
    createGroup: async (workspaceId, groupName) => (await service).createGroup(workspaceId, groupName),
    renameGroup: async (workspaceId, groupId, groupName) =>
      (await service).renameGroup(workspaceId, groupId, groupName),
    deleteGroup: async (workspaceId, groupId) => (await service).deleteGroup(workspaceId, groupId),
    moveSession: async (workspaceId, sessionId, groupId) =>
      (await service).moveSession(workspaceId, sessionId, groupId),
    setSegmentOrder: async (key, order) => (await service).setSegmentOrder(key, order),
    moveGroupBefore: async (workspaceId, groupId, beforeGroupId) =>
      (await service).moveGroupBefore(workspaceId, groupId, beforeGroupId),
    createVirtualWorkspace: async (groupName) => (await service).createVirtualWorkspace(groupName),
    moveVirtualWorkspaceBefore: async (groupId, beforeGroupId) =>
      (await service).moveVirtualWorkspaceBefore(groupId, beforeGroupId),
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
    focusEntry: async (address) => (await service).focusEntry(address),
    togglePinned: async (address) => (await service).togglePinned(address),
    // 直接走 feed：它与服务内部用的是同一个实例，不必等域打开
    followSnapshotChanges: (signal) => feed.follow(signal),
  }

  // typert-loader 按这份绑定把 facade 的方法挂到网关上
  Object.defineProperty(facade, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service: facade, serviceKey: 'workspacePlus', namespace: 'workspacePlus' },
  })

  ctx.provide('workspacePlus', facade)
  watchForkedSessions(ctx, service)
  ctx.logger.info('workspace-plus host half loaded')
}
