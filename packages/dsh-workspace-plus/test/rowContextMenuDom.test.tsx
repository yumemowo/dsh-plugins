// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { OFFICIAL_PIN_SLOT_ID, ROW_SLOTS } from '../src/client/rowSlots.ts'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 会话行右键菜单接住官方注册表的条目
 *
 * 注册表按需解析，第一次右键时条目还是空的
 * 因此「右键有没有反应」不能靠条目判：判据要是「这一行能不能有菜单」
 * 这里用一份第一次解析才交出条目的替身，钉住那条路径
 */

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    Menu: ({ items, onSelect, onClose, anchor, open }: {
      items?: { id: string; label?: React.ReactNode }[]
      onSelect?: (id: string) => void
      onClose?: () => void
      anchor?: React.ReactNode
      open?: boolean
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
        anchor,
        open === true
          ? [
              h('button', { key: '__close', type: 'button', 'data-wg-test-close': '', onClick: () => onClose?.() }, 'close'),
              ...(items ?? []).map((item) =>
                h(
                  'button',
                  { key: item.id, type: 'button', 'data-wg-test-item': item.id, onClick: () => onSelect?.(item.id) },
                  item.label as React.ReactNode,
                ),
              ),
            ]
          : null,
      ),
  }
})

const CREATED = new Date(2026, 0, 1, 0, 0).toISOString()

const SUMMARIES: Record<string, unknown> = { a: summary('a', 1_000) }

function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({
        items: [{ workspaceId: 'w1', path: '/tmp/w1', title: 'W1', sessionIds: ['a'], createdAt: CREATED, updatedAt: CREATED }],
        archivedSessionIds: [],
        pinnedSessionIds: [],
        phase: 'ready',
      })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a'], byId: SUMMARIES, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) => select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () => snapshot(),
    onReady: () => () => {},
    createGroup: async () => snapshot(),
    renameGroup: async () => snapshot(),
    deleteGroup: async () => snapshot(),
    moveSession: async () => snapshot(),
    setSegmentOrder: async () => snapshot(),
    moveGroupBefore: async () => snapshot(),
    moveVirtualWorkspaceBefore: async () => snapshot(),
    createVirtualWorkspace: async () => snapshot(),
    renameVirtualWorkspace: async () => snapshot(),
    deleteVirtualWorkspace: async () => snapshot(),
    moveWorkspace: async () => snapshot(),
    nestWorkspaces: async () => snapshot(),
    unnestWorkspaces: async () => snapshot(),
    setNested: async () => snapshot(),
    forgetWorkspace: async () => snapshot(),
    focusEntry: async () => snapshot(),
    togglePinned: async () => snapshot(),
    setSessionPinned: async () => {},
    insertWorkspaceBefore: async () => {},
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    ...shellSeats(),
    ...viewModeProps(),
    ...overrides,
  }
}

const roots: { unmount: () => void }[] = []

async function mount(overrides: Partial<WorkspaceGroupsProps> = {}): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(overrides)))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return container
}

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  document.body.replaceChildren()
})

/**
 * 造一个「解析之后才有条目」的注册表替身
 *
 * 真注册表在 resolve 里同步交出一份快照，未解析时它什么也没有
 * 替身照此把条目挂在解析之后的那份源上
 * @param views - 解析之后要交出的条目
 * @param resolved - 记录解析次数
 */
function lazyRegistry(
  views: readonly { id: string; label: string }[],
  resolved: { count: number },
): NonNullable<WorkspaceGroupsProps['menuRegistry']> {
  const listeners = new Set<() => void>()
  let ready = false
  const source = {
    getSnapshot: () => (ready ? views : []),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return () => ({
    resolve: () => {
      resolved.count += 1
      ready = true
      return {
        source,
        ready: Promise.resolve(),
        select: () => {},
        dispose: () => {},
      }
    },
  })
}

/** 会话行元素 */
function rowOf(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('.workspaceBody .row')
  if (found === null) throw new Error('no session row')
  return found
}

/**
 * 渲染出来的菜单项 id
 *
 * 面板是行外的浮层（真原语还会 portal 到 body），因此从容器上找而不是从行元素上找
 * @param container - 区域根元素
 */
function itemIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-wg-test-item]')).map(
    (entry) => entry.getAttribute('data-wg-test-item') ?? '',
  )
}

/** 在行上派发一次右键 */
async function rightClick(row: HTMLElement): Promise<void> {
  await act(async () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 50 }))
  })
}

