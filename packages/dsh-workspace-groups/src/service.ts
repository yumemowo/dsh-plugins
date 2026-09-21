import type { Context } from '@deepseek-ai/cordis'
import { workspaceGroupsSpec } from './spec.ts'
import type { Group, PickerSnapshot, VirtualWorkspace, WorkspaceGroupsSnapshot } from './spec.ts'
import { normalizePickerState, withFocus, withPinnedToggled, withoutEntry } from './pickerState.ts'
import { rootVirtualKey, rootWorkspaceKey } from './rootEntry.ts'

/** 分组存储与变更操作的实现，注册为 `ctx.workspaceGroups` */
export interface WorkspaceGroupsService {
  /** 读取全部工作区的会话分组、根节点上的工作区分组与菜单状态 */
  list(): Promise<WorkspaceGroupsSnapshot>
  /** 在工作区下新建一个会话分组 */
  createGroup(workspaceId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 重命名会话分组 */
  renameGroup(workspaceId: string, groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 删除会话分组；组内会话回到未分组，会话本身不受影响 */
  deleteGroup(workspaceId: string, groupId: string): Promise<WorkspaceGroupsSnapshot>
  /** 把会话移入分组；`groupId` 为 null 表示移出到未分组 */
  moveSession(workspaceId: string, sessionId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>
  /** 在根节点新建一个工作区分组 */
  createVirtualWorkspace(name: string): Promise<WorkspaceGroupsSnapshot>
  /** 重命名工作区分组 */
  renameVirtualWorkspace(groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 删除工作区分组；组内工作区回到未分组，工作区本身不受影响 */
  deleteVirtualWorkspace(groupId: string): Promise<WorkspaceGroupsSnapshot>
  /**
   * 把工作区移入分组；`groupId` 为 null 表示移出到未分组
   *
   * 一个工作区至多属于一个分组，移入时自动从原分组摘除
   */
  moveWorkspace(workspaceId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>
  /**
   * 把一个工作区从所有分组里摘除
   *
   * 删除工作区时清理由此留下的归属记录，不另开一套删除接口
   */
  forgetWorkspace(workspaceId: string): Promise<WorkspaceGroupsSnapshot>
  /**
   * 聚焦一个根节点条目，并把它记入最近使用
   * @param key - 条目键（见 `rootEntry.ts`）；空串表示退回「全部」
   */
  focusEntry(key: string): Promise<WorkspaceGroupsSnapshot>
  /**
   * 切换一个根节点条目的置顶
   * @param key - 条目键（见 `rootEntry.ts`）
   */
  togglePinned(key: string): Promise<WorkspaceGroupsSnapshot>
}

/** 生成一个会话分组 id；同工作区内唯一即可，无需全局唯一 */
function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 生成一个工作区分组 id；与会话分组的 id 前缀区分开，便于排查元数据 */
function newVirtualWorkspaceId(): string {
  return `wg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
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
  const tree = domain.global

  /** 读取全部记录，按 workspaceId 归集会话分组 */
  function snapshot(): WorkspaceGroupsSnapshot {
    const byWorkspace: Record<string, Group[]> = {}
    for (const [workspaceId, record] of table.entries()) {
      byWorkspace[workspaceId] = record.groups
    }
    const global = tree.get()
    return {
      byWorkspace,
      workspaceGroups: global.virtualWorkspaces,
      // 走一次归一而不是直接交出这一格：global 记录可能来自一个没有这几格的
      // 旧版本，缺格时下游（浏览器半边的菜单）会读到 undefined
      picker: normalizePickerState(global.picker),
    }
  }

  /**
   * 取某工作区的会话分组；不存在时视为空列表，不写盘
   *
   * 返回副本：域把存储的对象原样交出来（不做防御性拷贝），就地改它会直接改到
   * 域内存里的权威状态
   */
  function groupsOf(workspaceId: string): Group[] {
    return [...(table.get(workspaceId)?.groups ?? [])]
  }

  /** 取根节点上的工作区分组；返回副本，理由同上 */
  function treeGroups(): VirtualWorkspace[] {
    return [...tree.get().virtualWorkspaces]
  }

  /** 写回某工作区的会话分组；空列表表示删除该记录 */
  async function save(workspaceId: string, groups: Group[]): Promise<WorkspaceGroupsSnapshot> {
    if (groups.length === 0) await table.delete(workspaceId)
    else await table.put(workspaceId, { groups })
    return snapshot()
  }

  /** 写回根节点上的工作区分组列表，菜单状态原样保留 */
  async function saveTree(groups: VirtualWorkspace[]): Promise<WorkspaceGroupsSnapshot> {
    await tree.set({ virtualWorkspaces: groups, picker: normalizePickerState(tree.get().picker) })
    return snapshot()
  }

  /**
   * 写回菜单状态；分组列表原样保留
   *
   * 三份记录都可能提到现已不存在的对象（记录比列表活得久），因此这里不做修剪：
   * 唯一知道「哪些对象还在」的是渲染菜单的那一侧，宿主只管落盘
   */
  async function savePicker(picker: PickerSnapshot): Promise<WorkspaceGroupsSnapshot> {
    await tree.set({ virtualWorkspaces: tree.get().virtualWorkspaces, picker })
    return snapshot()
  }

  /**
   * 删除一个根节点条目并同时摘掉它在菜单三份记录里的痕迹
   *
   * 两次写会让「分组已消失、聚焦还指着它」有一段可观察的窗口，因此合成一次
   * @param key - 被删除条目的键
   * @param groups - 删除后的分组列表
   * @returns 变更后的快照
   */
  async function dropEntry(
    key: string,
    groups: VirtualWorkspace[],
  ): Promise<WorkspaceGroupsSnapshot> {
    const picker = withoutEntry(normalizePickerState(tree.get().picker), key)
    await tree.set({ virtualWorkspaces: groups, picker })
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
      // 只删除分组本身：组内会话回到未分组，会话与工作区归属都不受影响
      const groups = groupsOf(workspaceId).filter((group) => group.id !== groupId)
      return save(workspaceId, groups)
    },

    async moveSession(workspaceId, sessionId, groupId) {
      // 先在所有分组中摘除该会话，保证一个会话至多属于一个分组
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

    async createVirtualWorkspace(name) {
      const groups = treeGroups()
      groups.push({ id: newVirtualWorkspaceId(), name, workspaceIds: [] })
      return saveTree(groups)
    },

    async renameVirtualWorkspace(groupId, name) {
      const groups = treeGroups().map((group) =>
        group.id === groupId ? { ...group, name } : group,
      )
      return saveTree(groups)
    },

    async deleteVirtualWorkspace(groupId) {
      // 只解散分组：组内工作区回到未分组，工作区及其会话都不受影响。分组在菜单
      // 三份记录里的条目一并摘掉，否则聚焦在一个已解散的分组上时列表会整片空掉
      return dropEntry(
        rootVirtualKey(groupId),
        treeGroups().filter((group) => group.id !== groupId),
      )
    },

    async moveWorkspace(workspaceId, groupId) {
      // 先在所有分组中摘除该工作区，保证一个工作区至多属于一个分组
      const groups = treeGroups().map((group) => ({
        ...group,
        workspaceIds: group.workspaceIds.filter((id) => id !== workspaceId),
      }))
      if (groupId !== null) {
        const target = groups.find((group) => group.id === groupId)
        if (target === undefined) throw new Error(`unknown workspace group "${groupId}"`)
        target.workspaceIds.push(workspaceId)
      }
      return saveTree(groups)
    },

    async forgetWorkspace(workspaceId) {
      // 工作区已被删除，它留下的归属记录再也不会被渲染；元数据里挂着不存在的
      // id 只会让两边长期偏离。没有该工作区的记录时不写盘
      const groups = treeGroups()
      const pruned = groups.map((group) => ({
        ...group,
        workspaceIds: group.workspaceIds.filter((id) => id !== workspaceId),
      }))
      const changed = pruned.some(
        (group, index) => group.workspaceIds.length !== (groups[index]?.workspaceIds.length ?? 0),
      )
      return dropEntry(rootWorkspaceKey(workspaceId), changed ? pruned : groups)
    },

    async focusEntry(key) {
      return savePicker(withFocus(normalizePickerState(tree.get().picker), key))
    },

    async togglePinned(key) {
      return savePicker(withPinnedToggled(normalizePickerState(tree.get().picker), key))
    },
  }
}
