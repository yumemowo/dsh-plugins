/**
 * 一段成员的换位换算
 *
 * 同一件事今天要在三处各写一遍：拖拽计划的换算、落点关系里的位次、宿主侧的写入。
 * 三处的差异只在「没变化」怎么表达（`null` / 原数组 / `undefined`），因此把它们收成一处，
 * 只留一种答案：**不需要写盘时返回 `undefined`**。
 *
 * 纯字符串序列上的操作，与业务无关：会话分组、置顶段、工作区分组、工作区注册表序都是同一形状，
 * 因此宿主半边也用得上，放在 `src/` 而不是 `src/client/`。
 */

/** 一个新位次：插到某个成员之前 / 之后，或落到末尾 */
export type Anchor =
  | { kind: 'before'; id: string }
  | { kind: 'after'; id: string }
  | { kind: 'end' }

/**
 * 一次换位的结果
 *
 * 「动了」「没动」「对不上」三件事分开，因为它们对调用方的含义不同：前者要写盘，
 * 中者是正常无操作，后者说明两侧数据已经不同步（来源不在这一份里，或锚点不是它的成员）。
 * 只把它们压成一个 `undefined` 会让后两种在日志里长得一样
 */
export type Placement =
  | { kind: 'placed'; order: string[] }
  | { kind: 'unchanged' }
  | { kind: 'unknown'; reason: 'source' | 'anchor' }

/**
 * 把被拖的成员挪到锚点指的新位次
 * @param order - 当前顺序，这一段的全量成员
 * @param movingId - 被挪动的成员
 * @param anchor - 新位次
 * @returns 新顺序、无变化、或对不上
 */
export function placeAt(
  order: readonly string[],
  movingId: string,
  anchor: Anchor,
): Placement {
  if (!order.includes(movingId)) return { kind: 'unknown', reason: 'source' }
  const rest = order.filter((id) => id !== movingId)
  let at = rest.length
  if (anchor.kind !== 'end') {
    // 锚点就是自己：挪到自己前面等于没动，不必判成「锚点不是这一份的成员」
    if (anchor.id === movingId) return { kind: 'unchanged' }
    at = rest.indexOf(anchor.id)
    if (at < 0) return { kind: 'unknown', reason: 'anchor' }
    if (anchor.kind === 'after') at += 1
  }
  const next = [...rest.slice(0, at), movingId, ...rest.slice(at)]
  if (next.every((id, index) => id === order[index])) return { kind: 'unchanged' }
  return { kind: 'placed', order: next }
}

/**
 * 新位次对应的新顺序，只在真的动了时交回
 *
 * 调用方只需要「要不要写、写什么」两个答案时用它；要区分「没动」与「对不上」时用 {@link placeAt}
 * @param order - 当前顺序
 * @param movingId - 被挪动的成员
 * @param anchor - 新位次
 * @returns 新顺序，不需要写盘时为 undefined
 */
export function placeBefore(
  order: readonly string[],
  movingId: string,
  anchor: Anchor,
): string[] | undefined {
  const placement = placeAt(order, movingId, anchor)
  return placement.kind === 'placed' ? placement.order : undefined
}

/**
 * 新顺序里「插到谁之前」那一格
 *
 * 也是「这一条的下一位是谁」，因此落点缝的代言人从同一处取：那不是两个问题
 * 被挪的成员排到末尾时没有下一位，返回 `undefined`，宿主方法把缺参数读作同一个意思
 * @param order - 换位之后的顺序
 * @param movingId - 被挪动的成员
 */
export function beforeIdOf(order: readonly string[], movingId: string): string | undefined {
  return order[order.indexOf(movingId) + 1]
}
