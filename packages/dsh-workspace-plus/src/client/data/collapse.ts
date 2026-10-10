/**
 * 一个展示范围内会话行的折叠
 *
 * 「展示范围」是一个工作区的未归组会话、工作区内的一个会话分组，或末尾的「未分组」桶
 * 每个范围各自算一次，因此收起一个分组不影响另一个工作区那一段
 *
 * 传入的 rows 就是展示顺序，这里不重排：窗口判据只读 updatedAt，用来分辨「最近用过」与「太久没用」
 * 当前展示顺序恰好由 updatedAt 决定，两条因此一致
 *
 * TODO: 等会话支持自定义相对位置，窗口判据要重定；那时用户摆的位置比时间更能说明重要性
 * 官方那套顺序投影与本模块要改的三处见 docs/session-collapse.md
 *
 * 与官方 `collapsedSessionRows` 的差异只在额度怎么算：官方把空闲行数到 5 就停
 * 这里的步骤见 {@link collapseSessionRows}，多出的是「最近用过」这条时间判据与 3 条下限
 */
import type { SessionRow } from './types.ts'

/** 一个展示范围内展示条数的上限 */
export const COLLAPSED_SESSION_LIMIT_MAX = 5

/** 一个展示范围内展示条数的下限 */
export const COLLAPSED_SESSION_LIMIT_MIN = 3

/** 「最近用过」的窗口长度 */
export const RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

/** 折叠结果 */
export interface CollapsedSessionRows {
  /** 折叠态下要展示的行，顺序与传入的 rows 一致 */
  rows: SessionRow[]
  /** 被收起的条数，溢出按钮据此报出「展开其余 n 个会话」 */
  hiddenCount: number
}

/**
 * 判定一行是否处于空闲状态之外
 *
 * 三类：新建中的空白行、会话自己正在运行的行、名下有运行中子代理的行
 * 它们参与步骤 3 的计数（窗口判据看它们自己的更新时间），落选的那些由步骤 5 补上
 * @param row - 待判定的会话行
 */
function isBusy(row: SessionRow): boolean {
  return row.blank || row.running || row.runningSubagentCount > 0
}

/**
 * 数出一个展示范围内要展示的行
 *
 * 步骤按顺序走，任一分支定下成员集合即结束：
 *
 * 1. 整段条数不超过下限：没有可收起的东西，全部展示
 * 2. 置顶超过上限：只留全部置顶，额度不再约束，跳到第 5 步
 * 3. 否则沿传入顺序补上窗口内用过的行（含未处于空闲状态的那些），总数到上限为止
 * 4. 补完仍不足下限：沿传入顺序继续补窗口之外的，补到下限为止
 * 5. 不论走到哪一步，仍未入选的未空闲行一律补上
 *
 * 第 3、4 步沿传入顺序走而不是按时间重排：传入的就是展示顺序，重排会让被收起的恰好是用户摆在最前面的那条
 * 窗口判据（`now - updatedAt`）只决定一段是「最近用过」还是「太久没用」，不决定次序
 * @param rows - 本范围内的全部会话行，顺序即展示顺序
 * @param alwaysVisible - 本范围内始终展示的行 id
 * @param now - 判定「最近用过」的基准时刻
 * @returns 要展示的行与被收起的条数
 */
export function collapseSessionRows(
  rows: readonly SessionRow[],
  alwaysVisible: ReadonlySet<string>,
  now: number,
): CollapsedSessionRows {
  // 1. 整段本身就不超过下限，没有可收起的东西
  if (rows.length <= COLLAPSED_SESSION_LIMIT_MIN) {
    return { rows: [...rows], hiddenCount: 0 }
  }

  const pinned = rows.filter((row) => alwaysVisible.has(row.id))
  // 未空闲的行与空闲的行同处一池：步骤 3 按它们各自的更新时间一起判窗口
  const others = rows.filter((row) => !alwaysVisible.has(row.id))

  const kept: SessionRow[] = [...pinned]
  // 2. 置顶超过上限时额度不再约束，置顶照常全部露出
  if (pinned.length <= COLLAPSED_SESSION_LIMIT_MAX) {
    // 3. 窗口内用过的补上，总数到上限为止
    for (const row of others) {
      if (kept.length >= COLLAPSED_SESSION_LIMIT_MAX) break
      if (now - row.updatedAt > RECENT_WINDOW_MS) continue
      kept.push(row)
    }
    // 4. 仍不足下限时继续补窗口之外的，补到下限为止
    for (const row of others) {
      if (kept.length >= COLLAPSED_SESSION_LIMIT_MIN) break
      if (kept.includes(row)) continue
      kept.push(row)
    }
  }
  // 5. 前面几步没选上的未空闲行一律补上，它们不受上面几条边界约束
  kept.push(...others.filter((row) => isBusy(row) && !kept.includes(row)))

  const shown = new Set(kept.map((row) => row.id))
  return {
    rows: rows.filter((row) => shown.has(row.id)),
    hiddenCount: rows.length - shown.size,
  }
}
