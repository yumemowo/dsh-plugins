/**
 * 置顶集合到渲染顺序的投影
 *
 * 官方集合的顺序、顺序位的合成与就地置顶的名次三处算错时界面都不会报错
 * 只表现为「置顶区拖过之后又跳回官方顺序」「新置顶的那条插到了中间」或「分组内的置顶段与置顶区先后不一致」
 */
import { describe, expect, it } from 'vitest'
import { frontPinnedRows, pinRanks, pinnedEntries, reconcilePinned } from '../src/client/data/pinned.ts'
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

describe('reconcilePinned', () => {
  /** 置顶集合的三条会话，官方集合顺序是 c、a、b */
  function entries(ids: readonly string[] = ['c', 'a', 'b']) {
    return pinnedEntries(
      ids,
      listState([{ id: 'a', updatedAt: 30 }, { id: 'b', updatedAt: 20 }, { id: 'c', updatedAt: 10 }]),
      [],
      new Map(),
      undefined,
    )
  }

  it('keeps the official set order when the pinned stretch has no slot', () => {
    // 旧数据零变化：没有顺序位时置顶区的显示与引入顺序位之前逐项相同
    expect(reconcilePinned(undefined, entries()).map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('treats an empty slot as no slot at all', () => {
    expect(reconcilePinned([], entries()).map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('follows the slot order for the members it names', () => {
    expect(reconcilePinned(['b', 'c', 'a'], entries()).map((entry) => entry.id)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  it('appends a newly pinned member after the ones the slot names', () => {
    // 新置顶的会话不在顺序位里，接在手动排过的那些之后
    const four = pinnedEntries(
      ['c', 'a', 'b', 'd'],
      listState([
        { id: 'a', updatedAt: 30 },
        { id: 'b', updatedAt: 20 },
        { id: 'c', updatedAt: 10 },
        { id: 'd', updatedAt: 40 },
      ]),
      [],
      new Map(),
      undefined,
    )

    expect(reconcilePinned(['b', 'a'], four).map((entry) => entry.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('returns a re-pinned member to the position the slot remembers', () => {
    // 取消置顶不写回顺序位，那一格因此留着；重新置顶时这条会话回到原来摆过的位次
    // 与上一条的分工：顺序位里从来没有它的新成员接在手动项之后，有过它的老成员回到原位
    const members = (ids: readonly string[]) =>
      pinnedEntries(
        ids,
        listState([
          { id: 'a', updatedAt: 30 },
          { id: 'b', updatedAt: 20 },
          { id: 'c', updatedAt: 10 },
        ]),
        [],
        new Map(),
        undefined,
      )
    // 用户把「b」摆到了最前，这一格此后不再随集合增删改写
    const slot = ['b', 'a', 'c']

    // 取消置顶：成员集合里没有它，那一格静默丢弃，但顺序位本身没被改写
    expect(reconcilePinned(slot, members(['c', 'a'])).map((entry) => entry.id)).toEqual(['a', 'c'])
    // 重新置顶：官方集合把它接在最前，渲染序却回到用户摆过的那一位
    expect(reconcilePinned(slot, members(['b', 'c', 'a'])).map((entry) => entry.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('drops a slot id that is no longer pinned', () => {
    // 取消置顶会在顺序位里留下已经不作数的 id，它不该在界面上占位
    expect(reconcilePinned(['b', 'gone', 'a'], entries()).map((entry) => entry.id)).toEqual([
      'b',
      'a',
      'c',
    ])
  })

  it('drops a slot id that is pinned but not visible', () => {
    // 归档的置顶项不渲染，它在顺序位里的那一格同样不占位
    const archived = pinnedEntries(
      ['b', 'a'],
      listState([{ id: 'a', updatedAt: 30 }, { id: 'b', updatedAt: 20 }]),
      ['b'],
      new Map(),
      undefined,
    )

    expect(reconcilePinned(['b', 'a'], archived).map((entry) => entry.id)).toEqual(['a'])
  })

  it('returns every member exactly once', () => {
    // 成员集合是事实来源：顺序位无论写了什么，界面都不该因此丢行或重复
    const out = reconcilePinned(['c', 'ghost', 'c'], entries()).map((entry) => entry.id)

    expect([...out].sort()).toEqual(['a', 'b', 'c'])
  })

  it('leaves the entry list alone', () => {
    const input = entries()
    reconcilePinned(['b', 'a', 'c'], input)

    expect(input.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
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

  it('numbers them by the reconciled order once the stretch has a slot', () => {
    // 置顶区拖过之后名次跟着换：两处读同一份顺序，分组内就地置顶因此与置顶区一致
    const ranks = pinRanks(
      reconcilePinned(
        ['a', 'c'],
        pinnedEntries(['c', 'a'], listState([{ id: 'a' }, { id: 'c' }]), [], new Map(), undefined),
      ),
    )

    expect(ranks.get('a')).toBe(0)
    expect(ranks.get('c')).toBe(1)
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
