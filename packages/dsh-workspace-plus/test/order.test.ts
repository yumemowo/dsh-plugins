/**
 * 顺序位到渲染顺序的换算
 *
 * 这一段算错时界面不会报错，只表现为「拖过的分组顺序又跳回时间序」「新会话插到了中间」或「同一条会话出现两次」，
 * 因此这里逐条钉住四种合成结果：没有顺序位时原样按时间序、顺序位里的成员按它排、不在顺序位里的成员接在后面、
 * 顺序位里已经不作数的 id 静默丢掉
 */
import { describe, expect, it } from 'vitest'
import { reconcileOrder } from '../src/client/data/order.ts'

/** 一个成员，只带比较用得上的两格 */
interface Member {
  id: string
  at: number
}

/**
 * 造一个成员
 * @param id - 成员 id
 * @param at - 时间序读数，越小越靠前
 */
function member(id: string, at: number): Member {
  return { id, at }
}

/** 按时间序读数升序 */
function byTime(a: Member, b: Member): number {
  return a.at - b.at
}

/** 换算结果里的 id */
function ids(members: readonly Member[]): string[] {
  return members.map((entry) => entry.id)
}

describe('reconcileOrder', () => {
  it('keeps the time order when the segment has no slot', () => {
    // 旧数据零变化：没有顺序位时显示与引入顺序位之前逐项相同
    const members = [member('a', 30), member('b', 10), member('c', 20)]

    expect(ids(reconcileOrder(undefined, members, byTime))).toEqual(['b', 'c', 'a'])
  })

  it('treats an empty slot as no slot at all', () => {
    // 空表与缺席是同一件事：留一份空数组只是落盘时的一格噪音
    const members = [member('a', 20), member('b', 10)]

    expect(ids(reconcileOrder([], members, byTime))).toEqual(['b', 'a'])
  })

  it('follows the slot order for the members it names', () => {
    const members = [member('a', 10), member('b', 20), member('c', 30)]

    expect(ids(reconcileOrder(['c', 'a', 'b'], members, byTime))).toEqual(['c', 'a', 'b'])
  })

  it('appends members the slot does not name in time order', () => {
    // 新会话不在顺序位里，接在手动排过的那些之后，而不是插到它们中间
    const members = [member('a', 10), member('b', 20), member('c', 30), member('d', 5)]

    expect(ids(reconcileOrder(['c', 'a'], members, byTime))).toEqual(['c', 'a', 'd', 'b'])
  })

  it('drops slot ids that are no longer members', () => {
    // 归档、删除、移出分组都会在顺序位里留下已经不作数的 id，它们不该在界面上占位
    const members = [member('a', 10), member('b', 20)]

    expect(ids(reconcileOrder(['gone', 'b', 'a'], members, byTime))).toEqual(['b', 'a'])
  })

  it('keeps a member named twice in the slot only once', () => {
    // 顺序位被写重时，同一个成员在界面上出现两次会让 React 的 key 撞车
    const members = [member('a', 10), member('b', 20)]

    expect(ids(reconcileOrder(['b', 'b', 'a'], members, byTime))).toEqual(['b', 'a'])
  })

  it('returns every member exactly once', () => {
    // 成员集合是事实来源：顺序位无论写了什么，界面都不该因此丢行或重复
    const members = [member('a', 10), member('b', 20), member('c', 30)]

    const out = ids(reconcileOrder(['c', 'ghost', 'c'], members, byTime))

    expect([...out].sort()).toEqual(['a', 'b', 'c'])
  })

  it('leaves the input alone', () => {
    const members = [member('a', 10), member('b', 20)]

    reconcileOrder(['b', 'a'], members, byTime)

    expect(ids(members)).toEqual(['a', 'b'])
  })
})
