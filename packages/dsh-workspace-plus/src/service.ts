import type { Context } from '@deepseek-ai/cordis'
import { workspaceGroupsSpec } from './spec.ts'
import type {
  Group,
  PickerSnapshot,
  VirtualWorkspace,
  WorkspaceGroupsSnapshot,
  WorkspaceNesting,
} from './spec.ts'
import { normalizePickerState, withFocus, withPinnedToggled, withoutEntry } from './pickerState.ts'
import { virtualAddress, workspaceAddress } from './rootEntry.ts'
import type { RootEntryAddress } from './rootEntry.ts'

/** 分组存储与变更操作的实现，注册为 `ctx.workspacePlus` */
export interface WorkspaceGroupsService {
  /** 读取全部工作区的会话分组、根节点上的工作区分组、嵌套归属、菜单状态与嵌套开关 */
  list(): Promise<WorkspaceGroupsSnapshot>
  /** 在工作区下新建一个会话分组 */
  createGroup(workspaceId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 重命名会话分组 */
  renameGroup(workspaceId: string, groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 删除会话分组，组内会话回到未分组，放进它的子工作区解除嵌套，会话本身不受影响 */
  deleteGroup(workspaceId: string, groupId: string): Promise<WorkspaceGroupsSnapshot>
  /** 把会话移入分组，`groupId` 为 null 表示移出到未分组 */
  moveSession(workspaceId: string, sessionId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>
  /** 在根节点新建一个工作区分组 */
  createVirtualWorkspace(name: string): Promise<WorkspaceGroupsSnapshot>
  /** 重命名工作区分组 */
  renameVirtualWorkspace(groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>
  /** 删除工作区分组，组内工作区回到未分组，工作区本身不受影响 */
  deleteVirtualWorkspace(groupId: string): Promise<WorkspaceGroupsSnapshot>
  /**
   * 把工作区移入分组，`groupId` 为 null 表示移出到未分组
   *
   * 一个工作区至多属于一个分组，移入时自动从原分组摘除
   */
  moveWorkspace(workspaceId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>
  /**
   * 把若干工作区放进某个工作区的会话分组，作为该分组下的子工作区
   *
   * 收一批 id 而不是一个，把工作区移进分组时，它名下与它同处一个容器的子工作区要一并跟随，否则层级会在分组边界上断开
   * 这批 id 由客户端按 cwd 路径算出——宿主只看得到 id，看不到路径
   *
   * 归属记在子工作区自己的记录上，因此一个子工作区天然只能有一个归属，不跨工作区移动
   * @param workspaceIds - 要放进该分组的子工作区
   * @param parentWorkspaceId - 持有该分组的工作区，也就是这些子工作区的父工作区
   * @param groupId - 目标分组 id
   */
  nestWorkspaces(
    workspaceIds: readonly string[],
    parentWorkspaceId: string,
    groupId: string,
  ): Promise<WorkspaceGroupsSnapshot>
  /** 解除这些工作区的嵌套归属，它们退回按 cwd 路径推导的位置 */
  unnestWorkspaces(workspaceIds: readonly string[]): Promise<WorkspaceGroupsSnapshot>
  /**
   * 开关按子工作区渲染
   *
   * 关闭时把所有已落盘的归属一并清空，关掉之后它们再也不会被渲染，留着只会让元数据与界面长期偏离
   * 两次写会让「开关已关、归属还在」有一段可观察的窗口，因此合成一次
   */
  setNested(enabled: boolean): Promise<WorkspaceGroupsSnapshot>
  /**
   * 把一个工作区从所有分组与归属里摘除
   *
   * 删除工作区时清理由此留下的记录，不另开一套删除接口，它自己的归属、挂在它名下的分组的归属、以及以它为父工作区的那些归属都在这一次写里清掉
   */
  forgetWorkspace(workspaceId: string): Promise<WorkspaceGroupsSnapshot>
  /**
   * 聚焦一个根节点条目，并把它记入最近使用
   */
  focusEntry(address: RootEntryAddress): Promise<WorkspaceGroupsSnapshot>
  /**
   * 切换一个根节点条目的置顶
   */
  togglePinned(address: RootEntryAddress): Promise<WorkspaceGroupsSnapshot>
}

/** 生成一个会话分组 id，同工作区内唯一即可，无需全局唯一 */
function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** 生成一个工作区分组 id，与会话分组的 id 前缀区分开，便于排查元数据 */
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
  ctx.effect(() => () => domain.close(), 'workspace-plus: domain close')
  const table = domain.table('by_workspace')
  const tree = domain.global

  /** 读取全部记录，按 workspaceId 归集会话分组与嵌套归属 */
  function snapshot(): WorkspaceGroupsSnapshot {
    const byWorkspace: Record<string, Group[]> = {}
    const nesting: Record<string, WorkspaceNesting> = {}
    const global = tree.get()
    for (const [workspaceId, record] of table.entries()) {
      byWorkspace[workspaceId] = record.groups
      const bound = record.nesting ?? null
      if (bound !== null) nesting[workspaceId] = bound
    }
    return {
      byWorkspace,
      // 开关关着时归属整格为空，渲染侧因此只要读这一格，不必再自行判断开关
      nesting: global.nested ? nesting : {},
      workspaceGroups: global.virtualWorkspaces,
      // 走一次归一而不是直接交出这一格，global 记录可能来自一个没有这几格的旧版本，缺格时下游（浏览器半边的菜单）会读到 undefined
      picker: normalizePickerState(global.picker),
      // 同样补格，旧 global 里没有这一格，直接交给渲染侧会得到 undefined
      nested: global.nested !== false,
    }
  }

  /**
   * 取某工作区的会话分组，不存在时视为空列表，不写盘
   *
   * 返回副本：域把存储的对象原样交出来（不做防御性拷贝），就地改它会直接改到域内存里的权威状态
   */
  function groupsOf(workspaceId: string): Group[] {
    return [...(table.get(workspaceId)?.groups ?? [])]
  }

  /** 取某工作区的嵌套归属，不存在时为 null */
  function nestingOf(workspaceId: string): WorkspaceNesting | null {
    return table.get(workspaceId)?.nesting ?? null
  }

  /** 取根节点上的工作区分组，返回副本，理由同上 */
  function treeGroups(): VirtualWorkspace[] {
    return [...tree.get().virtualWorkspaces]
  }

  /**
   * 写一份工作区的分组记录
   *
   * 会话分组与嵌套归属同写一份记录（主键都是这个工作区自己），两者都为空时删掉整条，不留死数据
   */
  async function saveRecord(
    workspaceId: string,
    groups: Group[],
    nesting: WorkspaceNesting | null,
  ): Promise<void> {
    if (groups.length === 0 && nesting === null) await table.delete(workspaceId)
    else await table.put(workspaceId, { groups, nesting })
  }

  /**
   * 写回某工作区的分组记录
   *
   * 不传 `nesting` 时沿用已落盘的那一份
   */
  async function save(
    workspaceId: string,
    groups: Group[],
    nesting: WorkspaceNesting | null = nestingOf(workspaceId),
  ): Promise<WorkspaceGroupsSnapshot> {
    await saveRecord(workspaceId, groups, nesting)
    return snapshot()
  }

  /**
   * 一次写入多份工作区的分组记录
   *
   * 把工作区放进分组时要连带它名下的子工作区一起写，分多次写会让「父工作区已归组、子工作区还在外面」有一段可观察的窗口
   * @param updates - 每个要改的工作区及其新记录
   */
  async function saveMany(
    updates: readonly { workspaceId: string; groups: Group[]; nesting: WorkspaceNesting | null }[],
  ): Promise<WorkspaceGroupsSnapshot> {
    for (const update of updates) {
      await saveRecord(update.workspaceId, update.groups, update.nesting)
    }
    return snapshot()
  }

  /**
   * 写回根节点那份单例状态
   *
   * 未指名的几格沿用当前值，`picker` 那一格走一次归一：global 记录可能来自没有这几格的旧版本，缺格时下游会读到 undefined
   * @param patch - 要改的格，其余原样保留
   */
  async function writeTree(
    patch: Partial<{ virtualWorkspaces: VirtualWorkspace[]; picker: PickerSnapshot; nested: boolean }>,
  ): Promise<WorkspaceGroupsSnapshot> {
    const global = tree.get()
    await tree.set({
      virtualWorkspaces: patch.virtualWorkspaces ?? global.virtualWorkspaces,
      picker: patch.picker ?? normalizePickerState(global.picker),
      nested: patch.nested ?? global.nested !== false,
    })
    return snapshot()
  }

  /** 写回根节点上的工作区分组列表，菜单状态与嵌套开关原样保留 */
  function saveTree(groups: VirtualWorkspace[]): Promise<WorkspaceGroupsSnapshot> {
    return writeTree({ virtualWorkspaces: groups })
  }

  /**
   * 写回菜单状态，分组列表与嵌套开关原样保留
   *
   * 三份记录都可能提到现已不存在的对象（记录比列表活得久），因此这里不做修剪，唯一知道「哪些对象还在」的是渲染菜单的那一侧，宿主只管落盘
   */
  function savePicker(picker: PickerSnapshot): Promise<WorkspaceGroupsSnapshot> {
    return writeTree({ picker })
  }

  /**
   * 删除一个根节点条目并同时摘掉它在菜单三份记录里的痕迹
   *
   * 两次写会让「分组已消失、聚焦还指着它」有一段可观察的窗口，因此合成一次
   * @param groups - 删除后的分组列表
   * @returns 变更后的快照
   */
  function dropEntry(
    address: RootEntryAddress,
    groups: VirtualWorkspace[],
  ): Promise<WorkspaceGroupsSnapshot> {
    const picker = withoutEntry(normalizePickerState(tree.get().picker), address)
    return writeTree({ virtualWorkspaces: groups, picker })
  }

  /**
   * 清掉指向某个已消失分组的归属记录
   *
   * 分组被删除后，放进它的子工作区再也不会被渲染在那，留着这条引用只会让元数据与界面长期偏离
   * @param workspaceId - 持有该分组的工作区
   * @param groupId - 被删除的分组 id
   */
  async function releaseNestingIn(workspaceId: string, groupId: string): Promise<void> {
    for (const [childId, record] of [...table.entries()]) {
      if (record.nesting?.workspaceId === workspaceId && record.nesting.groupId === groupId) {
        await saveRecord(childId, record.groups, null)
      }
    }
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
      // 只删除分组本身，组内会话回到未分组，放进它的子工作区解除嵌套，会话本身都还在
      const groups = groupsOf(workspaceId).filter((group) => group.id !== groupId)
      // 归属记在子工作区自己那份记录上，因此要逐条扫过表，指向的这个分组已经没了，它们都成了悬空引用
      await releaseNestingIn(workspaceId, groupId)
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
      // 只解散分组：组内工作区回到未分组，工作区及其会话都不受影响
      // 分组在菜单三份记录里的条目一并摘掉，否则聚焦在一个已解散的分组上时列表会整片空掉
      return dropEntry(
        virtualAddress(groupId),
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

    async nestWorkspaces(workspaceIds, parentWorkspaceId, groupId) {
      // 目标分组必须真实存在，归属于一个不存在的分组会在渲染时被当作无效而整条丢掉
      const target = groupsOf(parentWorkspaceId).find((group) => group.id === groupId)
      if (target === undefined) {
        throw new Error(`unknown group "${groupId}" in workspace "${parentWorkspaceId}"`)
      }
      // 一个子工作区至多有一个归属，这一次写直接覆盖它原来的那一份，因此不必先摘除
      const updates = workspaceIds.map((workspaceId) => ({
        workspaceId,
        groups: groupsOf(workspaceId),
        nesting: { workspaceId: parentWorkspaceId, groupId },
      }))
      if (updates.length === 0) return snapshot()
      return saveMany(updates)
    },

    async unnestWorkspaces(workspaceIds) {
      const updates = workspaceIds
        .filter((workspaceId) => nestingOf(workspaceId) !== null)
        .map((workspaceId) => ({
          workspaceId,
          groups: groupsOf(workspaceId),
          nesting: null,
        }))
      if (updates.length === 0) return snapshot()
      return saveMany(updates)
    },

    async setNested(enabled) {
      // 关闭时把全部归属一并清空，关掉之后它们再也不会被渲染，留着只会让元数据与界面长期偏离
      // 开关与清理合成一次写入，避免「开关已关、归属还在」那段可观察的窗口
      const cleared: { childId: string; groups: Group[] }[] = []
      if (!enabled) {
        for (const [childId, record] of [...table.entries()]) {
          if (record.nesting == null) continue
          cleared.push({ childId, groups: record.groups })
        }
      }
      const global = tree.get()
      await tree.set({
        virtualWorkspaces: global.virtualWorkspaces,
        picker: normalizePickerState(global.picker),
        nested: enabled,
      })
      for (const entry of cleared) {
        await saveRecord(entry.childId, entry.groups, null)
      }
      return snapshot()
    },

    async forgetWorkspace(workspaceId) {
      // 工作区已被删除，它留下的记录再也不会被渲染，元数据里挂着不存在的 id 只会让两边长期偏离
      // 三处一起清：它在根节点分组里的成员资格、它自己的嵌套归属、以及以它为父工作区的归属
      // 第三处不能省——父工作区没了，那些子工作区再也不会被渲染在它下面，留着就是悬空引用
      const groups = treeGroups()
      const pruned = groups.map((group) => ({
        ...group,
        workspaceIds: group.workspaceIds.filter((id) => id !== workspaceId),
      }))
      const changed = pruned.some(
        (group, index) => group.workspaceIds.length !== (groups[index]?.workspaceIds.length ?? 0),
      )
      const orphaned = [...table.entries()].filter(
        ([childId, record]) =>
          childId !== workspaceId && record.nesting?.workspaceId === workspaceId,
      )
      const address = workspaceAddress(workspaceId)
      const next = await dropEntry(address, changed ? pruned : groups)
      for (const [childId, record] of orphaned) {
        // 无条件写回，不共用 `saveRecord`：后者会把两份内容都空的记录整条删掉
        await table.put(childId, { groups: record.groups, nesting: null })
      }
      return orphaned.length === 0 ? next : snapshot()
    },

    async focusEntry(address) {
      return savePicker(withFocus(normalizePickerState(tree.get().picker), address))
    },

    async togglePinned(address) {
      return savePicker(withPinnedToggled(normalizePickerState(tree.get().picker), address))
    },
  }
}
