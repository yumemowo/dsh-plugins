/**
 * 拖拽命中层的纯逻辑
 *
 * 命中算错时界面不会报错，只表现为「拖过去放不进那一段」或「放进了另一段」，
 * 因此这里逐条钉住区域键的编解码、计划查表、最近行的前后半判定，以及三种「查不到」的缺席：
 * 不在计划表里的区域、原地投放（构造期就不收进计划）、区域里一行都没有
 *
 * 命中函数只读 `getAttribute` 与 `getBoundingClientRect`，因此替身给这两格就够，
 * 不必拉起 jsdom 或搭一棵真实元素树
 */
import { describe, expect, it } from 'vitest'
import {
  DROP_ATTRIBUTE,
  PINNED_KEY,
  ROOT_KEY,
  ROW_ATTRIBUTE,
  ZONE_ATTRIBUTE,
  beforeIdOf,
  containsPoint,
  findZone,
  groupHeadKey,
  groupOfZoneKey,
  halfOf,
  looseKey,
  nearestRow,
  orderDragPlan,
  reorderTo,
  resolveHit,
  sessionGroupKey,
  targetOfZone,
  virtualWorkspaceHeadKey,
  workspaceOfZoneKey,
} from '../src/client/data/dnd.ts'
import type { DragPlan, DragPlanTarget, DropAnchor } from '../src/client/data/dnd.ts'

/** 一条矩形带 */
interface Band {
  left?: number
  right?: number
  top: number
  height: number
}

/**
 * 造一个只带命中层读得到的那两格的东西
 * @param attributes - 元素上的标记属性
 * @param band - 元素的矩形，缺省表示它量不出布局（jsdom 里的真实情形）
 */
function node(attributes: Record<string, string>, band?: Band): Element {
  const rect = {
    left: band?.left ?? 0,
    right: band?.right ?? 200,
    top: band?.top ?? 0,
    height: band?.height ?? 0,
    get bottom(): number {
      return this.top + this.height
    },
  }
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    getBoundingClientRect: () => rect,
  } as unknown as Element
}

/** 一个区域元素，带区域键 */
function zone(key: string, band?: Band): Element {
  return node({ [ZONE_ATTRIBUTE]: key }, band)
}

/** 一个参照行元素，带行 id */
function row(id: string, band: Band): Element {
  return node({ [ROW_ATTRIBUTE]: id }, band)
}

/** 一个只接整块投放的计划目标 */
function container(sink: DropAnchor[]): DragPlanTarget {
  return { mode: 'container', commit: (anchor) => sink.push(anchor) }
}

/** 一张计划表，键即区域键 */
function plan(targets: Record<string, DragPlanTarget>): DragPlan {
  return { source: { kind: 'session', id: 'session-1' }, targets: new Map(Object.entries(targets)) }
}

/** 指针位置 */
function at(y: number, x = 100): { x: number; y: number } {
  return { x, y }
}

describe('zone keys', () => {
  it('encodes the workspace and the group into a session group key', () => {
    expect(sessionGroupKey('ws-1', 'group-a')).toBe('sessionGroup/ws-1/group-a')
  })

  it('encodes a loose stretch key per workspace', () => {
    expect(looseKey('ws-1')).toBe('loose/ws-1')
  })

  it('reads the workspace back out of both key families', () => {
    expect(workspaceOfZoneKey('sessionGroup/ws-1/group-a')).toBe('ws-1')
    expect(workspaceOfZoneKey('loose/ws-2')).toBe('ws-2')
  })

  it('reads no workspace out of a key that belongs to no workspace', () => {
    // 置顶区与根节点两层跨工作区共用一格，归属问题对它们没有答案
    expect(workspaceOfZoneKey(PINNED_KEY)).toBeUndefined()
    expect(workspaceOfZoneKey(ROOT_KEY)).toBeUndefined()
    expect(workspaceOfZoneKey('')).toBeUndefined()
  })

  it('reads the group back out of a session group key only', () => {
    expect(groupOfZoneKey('sessionGroup/ws-1/group-a')).toBe('group-a')
    // 未归组段没有分组这一层，硬读出来一个空串会被当成「有个叫空串的分组」
    expect(groupOfZoneKey('loose/ws-1')).toBeUndefined()
    expect(groupOfZoneKey(PINNED_KEY)).toBeUndefined()
  })
})

