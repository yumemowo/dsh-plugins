import { describe, expect, it } from 'vitest'
import { maybeDropSearcher } from '../src/client/data/dnd/dropSearcher.ts'
import type { DropArea, DropUnit } from '../src/client/data/dnd/protocol.ts'

/**
 * 检测器的行为
 *
 * 输入只有 DOM 已经给出的两样东西：指针那一点落在哪几格上、压着哪一行。
 * 输出至多两处落点：一个画框、一个画线。
 *
 * 判定不碰元素也不认识索引——片区自己声明占哪几格，因此检测就是「沿这一串格子往上，
 * 找第一个接这种读法的片区」。
 */

/** 一块的读数：检测器拿它分线的上下半 */
function measure(rect: { top: number; height: number }): () => { top: number; height: number } {
  return () => rect
}

/** 一条默认的单位读数：高 10、上缘在 0，指针落在它上半 */
const TALL = measure({ top: 0, height: 10 })

const at = (y: number) => ({ x: 0, y })

/**
 * 一片只接「放进去」的片区
 * @param zones - 它占的那几格
 */
function insideArea(zones: readonly string[]): DropArea {
  return { zones, units: [{ region: undefined, row: undefined }], accepts: 'inside', commit: () => {} }
}

/**
 * 一片接位次的片区
 * @param zones - 它占的那几格
 * @param unit - 它的读数单位
 */
function orderArea(zones: readonly string[], unit?: Partial<DropUnit>): DropArea {
  return {
    zones,
    units: [{ region: undefined, row: zones[0], ...unit }],
    accepts: 'order',
    commit: () => {},
  }
}

/** 交一份「量哪一块」的口子：整个检测用一个读数 */
const measuring = (rect: { top: number; height: number }) => () => measure(rect)
const TALL_OF = () => measuring({ top: 0, height: 10 })

