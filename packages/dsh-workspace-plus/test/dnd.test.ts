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
  SCROLL_ATTRIBUTE,
  ZONE_ATTRIBUTE,
  bandOf,
  beforeIdOf,
  groupHeadKey,
  groupOfZoneKey,
  looseKey,
  orderDragPlan,
  reorderTo,
  sessionGroupingPlan,
  sessionGroupRegionKey,
  sessionGroupKey,
  stretchDragPlan,
  virtualWorkspaceBodyKey,
  virtualWorkspaceHeadKey,
  workspaceHeadKey,
  workspaceRegionKey,
  workspaceOfZoneKey,
  workspaceTreeDragPlan,
} from '../src/client/data/dnd.ts'
import type { DragPlan, DragPlanTarget, DropAnchor } from '../src/client/data/dnd.ts'
import { deriveNesting } from '../src/client/data/nest.ts'
import { buildWorkspaceTree } from '../src/client/data/tree.ts'

/** 一个只接整块投放的计划目标 */
function container(sink: DropAnchor[]): DragPlanTarget {
  return { mode: 'container', commit: (anchor) => sink.push(anchor) }
}

/** 一张计划表，键即区域键 */
function plan(targets: Record<string, DragPlanTarget>): DragPlan {
  return { source: { kind: 'session', id: 'session-1' }, targets: new Map(Object.entries(targets)) }
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

describe('the three bands of a container row', () => {
  const band = { top: 100, height: 40 }

  it('reads the top quarter as before, the middle half as inside and the bottom quarter as after', () => {
    // 同一行身兼排序参照与放入落点两件事时按这条分流，比例是产品手感参数
    expect(bandOf(band, 100)).toBe('before')
    expect(bandOf(band, 109)).toBe('before')
    // 两条边界都算中间那一段：上四分之一与下四分之一因此各是开区间，中二分之一恰好占满一半
    expect(bandOf(band, 110)).toBe('inside')
    expect(bandOf(band, 120)).toBe('inside')
    expect(bandOf(band, 130)).toBe('inside')
    expect(bandOf(band, 131)).toBe('after')
    expect(bandOf(band, 140)).toBe('after')
  })

  it('reads a zero-height band as inside everywhere', () => {
    // jsdom 恒零矩形，尚未布局的节点也如此：那时上下段都无从谈起，退回不需要像素的放入读法
    expect(bandOf({ top: 100, height: 0 }, 100)).toBe('inside')
    expect(bandOf({ top: 100, height: 0 }, 999)).toBe('inside')
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

    expect(p.targets.get('sessionGroup/ws-1/group-a')).toBeUndefined()
    expect(p.targets.get('loose/ws-1')).toBeUndefined()
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

describe('building a session grouping plan', () => {
  /** 本工作区的会话分组 */
  const SECTIONS = [{ id: 'group-a' }, { id: 'group-b' }]

  /** 记下一次计划里各格的档位 */
  function modes(plan: DragPlan): [string, string][] {
    return [...plan.targets.entries()].map(([key, target]) => [key, target.mode])
  }

  /**
   * 造一个只收归属变更的计划
   *
   * 回调记下自己被调了没有与收到什么，落点换成可断言的一格
   */
  function groupingPlan(currentGroupId: string, sessionId = 's-1'): {
    plan: DragPlan
    moved: string[]
  } {
    const moved: string[] = []
    const plan = sessionGroupingPlan({
      workspaceId: 'ws-1',
      sessionId,
      currentGroupId,
      sections: SECTIONS,
      moveToGroup: (groupId) => moved.push(groupId),
    })
    return { plan, moved }
  }

  /** 提交某一格，交出它收到的落点 */
  function commitAt(plan: DragPlan, key: string, anchor: DropAnchor): void {
    plan.targets.get(key)?.commit(anchor)
  }

  it('collects the block and the head of every other group as whole-block landings', () => {
    // 两块都读作「归到这个分组」：头自己另占一格，不收它则拖到头上命中就到此为止
    const { plan } = groupingPlan('group-a')

    expect(modes(plan)).toEqual([
      ['sessionGroup/ws-1/group-b', 'container'],
      ['groupHead/ws-1/group-b', 'container'],
      ['loose/ws-1', 'container'],
      ['workspaceHead/ws-1', 'container'],
    ])
  })

  it('leaves the source group block out of its own target table', () => {
    // 原地投放是构造期缺席：那个分组的两格都不为自己注册
    const { plan } = groupingPlan('group-a')

    expect([...plan.targets.keys()]).not.toContain('sessionGroup/ws-1/group-a')
    expect([...plan.targets.keys()]).not.toContain('groupHead/ws-1/group-a')
  })

  it('joins the group whose block was hit', () => {
    const { plan, moved } = groupingPlan('group-a')
    commitAt(plan, 'sessionGroup/ws-1/group-b', { kind: 'inside' })

    expect(moved).toEqual(['group-b'])
  })

  it('joins the group whose head was hit', () => {
    // 头与块共用同一个提交：拖到分组头上也是归组
    const { plan, moved } = groupingPlan('group-a')
    commitAt(plan, 'groupHead/ws-1/group-b', { kind: 'inside' })

    expect(moved).toEqual(['group-b'])
  })

  it('leaves the group when the loose stretch is hit', () => {
    const { plan, moved } = groupingPlan('group-a')
    commitAt(plan, 'loose/ws-1', { kind: 'inside' })

    expect(moved).toEqual([''])
  })

  it('names the workspace as the unit the loose stretch lands in', () => {
    // 未归组那一段只是工作区体内的一截，它自己不是容器：能放进去的是它所在的工作区，
    // 框因此套住整块工作区，而不是缩成那一段
    const { plan } = groupingPlan('group-a')

    expect(plan.targets.get('loose/ws-1')?.regionOf).toBe(workspaceRegionKey('ws-1'))
    // 标题行是同一份提交、同一个落点单位：拖到那一行上也是回到这个工作区
    expect(plan.targets.get('workspaceHead/ws-1')?.regionOf).toBe(workspaceRegionKey('ws-1'))
  })

  it('names no unit for a group, so its own block stands for it', () => {
    // 分组块本身就是整块（组头与组体同属那一块），它自己就是单位
    const { plan } = groupingPlan('group-a')

    expect(plan.targets.get('sessionGroup/ws-1/group-b')?.regionOf).toBe(
      sessionGroupRegionKey('ws-1', 'group-b'),
    )
  })

  it('leaves the group when the workspace title row is hit', () => {
    // 标题行是目录性质的落点：拖到它上面与拖到未归组段上是同一件事
    const { plan, moved } = groupingPlan('group-a')
    commitAt(plan, 'workspaceHead/ws-1', { kind: 'inside' })

    expect(moved).toEqual([''])
  })

  it('leaves the source stretch out when the session is already ungrouped', () => {
    // 已在未归组段时拖回那一段是原地投放，两格都不进表
    // 这一条不能靠提交期判等代替：归属没变时宿主仍会写一次盘
    const { plan } = groupingPlan('')

    expect(modes(plan)).toEqual([
      ['sessionGroup/ws-1/group-a', 'container'],
      ['groupHead/ws-1/group-a', 'container'],
      ['sessionGroup/ws-1/group-b', 'container'],
      ['groupHead/ws-1/group-b', 'container'],
    ])
  })

  it('collects every group when the source comes from the loose stretch', () => {
    const { plan } = groupingPlan('')

    expect([...plan.targets.keys()]).toContain('sessionGroup/ws-1/group-a')
    expect([...plan.targets.keys()]).toContain('groupHead/ws-1/group-b')
  })

  it('carries the dragged session as the source', () => {
    // 外部插件读这个前缀认出这是本包的拖拽，来源身份因此也要对
    const { plan } = groupingPlan('group-a', 's-4')

    expect(plan.source).toEqual({ kind: 'session', id: 's-4' })
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

  it('names the next member for the seam after a member', () => {
    // 「排到这一条之后」与「排到下一条之前」是同一处空白：后者天然画在下一条的上缘，
    // 前者因此点名下一条，两条路径画出同一条线
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-a' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b', 'group-c'],
      movingId: 'group-a',
      commit: () => {},
    })

    expect(p.targets.get(groupHeadKey('ws-1', 'group-b'))?.seamKey).toBe(
      groupHeadKey('ws-1', 'group-c'),
    )
  })

  it('names no seam when the next member is the one being dragged', () => {
    // 下一条正是被拖走的那一条：那一处是原地投放，线画上去只会跟着那一行一起淡掉
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-b' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b'],
      movingId: 'group-b',
      commit: () => {},
    })

    expect(p.targets.get(groupHeadKey('ws-1', 'group-a'))?.seamKey).toBeUndefined()
  })

  it('names no seam after the last member of a stretch', () => {
    const p = orderDragPlan({
      source: { kind: 'sessionGroup', workspaceId: 'ws-1', groupId: 'group-z' },
      keyOf: (memberId) => groupHeadKey('ws-1', memberId),
      order: ['group-a', 'group-b', 'group-z'],
      movingId: 'group-z',
      commit: () => {},
    })

    expect(p.targets.get(groupHeadKey('ws-1', 'group-b'))?.seamKey).toBeUndefined()
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

describe('building a tree driven workspace drag plan', () => {
  /** 四个工作区互不嵌套、同处一层：用来钉「同层兄弟」那几格 */
  const flatTopology = { virtualGroups: [] as { id: string; workspaceIds: string[] }[] }

  /** 夹具照搬验收拓扑：一个虚拟分组四个成员，其中两条按 cwd 挂在同一条工作区之下 */
  function planFor(
    source: string,
    options: {
      virtualGroups?: { id: string; workspaceIds: string[] }[]
      paths?: Record<string, string>
      bindings?: Record<string, { workspaceId: string; groupId: string }>
      groupIds?: Record<string, string[]>
      writes?: { moves: string[]; orders: (string | undefined)[]; nests: string[]; unnests: string[] }
    } = {},
  ) {
    const workspaceIds = ['ws-p1', 'ws-c1', 'ws-c2', 'ws-p2']
    const virtualGroups = options.virtualGroups ?? [
      { id: 'wg-1', workspaceIds: ['ws-p1', 'ws-c1', 'ws-c2', 'ws-p2'] },
      { id: 'wg-2', workspaceIds: [] },
    ]
    const paths = options.paths ?? {
      'ws-p1': '/p1',
      'ws-c1': '/p1/c1',
      'ws-c2': '/p1/c2',
      'ws-p2': '/p2',
    }
    const bindings = options.bindings ?? {}
    const groupIds = options.groupIds ?? {}
    const writes = options.writes ?? { moves: [], orders: [], nests: [], unnests: [] }
    const virtualOf = (id: string): string =>
      virtualGroups.find((group) => group.workspaceIds.includes(id))?.id ?? ''
    const nesting = deriveNesting({
      enabled: true,
      workspaceIds,
      pathOf: (id) => paths[id],
      virtualOf,
      bindingOf: (id) => bindings[id],
      groupIdsOf: (id) => new Set(groupIds[id] ?? []),
    })
    const tree = buildWorkspaceTree({
      workspaceIds,
      virtualGroups,
      nesting,
      sessionGroupsOf: (id) => groupIds[id] ?? [],
      // 拖拽认祖先要看 cwd：那是「可能挪到哪儿」，与渲染那一层的同组要求不是同一个问题
      pathOf: (id) => paths[id],
    })
    return workspaceTreeDragPlan({
      tree,
      workspaceId: source,
      moveToGroup: (groupId) => writes.moves.push(groupId),
      reorder: (before) => writes.orders.push(before),
      nestInto: (parentId, groupId) => writes.nests.push(`${parentId}/${groupId}`),
      unnest: () => writes.unnests.push(source),
    })
  }

  it('collects the head and the body of every group the source is not in', () => {
    // 组头与组体同一档：拖到组头的标题上、或者拖到组体里那一片空白上，都读作移入这个分组
    // 两格都要在，指针停在组头上时命中层先撞上它，那一次落点就到此为止
    const p = planFor('ws-p1', { writes: { moves: [], orders: [], nests: [], unnests: [] } })

    expect(p.targets.get(virtualWorkspaceHeadKey("wg-2"))?.mode).toBe('container')
    expect(p.targets.get(virtualWorkspaceBodyKey("wg-2"))?.mode).toBe('container')
    // 来源已在的那个分组整块不进表，拖回自己那一片是构造期缺席
    expect(p.targets.has(virtualWorkspaceHeadKey("wg-1"))).toBe(false)
    expect(p.targets.has(virtualWorkspaceBodyKey("wg-1"))).toBe(false)
  })

  it('collects the loose row stretch of the root list as a way out of the group', () => {
    // 来源已在某个分组里时，平铺在根节点上的工作区行与整片根节点都读作「移出虚拟工作区分组」
    const writes = { moves: [] as string[], orders: [] as (string | undefined)[], nests: [] as string[], unnests: [] as string[] }
    const p = planFor('ws-p1', { virtualGroups: [{ id: 'wg-1', workspaceIds: ['ws-p1'] }], writes })

    expect(p.targets.get(ROOT_KEY)?.mode).toBe('container')
    p.targets.get(ROOT_KEY)?.commit({ kind: 'inside' })
    expect(writes.moves).toEqual([''])
  })

  it('keeps the root stretch out of the plan while the source is already there', () => {
    const p = planFor('ws-p2', {
      virtualGroups: [],
      writes: { moves: [], orders: [], nests: [], unnests: [] },
    })

    expect(p.targets.has(ROOT_KEY)).toBe(false)
  })

  it('collects the sibling rows of the source group as rows targets', () => {
    const writes = { moves: [] as string[], orders: [] as (string | undefined)[], nests: [] as string[], unnests: [] as string[] }
    const p = planFor('ws-p2', { ...flatTopology, writes })

    expect(p.targets.get(workspaceHeadKey('ws-p1'))?.mode).toBe('rows')
    p.targets.get(workspaceHeadKey('ws-p1'))?.commit({ kind: 'before', rowId: 'ws-p1' })
    expect(writes.orders).toEqual(['ws-p1'])
  })

  it('reports no change when a workspace is dropped on its own neighbour', () => {
    // 拖动发生了，顺序没变：换算出的新顺序与现状逐位相同，写入因此被跳过
    const writes = { moves: [] as string[], orders: [] as (string | undefined)[], nests: [] as string[], unnests: [] as string[] }
    const p = planFor('ws-c1', { ...flatTopology, writes })

    // 来源 ws-c1 与 ws-c2 同层，落到 ws-c2 之前得到的顺序与现状逐位相同
    p.targets.get(workspaceHeadKey('ws-c2'))?.commit({ kind: 'before', rowId: 'ws-c2' })
    expect(writes.orders).toEqual([])
  })

  it('collects the session groups of the source ancestors as nesting targets', () => {
    const writes = { moves: [] as string[], orders: [] as (string | undefined)[], nests: [] as string[], unnests: [] as string[] }
    const p = planFor('ws-c1', { groupIds: { 'ws-p1': ['group-a', 'group-b'] }, writes })

    expect(p.targets.get(groupHeadKey("ws-p1", "group-a"))?.mode).toBe('container')
    p.targets.get(groupHeadKey("ws-p1", "group-a"))?.commit({ kind: 'inside' })
    expect(writes.nests).toEqual(['ws-p1/group-a'])
  })

  it('leaves the session group the source already belongs to out of its target table', () => {
    // 已经归属的那一组不再承接「放进去」——归属没有变化，宿主仍会写一次盘。
    // 但它的组头仍可作位次参照：组里其他成员的先后是合法的，那一格因此留着，只是不接 inside
    const p = planFor('ws-c1', {
      bindings: { 'ws-c1': { workspaceId: 'ws-p1', groupId: 'group-a' } },
      groupIds: { 'ws-p1': ['group-a', 'group-b'] },
      writes: { moves: [], orders: [], nests: [], unnests: [] },
    })

    expect(p.targets.get(groupHeadKey("ws-p1", "group-a"))?.mode).not.toBe('container')
    expect(p.targets.get(groupHeadKey("ws-p1", "group-b"))?.mode).toBe('container')
  })

  it('reads a drop on the parent workspace row as leaving the session group', () => {
    const writes = { moves: [] as string[], orders: [] as (string | undefined)[], nests: [] as string[], unnests: [] as string[] }
    const p = planFor('ws-c1', {
      bindings: { 'ws-c1': { workspaceId: 'ws-p1', groupId: 'group-a' } },
      groupIds: { 'ws-p1': ['group-a'] },
      writes,
    })

    expect(p.targets.get(workspaceHeadKey("ws-p1"))?.mode).toBe('container')
    p.targets.get(workspaceHeadKey("ws-p1"))?.commit({ kind: 'inside' })
    expect(writes.unnests).toEqual(['ws-c1'])
  })

  it('leaves the source row out of its own target table', () => {
    const p = planFor('ws-p1', {
      writes: { moves: [], orders: [], nests: [], unnests: [] },
    })

    expect(p.targets.has(workspaceHeadKey("ws-p1"))).toBe(false)
  })

  it('reports the dragged workspace as the source', () => {
    const p = planFor('ws-p2', {
      virtualGroups: [],
      writes: { moves: [], orders: [], nests: [], unnests: [] },
    })

    expect(p.source).toEqual({ kind: 'workspace', id: 'ws-p2' })
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

  it('names the scrolling containers on an attribute of their own', () => {
    // 可滚的容器与落点区域是两回事：一处容器罩着多段落点，一个落点也可能在不可滚的祖先里
    expect(SCROLL_ATTRIBUTE).toBe('data-wg-dnd-scroll')
    expect(SCROLL_ATTRIBUTE).not.toBe(ZONE_ATTRIBUTE)
  })
})