describe('plan lookup', () => {
  it('finds the target a zone key names', () => {
    const sinks = { a: [] as DropAnchor[], b: [] as DropAnchor[] }
    const p = plan({
      'sessionGroup/ws-1/group-a': container(sinks.a),
      'loose/ws-1': container(sinks.b),
    })

    expect(targetOfZone(p, 'sessionGroup/ws-1/group-a')?.mode).toBe('container')
    expect(targetOfZone(p, 'loose/ws-1')?.mode).toBe('container')
  })

  it('reads nothing out of a zone the plan never declared', () => {
    // 不接的区域不是「被拒绝」，是「从未被计划」：查不到这一格就是这次拖拽不落这里
    const p = plan({ 'loose/ws-1': container([]) })

    expect(targetOfZone(p, 'sessionGroup/ws-1/group-a')).toBeUndefined()
    expect(targetOfZone(p, 'sessionGroup/ws-2/group-a')).toBeUndefined()
  })
})

describe('zone hit while walking up', () => {
  it('picks the innermost zone the plan accepts', () => {
    const p = plan({
      'loose/ws-1': container([]),
      'sessionGroup/ws-1/group-a': container([]),
    })
    // 分组头嵌在工作区块里，两个键都在计划表里，命中的是更内层那个
    const inner = zone('sessionGroup/ws-1/group-a')
    const outer = zone('loose/ws-1')

    expect(findZone([inner, outer], p)?.element).toBe(inner)
  })

  it('stops at the nearest zone and takes nothing when the plan leaves it out', () => {
    // 走到第一个带区域键的元素就停，不再往上找：原地投放靠这条读法成立
    // 拖回自己所在那一段时那一段的键不在计划里，继续向上走会让包着它的区域接到这次落点，
    // 把一次原地投放读成「移出这一段」
    const p = plan({ 'loose/ws-1': container([]) })
    const inner = zone('loose/ws-2')
    const outer = zone('loose/ws-1')

    expect(findZone([inner, outer], p)).toBeNull()
  })

  it('keeps walking while the elements above carry no zone key at all', () => {
    // 中间层（撑开体、行容器）不带标记，它们不构成「最近的那一个区域」
    const p = plan({ 'loose/ws-1': container([]) })
    const outer = zone('loose/ws-1')

    expect(findZone([node({}), node({ 'data-wg-stagger': '' }), outer], p)?.zoneKey).toBe('loose/ws-1')
  })

  it('reads no zone when nothing along the way carries a zone key', () => {
    const p = plan({ 'loose/ws-1': container([]) })

    expect(findZone([node({}), node({})], p)).toBeNull()
    expect(findZone([], p)).toBeNull()
  })

  it('lets an unmarked element in the middle pass through to the zone above it', () => {
    const p = plan({ 'loose/ws-1': container([]) })
    // 撑开体、行容器这些中间层都不带标记，向上走时直接跳过
    const target = node({ 'data-wg-stagger': '' })
    const outer = zone('loose/ws-1')

    expect(findZone([target, node({}), outer], p)?.zoneKey).toBe('loose/ws-1')
  })
})

describe('half of a row band', () => {
  it('reads the upper half as before and the lower half as after', () => {
    const band = { top: 100, height: 40 }

    expect(halfOf(band, 100)).toBe('before')
    expect(halfOf(band, 119)).toBe('before')
    expect(halfOf(band, 121)).toBe('after')
    expect(halfOf(band, 140)).toBe('after')
  })

  it('puts the exact centre on after', () => {
    // 中线上取「之后」：前后半相邻两行的分界因此落在同一侧，不会出现既不属于上一行又不属于下一行的缝
    expect(halfOf({ top: 100, height: 40 }, 120)).toBe('after')
  })

  it('reads a zero-height band as after everywhere', () => {
    // 量不出布局的元素（折叠后仍在文档里的行）高度为零，此时没有前半可言
    expect(halfOf({ top: 100, height: 0 }, 100)).toBe('after')
  })
})

