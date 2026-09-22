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
 * 与会话分组是两个层级的不同概念，因此另起一套结构而不是复用 {@link groupSchema}：它装的是工作区 id，且只出现在列表的最外层
 */
export const virtualWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspaceIds: z.array(z.string()),
})

/**
 * 菜单的聚焦 / 最近使用 / 置顶记录
 *
 * 三者都是根节点条目的键列表（见 `rootEntry.ts`），因此能指向工作区与工作区分组两类对象
 * 字段都带默认值：旧文件里没有这几格时按空读，不必升版本号
 * 与 `virtualWorkspaces` 同一取舍——升版本会让既有文件直接 version-mismatch
 */
export const pickerStateSchema = z.object({
  focused: z.string().default(''),
  recent: z.array(z.string()).default([]),
  pinned: z.array(z.string()).default([]),
})

/**
 * 根节点的单例状态：工作区分组列表与菜单的三份记录
 *
 * 两者都是「根节点这一层」的单例状态，同处一个 global 槽位——分开两份记录只会多一次可能对不齐的写入
 */
export const workspaceTreeSchema = z.object({
  virtualWorkspaces: z.array(virtualWorkspaceSchema),
  picker: pickerStateSchema.default({ focused: '', recent: [], pinned: [] }),
})

/**
 * 分组元数据的持久化声明
 *
 * 域与表名都受 `^[a-z][a-z0-9_]*$` 约束，因此用下划线而非连字符
 * 表以 workspaceId 为主键，因此会话分组与工作区本身一一对应
 * 不侵入 `workspaceRegistry` 的会话归属
 *
 * 根节点那份是单例结构（全部内容在同一份记录里，天然有序），因此走域的 global 槽位而不是再开一张表
 * global 的字段都是 v1 内可加的部分：旧文件里缺哪一格就按 schema 的默认值读，因此不必升版本
 * 升版本会让 `single` 布局的既有文件直接 version-mismatch
 */
export const workspaceGroupsSpec = defineDomain({
  name: 'workspace_groups',
  version: 1,
  global: {
    schema: workspaceTreeSchema,
    initial: { virtualWorkspaces: [], picker: { focused: '', recent: [], pinned: [] } },
  },
  tables: { by_workspace: domainTable(workspaceGroupsSchema) },
})

/** 对外快照：按 workspaceId 索引的会话分组，加根节点的分组列表与菜单状态 */
export const snapshotSchema = z.object({
  byWorkspace: z.record(z.string(), z.array(groupSchema)),
  workspaceGroups: z.array(virtualWorkspaceSchema),
  picker: pickerStateSchema,
})

export type Group = z.infer<typeof groupSchema>
export type VirtualWorkspace = z.infer<typeof virtualWorkspaceSchema>
export type PickerSnapshot = z.infer<typeof pickerStateSchema>
export type WorkspaceGroupsSnapshot = z.infer<typeof snapshotSchema>
