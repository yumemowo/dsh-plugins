/**
 * 区域渲染用的数据形状
 *
 * 只承载展示所需的事实，不复制整份会话或工作区快照
 */

/** 一个会话在列表中的渲染行 */
export interface SessionRow {
  id: string
  title: string
  blank: boolean
  running: boolean
  /** 沿子代理来源脉络接续下来的运行中子代理数；状态点据此亮起 */
  runningSubagentCount: number
  completed: boolean
  updatedAt: number
}

/** 用户创建的一个分组 */
export interface GroupSection {
  id: string
  label: string
  sessions: SessionRow[]
}

/**
 * 一个工作区的渲染布局
 *
 * `loose` 是不属于任何分组的会话：它们平铺在工作区下，没有分组头。
 * 只有用户真正创建过分组，才会出现分组结构
 */
export interface WorkspaceLayout {
  groups: GroupSection[]
  loose: SessionRow[]
}

/**
 * 一个待编辑的分组名，指名编辑对象与当前草稿
 *
 * 新建时 `groupId` 为空串，确认后走 `createGroup`；否则走 `renameGroup`
 */
export interface GroupNameDraft {
  workspaceId: string
  groupId: string
  value: string
}

/** 一个待编辑的工作区名，指名编辑对象与当前草稿 */
export interface WorkspaceNameDraft {
  workspaceId: string
  value: string
}

/** 会话行在分组选择器里的取值：分组 id，或空串表示不属于任何分组 */
export type GroupChoice = string