describe('point inside a band', () => {
  const band = { left: 10, top: 100, right: 210, bottom: 140 }

  it('accepts a point inside and on the edges', () => {
    expect(containsPoint(band, at(120, 100))).toBe(true)
    expect(containsPoint(band, at(100, 10))).toBe(true)
    expect(containsPoint(band, at(140, 210))).toBe(true)
  })

  it('rejects a point outside on either axis', () => {
    expect(containsPoint(band, at(99, 100))).toBe(false)
    expect(containsPoint(band, at(141, 100))).toBe(false)
    expect(containsPoint(band, at(120, 9))).toBe(false)
    expect(containsPoint(band, at(120, 211))).toBe(false)
  })
})

describe('nearest row in a stretch', () => {
  const rows = [
    row('session-1', { top: 0, height: 40 }),
    row('session-2', { top: 40, height: 40 }),
    row('session-3', { top: 80, height: 40 }),
  ]

  it('picks the row the pointer is standing on', () => {
    expect(nearestRow(rows, at(10))).toEqual({ rowId: 'session-1', half: 'before' })
    expect(nearestRow(rows, at(30))).toEqual({ rowId: 'session-1', half: 'after' })
    expect(nearestRow(rows, at(50))).toEqual({ rowId: 'session-2', half: 'before' })
    expect(nearestRow(rows, at(90))).toEqual({ rowId: 'session-3', half: 'before' })
  })

  it('picks the closest row when the pointer sits in the gap between two', () => {
    const spaced = [
      row('session-1', { top: 0, height: 40 }),
      row('session-2', { top: 46, height: 40 }),
    ]

    // 缝隙里偏上，最近的是上一行，读作追加到它之后
    expect(nearestRow(spaced, at(42))).toEqual({ rowId: 'session-1', half: 'after' })
    // 偏下，最近的是下一行，读作插到它之前
    expect(nearestRow(spaced, at(45))).toEqual({ rowId: 'session-2', half: 'before' })
  })

  it('reads a pointer below every row as landing after the last one', () => {
    // 段尾空白：最近的那一行仍是最后一行
    expect(nearestRow(rows, at(400))).toEqual({ rowId: 'session-3', half: 'after' })
  })

  it('reads a pointer above every row as landing before the first one', () => {
    expect(nearestRow(rows, at(-50))).toEqual({ rowId: 'session-1', half: 'before' })
  })

  it('keeps the earlier row when two rows measure the same distance', () => {
    // 等高相邻两行的分界上取先出现的那个，否则同一个指针位置会在两行之间来回跳
    const tie = [
      row('session-1', { top: 0, height: 20 }),
      row('session-2', { top: 20, height: 20 }),
    ]

    expect(nearestRow(tie, at(20))).toEqual({ rowId: 'session-1', half: 'after' })
  })

  it('reads no row while the stretch renders none', () => {
    // 空分组：一行都没有，落点因此只有整块投放一种读法
    expect(nearestRow([], at(20))).toBeNull()
  })

  it('skips an element that carries no row marker', () => {
    expect(nearestRow([node({}, { top: 0, height: 40 })], at(20))).toBeNull()
  })
})

describe('resolving a hit', () => {
  it('always reads a whole-block landing for a container target', () => {
    const rows = [row('session-1', { top: 0, height: 40 }), row('session-2', { top: 40, height: 40 })]

    // container 档不按上下半分档，段里有没有行都是整块落进容器
    for (const y of [0, 20, 60, 400]) {
      expect(resolveHit({ zoneKey: 'sessionGroup/ws-1/group-a', target: container([]), rows, point: at(y) }))
        .toEqual({ zoneKey: 'sessionGroup/ws-1/group-a', anchor: { kind: 'inside' } })
    }
  })

  it('reads the row halves for a rows target', () => {
    const rows = [row('session-1', { top: 0, height: 40 }), row('session-2', { top: 40, height: 40 })]
    const target: DragPlanTarget = { mode: 'rows', commit: () => {} }

    expect(resolveHit({ zoneKey: 'loose/ws-1', target, rows, point: at(10) })).toEqual({
      zoneKey: 'loose/ws-1',
      anchor: { kind: 'before', rowId: 'session-1' },
    })
    expect(resolveHit({ zoneKey: 'loose/ws-1', target, rows, point: at(30) })).toEqual({
      zoneKey: 'loose/ws-1',
      anchor: { kind: 'after', rowId: 'session-1' },
    })
  })

  it('reads an empty rows stretch as appending to the end', () => {
    const target: DragPlanTarget = { mode: 'rows', commit: () => {} }

    expect(resolveHit({ zoneKey: 'loose/ws-1', target, rows: [], point: at(20) })).toEqual({
      zoneKey: 'loose/ws-1',
      anchor: { kind: 'inside' },
    })
  })

  it('carries the zone key through so the commit can name its stretch', () => {
    const hit = resolveHit({
      zoneKey: 'loose/ws-1',
      target: container([]),
      rows: [],
      point: at(0),
    })

    expect(hit?.zoneKey).toBe('loose/ws-1')
  })
})

