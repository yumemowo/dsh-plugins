// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROW_SLOTS, renderRowSlot } from '../src/client/rowSlots.ts'

/**
 * 照官方行内按钮的真实形状渲染一次
 *
 * 官方 `PinSessionRowButton` 读 `usePinned` / `useArchived` / `useSessionAccess`，并且调 `pinSession`
 * 这里把那份形状抄一遍，钉住「占用者要的四类东西本包都交得出去」
 */

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next: T) => {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** 与官方 `PinSessionRowButton` 同形的最小占用者 */
function PinLike(props: Record<string, unknown>) {
  const sessionId = props['sessionId'] as string
  const usePinned = props['usePinned'] as (selector: (value: Set<string>) => boolean) => boolean
  const useArchived = props['useArchived'] as (selector: (value: Set<string>) => boolean) => boolean
  const useSessionAccess = props['useSessionAccess'] as (id: string, action: string) => boolean
  const pinSession = props['pinSession'] as (id: string) => void
  const pinned = usePinned((set) => set.has(sessionId))
  const archived = useArchived((set) => set.has(sessionId))
  const allowed = useSessionAccess(sessionId, pinned ? 'workspace/unpinSession' : 'workspace/pinSession')
  if (archived || !allowed) return null
  return React.createElement('button', {
    type: 'button',
    'data-wg-test-pin': pinned ? 'on' : 'off',
    onClick: () => pinSession(sessionId),
  })
}

describe('renderRowSlot with an official-shaped occupant', () => {
  it('supplies every hook and action the official row button reads', async () => {
    const pinned = source(new Set<string>())
    const archived = source(new Set<string>())
    const pinnedCalls: string[] = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(renderRowSlot(
        {
          entriesOfSlot: () => [{
            component: PinLike,
            locale: 'workspace',
            options: { id: 'pin' },
            inject: () => ({
              hooks: { pinned, archived },
              pinSession: (id: string) => pinnedCalls.push(id),
              unpinSession: () => {},
            }),
          }],
        } as never,
        { bind: () => (key: string) => key } as never,
        ROW_SLOTS.action,
        { sessionId: 's1' },
        { useSessionAccess: () => true },
      ))
    })

    const button = container.querySelector('[data-wg-test-pin]')
    expect(button?.getAttribute('data-wg-test-pin')).toBe('off')
    await act(async () => { (button as HTMLButtonElement).click(); })
    expect(pinnedCalls).toEqual(['s1'])

    // 置顶集合变了，选择器跟着重渲染
    await act(async () => { pinned.set(new Set(['s1'])); })
    expect(container.querySelector('[data-wg-test-pin]')?.getAttribute('data-wg-test-pin')).toBe('on')
  })
})
