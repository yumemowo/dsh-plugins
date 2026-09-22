/**
 * 区域渲染用的数据形状
 *
 * 只承载展示所需的事实，不复制整份会话或工作区快照
 */

/** 一个会话在列表中的渲染行 */
export interface SessionRow {
  id: string
  /**
   * 存储的显示标题
   *
   * 空白（新建中）会话为空串，与官方一样
   * 那条占位行的名字由渲染期套官方语言包的固定名，而不是拿宿主给的后备标题顶上；首个回合落地后宿主提供摘要标题，这一格随之有值
   */
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
 * `loose` 是不属于任何分组的会话：它们平铺在工作区下，没有分组头；只有用户真正创建过分组，才会出现分组结构
 */
export interface WorkspaceLayout {
  groups: GroupSection[]
  loose: SessionRow[]
}

/** 一个工作区分组段：分组头 + 组内的工作区 id，按传入顺序 */
export interface VirtualWorkspaceSection {
  id: string
  label: string
  workspaceIds: string[]
}

/**
 * 根节点的渲染布局
 *
 * 与 {@link WorkspaceLayout} 是同一个形状在两个层级上的用法：这里是工作区被分组，那里是会话被分组
 * `loose` 是没有归入任何分组的工作区 id，它们平铺在全部工作区分组之后、不带区段头
 */
export interface RootLayout {
  groups: VirtualWorkspaceSection[]
  loose: string[]
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

/**
 * 一个待编辑的工作区分组名，指名编辑对象与当前草稿
 *
 * 与 {@link GroupNameDraft} 同形但不同层级：那个落在某个工作区内部，这个落在根节点
 * `groupId` 为空串表示新建，那时 `workspaceId` 是发起这次新建的那个工作区——入口在它的行菜单里，建完要把它一并放进去
 */
export interface VirtualWorkspaceNameDraft {
  groupId: string
  /** 新建时随建组一并移入的工作区；改名时为 undefined */
  workspaceId?: string | undefined
  /**
   * 建好之后是否把视图切到新分组；改名时为 undefined
   *
   * 只在当前不是「显示全部工作区」时有意义——已经看着全部内容时没有可切的目的地，那个勾选项因此也不渲染
   */
  followFocus?: boolean | undefined
  value: string
}

/** 一个待编辑的工作区名，指名编辑对象与当前草稿 */
export interface WorkspaceNameDraft {
  workspaceId: string
  value: string
}

/** 会话行在分组选择器里的取值：分组 id，或空串表示不属于任何分组 */
export type GroupChoice = string
