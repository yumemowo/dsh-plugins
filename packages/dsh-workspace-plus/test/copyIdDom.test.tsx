// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { storeViewModeProps, viewModeStoreStub } from './viewMode-stub.ts'

/**
 * 三处「复制 ID」的真实 DOM
 *
 * 写剪贴板与提示条都走基线原语，{@link primitives-stub} 的替身把写进去的文本记在
 * `globalThis.__clipboard` 上、把提示渲染成带 `data-wg-toast` 的节点
 * 因此这里能验证整条链路：菜单项被点到 -> 文本真的写出去 -> 提示条带着对应文案出现
 *
 * 只测渲染不测交互的话，「菜单项加了但分派没接上」在元素树里看起来完全正常
 */

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    // 行菜单要用真实点击驱动：替身里 Menu 是 null，那样点不到任何条目
    Menu: ({
      items,
      onSelect,
    }: {
      items?: { id: string; label?: React.ReactNode; disabled?: boolean }[]
      onSelect?: (id: string) => void
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
        (items ?? []).map((item) =>
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              'data-wg-test-item': item.id,
              disabled: item.disabled === true,
              onClick: () => onSelect?.(item.id),
            },
            item.label as React.ReactNode,
          ),
        ),
      ),
  }
})

const CREATED = new Date(2026, 0, 1, 0, 0).toISOString()

/**
 * 两份快照必须建在模块级
 *
 * 选择器每次渲染都会被调用，每次新建对象会让 `useSyncExternalStore` 判定为快照变过，渲染因此无限循环
 */
const WORKSPACES = {
  items: [
    {
      workspaceId: 'w1',
      path: '/tmp/w1',
      title: 'W1',
      sessionIds: ['a'],
      createdAt: CREATED,
      updatedAt: CREATED,
    },
  ],
  archivedSessionIds: [] as string[],
  pinnedSessionIds: [] as string[],
  phase: 'ready',
}

const SESSIONS = { ids: ['a'], byId: { a: summary('a', 1_000) }, phase: 'ready' }

/** 造一份注入面完整的数据：一个工作区、它体内一个会话分组、根节点一个工作区分组 */
function props(): WorkspaceGroupsProps {
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) => select(WORKSPACES)) as never,
    useSessions: ((select: (s: unknown) => unknown) => select(SESSIONS)) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () =>
      snapshot({
        byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] },
        workspaceGroups: [{ id: 'wg1', name: '聚合组', workspaceIds: [] }],
      }),
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
    ...storeViewModeProps(viewModeStoreStub()),
  }
}

/** 挂载区域并等分组元数据落地 */
async function mount(): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props()))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root }
}

beforeEach(() => {
  delete (globalThis as { __clipboard?: string }).__clipboard
  delete (globalThis as { __clipboardOk?: boolean }).__clipboardOk
})

afterEach(() => {
  document.body.replaceChildren()
})

/** 点一处菜单项，并把这一次复制的落地等出来 */
async function clickItem(scope: ParentNode, id: string): Promise<void> {
  await act(async () => {
    scope.querySelector<HTMLButtonElement>(`[data-wg-test-item="${id}"]`)?.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** 页面上那条复制提示的文案，没有提示时为 undefined */
function toastText(): string | undefined {
  return document.body.querySelector('[data-wg-toast]')?.textContent ?? undefined
}

describe('copy id', () => {
  it('writes the session id and reports the official copied wording', async () => {
    const { container, root } = await mount()

    // 会话行的那一份菜单里挂着「复制 Session ID」，与官方会话菜单同一条
    const sessionRow = container.querySelector<HTMLElement>('.row')
    await clickItem(sessionRow as HTMLElement, 'copy-id')

    expect((globalThis as { __clipboard?: string }).__clipboard).toBe('a')
    expect(toastText()).toBe('Session ID 已复制')
    await act(async () => root.unmount())
  })

  it('writes the session group id', async () => {
    const { container, root } = await mount()

    // 根节点的分组头另带 `virtualWorkspaceHead`，这里要的是工作区体内那个会话分组
    const sessionGroup = Array.from(container.querySelectorAll<HTMLElement>('.groupHead')).find(
      (head) => head.classList.contains('virtualWorkspaceHead') === false,
    ) as HTMLElement
    await clickItem(sessionGroup, 'copy-id')

    expect((globalThis as { __clipboard?: string }).__clipboard).toBe('g1')
    expect(toastText()).toBe('分组 ID 已复制')
    await act(async () => root.unmount())
  })

  it('writes the workspace group id', async () => {
    const { container, root } = await mount()

    const heads = Array.from(container.querySelectorAll<HTMLElement>('.groupHead'))
    const workspaceGroup = heads.find((head) =>
      head.textContent?.includes('聚合组') === true,
    ) as HTMLElement
    await clickItem(workspaceGroup, 'copy-id')

    expect((globalThis as { __clipboard?: string }).__clipboard).toBe('wg1')
    expect(toastText()).toBe('分组 ID 已复制')
    await act(async () => root.unmount())
  })

  it('reports the shared failure wording when the clipboard refuses', async () => {
    const { container, root } = await mount()
    ;(globalThis as { __clipboardOk?: boolean }).__clipboardOk = false

    const sessionRow = container.querySelector<HTMLElement>('.row')
    await clickItem(sessionRow as HTMLElement, 'copy-id')

    // 失败提示取官方那句不点名对象的文案，三处复制共用
    expect(toastText()).toBe('复制失败，请重试')
    await act(async () => root.unmount())
  })
})
