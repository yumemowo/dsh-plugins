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
  insertAtAnchor,
  looseKey,
  nearestRow,
  orderDragPlan,
  reorderTo,
  resolveHit,
  sessionAnchorPlan,
  sessionGroupKey,
  stretchDragPlan,
  targetOfZone,
  virtualWorkspaceBodyKey,
  virtualWorkspaceHeadKey,
  workspaceDragPlan,
  workspaceHeadKey,
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

describe('inserting a member that is not in the stretch yet', () => {
  const ORDER = ['a', 'b', 'c']

  it('inserts before the row it was dropped above', () => {
    // 与段内换位的分工按「来源是否已经在这一段里」划开：这一个从别段插进来，长度必然改变
    expect(insertAtAnchor(ORDER, 'x', { kind: 'before', rowId: 'b' })).toEqual(['a', 'x', 'b', 'c'])
  })

  it('inserts after the row it was dropped below', () => {
    expect(insertAtAnchor(ORDER, 'x', { kind: 'after', rowId: 'b' })).toEqual(['a', 'b', 'x', 'c'])
  })

  it('appends the member when the drop reads as inside', () => {
    // 段尾与空段的落点都是 inside，读作追加
    expect(insertAtAnchor(ORDER, 'x', { kind: 'inside' })).toEqual(['a', 'b', 'c', 'x'])
  })

  it('appends when the whole stretch is empty', () => {
    expect(insertAtAnchor([], 'x', { kind: 'inside' })).toEqual(['x'])
  })

  it('falls back to the tail when the anchor is not part of the stretch', () => {
    // 拖拽期间快照可能被别处改过，段尾比丢掉这次投放更接近用户的意图
    expect(insertAtAnchor(ORDER, 'x', { kind: 'before', rowId: 'ghost' })).toEqual(['a', 'b', 'c', 'x'])
  })

  it('does not duplicate a member that is already in the stretch', () => {
    // 换算前先摘掉它原有的那一格，否则同一个成员会在界面上出现两次
    expect(insertAtAnchor(ORDER, 'b', { kind: 'after', rowId: 'c' })).toEqual(['a', 'c', 'b'])
  })
})