describe('maybeDropSearcher', () => {
  it('returns nothing when the pointer is on no area', () => {
    const searcher = maybeDropSearcher([orderArea(['workspaceHead/ws-2'])])

    expect(searcher.checkDrop(['workspaceHead/ws-3'], undefined, at(0), TALL_OF())).toBeNull()
  })

  it('returns the area the pointer sits in', () => {
    const searcher = maybeDropSearcher([insideArea(['virtualWorkspaceHead/vg-1', 'virtualWorkspaceBody/vg-1'])])

    // 指针落在组体里：那一片声明了这两格，因此读出的就是它
    const hit = searcher.checkDrop(['virtualWorkspaceBody/vg-1'], undefined, at(0), TALL_OF())

    expect(hit?.inside?.area.zones).toEqual(['virtualWorkspaceHead/vg-1', 'virtualWorkspaceBody/vg-1'])
    expect(hit?.order).toBeUndefined()
  })

  it('reads the nearest area that accepts the drop', () => {
    // 一串格子由近到远：内部那一片先接，外面那一圈因此轮不到
    const searcher = maybeDropSearcher([
      insideArea(['sessionGroup/ws-1/group-a']),
      insideArea(['workspaceBody/ws-1']),
    ])

    const hit = searcher.checkDrop(
      ['sessionGroup/ws-1/group-a', 'workspaceBody/ws-1'],
      undefined,
      at(0),
      TALL_OF(),
    )

    expect(hit?.inside?.area.zones).toEqual(['sessionGroup/ws-1/group-a'])
  })

  it('returns a box and a line at the same time from two areas', () => {
    // 框说「放进这一片」，线说「排在这一条之前 / 之后」，两件事可以同时成立
    const searcher = maybeDropSearcher([
      insideArea(['virtualWorkspaceBody/vg-1']),
      orderArea(['workspaceHead/ws-2']),
    ])

    const hit = searcher.checkDrop(['workspaceHead/ws-2', 'virtualWorkspaceBody/vg-1'], undefined, at(0), TALL_OF())

    expect(hit?.inside?.area.zones).toEqual(['virtualWorkspaceBody/vg-1'])
    expect(hit?.order?.area.zones).toEqual(['workspaceHead/ws-2'])
  })

  it('draws no box when only a line is offered', () => {
    const searcher = maybeDropSearcher([orderArea(['workspaceHead/ws-3'])])

    const hit = searcher.checkDrop(['workspaceHead/ws-3'], undefined, at(0), TALL_OF())

    expect(hit?.order?.area.zones).toEqual(['workspaceHead/ws-3'])
    expect(hit?.inside).toBeUndefined()
  })

  it('reads the upper half as before and the lower half as after', () => {
    const searcher = maybeDropSearcher([orderArea(['workspaceHead/ws-2'])])
    const measureOf = measuring({ top: 100, height: 20 })

    expect(searcher.checkDrop(['workspaceHead/ws-2'], undefined, at(105), measureOf)?.order?.side).toBe('before')
    expect(searcher.checkDrop(['workspaceHead/ws-2'], undefined, at(115), measureOf)?.order?.side).toBe('after')
  })

  it('reads a zero height unit as before', () => {
    // jsdom 恒零矩形，尚未布局的元素也如此：那时分不出上下，
    // 读作「之前」让线落在这块自己身上，与指针到底指着哪一处无关
    const searcher = maybeDropSearcher([orderArea(['workspaceHead/ws-2'])])

    expect(
      searcher.checkDrop(['workspaceHead/ws-2'], undefined, at(100), measuring({ top: 100, height: 0 }))?.order
        ?.side,
    ).toBe('before')
  })

  it('skips an area whose unit cannot be measured', () => {
    // 那一块还没渲染出来：这一片这次接不住，继续往外找
    const searcher = maybeDropSearcher([
      orderArea(['workspaceHead/ws-2']),
      orderArea(['virtualWorkspaceBody/vg-1']),
    ])

    const hit = searcher.checkDrop(
      ['workspaceHead/ws-2', 'virtualWorkspaceBody/vg-1'],
      undefined,
      at(0),
      (area) => (area.zones[0] === 'workspaceHead/ws-2' ? undefined : TALL),
    )

    expect(hit?.order?.area.zones).toEqual(['virtualWorkspaceBody/vg-1'])
  })

  it('picks the unit the pointer row points at', () => {
    // 一格装多行：那一片声明了好几处单位，指针压着哪一行就是哪一处
    const area: DropArea = {
      zones: ['pinned'],
      units: [
        { region: undefined, row: 'session-1' },
        { region: undefined, row: 'session-2' },
      ],
      accepts: 'order',
      commit: () => {},
    }
    const searcher = maybeDropSearcher([area])

    expect(searcher.checkDrop(['pinned'], 'session-2', at(0), TALL_OF())?.order?.unit.row).toBe('session-2')
  })

  it('answers for a single unit area whatever row the pointer is on', () => {
    // 一处单位的片区是一个整体：指针压着它体内的任何一行，说的都是这一片。
    // 只有「一格装多行」那种才按行分单位
    const searcher = maybeDropSearcher([orderArea(['workspaceHead/ws-1'], { row: 'ws-1' })])

    expect(searcher.checkDrop(['workspaceHead/ws-1'], 'session-9', at(0), TALL_OF())?.order?.unit.row).toBe('ws-1')
  })

  it('turns a drop after one unit into the seam the next unit owns', () => {
    // 一处缝从上面看是前一条的下半、从下面看是后一条的上半：屏幕上同一处空白，
    // 因此「之后」在检测层就换成下一条的「之前」，画出来只有一条线
    const area: DropArea = {
      zones: ['pinned'],
      units: [
        { region: undefined, row: 'session-1', seam: 'session-2' },
        { region: undefined, row: 'session-2' },
      ],
      accepts: 'order',
      commit: () => {},
    }
    const searcher = maybeDropSearcher([area])
    const measureOf = measuring({ top: 0, height: 20 })

    const hit = searcher.checkDrop(['pinned'], 'session-1', at(18), measureOf)

    expect(hit?.order?.side).toBe('after')
    expect(hit?.order?.seam?.unit.row).toBe('session-2')
  })

  it('resolves a seam that lives in another area', () => {
    // 每个成员各占一片时，下一条是另一片：两处都要在这张名单里找得到。
    // 成员 id 与会话分组那种情况一致——组的成员 id 就是分组 id
    const searcher = maybeDropSearcher([
      orderArea(['groupHead/ws-1/group-a'], { row: 'group-a', seam: 'group-b' }),
      orderArea(['groupHead/ws-1/group-b'], { row: 'group-b' }),
    ])

    const hit = searcher.checkDrop(['groupHead/ws-1/group-a'], undefined, at(18), measuring({ top: 0, height: 20 }))

    expect(hit?.order?.side).toBe('after')
    expect(hit?.order?.seam?.area.zones).toEqual(['groupHead/ws-1/group-b'])
  })

  it('lets only the nearest area stand when one declares its own level', () => {
    // 罩住整片列表的那一片裹着所有成员：指针停在成员身上时不该由它接住，
    // 否则「移出分组」会抢在成员自己那一片之前
    const root: DropArea = {
      zones: ['root'],
      units: [{ region: undefined, row: undefined }],
      accepts: 'inside',
      hitArea: 'ownLevel',
      commit: () => {},
    }
    const searcher = maybeDropSearcher([insideArea(['workspaceBody/ws-1']), root])

    // 指针在体内那一格上：前面出现过容器体内，根节点那一片因此不算
    const nested = searcher.checkDrop(['workspaceBody/ws-1', 'root'], undefined, at(0), TALL_OF())
    expect(nested?.inside?.area.zones).toEqual(['workspaceBody/ws-1'])

    // 指针直接落在根节点那一格上：这时才是它
    const direct = searcher.checkDrop(['root'], undefined, at(0), TALL_OF())
    expect(direct?.inside?.area.zones).toEqual(['root'])
  })

  it('commits whichever areas the hit names', () => {
    const calls: string[] = []
    const searcher = maybeDropSearcher([
      { ...insideArea(['virtualWorkspaceBody/vg-1']), commit: () => calls.push('inside') },
      { ...orderArea(['workspaceHead/ws-2']), commit: (anchor) => calls.push('order:' + anchor.kind) },
    ])

    const hit = searcher.checkDrop(['workspaceHead/ws-2', 'virtualWorkspaceBody/vg-1'], undefined, at(0), TALL_OF())

    hit?.inside?.area.commit({ kind: 'inside' })
    if (hit?.order !== undefined) hit.order.area.commit({ kind: hit.order.side, rowId: hit.order.unit.row ?? '' })

    expect(calls).toEqual(['inside', 'order:before'])
  })

  it('lets the first area win when two claim the same zone', () => {
    // 一格只归一片：同一个人不会既承接放入又承接位次
    const searcher = maybeDropSearcher([insideArea(['workspaceHead/ws-1']), orderArea(['workspaceHead/ws-1'])])

    const hit = searcher.checkDrop(['workspaceHead/ws-1'], undefined, at(0), TALL_OF())

    expect(hit?.inside?.area.accepts).toBe('inside')
    expect(hit?.order).toBeUndefined()
  })
})
