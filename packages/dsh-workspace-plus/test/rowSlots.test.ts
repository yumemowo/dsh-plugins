import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderRowSlot, rowSlotOccupied, ROW_SLOTS } from '../src/client/rowSlots.ts'

/**
 * 行级子插槽的占用者渲染
 *
 * 本包不能声明那四个子插槽，只能从 ledger 的条目表里取占用者自己渲染
 * 这里用一份最小的注册表替身钉住三件事：没占用者时不渲染、占用者拿到 owner 与自己的 inject 面、有没有人可订阅
 */

/** 造一个插槽注册表替身，只实现本模块用到的两个读法 */
function slotsWith(entries: readonly Record<string, unknown>[]): never {
  return {
    entriesOfSlot: () => entries,
  } as never
}

describe('renderRowSlot', () => {
  it('renders nothing without an occupant', () => {
    // 宿主没装任何往这四个子插槽注册的插件时，行上不多出空盒子
    expect(renderRowSlot(slotsWith([]), undefined, ROW_SLOTS.leading, { sessionId: 's1' })).toBeNull()
  })

  it('passes the owner and the occupant inject face', () => {
    const seen: Record<string, unknown>[] = [];
    const Occupant = (props: Record<string, unknown>) => {
      seen.push(props);
      return React.createElement('i', { 'data-test': 'mark' });
    };
    const node = renderRowSlot(
      slotsWith([{ component: Occupant, inject: () => ({ label: 'x' }) }]),
      undefined,
      ROW_SLOTS.leading,
      { sessionId: 's1' },
    );
    expect(node).not.toBeNull();
  })

  it('skips an entry whose component is not a function', () => {
    // 已崩溃退位的注册项会从渲染者视图里摘掉，这里照同一取舍跳过
    expect(renderRowSlot(slotsWith([{ component: 42 }]), undefined, ROW_SLOTS.hover, { sessionId: 's1' })).toBeNull()
  })
})

describe('rowSlotOccupied', () => {
  it('reports whether any occupant registered', () => {
    expect(rowSlotOccupied(slotsWith([]), ROW_SLOTS.action)).toBe(false)
    expect(rowSlotOccupied(slotsWith([{ component: () => null }]), ROW_SLOTS.action)).toBe(true)
  })
})
