import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { ALL_ENTRIES } from './rootEntry.ts'
import type { RootEntryAddress } from './rootEntry.ts'

/** 一个会话分组：稳定的标识、显示名，以及按顺序归属的会话 */
export const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionIds: z.array(z.string()),
})

/**
 * 一个工作区被放进某个分组时记录的归属
 *
 * 存的是子工作区自己的这份记录，而不是往父工作区的分组里追加成员
 * 一个子工作区因此天然至多只有一个归属，父工作区的分组被删除时这份记录也只是一个悬空引用，由渲染侧判为无效
 *
 * `workspaceId` 是父工作区 id，分组本身属于某个工作区，归属必须落在同一个工作区里，不跨工作区移动
 */
export const workspaceNestingSchema = z.object({
  workspaceId: z.string(),
  groupId: z.string(),
})

/**
 * 单个工作区的分组记录
 *
 * 会话未出现在任何分组时即为「未分组」，`nesting` 缺省表示这个工作区没有被放进任何父工作区的分组
 * 两者同一份记录，因为它们的主键都是这个工作区自己
 */
export const workspaceGroupsSchema = z.object({
  groups: z.array(groupSchema),
  nesting: workspaceNestingSchema.nullable().default(null),
})

/**
 * 一个工作区分组，把若干工作区打包在一起的根节点
 *
 * 与会话分组是两个层级的不同概念，因此另起一套结构而不是复用 {@link groupSchema}，它装的是工作区 id，且只出现在列表的最外层
 */
export const virtualWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspaceIds: z.array(z.string()),
})

/**
 * 根节点条目地址的持久化形状
 *
 * 标注成 {@link RootEntryAddress}，让形状只有 `rootEntry.ts` 那一处定义：改一边而忘了另一边会被 tsc 拦下
 * 两个半边与线上 codec 都从这一份派生
 */
export const entryAddressSchema: z.ZodType<RootEntryAddress> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workspace'), id: z.string() }),
  z.object({ kind: z.literal('virtual'), id: z.string() }),
  z.object({ kind: z.literal('all') }),
])

/**
 * 菜单的聚焦 / 最近使用 / 置顶记录
 *
 * 三者都是根节点条目地址的列表（见 `rootEntry.ts`），因此能指向工作区与工作区分组两类对象
 * 字段都带默认值，旧文件里没有这几格时按空读，不必升版本号
 * 与 `virtualWorkspaces` 同一取舍，升版本会让既有文件直接 version-mismatch
 */
export const pickerStateSchema = z.object({
  focused: entryAddressSchema.default(ALL_ENTRIES),
  recent: z.array(entryAddressSchema).default([]),
  pinned: z.array(entryAddressSchema).default([]),
})

/**
 * 根节点的单例状态，工作区分组列表、菜单的三份记录，以及嵌套渲染的开关
 *
 * 三者都是「根节点这一层」的单例状态，同处一个 global 槽位，分开几份记录只会多几次可能对不齐的写入
 */
export const workspaceTreeSchema = z.object({
  virtualWorkspaces: z.array(virtualWorkspaceSchema),
  picker: pickerStateSchema.default({ focused: ALL_ENTRIES, recent: [], pinned: [] }),
  /**
   * 是否按子工作区渲染
   *
   * 关掉时界面回到「全部工作区平铺在根节点」，已经落盘的归属记录仍留着，重新打开即恢复
   * 与 `picker` 同一取舍，旧文件里缺这一格时按默认值读，不必升版本
   */
  nested: z.boolean().default(true),
})

/**
 * 分组元数据的持久化声明
 *
 * 域与表名都受 `^[a-z][a-z0-9_]*$` 约束，因此用下划线而非连字符
 * 表以 workspaceId 为主键，因此会话分组与工作区本身一一对应
 * 不侵入 `workspaceRegistry` 的会话归属
 *
 * 根节点那份是单例结构（全部内容在同一份记录里，天然有序），因此走域的 global 槽位而不是再开一张表
 * global 的字段都是 v1 内可加的部分，旧文件里缺哪一格就按 schema 的默认值读，因此不必升版本
 * 升版本会让 `single` 布局的既有文件直接 version-mismatch
 */
export const workspaceGroupsSpec = defineDomain({
  name: 'workspace_plus',
  version: 1,
  global: {
    schema: workspaceTreeSchema,
    initial: {
      virtualWorkspaces: [],
      picker: { focused: ALL_ENTRIES, recent: [], pinned: [] },
      nested: true,
    },
  },
  tables: { by_workspace: domainTable(workspaceGroupsSchema) },
})

/**
 * 对外快照，按 workspaceId 索引的会话分组与嵌套归属，加根节点的分组列表、菜单状态与嵌套开关
 *
 * `nested` 既回开关本身，也回按该开关归一后的归属，关着时每一条归属都已被清空，渲染侧不必再自行判断
 */
export const snapshotSchema = z.object({
  byWorkspace: z.record(z.string(), z.array(groupSchema)),
  nesting: z.record(z.string(), workspaceNestingSchema),
  workspaceGroups: z.array(virtualWorkspaceSchema),
  picker: pickerStateSchema,
  nested: z.boolean(),
})

export type Group = z.infer<typeof groupSchema>
export type WorkspaceNesting = z.infer<typeof workspaceNestingSchema>
export type VirtualWorkspace = z.infer<typeof virtualWorkspaceSchema>
export type PickerSnapshot = z.infer<typeof pickerStateSchema>
export type WorkspaceGroupsSnapshot = z.infer<typeof snapshotSchema>