describe('a plan that leaves the origin out', () => {
  it('carries no target for the stretch the dragged session already sits in', () => {
    // 原地投放从运行期判据变成构造期缺席：拖回自己那一段时查不到目标，
    // 命中层因此既不标记也不提交
    const p = plan({
      'sessionGroup/ws-1/group-b': container([]),
      'loose/ws-2': container([]),
    })

    expect(targetOfZone(p, 'sessionGroup/ws-1/group-a')).toBeUndefined()
    expect(targetOfZone(p, 'loose/ws-1')).toBeUndefined()
  })

  it('still carries every other stretch of the same workspace', () => {
    const p = plan({
      'sessionGroup/ws-1/group-b': container([]),
      'loose/ws-1': container([]),
    })

    expect([...p.targets.keys()]).toEqual(['sessionGroup/ws-1/group-b', 'loose/ws-1'])
  })

  it('keeps the dragged session in the source rather than in the target table', () => {
    // 来源是一格独立的事实，不在目标表里：目标表回答「能落到哪」，来源回答「拖的是谁」
    const p: DragPlan = {
      source: { kind: 'session', id: 'session-1' },
      targets: new Map([['loose/ws-1', container([])]]),
    }

    expect(p.source).toEqual({ kind: 'session', id: 'session-1' })
    expect([...p.targets.keys()].some((key) => key.includes('session-1'))).toBe(false)
  })
})

describe('turning a drop anchor into a new order', () => {
  const ORDER = ['group-a', 'group-b', 'group-c']

  it('moves a member before the row it was dropped above', () => {
    expect(reorderTo(ORDER, 'group-c', { kind: 'before', rowId: 'group-a' })).toEqual([
      'group-c',
      'group-a',
      'group-b',
    ])
  })

  it('moves a member after the row it was dropped below', () => {
    expect(reorderTo(ORDER, 'group-a', { kind: 'after', rowId: 'group-c' })).toEqual([
      'group-b',
      'group-c',
      'group-a',
    ])
  })

  it('appends the member when the drop reads as inside', () => {
    // 区域里一行都没有时命中层给的是 inside，读作追加到段尾
    expect(reorderTo(ORDER, 'group-a', { kind: 'inside' })).toEqual([
      'group-b',
      'group-c',
      'group-a',
    ])
  })

  it('reports no change when the member is dropped on the row just below it', () => {
    // 落在下一位的上半：算出来仍是原位，这是一次相邻位空操作，不该写盘
    expect(reorderTo(ORDER, 'group-a', { kind: 'before', rowId: 'group-b' })).toBeUndefined()
  })

  it('reports no change when the member is dropped on the row just above it', () => {
    expect(reorderTo(ORDER, 'group-b', { kind: 'after', rowId: 'group-a' })).toBeUndefined()
  })

  it('reports no change when the member is dropped on itself', () => {
    expect(reorderTo(ORDER, 'group-b', { kind: 'before', rowId: 'group-b' })).toBeUndefined()
    expect(reorderTo(ORDER, 'group-b', { kind: 'after', rowId: 'group-b' })).toBeUndefined()
  })

  it('reports no change when the member is not part of the stretch', () => {
    // 快照可能在拖拽期间被别处改过，来源已不在这一段里时按无操作读
    expect(reorderTo(ORDER, 'group-z', { kind: 'before', rowId: 'group-a' })).toBeUndefined()
  })

  it('reports no change when the anchor is not part of the stretch', () => {
    // 锚点资格的第二半：锚点必须仍是这一段的其他成员
    expect(reorderTo(ORDER, 'group-a', { kind: 'before', rowId: 'group-z' })).toBeUndefined()
  })

  it('keeps a single-member stretch unchanged', () => {
    expect(reorderTo(['group-a'], 'group-a', { kind: 'inside' })).toBeUndefined()
  })

  it('reads the next member as the anchor of the new order', () => {
    // 新顺序里排在末尾的那个成员没有下一位，宿主把缺参数读作「挪到末尾」
    expect(beforeIdOf(['group-c', 'group-a', 'group-b'], 'group-c')).toBe('group-a')
    expect(beforeIdOf(['group-b', 'group-c', 'group-a'], 'group-a')).toBeUndefined()
  })
})

