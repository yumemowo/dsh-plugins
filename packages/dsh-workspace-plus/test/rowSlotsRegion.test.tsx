// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { ROW_SLOTS } from '../src/client/rowSlots.ts'
import { renderRowSlot } from '../src/client/rowSlots.ts'
import type { RowSlotFace, StandardHooks } from '../src/client/rowSlots.ts'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 行级子插槽的占用者经由区域渲染时不会崩
 *
 * 占用者按渲染器的约定读 `useCatalog` 这类绑好的选择器，而不是读源本身
 * 本包自己渲染占用者时若把 `hooks` 隔间原样传下去，占用者拿到 undefined 就当函数调用
 * 这条用例照 Schedule 告警标记的真实形状走一遍区域，钉住「不崩、且画得出来」
 */

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

/** 一个可订阅源 */
function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/**
 * 照官方的行级插槽渲染器造一份面
 *
 * 调用本包真正的 `renderRowSlot`，因此走的是与生产同一条代码
 * @param hooks - 交给占用者的全局标准 hook
 */
function face(hooks: StandardHooks): NonNullable<WorkspaceGroupsProps['rowSlots']> {
  return (): RowSlotFace => ({
    render: (key: string, owner: { sessionId: string }, standard?: StandardHooks) =>
      renderRowSlot(
        {
          entriesOfSlot: () => key === ROW_SLOTS.leading
            ? [{
                component: ScheduleLikeMark,
                locale: 'schedule',
                options: { id: 'schedule-mark' },
                inject: () => ({ hooks: { catalog: source([{ id: 'task-1' }]) } }),
              }]
            : [],
        } as never,
        { bind: () => (namespace: string) => namespace } as never,
        key,
        owner,
        standard ?? hooks,
      ),
  })
}

/** 照官方告警标记的形状读 `useCatalog` */
function ScheduleLikeMark(props: Record<string, unknown>) {
  const sessionId = props['sessionId'] as string
  const useCatalog = props['useCatalog'] as (selector: (value: readonly { id: string }[]) => number) => number
  if (typeof useCatalog !== 'function') throw new TypeError('useCatalog is not a function')
  const count = useCatalog((records) => records.length)
  if (count === 0) return null
  return createElement('span', { 'data-wg-test-mark': sessionId })
}

describe('a row slot occupant over the region', () => {
  it('renders the leading occupant without crashing on its bound hook', async () => {
    const container = await mount({ rowSlots: face({}) })

    // 占用者画在行首那一格，说明没有崩、且确实挂上了
    expect(container.querySelector('[data-wg-test-mark="a"]')).not.toBeNull()
  })

  it('forwards every use* prop it is given, without a hand-written list', async () => {
    // 全局标准 hook 有十几个且随宿主新增，名单式转发漏一个就崩，而漏的那个 tsc 看不见
    // 这里只验「按约定整体转发」这条机制本身：随便给一个本包不认识的 use*，占用者也拿得到
    const seen: Record<string, unknown> = {}
    const Probe = (props: Record<string, unknown>) => {
      seen['useWhatever'] = props['useWhatever']
      seen['useSessionAccess'] = props['useSessionAccess']
      return null
    }
    const container = await mount({
      rowSlots: () => ({
        render: (key: string, owner: { sessionId: string }, standard?: StandardHooks) =>
          renderRowSlot(
            {
              entriesOfSlot: () => key === ROW_SLOTS.leading ? [{ component: Probe, options: { id: 'probe' } }] : [],
            } as never,
            undefined,
            key,
            owner,
            standard,
          ),
      }),
      useSessionAccess: () => true,
      // 宿主将来新增的标准 hook：本包不认识它，但它照样要转过去
      useWhatever: () => 'value',
    } as Partial<WorkspaceGroupsProps>)

    expect(typeof seen['useSessionAccess']).toBe('function')
    expect(typeof seen['useWhatever']).toBe('function')
    expect(container).not.toBeNull()
  })
})
