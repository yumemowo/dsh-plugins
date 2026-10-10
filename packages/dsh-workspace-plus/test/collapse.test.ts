import { describe, expect, it } from 'vitest'
import {
  COLLAPSED_SESSION_LIMIT_MAX,
  COLLAPSED_SESSION_LIMIT_MIN,
  RECENT_WINDOW_MS,
  collapseSessionRows,
} from '../src/client/data/collapse.ts'
import type { SessionRow } from '../src/client/data/types.ts'

/** 判定基准时刻，与 `Date.now()` 同量级，避免用例把 0 当成「很久以前」 */
const NOW = Date.parse('2026-10-02T12:00:00.000Z')

const DAY = 24 * 60 * 60 * 1000

/**
 * 造一行会话渲染数据
 * @param id - 会话 id
 * @param ageDays - 距今多少天没被用过，决定它算不算「最近用过」
 */
function row(id: string, ageDays: number, extra: Partial<SessionRow> = {}): SessionRow {
  return {
    id,
    title: id,
    blank: false,
    running: false,
    runningSubagentCount: 0,
    completed: false,
    updatedAt: NOW - ageDays * DAY,
    ...extra,
  }
}

/**
 * 造一串会话行，按更新时间从近到远
 * @param ages - 每行距今多少天没被用过，顺序即传入顺序
 */
function rows(...ages: number[]): SessionRow[] {
  return ages.map((age, index) => row(`s${index}`, age))
}

/** 始终展示并占额度的行 id，即区域容器算好后交给折叠的那份名单 */
function alwaysVisible(...ids: string[]): Set<string> {
  return new Set(ids)
}

/**
 * 判定步骤之外的两类用例
 *
 * 逐步判定本身按 5 步各一条，见下一个 describe；这里只收它没有单列的边界与不变量
 */
describe('collapseSessionRows', () => {
  it('counts a row updated exactly at the window edge as recent', () => {
    // 正好压线的那一条算最近用过：不算的话它会掉进步骤 4，被更旧的顶掉
    const all = [
      { ...row('edge', 0), updatedAt: NOW - RECENT_WINDOW_MS },
      row('near-0', 0),
      row('near-1', 1),
      row('near-2', 2),
      row('near-3', 2),
      row('far', 10),
    ]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual([
      'edge',
      'near-0',
      'near-1',
      'near-2',
      'near-3',
    ])
    expect(collapsed.hiddenCount).toBe(1)
  })

  it('preserves the order it was given', () => {
    // 输出顺序由调用方决定：工作区按最近更新倒序，「未分组」桶保持列表原序
    const all = [row('newest', 1), row('oldest', 40), row('middle', 20)]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(['newest', 'oldest', 'middle'])
  })

  it('follows the given order instead of re-sorting by recency', () => {
    // 传入顺序就是展示顺序，这里不重排：显示顺序将来由「自定义相对位置」决定，按时间重排会让被收起的
    // 恰好是用户摆在最前面的那条
    // 本用例刻意让传入顺序与时间序相反，把「不重排」这条钉住
    const all = [
      row('stale-1', 30),
      row('stale-2', 29),
      row('stale-3', 28),
      row('stale-4', 27),
      row('stale-5', 26),
      row('fresh', 1),
    ]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    // 步骤 3 先收下窗口内的 fresh，步骤 4 再从传入顺序开头补满下限，于是选中 stale-1、stale-2
    // 输出仍按传入顺序：stale-1、stale-2 在前，fresh 在它原本的位置上
    expect(collapsed.rows.map((r) => r.id)).toEqual(['stale-1', 'stale-2', 'fresh'])
    expect(collapsed.hiddenCount).toBe(3)
  })

  it('reports no hidden row for an empty scope', () => {
    expect(collapseSessionRows([], new Set(), NOW)).toEqual({ rows: [], hiddenCount: 0 })
  })

  it('keeps the ceiling above the floor', () => {
    // 两个常量反了就变成「最多 3 条」，这条挡住那种改动
    expect(COLLAPSED_SESSION_LIMIT_MAX).toBeGreaterThan(COLLAPSED_SESSION_LIMIT_MIN)
  })

  it('keeps the rows outside the idle state visible even when the idle rows are cut', () => {
    // 4 条旧的空闲行超过下限，被收到 3 条；空白、运行中与有运行中子代理的行照旧全部露出
    const all = [
      row('idle-1', 20),
      row('idle-2', 21),
      row('idle-3', 22),
      row('idle-4', 23),
      row('blank', 30, { blank: true }),
      row('running', 31, { running: true }),
      row('child', 32, { runningSubagentCount: 2 }),
    ]

    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual([
      'idle-1',
      'idle-2',
      'idle-3',
      'blank',
      'running',
      'child',
    ])
    expect(collapsed.hiddenCount).toBe(1)
  })
})