describe('session row right click over the official registry', () => {
  it('opens the registry entries on the very first right click', async () => {
    // 注册表的条目按需解析：第一次右键时它们还没准备好
    // 拿「眼下有没有条目」当判据，这一次就会落空，浏览器弹出自己的菜单
    const resolved = { count: 0 }
    const container = await mount({
      menuRegistry: lazyRegistry([{ id: 'rename', label: '重命名' }], resolved),
    })
    const row = rowOf(container)

    await rightClick(row)

    expect(resolved.count).toBe(1)
    expect(itemIds(container)).toContain('rename')
  })

  it('releases the resolution when the right-click panel closes', async () => {
    // 两个面板共用同一次解析，右键打开的那次也要在关掉时释放
    // 否则解析一直挂到行被卸载，注册表那边始终认为还有人在用它
    const resolved = { count: 0 }
    const disposed = { count: 0 }
    const registry: NonNullable<WorkspaceGroupsProps['menuRegistry']> = () => ({
      resolve: () => {
        resolved.count += 1
        const source = { getSnapshot: () => [{ id: 'rename', label: '重命名' }], subscribe: () => () => {} }
        return {
          source,
          ready: Promise.resolve(),
          select: () => {},
          dispose: () => {
            disposed.count += 1
          },
        }
      },
    })
    const container = await mount({ menuRegistry: registry })
    const row = rowOf(container)

    await rightClick(row)
    expect(disposed.count).toBe(0)

    // 面板自己在关掉时回调，与行内 `...` 菜单走的是同一处释放
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-wg-test-close]')?.click()
    })
    expect(disposed.count).toBe(1)
  })

  it('intercepts the browser menu when the registry can still supply entries', async () => {
    // 判据是「这一行能不能有菜单」而不是「眼下有没有条目」
    // 条目还没解析出来时若照后者判，这一下右键就落空了，浏览器弹出自己的菜单
    // 反面（一处菜单源都没有的行）见 render.test.ts 那条「没有入口就不挂处理函数」
    const container = await mount({
      menuRegistry: lazyRegistry([{ id: 'rename', label: '重命名' }], { count: 0 }),
    })
    const row = rowOf(container)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 })
    await act(async () => {
      row.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
  })
})

/**
 * 行尾按钮位的占用者
 *
 * 官方自己往这一格注册了一枚置顶按钮，它与本包那枚同形同义
 * 但官方那枚只按官方自己的置顶集合判断，不认本包的置顶上限，因此由本包那枚接替这一格
 */
describe('the row action slot with an official pin occupant', () => {
  /** 照官方那枚的形状造一个能分辨来源的按钮，并记下排掉的 id */
  function officialPinSlot(omit: (string[] | undefined)[]): NonNullable<WorkspaceGroupsProps['rowSlots']> {
    return () => ({
      render: (key: string, _owner: unknown, _standard?: unknown, omits?: readonly string[]) => {
        omit.push(omits === undefined ? undefined : [...omits])
        if (key !== ROW_SLOTS.action) return null
        if (omits?.includes(OFFICIAL_PIN_SLOT_ID) === true) return null
        return React.createElement('button', { 'data-wg-test-official-pin': '', type: 'button' })
      },
    })
  }

  it('leaves the official pin out of the action slot', async () => {
    const omits: (string[] | undefined)[] = []
    const container = await mount({ rowSlots: officialPinSlot(omits) })
    const row = rowOf(container)

    // 行尾只有本包那枚图钉：官方那枚按 id 排掉了，两枚不会并排站成「一枚守上限、一枚绕过它」
    expect(row.querySelector('[data-wg-test-official-pin]')).toBeNull()
    expect(row.querySelector('.rowPin')).not.toBeNull()
    expect(omits.flat()).toContain(OFFICIAL_PIN_SLOT_ID)
  })

  it('keeps the rest of the action slot intact', async () => {
    // 排的只有置顶那一条，同格其余条目照旧渲染
    const container = await mount({
      rowSlots: () => ({
        render: (key: string, _owner: unknown, _standard?: unknown, omits?: readonly string[]) =>
          key !== ROW_SLOTS.action
            ? null
            : React.createElement(
                'span',
                null,
                ...['pin', 'archive'].map((id) =>
                  omits?.includes(id) === true
                    ? null
                    : React.createElement('button', { key: id, 'data-wg-test-slot': id, type: 'button' }),
                ),
              ),
      }),
    })
    const row = rowOf(container)

    expect(row.querySelector('[data-wg-test-slot="archive"]')).not.toBeNull()
    expect(row.querySelector('[data-wg-test-slot="pin"]')).toBeNull()
  })
})
