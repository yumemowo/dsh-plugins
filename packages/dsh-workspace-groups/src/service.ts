import type { Context } from '@deepseek-ai/cordis'
import { workspaceGroupsSpec } from './spec.ts'
import type { Group, WorkspaceGroupsSnapshot } from './spec.ts'

/** 分组存储与变更操作的实现，注册为 `ctx.workspaceGroups` */
export interface WorkspaceGroupsService {
  /** 读取全部工作区的分组 */
  list(): Promise<WorkspaceGroupsSnapshot>
  /** 在工作区下新建一个分组 */
  createGroup(workspaceId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 重命名分组 */
  renameGroup(workspaceId: string, groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 删除分组；组内会话回到未分组，会话本身不受影响 */
  deleteGroup(workspaceId: string, groupId: string): Promise<WorkspaceGroupsSnapshot>
  /** 把会话移入分组；`groupId` 为 null 表示移出到未分组 */
  moveSession(workspaceId: string, sessionId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>
}

/** 生成一个分组 id；同工作区内唯一即可，无需全局唯一 */
function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 打开持久化域并构造服务
 *
 * 每次变更都以整份快照返回，调用方直接替换本地状态即可，无需自行推导差量
 * @param ctx - 已就绪 `storageDomain` 的插件上下文
 * @returns 服务实现
 */
export async function createWorkspaceGroupsService(ctx: Context): Promise<WorkspaceGroupsService> {
  const domain = await ctx.storageDomain.open(workspaceGroupsSpec)
  ctx.effect(() => () => domain.close(), 'workspace-groups: domain close')
  const table = domain.table('by_workspace')

  /** 读取全部记录，按 workspaceId 归集 */
  function snapshot(): WorkspaceGroupsSnapshot {
    const byWorkspace: Record<string, Group[]> = {}
    for (const [workspaceId, record] of table.entries()) {
      byWorkspace[workspaceId] = record.groups
    }
    return { byWorkspace }
  }

  /** 取某工作区的分组；不存在时视为空列表，不写盘 */
  function groupsOf(workspaceId: string): Group[] {
    return table.get(workspaceId)?.groups ?? []
  }

  /** 写回某工作区的分组；空列表表示删除该记录 */
  async function save(workspaceId: string, groups: Group[]): Promise<WorkspaceGroupsSnapshot> {
    if (groups.length === 0) await table.delete(workspaceId)
    else await table.put(workspaceId, { groups })
    return snapshot()
  }

  return {
    async list() {
      return snapshot()
    },

    async createGroup(workspaceId, name) {
      const groups = groupsOf(workspaceId)
      groups.push({ id: newGroupId(), name, sessionIds: [] })
      return save(workspaceId, groups)
    },

    async renameGroup(workspaceId, groupId, name) {
      const groups = groupsOf(workspaceId).map((group) =>
        group.id === groupId ? { ...group, name } : group,
      )
      return save(workspaceId, groups)
    },

    async deleteGroup(workspaceId, groupId) {
      // 只删除分组本身：组内会话回到未分组，会话与工作区归属都不受影响。
      const groups = groupsOf(workspaceId).filter((group) => group.id !== groupId)
      return save(workspaceId, groups)
    },

    async moveSession(workspaceId, sessionId, groupId) {
      // 先在所有分组中摘除该会话，保证一个会话至多属于一个分组。
      const groups = groupsOf(workspaceId).map((group) => ({
        ...group,
        sessionIds: group.sessionIds.filter((id) => id !== sessionId),
      }))
      if (groupId !== null) {
        const target = groups.find((group) => group.id === groupId)
        if (target === undefined) throw new Error(`unknown group "${groupId}" in workspace "${workspaceId}"`)
        target.sessionIds.push(sessionId)
      }
      return save(workspaceId, groups)
    },
  }
}
