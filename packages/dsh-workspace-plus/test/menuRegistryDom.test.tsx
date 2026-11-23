// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 会话菜单借官方注册表的真实 DOM
 *
 * 注册表那段条目由插件注册，本包的归组项接在后面，两者在同一个面板里
 * 「谁先谁后」与「选中落到谁身上」都只能在真实渲染里看
 */

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    Menu: ({ items, onSelect, anchor }: {
      items?: { id: string; label?: React.ReactNode }[]
      onSelect?: (id: string) => void
      anchor?: React.ReactNode
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
        anchor,
        (items ?? []).map((item) =>
          h(
            'button',
            { key: item.id, type: 'button', 'data-wg-test-item': item.id, onClick: () => onSelect?.(item.id) },
            item.label as React.ReactNode,
          ),
        ),
      ),
  }
})

const CREATED = new Date(2026, 0, 1, 0, 0).toISOString()

const SUMMARIES: Record<string, unknown> = {
  a: summary('a', 1_000),
}

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
 * 造一个注册表替身
 *
 * 形状照官方的菜单解析结果：条目来自可订阅的源，选中按 id 交回给这次解析
 * @param views - 这次解析要交出的条目
 * @param executed - 选中时记录 id 的地方
 */
function registryStub(
  views: readonly { id: string; label: string; icon?: { key: string } }[],
  executed: string[],
): NonNullable<WorkspaceGroupsProps['menuRegistry']> {
  const source = { getSnapshot: () => views, subscribe: () => () => {} }
  return () => ({
    resolve: () => ({
      source,
      ready: Promise.resolve(),
      select: (id: string) => {
        executed.push(id)
      },
      dispose: () => {},
    }),
  })
}

/** 行尾那枚省略号按钮 */
function actionButton(container: HTMLElement): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('.workspaceBody .rowAction')
  if (found === null) throw new Error('row has no action button')
  return found
}

/** 一行上渲染出来的菜单项 id */
function itemIds(row: HTMLElement): string[] {
  return Array.from(row.querySelectorAll('[data-wg-test-item]')).map(
    (entry) => entry.getAttribute('data-wg-test-item') ?? '',
  )
}

describe('session menu over the official context-menu registry', () => {
  it('renders the registry entries before the own grouping items', async () => {
    const executed: string[] = []
    const container = await mount({
      menuRegistry: registryStub([{ id: 'pin', label: '置顶会话' }, { id: 'rename', label: '重命名' }], executed),
    })
    const row = container.querySelector<HTMLElement>('.workspaceBody .row')
    if (row === null) throw new Error('no row')

    await act(async () => actionButton(container).click())

    // 注册表那段在前，本包的归组项接在后面
    const ids = itemIds(row)
    expect(ids.slice(0, 2)).toEqual(['pin', 'rename'])
    expect(ids.length).toBeGreaterThan(2)
  })

  it('runs the registry action instead of the built-in one', async () => {
    const executed: string[] = []
    const container = await mount({
      menuRegistry: registryStub([{ id: 'pin', label: '置顶会话' }], executed),
    })
    const row = container.querySelector<HTMLElement>('.workspaceBody .row')
    if (row === null) throw new Error('no row')

    await act(async () => actionButton(container).click())
    await act(async () => row.querySelector<HTMLButtonElement>('[data-wg-test-item="pin"]')?.click())

    // 同一个 id 由注册表执行：本包不再自己调置顶
    expect(executed).toEqual(['pin'])
  })

  it('falls back to the built-in entries when no registry is installed', async () => {
    const container = await mount()
    const row = container.querySelector<HTMLElement>('.workspaceBody .row')
    if (row === null) throw new Error('no row')

    await act(async () => actionButton(container).click())

    // 宿主没装 ui-context-menu 时行为与改动前完全一致
    expect(itemIds(row)).toContain('pin')
    expect(itemIds(row)).toContain('rename')
  })
})
