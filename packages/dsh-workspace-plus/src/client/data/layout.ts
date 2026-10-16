/**
 * 分组元数据到渲染布局的切分
 *
 * 纯数据变换：一层把工作区当前的会话行与分组定义切成「分组段 + 未归组行」，另一层把工作区列表与工作区分组切成「分组段 + 未归组工作区」
 *
 * 两层都还要认 cwd 路径推导出的父工作区与子工作区关系，会话分组里可以放进子工作区，工作区列表里被嵌套的那些不再出现在根节点
 */
import { virtualAddress, workspaceAddress } from '../../rootEntry.ts'
import type { EntryAddress } from '../../rootEntry.ts'
import type { Group, VirtualWorkspace } from '../remote.ts'
import type { ContainerNode, Nesting } from './nest.ts'
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
 * 分组里记录的会话若已不在列表中（被归档或删除），会被静默跳过，未归组的会话按传入顺序平铺
 * 这样即使元数据与真实列表出现偏差，界面也不会丢行
 *
 * 每个分组还带上放进去的顶层子工作区，它们渲染在组内会话之前
 * @param childrenOf - 取某个分组容纳的顶层子工作区，缺省表示没有任何子工作区
 * @param looseChildren - 该工作区体内未归组那一段的顶层子工作区
 */
export function buildLayout(
  sessions: readonly SessionRow[],
  groups: readonly Group[],
  childrenOf: (groupId: string) => readonly string[] = () => [],
  looseChildren: readonly string[] = [],
): WorkspaceLayout {
  const byId = new Map(sessions.map((row) => [row.id, row]))
  const claimed = new Set<string>()
  const sections: GroupSection[] = []

  for (const group of groups) {
    const rows: SessionRow[] = []
    for (const id of group.sessionIds) {
      const row = byId.get(id)
      // 元数据里存在的会话可能已经归档，列表是事实来源，跳过即可
      if (row === undefined || claimed.has(id)) continue
      claimed.add(id)
      rows.push(row)
    }
    sections.push({
      id: group.id,
      label: group.name,
      sessions: rows,
      children: [...childrenOf(group.id)],
    })
  }

  return {
    groups: sections,
    loose: sessions.filter((row) => !claimed.has(row.id)),
    children: [...looseChildren],
  }
}

/**
 * 判定一个会话当前所属的分组
 * @returns 所属分组 id，不属于任何分组时返回空串
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
 * 与会话那一层同一取舍：分组里记录的工作区若已不在列表中（被删除），会被静默跳过，元数据与真实列表出现偏差时界面也不会丢工作区
 * 一个工作区被两个分组同时记录时以先出现的为准，因此渲染出的每个工作区都只有一个位置
 *
 * 分组的 `workspaceIds` 只当归属集合用：组内渲染顺序改由注册表序（传入的 `workspaceIds`）定
 * 这样顶层成员与被嵌套子工作区共用同一个顺序来源，换位写入 (`insertBefore`) 在各层读到的都是同一份序
 *
 * 开启嵌套时，每一段只列该容器里的顶层工作区，被嵌套的那些渲染在父工作区体内
 * 关闭嵌套（`nesting` 缺省）时退化成「全部工作区按虚拟分组平铺」，与没有这个特性时逐项相同
 *
 * `entries` 交出根节点条目的单一有序名单，未接管混排时按「分组在前、平铺在后」合成
 * @param nesting - 嵌套推导结果，缺省表示不按子工作区渲染
 */
export function buildRootLayout(
  workspaceIds: readonly string[],
  groups: readonly VirtualWorkspace[] | undefined,
  nesting?: Nesting | undefined,
): RootLayout {
  const known = new Set(workspaceIds)
  const groupOf = new Map<string, VirtualWorkspace>()
  const membership = new Map<string, string>()

  // 分组定义可能整格缺席，浏览器半边热重载会先换上新的客户端，而宿主半边要重启
  // `dsh` 才换，那段窗口里收到的是旧形状的快照（没有这一格）。缺格时退化成
  // 「没有工作区分组」而不是抛错
  for (const group of groups ?? []) {
    groupOf.set(group.id, group)
    for (const id of group.workspaceIds) {
      // 元数据里存在的工作区可能已被删除，列表是事实来源，跳过即可
      // 一个工作区被两个分组同时记录时以先出现的为准
      if (!known.has(id) || membership.has(id)) continue
      membership.set(id, group.id)
    }
  }

  /** 一个容器里的顶层成员，按注册表序，不开嵌套时原样返回 */
  const topsOf = (container: ContainerNode | undefined, members: readonly string[]): string[] => {
    if (nesting === undefined || container === undefined) return [...members]
    const roots = new Set(nesting.rootsOf(container))
    return members.filter((id) => roots.has(id))
  }

  /** 各分组的归属成员，按注册表序装配，与分组定义里的数组序无关 */
  const membersByGroup = new Map<string, string[]>()
  const looseMembers: string[] = []
  for (const id of workspaceIds) {
    const groupId = membership.get(id)
    if (groupId === undefined) {
      looseMembers.push(id)
      continue
    }
    const list = membersByGroup.get(groupId)
    if (list === undefined) membersByGroup.set(groupId, [id])
    else list.push(id)
  }

  const sections: VirtualWorkspaceSection[] = []
  for (const group of groups ?? []) {
    const ids = membersByGroup.get(group.id) ?? []
    sections.push({
      id: group.id,
      label: group.name,
      // 归属保住全量，内嵌不改变「它在哪个分组里」
      workspaceIds: ids,
      // 渲染只列这一层的顶层，被嵌套的那些在父工作区体内
      roots: topsOf(nesting?.containers.virtualOf(group.id), ids),
    })
  }

  // 未归组的那些同样只留最外层那一段的顶层，被嵌套的在父工作区体内
  const loose = topsOf(nesting?.containers.root, looseMembers)

  const entries: EntryAddress[] = [
    ...sections.map((section) => virtualAddress(section.id)),
    ...loose.map((id) => workspaceAddress(id)),
  ]
  return { groups: sections, loose, entries }
}

/**
 * 判定一个工作区当前所属的工作区分组
 * @returns 所属分组 id，不属于任何分组时返回空串
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
