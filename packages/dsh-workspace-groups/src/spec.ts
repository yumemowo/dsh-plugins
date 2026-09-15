import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** 一个分组：稳定的标识、显示名，以及按顺序归属的会话 */
export const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionIds: z.array(z.string()),
})

/** 单个工作区的分组记录。会话未出现在任何分组时即为「未分组」 */
export const workspaceGroupsSchema = z.object({
  groups: z.array(groupSchema),
})

/**
 * 分组元数据的持久化声明
 *
 * 域与表名都受 `^[a-z][a-z0-9_]*$` 约束，因此用下划线而非连字符。
 * 表以 workspaceId 为主键，因此分组数据与工作区本身一一对应，
 * 不侵入 `workspaceRegistry` 的会话归属
 */
export const workspaceGroupsSpec = defineDomain({
  name: 'workspace_groups',
  version: 1,
  tables: { by_workspace: domainTable(workspaceGroupsSchema) },
})

/** 对外快照：按 workspaceId 索引的分组列表 */
export const snapshotSchema = z.object({
  byWorkspace: z.record(z.string(), z.array(groupSchema)),
})

export type Group = z.infer<typeof groupSchema>
export type WorkspaceGroupsSnapshot = z.infer<typeof snapshotSchema>
