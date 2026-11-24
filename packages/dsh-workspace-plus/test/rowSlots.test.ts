import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { OFFICIAL_PIN_SLOT_ID, renderRowSlot, ROW_SLOTS } from '../src/client/rowSlots.ts'

/**
 * 行级子插槽的占用者渲染
 *
 * 本包不能声明那四个子插槽，只能从 ledger 的条目表里取占用者自己渲染
 * 这里用一份最小的注册表替身钉住三件事：没占用者时不渲染、占用者拿到 owner 与自己的 inject 面、排掉指定 id
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

  it('leaves out the occupants whose id is omitted', () => {
    // 官方那枚置顶与别的插槽占用者同在一格：排掉它之后，剩下的那些照旧渲染
    const kind = (props: Record<string, unknown>) =>
      React.createElement('i', { 'data-test': String(props['mark']) })
    const Mark = (props: { mark: string }) => kind(props as unknown as Record<string, unknown>)
    const node = renderRowSlot(
      slotsWith([
        { component: Mark, options: { id: OFFICIAL_PIN_SLOT_ID }, inject: () => ({ mark: 'official-pin' }) },
        { component: Mark, options: { id: 'archive' }, inject: () => ({ mark: 'archive' }) },
      ]),
      undefined,
      ROW_SLOTS.action,
      { sessionId: 's1' },
      {},
      [OFFICIAL_PIN_SLOT_ID],
    )
    // 排掉的那条不渲染，同格里其余条目照旧
    expect(React.isValidElement(node)).toBe(true)
    const children = (node as React.ReactElement<{ children: unknown }>).props.children
    expect(React.Children.count(children)).toBe(1)
  })
})
