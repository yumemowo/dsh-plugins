import type {
  Group,
  PickerSnapshot,
  VirtualWorkspace,
  WorkspaceGroupsSnapshot,
} from '../src/client/remote.ts'

/**
 * 测试用的分组快照替身
 *
 * 宿主每个变更方法都回整份快照，因此测试里的动作替身也需要一个合法的空快照——
 * 直接写 `{}` 在类型上就不再成立
 */
export interface SnapshotInit {
  /** 按 workspaceId 索引的会话分组 */
  byWorkspace?: Record<string, Group[]>
  /** 根节点上的工作区分组 */
  workspaceGroups?: VirtualWorkspace[]
  /** 菜单的聚焦 / 最近使用 / 置顶；未给时是「没有聚焦、没有记录」 */
  picker?: PickerSnapshot
}

/** 造一份分组快照，未给的部分按空 */
export function snapshot(init: SnapshotInit = {}): WorkspaceGroupsSnapshot {
  return {
    byWorkspace: init.byWorkspace ?? {},
    workspaceGroups: init.workspaceGroups ?? [],
    picker: init.picker ?? { focused: '', recent: [], pinned: [] },
  }
}

/** 造一个工作区分组定义 */
export function virtualWorkspace(id: string, name: string, workspaceIds: string[]): VirtualWorkspace {
  return { id, name, workspaceIds }
}
