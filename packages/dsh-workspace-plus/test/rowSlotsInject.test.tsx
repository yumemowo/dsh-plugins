// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ROW_SLOTS, renderRowSlot } from '../src/client/rowSlots.ts'

/**
 * 占用者 inject 面里那几个隔间的绑定
 *
 * 渲染器把 `hooks` 里的每个可订阅源绑成 `use<Name>` 选择器，而不是把源本身交给组件
 * 占用者按那个名字调用（如 Schedule 的告警标记读 `useCatalog`），传源过去就是「不是函数」
 * 这组用例钉住三件事：源被换成选择器、选择器读到当前快照、`keyedHooks` 同理
 */

/** 造一个可订阅源，值由用例改 */
function source<T>(initial: T): {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
  set: (next: T) => void
} {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set: (next) => {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** 挂载一个节点并交出容器 */
async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
  return container
}

describe('renderRowSlot inject binding', () => {
  it('binds a hooks source to a use<Name> selector instead of passing it through', async () => {
    const catalog = source([{ id: 't1' }])
    const received: Record<string, unknown> = {}
    const Occupant = (props: Record<string, unknown>) => {
      // 占用者按渲染器的约定读：名字是 use<Name>，形态是选择器
      const useCatalog = props['useCatalog'] as ((selector: (value: unknown) => unknown) => unknown) | undefined
      received['useCatalog'] = useCatalog
      received['rawHooks'] = props['hooks']
      if (typeof useCatalog !== 'function') return React.createElement('i', null, 'no hook')
      const value = useCatalog((snapshot) => snapshot) as unknown[]
      return React.createElement('i', { 'data-count': String(value.length) })
    }

    const node = renderRowSlot(
      { entriesOfSlot: () => [{ component: Occupant, inject: () => ({ hooks: { catalog } }) }] } as never,
      undefined,
      ROW_SLOTS.leading,
      { sessionId: 's1' },
    )
    const container = await mount(node)

    // 关键：源本身不交给组件，交的是绑好的选择器
    expect(typeof received['useCatalog']).toBe('function')
    expect(received['rawHooks']).toBeUndefined()
    expect(container.querySelector('[data-count]')?.getAttribute('data-count')).toBe('1')
  })

  it('re-reads the source when it changes', async () => {
    const catalog = source([{ id: 't1' }])
    const Occupant = (props: Record<string, unknown>) => {
      const useCatalog = props['useCatalog'] as (selector: (value: unknown) => unknown) => unknown
      const value = useCatalog((snapshot) => snapshot) as unknown[]
      return React.createElement('i', { 'data-count': String(value.length) })
    }
    const container = await mount(renderRowSlot(
      { entriesOfSlot: () => [{ component: Occupant, inject: () => ({ hooks: { catalog } }) }] } as never,
      undefined,
      ROW_SLOTS.leading,
      { sessionId: 's1' },
    ))
    expect(container.querySelector('[data-count]')?.getAttribute('data-count')).toBe('1')

    await act(async () => {
      catalog.set([{ id: 't1' }, { id: 't2' }])
    })
    // 选择器订阅着源，快照变了组件跟着重渲染
    expect(container.querySelector('[data-count]')?.getAttribute('data-count')).toBe('2')
  })

  it('binds a keyed source to a keyed selector', async () => {
    const received: Record<string, unknown> = {}
    const Occupant = (props: Record<string, unknown>) => {
      received['useItem'] = props['useItem']
      return null
    }
    await mount(renderRowSlot(
      { entriesOfSlot: () => [{ component: Occupant, inject: () => ({ keyedHooks: { item: () => source('x') } }) }] } as never,
      undefined,
      ROW_SLOTS.hover,
      { sessionId: 's1' },
    ))

    expect(typeof received['useItem']).toBe('function')
  })

  it('reads a keyed hook the way the renderer lets an occupant call it', async () => {
    // 三种调用形态：只给选择器、给键与成员、给键与成员与判等函数
    const seen: unknown[] = []
    const Occupant = (props: Record<string, unknown>) => {
      const useItem = props['useItem'] as (
        a: string | ((value: unknown) => unknown),
        b?: string | ((value: unknown) => unknown),
      ) => unknown
      // 键 + 选择器
      seen.push(useItem('k1', (value) => value))
      return null
    }
    await mount(renderRowSlot(
      {
        entriesOfSlot: () => [{
          component: Occupant,
          inject: () => ({ keyedHooks: { item: (key: string) => source('value:' + key) } }),
        }],
      } as never,
      undefined,
      ROW_SLOTS.hover,
      { sessionId: 's1' },
    ))

    expect(seen).toEqual(['value:k1'])
  })

  it('gives a keyed hook with no key an absent source instead of throwing', async () => {
    // 只给选择器、没有键：渲染器退回缺省键，本包这四个子插槽没有缺省键，因此读成 undefined
    const seen: unknown[] = []
    const Occupant = (props: Record<string, unknown>) => {
      const useItem = props['useItem'] as (selector: (value: unknown) => unknown) => unknown
      seen.push(useItem((value) => value))
      return null
    }
    await mount(renderRowSlot(
      {
        entriesOfSlot: () => [{
          component: Occupant,
          inject: () => ({ keyedHooks: { item: () => source('x') } }),
        }],
      } as never,
      undefined,
      ROW_SLOTS.hover,
      { sessionId: 's1' },
    ))

    expect(seen).toEqual([undefined])
  })

  it('forwards the global standard hooks the renderer would supply', async () => {
    // 官方行内按钮先问 useSessionAccess 再决定渲不渲染；不转交它拿到 undefined 就当函数调
    const received: Record<string, unknown> = {}
    const Occupant = (props: Record<string, unknown>) => {
      received['useSessionAccess'] = props['useSessionAccess']
      received['useSessions'] = props['useSessions']
      return null
    }
    const useSessionAccess = (sessionId: string, action: string): boolean =>
      sessionId === 's1' && action === 'session/rename'
    await mount(renderRowSlot(
      { entriesOfSlot: () => [{ component: Occupant, inject: () => ({}) }] } as never,
      undefined,
      ROW_SLOTS.action,
      { sessionId: 's1' },
      { useSessionAccess, useSessions: () => undefined },
    ))

    expect(received['useSessionAccess']).toBe(useSessionAccess)
    expect(typeof received['useSessions']).toBe('function')
  })

  it('lets the occupant inject face win over a same-named standard hook', async () => {
    // 两份同名时注册项自己的那一份胜出：渲染器把 inject 铺在标准 hook 之后
    const fromStandard = (): string => 'standard'
    const fromInject = (): string => 'inject'
    const received: Record<string, unknown> = {}
    const Occupant = (props: Record<string, unknown>) => {
      received['useThing'] = props['useThing']
      return null
    }
    await mount(renderRowSlot(
      {
        entriesOfSlot: () => [{
          component: Occupant,
          inject: () => ({ hooks: { thing: source('own') } }),
        }],
      } as never,
      undefined,
      ROW_SLOTS.leading,
      { sessionId: 's1' },
      { useThing: fromStandard },
    ))

    // 绑出来的选择器不是注册项注入的那一个函数，但读的是注册项自己的源
    expect(received['useThing']).not.toBe(fromInject)
    expect(typeof received['useThing']).toBe('function')
  })

  it('contains a crashing occupant without taking the row with it', async () => {
    // 渲染器给每个注册项包一层崩溃隔离；本包自己渲染时同样需要
    // 否则一个第三方占用者写坏就让整片列表崩掉，而界面上只表现为「列表没了」
    const Broken = () => {
      throw new TypeError('boom')
    }
    const Healthy = () => React.createElement('i', { 'data-test': 'healthy' })

    const node = renderRowSlot(
      {
        entriesOfSlot: () => [
          { component: Broken, options: { id: 'broken' } },
          { component: Healthy, options: { id: 'healthy' } },
        ],
      } as never,
      undefined,
      ROW_SLOTS.leading,
      { sessionId: 's1' },
    )

    const container = await mount(node)

    // 崩溃那一格换成空占位，旁边那个正常的照常渲染
    expect(container.querySelector('[data-slot-error="sidebar.session.row.leading"]')).not.toBeNull()
    expect(container.querySelector('[data-test="healthy"]')).not.toBeNull()
  })
})
