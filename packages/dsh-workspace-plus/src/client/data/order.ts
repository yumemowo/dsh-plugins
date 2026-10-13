/**
 * 顺序位到渲染顺序的换算
 *
 * 顺序位只记 id，成员集合另有一份来源（分组的 `sessionIds`、会话列表、置顶集合），两者会漂移：
 * 新会话不在顺序位里、被归档或移出的会话还留在顺序位里
 * 因此渲染不直接用顺序位，而是把它与成员集合对一遍
 *
 * 没有顺序位时按时间序，与顺序位这一格不存在时逐项相同——这是「旧数据零变化」那条验收的落点
 */

/**
 * 快照里那一格顺序位表
 *
 * 段键 → 手动顺序，缺一格表示该段按时间序
 * 形状由 `segment.ts` 的构造函数钉住，这里只声明读取侧的形状
 */
export type OrderSlots = Readonly<Record<string, readonly string[]>>

/**
 * 一段成员按顺序位与时间序合成后的渲染顺序
 *
 * 顺序位里仍然是成员的按顺序位排在前，不在顺序位里的成员按时间序接在后面
 * 顺序位里已不是成员的 id 静默丢弃：归档、删除、移出分组都会留下这种 id，它们不该在界面上占位
 *
 * 成员集合是事实来源，顺序位只在它的范围内定次序：一个成员被两个分组同时记录、或顺序位里出现了别的段的 id 时，界面都不会因此丢行或重复
 * @param slot - 该段的顺序位，缺省表示这一段没有手动顺序
 * @param members - 该段当前的成员
 * @param compare - 时间序比较器，无手动顺序与顺序位外的成员都按它排
 * @returns 渲染顺序，成员身份与传入的一致
 */
export function reconcileOrder<T extends { id: string }>(
  slot: readonly string[] | undefined,
  members: readonly T[],
  compare: (a: T, b: T) => number,
): T[] {
  // 空表与缺席同义：两者都表示这一段没有手动顺序，留一份空数组只是落盘时的一格噪音
  if (slot === undefined || slot.length === 0) return [...members].sort(compare)

  const byId = new Map(members.map((member) => [member.id, member]))
  const ordered: T[] = []
  const placed = new Set<string>()
  for (const id of slot) {
    const member = byId.get(id)
    // 同一个 id 在顺序位里只认第一格：重复的 id 会让同一个成员在界面上出现两次
    if (member === undefined || placed.has(id)) continue
    placed.add(id)
    ordered.push(member)
  }
  const rest = members.filter((member) => !placed.has(member.id)).sort(compare)
  return [...ordered, ...rest]
}
