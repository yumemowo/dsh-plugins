import { describe, expect, it } from 'vitest'
import { frontPinnedRows, pinRanks, pinnedEntries } from '../src/client/data/pinned.ts'
import { compareSessionRows, compareSessionRowsWithPins } from '../src/client/data/sessions.ts'
import type { SessionRow } from '../src/client/data/types.ts'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

/**
 * 造一份会话列表状态
 *
 * `current` 那一格落成会话自己的保留计数，与官方 `mainSessionId` 读的是同一处
 */
function listState(
  rows: { id: string; updatedAt?: number; blank?: boolean; origin?: 'subagent' }[],
  current?: string,
): SessionListState {
  const byId: Record<string, unknown> = {}
  for (const item of rows) {
    byId[item.id] = {
      id: item.id,
      displayTitle: item.id,
      running: false,
      blank: item.blank === true,
      retainedBy: item.id === current ? { mainView: 1 } : {},
      updatedAt: item.updatedAt ?? 0,
      ...(item.origin === undefined ? {} : { origin: item.origin }),
    }
  }
  return { ids: rows.map((r) => r.id), byId, phase: 'ready' } as unknown as SessionListState
}

/** 造一行会话渲染数据，供比较器的用例使用 */
function row(id: string, updatedAt = 0, blank = false): SessionRow {
  return { id, title: id, blank, running: false, runningSubagentCount: 0, completed: false, updatedAt }
}

describe('pinnedEntries', () => {
  it('follows the order of the pinned set rather than re-sorting it', () => {
    // 官方集合是「最近置顶在最前」，投影不该按更新时间重排
    const entries = pinnedEntries(
      ['c', 'a', 'b'],
      listState([{ id: 'a', updatedAt: 30 }, { id: 'b', updatedAt: 20 }, { id: 'c', updatedAt: 10 }]),
      [],
      new Map(),
      undefined,
    )

    expect(entries.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('drops archived sessions from the pinned set', () => {
    const entries = pinnedEntries(
      ['a', 'b'],
      listState([{ id: 'a' }, { id: 'b' }]),
      ['b'],
      new Map(),
      undefined,
    )

    expect(entries.map((entry) => entry.id)).toEqual(['a'])
  })

  it('drops subagent-origin sessions from the pinned set', () => {
    const entries = pinnedEntries(
      ['a', 'sub'],
      listState([{ id: 'a' }, { id: 'sub', origin: 'subagent' }]),
      [],
      new Map(),
      undefined,
    )

    expect(entries.map((entry) => entry.id)).toEqual(['a'])
  })

  it('drops blank sessions that are not the current one', () => {
    // 空白会话在列表里只保留当前那一条，置顶区沿用同一判据
    const entries = pinnedEntries(
      ['blank', 'a'],
      listState([{ id: 'blank', blank: true }, { id: 'a' }]),
      [],
      new Map(),
      'a',
    )

    expect(entries.map((entry) => entry.id)).toEqual(['a'])
  })

  it('drops pinned ids that are absent from the session snapshot', () => {
    const entries = pinnedEntries(['gone', 'a'], listState([{ id: 'a' }]), [], new Map(), undefined)

    expect(entries.map((entry) => entry.id)).toEqual(['a'])
  })

  it('reports the owning workspace and the current flag for each entry', () => {
    const entries = pinnedEntries(
      ['a'],
      listState([{ id: 'a', updatedAt: 5 }], 'a'),
      [],
      new Map([['a', 'w1']]),
      'a',
    )

    expect(entries[0]?.workspaceId).toBe('w1')
    expect(entries[0]?.current).toBe(true)
    expect(entries[0]?.row.updatedAt).toBe(5)
  })

  it('leaves the workspace undefined for a session that belongs to none', () => {
    const entries = pinnedEntries(['a'], listState([{ id: 'a' }]), [], new Map(), undefined)

    expect(entries[0]?.workspaceId).toBeUndefined()
  })
})

describe('pinRanks', () => {
  it('numbers the entries by their position in the pinned set', () => {
    const ranks = pinRanks(
      pinnedEntries(['c', 'a'], listState([{ id: 'a' }, { id: 'c' }]), [], new Map(), undefined),
    )

    expect(ranks.get('c')).toBe(0)
    expect(ranks.get('a')).toBe(1)
  })
})

describe('compareSessionRowsWithPins', () => {
  it('fronts pinned rows ahead of blank and recently updated ones', () => {
    // 官方口径是「空白最前、其余按最近更新倒序」，置顶要排在它前面，即「置顶 → 空白 → 其余」
    const pins = new Map([
      ['old', 0],
      ['new', 1],
    ])
    const sorted = [
      row('new', 10),
      row('blank', 99, true),
      row('old', 1),
      row('recent', 50),
    ].sort((a, b) => compareSessionRowsWithPins(pins, a, b))

    expect(sorted.map((r) => r.id)).toEqual(['old', 'new', 'blank', 'recent'])
  })

  it('keeps the plain order when nothing is pinned', () => {
    const sorted = [row('a', 10), row('blank', 0, true), row('b', 30)].sort((x, y) =>
      compareSessionRowsWithPins(new Map(), x, y),
    )

    expect(sorted.map((r) => r.id)).toEqual(['blank', 'b', 'a'])
  })

  it('falls back to the plain order inside each partition', () => {
    const pins = new Map([
      ['p1', 0],
      ['p2', 1],
    ])
    const sorted = [row('p2', 10), row('p1', 20), row('x', 5)].sort((a, b) =>
      compareSessionRowsWithPins(pins, a, b),
    )

    // 置顶区内部按名次，不看更新时间：p1 名次更小，虽然它更旧
    expect(sorted.map((r) => r.id)).toEqual(['p1', 'p2', 'x'])
  })

  it('agrees with compareSessionRows when the rank map is empty', () => {
    const a = row('a', 10)
    const b = row('b', 20)

    expect(compareSessionRowsWithPins(new Map(), a, b)).toBe(compareSessionRows(a, b))
  })
})

describe('frontPinnedRows', () => {
  it('moves the pinned rows up without reordering the rest', () => {
    // 未分组区段的既有行为是「保持会话列表原序」，因此未置顶的那几条必须逐格不动
    const rows = [row('s1', 10), row('s2', 30), row('s3', 20)]
    const pins = new Map([['s3', 0]])

    expect(frontPinnedRows(rows, pins).map((r) => r.id)).toEqual(['s3', 's1', 's2'])
  })

  it('orders several pinned rows by their rank, not by list order', () => {
    const rows = [row('a'), row('b'), row('c')]
    // c 名次更小 = 更晚置顶，因此排在 a 之前
    const pins = new Map([
      ['c', 0],
      ['a', 1],
    ])

    expect(frontPinnedRows(rows, pins).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns the plain list order when nothing is pinned', () => {
    const rows = [row('a', 10), row('b', 30), row('blank', 0, true)]

    // 空白行也不被前置：这里不做官方那套排序，只做置顶分区
    expect(frontPinnedRows(rows, new Map()).map((r) => r.id)).toEqual(['a', 'b', 'blank'])
  })

  it('leaves the input array untouched', () => {
    const rows = [row('a'), row('b')]
    frontPinnedRows(rows, new Map([['b', 0]]))

    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('handles an empty list', () => {
    expect(frontPinnedRows([], new Map([['a', 0]]))).toEqual([])
  })
})
