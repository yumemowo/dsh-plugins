/**
 * 分组元数据到渲染布局的切分
 *
 * 纯数据变换：一层把工作区当前的会话行与分组定义切成「分组段 + 未归组行」，
 * 另一层把工作区列表与工作区分组切成「分组段 + 未归组工作区」
 */
import type { Group, VirtualWorkspace } from '../remote.ts'
import type {
  GroupSection,
  RootLayout,
  SessionRow,
  VirtualWorkspaceSection,
  WorkspaceLayout,
} from './types.ts'

/**
 * 把工作区的会话按分组元数据切成「分组」与「未归组」两部分
 *
 * 分组里记录的会话若已不在列表中（被归档或删除），会被静默跳过；
 * 未归组的会话按传入顺序平铺。这样即使元数据与真实列表出现偏差，界面也不会丢行
 * @param sessions - 工作区当前可见的会话
 * @param groups - 该工作区的分组定义
 * @returns 分组段与未归组行
 */
export function buildLayout(
  sessions: readonly SessionRow[],
  groups: readonly Group[],
): WorkspaceLayout {
  const byId = new Map(sessions.map((row) => [row.id, row]))
  const claimed = new Set<string>()
  const sections: GroupSection[] = []

  for (const group of groups) {
    const rows: SessionRow[] = []
    for (const id of group.sessionIds) {
      const row = byId.get(id)
      // 元数据里存在的会话可能已经归档；列表是事实来源，跳过即可
      if (row === undefined || claimed.has(id)) continue
      claimed.add(id)
      rows.push(row)
    }
    sections.push({ id: group.id, label: group.name, sessions: rows })
  }

  return { groups: sections, loose: sessions.filter((row) => !claimed.has(row.id)) }
}

/**
 * 判定一个会话当前所属的分组
 * @param sections - 已切分好的分组段
 * @param sessionId - 目标会话
 * @returns 所属分组 id；不属于任何分组时返回空串
 */
export function groupIdOfSession(sections: readonly GroupSection[], sessionId: string): string {
  for (const section of sections) {
    if (section.sessions.some((row) => row.id === sessionId)) return section.id
  }
  return ''
}

/**
 * 比较两组分组段是否表示同一件事
 *
 * 供行级 memo 的比较器使用：归组菜单只消费分组的 id 与名字
 * @param a - 上一次的分组段
 * @param b - 这一次的分组段
 * @returns 归组菜单的显示结果相同为 true
 */
export function sameGroupSections(
  a: readonly GroupSection[] | undefined,
  b: readonly GroupSection[] | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  return a.every((section, index) => {
    const other = b[index]
    return other !== undefined && section.id === other.id && section.label === other.label
  })
}

/**
 * 判定一组会话行里是否有当前选中的那条
 *
 * 官方用它决定展开状态下的工作区文件夹是否染成强调色
 * @param rows - 该工作区可见的会话行
 * @param currentSessionId - 当前选中的会话 id
 * @returns 是否包含当前会话
 */
export function containsSession(
  rows: readonly SessionRow[],
  currentSessionId: string | undefined,
): boolean {
  if (currentSessionId === undefined) return false
  return rows.some((row) => row.id === currentSessionId)
}

/**
 * 把工作区列表按工作区分组切成「分组」与「未归组」两部分
 *
 * 与会话那一层同一取舍：分组里记录的工作区若已不在列表中（被删除），会被静默
 * 跳过，元数据与真实列表出现偏差时界面也不会丢工作区；一个工作区被两个分组同时
 * 记录时以先出现的为准，因此渲染出的每个工作区都只有一个位置
 * @param workspaceIds - 当前可见的工作区 id，按宿主顺序
 * @param groups - 根节点上的工作区分组定义
 * @returns 分组段与未归组工作区 id
 */
export function buildRootLayout(
  workspaceIds: readonly string[],
  groups: readonly VirtualWorkspace[] | undefined,
): RootLayout {
  const known = new Set(workspaceIds)
  const claimed = new Set<string>()
  const sections: VirtualWorkspaceSection[] = []

  // 分组定义可能整格缺席：浏览器半边热重载会先换上新的客户端，而宿主半边要重启
  // `dsh` 才换，那段窗口里收到的是旧形状的快照（没有这一格）。缺格时退化成
  // 「没有工作区分组」而不是抛错
  for (const group of groups ?? []) {
    const ids: string[] = []
    for (const id of group.workspaceIds) {
      // 元数据里存在的工作区可能已被删除；列表是事实来源，跳过即可
      if (!known.has(id) || claimed.has(id)) continue
      claimed.add(id)
      ids.push(id)
    }
    sections.push({ id: group.id, label: group.name, workspaceIds: ids })
  }

  return { groups: sections, loose: workspaceIds.filter((id) => !claimed.has(id)) }
}

/**
 * 判定一个工作区当前所属的工作区分组
 * @param sections - 已切分好的工作区分组段
 * @param workspaceId - 目标工作区
 * @returns 所属分组 id；不属于任何分组时返回空串
 */
export function virtualWorkspaceIdOf(
  sections: readonly VirtualWorkspaceSection[],
  workspaceId: string,
): string {
  for (const section of sections) {
    if (section.workspaceIds.includes(workspaceId)) return section.id
  }
  return ''
}