/**
 * 按步骤走一遍判定
 *
 * 每一步都是独立的分支，任一步定下成员集合即结束，因此逐步各一条
 */
describe('collapseSessionRows steps', () => {
  it('step 1: returns everything untouched while the scope fits inside the floor', () => {
    // 3 条正好压在下限上：没有可收起的东西，连窗口都不必看
    const all = [row('a', 40), row('b', 41), row('c', 42)]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows).toHaveLength(3)
    expect(collapsed.hiddenCount).toBe(0)
  })

  it('step 2: keeps only the listed rows once they exceed the ceiling', () => {
    // 6 条置顶超过上限，额度不再约束；空闲行一条也不补
    const pinned = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    const all = [...pinned.map((id) => row(id, 40)), row('recent', 1)]
    const collapsed = collapseSessionRows(all, alwaysVisible(...pinned), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(pinned)
  })

  it('step 2: adds the running rows after the listed ones when the list overflows', () => {
    // 置顶超过上限时只留置顶，未处于空闲状态的行照旧补在末尾
    const pinned = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5']
    const all = [
      ...pinned.map((id) => row(id, 40)),
      row('running', 50, { running: true }),
      row('recent', 1),
    ]
    const collapsed = collapseSessionRows(all, alwaysVisible(...pinned), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual([...pinned, 'running'])
  })

  it('step 3: tops up with the rows used inside the window, up to the ceiling', () => {
    // 无置顶、7 条都在窗口内：补到上限 5 条为止
    const collapsed = collapseSessionRows(rows(1, 1, 1, 1, 1, 1, 1), new Set(), NOW)

    expect(collapsed.rows).toHaveLength(5)
    expect(collapsed.hiddenCount).toBe(2)
  })

  it('step 3: counts the listed rows against the ceiling', () => {
    // 3 条旧置顶（窗口外）+ 1 条几分钟前：上限还剩 2 个名额，窗口内那 1 条补上，共 4 条
    const pinned = ['p7', 'p6', 'p5']
    const all = [
      row('p7', 7),
      row('p6', 6),
      row('p5', 5),
      row('current', 0.002),
      ...Array.from({ length: 51 }, (_, index) => row(`old${index}`, 10)),
    ]
    const collapsed = collapseSessionRows(all, alwaysVisible(...pinned), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(['p7', 'p6', 'p5', 'current'])
    // 3 条置顶 + 1 条当前 + 51 条旧的，共 55 条，收起 51 条
    expect(collapsed.hiddenCount).toBe(51)
  })

  it('step 3: stays at the floor when only one row was used inside the window', () => {
    // 窗口内只有 1 条：补到下限 3 条就停，第 4 条起是窗口外的
    const all = [row('fresh', 1), row('stale-1', 40), row('stale-2', 41), row('stale-3', 42)]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows).toHaveLength(3)
    expect(collapsed.hiddenCount).toBe(1)
  })

  it('step 4: tops up from outside the window when nothing was used inside it', () => {
    const all = rows(40, 41, 42, 43, 44)
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows).toHaveLength(3)
    expect(collapsed.hiddenCount).toBe(2)
  })

  it('step 4: tops up from outside the window along the given order', () => {
    // 窗口外的那几条同样沿传入顺序补，不按时间挑
    const all = [row('old-1', 50), row('old-2', 49), row('old-3', 40), row('old-4', 48)]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(['old-1', 'old-2', 'old-3'])
  })

  it('step 5: appends the running rows the earlier steps did not pick', () => {
    // 4 条旧空闲行 + 1 条窗口外的运行中：空闲行补到下限 3 条，运行中的那条由步骤 5 补在末尾
    const all = [
      row('idle-1', 20),
      row('idle-2', 21),
      row('idle-3', 22),
      row('idle-4', 23),
      row('running', 30, { running: true }),
    ]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(['idle-1', 'idle-2', 'idle-3', 'running'])
    expect(collapsed.hiddenCount).toBe(1)
  })

  it('step 3: counts a running row used inside the window against the ceiling', () => {
    // 窗口内的运行中行是步骤 3 的候选之一，它占掉一个名额，因此只再补 2 条旧的
    const all = [
      row('running', 1, { running: true }),
      ...Array.from({ length: 5 }, (_, index) => row(`stale${index}`, 10 + index)),
    ]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(['running', 'stale0', 'stale1'])
    expect(collapsed.hiddenCount).toBe(3)
  })

  it('step 3: counts a blank row used inside the window against the ceiling', () => {
    const all = [
      row('blank', 1, { blank: true }),
      ...Array.from({ length: 5 }, (_, index) => row(`stale${index}`, 10 + index)),
    ]
    const collapsed = collapseSessionRows(all, new Set(), NOW)

    expect(collapsed.rows.map((r) => r.id)).toEqual(['blank', 'stale0', 'stale1'])
    expect(collapsed.hiddenCount).toBe(3)
  })
})