describe('building a session drag plan', () => {
  /** 一个分组段与它的渲染序 */
  const SECTIONS = [
    { id: 'group-a', order: ['s-1', 's-2'] },
    { id: 'group-b', order: ['s-3'] },
  ]

  /** 记下一次计划里各格的档位 */
  function modes(plan: DragPlan): [string, string][] {
    return [...plan.targets.entries()].map(([key, target]) => [key, target.mode])
  }

  /**
   * 造一个只收落点回调的计划
   *
   * 三个回调各自记下自己被调了没有与收到什么，落点换成可断言的一格
   */
  function anchorPlan(currentGroupId: string, sessionId = 's-1'): {
    plan: DragPlan
    moved: string[]
    reordered: [string, readonly string[]][]
    placed: [string, readonly string[]][]
  } {
    const moved: string[] = []
    const reordered: [string, readonly string[]][] = []
    const placed: [string, readonly string[]][] = []
    const plan = sessionAnchorPlan({
      workspaceId: 'ws-1',
      sessionId,
      currentGroupId,
      sections: SECTIONS,
      // 来源已在未归组段时它本来就在这一段的成员里，不在的话段内换位无从谈起
      looseOrder: currentGroupId === '' ? ['s-4', 's-1'] : ['s-4', 's-5'],
      moveToGroup: (groupId) => moved.push(groupId),
      reorderSegment: (groupId, order) => reordered.push([groupId, order]),
      placeInSegment: (groupId, order) => placed.push([groupId, order]),
    })
    return { plan, moved, reordered, placed }
  }

  /** 提交某一格，交出它收到的落点 */
  function commitAt(plan: DragPlan, key: string, anchor: DropAnchor): void {
    plan.targets.get(key)?.commit(anchor)
  }

  it('collects the row stretch of every group, including the one the source sits in', () => {
    // 来源所在那一段的行仍要收：段内换位是这一段自己的事
    const { plan } = anchorPlan('group-a')

    expect(modes(plan)).toEqual([
      ['sessionRows/ws-1/group-a', 'rows'],
      ['sessionGroup/ws-1/group-b', 'container'],
      ['groupHead/ws-1/group-b', 'container'],
      ['sessionRows/ws-1/group-b', 'rows'],
      ['loose/ws-1', 'container'],
    ])
  })

  it('leaves the source group block out of its own target table', () => {
    // 原地投放是构造期缺席：整块那一格不为自己那一段注册
    const { plan } = anchorPlan('group-a')

    expect([...plan.targets.keys()]).not.toContain('sessionGroup/ws-1/group-a')
    expect([...plan.targets.keys()]).not.toContain('groupHead/ws-1/group-a')
  })

  it('reorders in place when the row stretch of the source group is hit', () => {
    const { plan, moved, reordered, placed } = anchorPlan('group-a')
    commitAt(plan, 'sessionRows/ws-1/group-a', { kind: 'after', rowId: 's-2' })

    expect(reordered).toEqual([['group-a', ['s-2', 's-1']]])
    // 归属没有变，因此另外两条路一次都不该走
    expect(moved).toEqual([])
    expect(placed).toEqual([])
  })

  it('reorders nothing when the source lands on its own row', () => {
    const { plan, reordered } = anchorPlan('group-a')
    commitAt(plan, 'sessionRows/ws-1/group-a', { kind: 'before', rowId: 's-1' })

    // 换算判出逐位相同，因此不写盘
    expect(reordered).toEqual([])
  })

  it('places the source into another group with the converted order', () => {
    // 工况 5：跨段的锚点投放要同时改归属与目标段的顺序
    const { plan, moved, reordered, placed } = anchorPlan('group-a')
    commitAt(plan, 'sessionRows/ws-1/group-b', { kind: 'before', rowId: 's-3' })

    expect(placed).toEqual([['group-b', ['s-1', 's-3']]])
    // 顺序整份交出，归属由同一次落点一并改，因此不单独调整块那条路
    expect(moved).toEqual([])
    expect(reordered).toEqual([])
  })

  it('reads a drop on another group block as joining it without a position', () => {
    const { plan, moved, placed } = anchorPlan('group-a')
    commitAt(plan, 'sessionGroup/ws-1/group-b', { kind: 'inside' })

    expect(moved).toEqual(['group-b'])
    // 整块投放不动目标段的顺序位
    expect(placed).toEqual([])
  })

  it('reads a drop on the loose stretch as leaving the group when the source is grouped', () => {
    const { plan, moved } = anchorPlan('group-a')
    commitAt(plan, 'loose/ws-1', { kind: 'inside' })

    expect(moved).toEqual([''])
  })

  it('reorders the loose stretch when the source is already ungrouped', () => {
    // 未归组段那一格的含义随来源而变：来源已在段里时它读作段内换位
    const { plan, moved, reordered } = anchorPlan('')
    commitAt(plan, 'loose/ws-1', { kind: 'before', rowId: 's-4' })

    expect(reordered).toEqual([['', ['s-1', 's-4']]])
    expect(moved).toEqual([])
  })

  it('collects every group block when the source comes from the loose stretch', () => {
    const { plan } = anchorPlan('')

    expect(modes(plan)).toEqual([
      ['sessionGroup/ws-1/group-a', 'container'],
      ['groupHead/ws-1/group-a', 'container'],
      ['sessionRows/ws-1/group-a', 'rows'],
      ['sessionGroup/ws-1/group-b', 'container'],
      ['groupHead/ws-1/group-b', 'container'],
      ['sessionRows/ws-1/group-b', 'rows'],
      ['loose/ws-1', 'rows'],
    ])
  })

  it('keeps folded members in place when the drop names a visible row', () => {
    // 工况 14：落点只提供「参照行 id + 前后半」，换算在全量成员顺序上做
    // 折叠段里那些没露出来的成员因此不动，相对位置自动保持
    // 这里把 s-2 当作被折起的那一条：它从不出现在锚点里，却必须留在 s-1 与 s-3 之间
    const moved: string[] = []
    const reordered: [string, readonly string[]][] = []
    const plan = sessionAnchorPlan({
      workspaceId: 'ws-1',
      sessionId: 's-4',
      currentGroupId: 'group-b',
      sections: [{ id: 'group-a', order: ['s-1', 's-2', 's-3'] }],
      looseOrder: [],
      moveToGroup: (groupId) => moved.push(groupId),
      reorderSegment: (groupId, order) => reordered.push([groupId, order]),
      placeInSegment: (groupId, order) => reordered.push([groupId, order]),
    })

    // 落点落在露出的 s-3 上（上半）：新序里 s-4 插到 s-3 之前，被折起的 s-2 仍在原位
    plan.targets.get('sessionRows/ws-1/group-a')?.commit({ kind: 'before', rowId: 's-3' })

    expect(reordered).toEqual([['group-a', ['s-1', 's-2', 's-4', 's-3']]])
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

describe('building a stretch drag plan', () => {
  it('collects the whole stretch as one rows target', () => {
    // 一个区域罩着多行：整段共用一格区域键，落点由最近的那一行算前后半
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-2' },
      zoneKey: 'pinned',
      order: ['s-1', 's-2', 's-3'],
      movingId: 's-2',
      commit: () => {},
    })

    expect([...p.targets.keys()]).toEqual(['pinned'])
    expect(p.targets.get('pinned')?.mode).toBe('rows')
  })

  it('commits the whole converted order rather than a single anchor', () => {
    // 写整份顺序而不是只交一个锚点：宿主手里的官方集合没有算上顺序位
    // 只交锚点会让接管的那一次与用户当时看见的顺序不一致
    const seen: (readonly string[])[] = []
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-3' },
      zoneKey: 'pinned',
      order: ['s-1', 's-2', 's-3'],
      movingId: 's-3',
      commit: (order) => seen.push(order),
    })

    p.targets.get('pinned')?.commit({ kind: 'before', rowId: 's-1' })

    expect(seen).toEqual([['s-3', 's-1', 's-2']])
  })

  it('skips the write when the drop lands on the neighbour it already sits next to', () => {
    // 相邻位是「拖动发生了、顺序没变」：换算判出逐位相同，因此不写盘
    const seen: (readonly string[])[] = []
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-1' },
      zoneKey: 'pinned',
      order: ['s-1', 's-2'],
      movingId: 's-1',
      commit: (order) => seen.push(order),
    })

    p.targets.get('pinned')?.commit({ kind: 'before', rowId: 's-2' })

    expect(seen).toEqual([])
  })

  it('skips the write when the drop lands on the source own row', () => {
    // 来源自己那一行仍在计划里：一格区域罩着多行，行与区域分不开
    // 拖到来源自己那一行上，换算判出顺序没变，因此不写盘
    const seen: (readonly string[])[] = []
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-2' },
      zoneKey: 'pinned',
      order: ['s-1', 's-2', 's-3'],
      movingId: 's-2',
      commit: (order) => seen.push(order),
    })

    p.targets.get('pinned')?.commit({ kind: 'before', rowId: 's-2' })

    expect(seen).toEqual([])
  })

  it('keeps folded members in place when the drop names a visible row', () => {
    // 超出可见条数的行仍在计划绑定的那一份顺序里，落点只提供参照行与前后半
    // 它们因此不动，相对位置自动保持
    const seen: (readonly string[])[] = []
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-4' },
      zoneKey: 'pinned',
      order: ['s-1', 's-2', 's-3', 's-4'],
      movingId: 's-4',
      commit: (order) => seen.push(order),
    })

    p.targets.get('pinned')?.commit({ kind: 'before', rowId: 's-2' })

    // s-4 插到 s-2 之前，被裁在可见高度之外的 s-3 仍在原位
    expect(seen).toEqual([['s-1', 's-4', 's-2', 's-3']])
  })

  it('appends the member when the drop lands on the stretch tail', () => {
    // 段尾空白读作追加到末尾：锚点缺省时 `reorderTo` 把成员放到最后
    const seen: (readonly string[])[] = []
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-1' },
      zoneKey: 'pinned',
      order: ['s-1', 's-2', 's-3'],
      movingId: 's-1',
      commit: (order) => seen.push(order),
    })

    p.targets.get('pinned')?.commit({ kind: 'inside' })

    expect(seen).toEqual([['s-2', 's-3', 's-1']])
  })

  it('leaves the bound order alone', () => {
    const order = ['s-1', 's-2']
    const p = stretchDragPlan({
      source: { kind: 'session', id: 's-1' },
      zoneKey: 'pinned',
      order,
      movingId: 's-1',
      commit: () => {},
    })

    p.targets.get('pinned')?.commit({ kind: 'before', rowId: 's-2' })

    expect(order).toEqual(['s-1', 's-2'])
  })
})