describe('building an ordering drag plan', () => {
  it('collects every other member of the stretch as a rows target', () => {
    const p = orderDragPlan({
      source: { kind: 'virtualWorkspace', groupId: 'wg-1' },
      keyOf: virtualWorkspaceHeadKey,
      order: ['wg-1', 'wg-2'],
      movingId: 'wg-1',
      commit: () => {},
    })

    expect([...p.targets.keys()]).toEqual([virtualWorkspaceHeadKey('wg-2')])
    expect(p.targets.get(virtualWorkspaceHeadKey('wg-2'))?.mode).toBe('rows')
  })

  it('leaves the source member out of its own target table', () => {
    // 原地投放是构造期缺席：拖回自己那一格时命中层查不到，既不标记也不提交
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-a' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b'],
      movingId: 'group-a',
      commit: () => {},
    })

    expect(p.targets.has(groupHeadKey('ws-1', 'group-a'))).toBe(false)
    expect(p.targets.has(groupHeadKey('ws-1', 'group-b'))).toBe(true)
  })

  it('commits the anchor of the converted order', () => {
    const seen: (string | undefined)[] = []
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-c' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b', 'group-c'],
      movingId: 'group-c',
      commit: (beforeId) => seen.push(beforeId),
    })

    p.targets.get(groupHeadKey('ws-1', 'group-a'))?.commit({ kind: 'before', rowId: 'group-a' })
    expect(seen).toEqual(['group-a'])
  })

  it('skips the write when the converted order is unchanged', () => {
    const seen: (string | undefined)[] = []
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-a' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b'],
      movingId: 'group-a',
      commit: (beforeId) => seen.push(beforeId),
    })

    p.targets.get(groupHeadKey('ws-1', 'group-b'))?.commit({ kind: 'before', rowId: 'group-b' })
    expect(seen).toEqual([])
  })

  it('commits no anchor when the member lands at the end of the stretch', () => {
    const seen: (string | undefined)[] = []
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-a' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b', 'group-c'],
      movingId: 'group-a',
      commit: (beforeId) => seen.push(beforeId),
    })

    p.targets.get(groupHeadKey('ws-1', 'group-c'))?.commit({ kind: 'after', rowId: 'group-c' })
    expect(seen).toEqual([undefined])
  })

  it('keeps the plan target table empty for a stretch of one', () => {
    const p = orderDragPlan({
      source: { kind: 'virtualWorkspace', groupId: 'wg-1' },
      keyOf: virtualWorkspaceHeadKey,
      order: ['wg-1'],
      movingId: 'wg-1',
      commit: () => {},
    })

    expect(p.targets.size).toBe(0)
  })
})

describe('the two markers the mechanism owns', () => {
  it('keeps the zone and row markers on separate attributes', () => {
    // 同一个元素上两种标记各说一件事：区域键回答「这是哪一段」，行 id 回答「这是哪一行」
    // 合成一个属性会让一个既接整块投放又可作参照行的元素只说得出一件事
    expect(ZONE_ATTRIBUTE).toBe('data-wg-dnd')
    expect(ROW_ATTRIBUTE).toBe('data-wg-dnd-row')
    expect(DROP_ATTRIBUTE).toBe('data-wg-drop')
  })
})
