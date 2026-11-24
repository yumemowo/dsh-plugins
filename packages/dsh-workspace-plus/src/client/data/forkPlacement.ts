/**
 * 分叉出的会话落回源会话所在的分组
 *
 * 判定只认「源会话此刻在哪个分组」这一格：子会话 id 由发起分叉的那一处直接给出
 *
 * 宿主侧判不出这件事了。dsh 从 0.2.1-rc.3 起把普通分叉做成独立会话
 * `SessionHeader.parentSession` 与列表里的 `parentId` 都不再写来源，`isSeeded` 是唯一留下的痕迹
 * 因此监听 `session/created` 按 header 判来源那条路在当前宿主上永远不会命中
 *
 * 改由本包接管分叉项：执行权在插件手里时官方那个 `onCreated` 回调会把子会话 id 交回来
 * 接管只在 `forkFollowsSourceGroup` 打开时发生（见 `config.ts`），关着时这一整套判据都不参与
 * 代价是只覆盖本包菜单这一个入口——聊天面板回合末尾的分叉、以及 `session.fork` 快捷键走各自的原生入口，不经过这里
 */
import { groupIdOfSession } from './sessions.ts'
import type { Group } from '../remote.ts'

/** 一次落位的目标：写进哪个工作区的哪个分组 */
export interface ForkPlacement {
  workspaceId: string
  groupId: string
}

/**
 * 判定分叉出的会话该落进哪个分组
 *
 * 源会话不在任何分组里时什么都不写：分叉出的会话跟着它待在未分组区，没有可落的归属
 * @param input - 源会话与全部工作区的分组元数据
 * @returns 目标工作区与分组，没有可落的分组时缺省
 */
export function forkPlacement(input: {
  /** 分叉的来源会话 */
  sourceId: string
  /** 全部工作区的分组元数据 */
  byWorkspace: Readonly<Record<string, readonly Group[]>>
}): ForkPlacement | undefined {
  for (const [workspaceId, groups] of Object.entries(input.byWorkspace)) {
    const groupId = groupIdOfSession(groups, input.sourceId)
    if (groupId !== '') return { workspaceId, groupId }
  }
  return undefined
}