describe('building a workspace drag plan', () => {
  /** 一个来源不在任何分组里的最小输入，用例只覆盖到自己那一格 */
  function planInput(overrides: Partial<Parameters<typeof workspaceDragPlan>[0]> = {}) {
    return {
      workspaceId: 'ws-1',
      currentGroupId: '',
      groups: [],
      looseIds: [],
      siblingOrder: [],
      nestTargets: [],
      moveToGroup: () => {},
      reorder: () => {},
      nestInto: () => {},
      unnest: () => {},
      ...overrides,
    }
  }

  it('collects the head and the body of every group the source is not in', () => {
    // 组头与组体同一档：拖到组头的标题上、或者拖到组体里那一片空白上，都读作移入这个分组
    // 两格都要在，指针停在组头上时命中层先撞上它，那一次落点就到此为止
    const p = workspaceDragPlan(
      planInput({
        currentGroupId: 'group-a',
        groups: [
          { id: 'group-a', workspaceIds: ['ws-1'] },
          { id: 'group-b', workspaceIds: ['ws-2'] },
        ],
      }),
    )

    expect(p.targets.get(virtualWorkspaceHeadKey('group-b'))?.mode).toBe('container')
    expect(p.targets.get(virtualWorkspaceBodyKey('group-b'))?.mode).toBe('container')
    expect(p.targets.has(virtualWorkspaceHeadKey('group-a'))).toBe(false)
    expect(p.targets.has(virtualWorkspaceBodyKey('group-a'))).toBe(false)
  })

  it('leaves the group the source already sits in out of its own target table', () => {
    // 原地投放是构造期缺席：拖回自己那一片时命中层查不到，既不标记也不提交
    const p = workspaceDragPlan(
      planInput({
        currentGroupId: 'group-a',
        groups: [
          { id: 'group-a', workspaceIds: ['ws-1', 'ws-2'] },
          { id: 'group-b', workspaceIds: [] },
        ],
        siblingOrder: ['ws-1', 'ws-2'],
      }),
    )

    expect(p.targets.has(virtualWorkspaceHeadKey('group-a'))).toBe(false)
    expect(p.targets.has(virtualWorkspaceBodyKey('group-a'))).toBe(false)
  })

  it('reads a drop on another workspace row as joining that row own group', () => {
    // 行自己带区域键，命中层停在它上面
    // 那一格不在计划里的话这次落点就到此为止
    const moved: string[] = []
    const p = workspaceDragPlan(
      planInput({
        groups: [{ id: 'group-b', workspaceIds: ['ws-2'] }],
        moveToGroup: (groupId) => moved.push(groupId),
      }),
    )

    p.targets.get(workspaceHeadKey('ws-2'))?.commit({ kind: 'inside' })
    expect(moved).toEqual(['group-b'])
  })

  it('collects the loose row stretch of the root list as a way out of the group', () => {
    // 来源已在某个分组里时，平铺在根节点上的工作区行与整片根节点都读作「移出虚拟工作区分组」
    const moved: string[] = []
    const p = workspaceDragPlan(
      planInput({
        currentGroupId: 'group-a',
        groups: [{ id: 'group-a', workspaceIds: ['ws-1'] }],
        looseIds: ['ws-9'],
        moveToGroup: (groupId) => moved.push(groupId),
      }),
    )

    expect(p.targets.get(ROOT_KEY)?.mode).toBe('container')
    p.targets.get(workspaceHeadKey('ws-9'))?.commit({ kind: 'inside' })
    expect(moved).toEqual([''])
  })

  it('keeps the root stretch out of the plan while the source is already there', () => {
    const p = workspaceDragPlan(planInput({ looseIds: ['ws-9'] }))

    expect(p.targets.has(ROOT_KEY)).toBe(false)
    expect(p.targets.has(workspaceHeadKey('ws-9'))).toBe(false)
  })

  it('collects the sibling rows of the source group as rows targets', () => {
    const reordered: (string | undefined)[] = []
    const p = workspaceDragPlan(
      planInput({
        currentGroupId: 'group-a',
        groups: [{ id: 'group-a', workspaceIds: ['ws-1', 'ws-2', 'ws-3'] }],
        siblingOrder: ['ws-1', 'ws-2', 'ws-3'],
        reorder: (beforeWorkspaceId) => reordered.push(beforeWorkspaceId),
      }),
    )

    expect(p.targets.get(workspaceHeadKey('ws-3'))?.mode).toBe('rows')
    p.targets.get(workspaceHeadKey('ws-3'))?.commit({ kind: 'before', rowId: 'ws-3' })
    expect(reordered).toEqual(['ws-3'])
  })

  it('reports no change when a workspace is dropped on its own neighbour', () => {
    // 拖动发生了，顺序没变：换算出的新顺序与现状逐位相同，写入因此被跳过
    const reordered: (string | undefined)[] = []
    const p = workspaceDragPlan(
      planInput({
        workspaceId: 'ws-2',
        currentGroupId: 'group-a',
        groups: [{ id: 'group-a', workspaceIds: ['ws-1', 'ws-2', 'ws-3'] }],
        siblingOrder: ['ws-1', 'ws-2', 'ws-3'],
        reorder: (beforeWorkspaceId) => reordered.push(beforeWorkspaceId),
      }),
    )

    p.targets.get(workspaceHeadKey('ws-3'))?.commit({ kind: 'before', rowId: 'ws-3' })
    expect(reordered).toEqual([])
  })

  it('collects the session groups of the source ancestors as nesting targets', () => {
    const nested: { parentId: string; groupId: string }[] = []
    const p = workspaceDragPlan(
      planInput({
        nestTargets: [{ parentId: 'ws-9', groupId: 'group-x' }],
        nestInto: (parentId, groupId) => nested.push({ parentId, groupId }),
      }),
    )

    expect(p.targets.get(groupHeadKey('ws-9', 'group-x'))?.mode).toBe('container')
    p.targets.get(groupHeadKey('ws-9', 'group-x'))?.commit({ kind: 'inside' })
    expect(nested).toEqual([{ parentId: 'ws-9', groupId: 'group-x' }])
  })

  it('leaves the session group the source already belongs to out of its target table', () => {
    const p = workspaceDragPlan(
      planInput({
        binding: { parentId: 'ws-9', groupId: 'group-x' },
        nestTargets: [
          { parentId: 'ws-9', groupId: 'group-x' },
          { parentId: 'ws-9', groupId: 'group-y' },
        ],
      }),
    )

    expect(p.targets.has(groupHeadKey('ws-9', 'group-x'))).toBe(false)
    expect(p.targets.has(groupHeadKey('ws-9', 'group-y'))).toBe(true)
  })

  it('reads a drop on the parent workspace row as leaving the session group', () => {
    const unnested: string[] = []
    const p = workspaceDragPlan(
      planInput({
        binding: { parentId: 'ws-9', groupId: 'group-x' },
        unnest: () => unnested.push('ws-1'),
      }),
    )

    p.targets.get(workspaceHeadKey('ws-9'))?.commit({ kind: 'inside' })
    expect(unnested).toEqual(['ws-1'])
  })

  it('keeps the parent row out of the root stretch so one key keeps one mode', () => {
    // 父工作区行同时能读到「移出虚拟工作区分组」与「移出会话分组」，同一格不能兼两档
    // 本条工作区已在某个分组里、父工作区又平铺在根节点时两种读法都成立，这里钉住取的是解除嵌套那一档
    const unnested: string[] = []
    const p = workspaceDragPlan(
      planInput({
        currentGroupId: 'group-a',
        groups: [{ id: 'group-a', workspaceIds: ['ws-1'] }],
        looseIds: ['ws-9'],
        binding: { parentId: 'ws-9', groupId: 'group-x' },
        unnest: () => unnested.push('ws-1'),
      }),
    )

    expect(p.targets.get(workspaceHeadKey('ws-9'))?.mode).toBe('container')
    p.targets.get(workspaceHeadKey('ws-9'))?.commit({ kind: 'inside' })
    expect(unnested).toEqual(['ws-1'])
  })

  it('leaves the source row out of its own target table', () => {
    const p = workspaceDragPlan(
      planInput({
        currentGroupId: 'group-a',
        groups: [{ id: 'group-a', workspaceIds: ['ws-1', 'ws-2'] }],
        siblingOrder: ['ws-1', 'ws-2'],
      }),
    )

    expect(p.targets.has(workspaceHeadKey('ws-1'))).toBe(false)
  })

  it('reports the dragged workspace as the source', () => {
    const p = workspaceDragPlan(planInput())

    expect(p.source).toEqual({ kind: 'workspace', id: 'ws-1' })
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
