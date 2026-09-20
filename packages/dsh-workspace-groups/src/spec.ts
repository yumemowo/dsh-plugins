import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** 一个会话分组：稳定的标识、显示名，以及按顺序归属的会话 */
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
 * 一个工作区分组：把若干工作区打包在一起的根节点
 *
 * 与会话分组是两个层级的不同概念，因此另起一套结构而不是复用
 * {@link groupSchema}：它装的是工作区 id，且只出现在列表的最外层
 */
export const virtualWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspaceIds: z.array(z.string()),
})

/** 根节点上的全部分组，按用户创建顺序 */
export const workspaceTreeSchema = z.object({
  virtualWorkspaces: z.array(virtualWorkspaceSchema),
})

/**
 * 分组元数据的持久化声明
 *
 * 域与表名都受 `^[a-z][a-z0-9_]*$` 约束，因此用下划线而非连字符。
 * 表以 workspaceId 为主键，因此会话分组与工作区本身一一对应，
 * 不侵入 `workspaceRegistry` 的会话归属
 *
 * 工作区分组是**单例结构**（全部根节点分组在同一份记录里，天然有序），
 * 因此走域的 global 槽位而不是再开一张表。两者都是 v1 内可加的部分：
 * 旧文件里没有 global 时按 schema 的初值空列表读，没有这张表时按空表读，
 * 因此不必升版本——升版本会让 `single` 布局的既有文件直接 version-mismatch
 */
export const workspaceGroupsSpec = defineDomain({
  name: 'workspace_groups',
  version: 1,
  global: { schema: workspaceTreeSchema, initial: { virtualWorkspaces: [] } },
  tables: { by_workspace: domainTable(workspaceGroupsSchema) },
})

/** 对外快照：按 workspaceId 索引的会话分组，加根节点上的工作区分组 */
export const snapshotSchema = z.object({
  byWorkspace: z.record(z.string(), z.array(groupSchema)),
  workspaceGroups: z.array(virtualWorkspaceSchema),
})

export type Group = z.infer<typeof groupSchema>
export type VirtualWorkspace = z.infer<typeof virtualWorkspaceSchema>
export type WorkspaceGroupsSnapshot = z.infer<typeof snapshotSchema>
