/**
 * 分组元数据到渲染布局的切分
 *
 * 纯数据变换：输入工作区当前的会话行与分组定义，输出「分组段 + 未归组行」
 */
import type { Group } from '../remote.ts'
import type { GroupSection, SessionRow, WorkspaceLayout } from './types.ts'

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
