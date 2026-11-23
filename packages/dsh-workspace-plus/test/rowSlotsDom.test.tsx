// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { ROW_SLOTS } from '../src/client/rowSlots.ts'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 行级子插槽在真实 DOM 里的落点
 *
 * 那四个子插槽的占用者是别的插件注册的，本包只负责把它们画在正确的格子里
 * 「画在哪儿」只能在真实渲染里看：元素树里看不出一个节点在行首还是行尾
 */

const CREATED = new Date(2026, 0, 1, 0, 0).toISOString()

const SUMMARIES: Record<string, unknown> = {
  a: summary('a', 1_000),
  blank: { id: 'blank', displayTitle: '', running: false, blank: true, retainedBy: { mainView: 1 }, updatedAt: 2_000 },
};

function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({
        items: [{ workspaceId: 'w1', path: '/tmp/w1', title: 'W1', sessionIds: ['a', 'blank'], createdAt: CREATED, updatedAt: CREATED }],
        archivedSessionIds: [],
        pinnedSessionIds: [],
        phase: 'ready',
      })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'blank'], byId: SUMMARIES, phase: 'ready' })) as never,
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
 * 造一份行级插槽面
 *
 * 每个键都渲染一个可断言的小盒子，内容带键名，用例据此判断它落在哪一格
 * @param occupied - 哪几个键有占用者
 */
function slots(occupied: readonly string[]): NonNullable<WorkspaceGroupsProps['rowSlots']> {
  return () => ({
    render: (key: string) =>
      occupied.includes(key)
        ? React.createElement('span', { 'data-wg-test-slot': key, key })
        : null,
    occupied: (key: string) => occupied.includes(key),
    has: (key: string, id: string) => occupied.includes(key) && id === 'pin',
  })
}

/** 一行会话在列表里的行元素 */
function rowOf(container: HTMLElement, title: string): HTMLElement {
  const found = Array.from(container.querySelectorAll<HTMLElement>('.workspaceBody .row')).find(
    (row) => row.querySelector('.rowTitle')?.textContent === title,
  );
  if (found === undefined) throw new Error('no row titled ' + title);
  return found;
}

describe('row slots in a real DOM', () => {
  it('draws the leading occupant in the status cell while the row is idle', async () => {
    const container = await mount({ rowSlots: slots([ROW_SLOTS.leading]) });
    const row = rowOf(container, '会话 a');

    // 空闲行不画状态点，那一格交给占用者
    expect(row.querySelector('[data-wg-test-slot="sidebar.session.row.leading"]')).not.toBeNull();
    expect(row.querySelector('.indicator')).toBeNull();
  })

  it('keeps the status dot and drops the leading occupant when the row is busy', async () => {
    // 行自身有状态时那一格归状态点：两者不共享同一处
    const container = await mount({
      rowSlots: slots([ROW_SLOTS.leading]),
      useSessionStatus: ((select: (s: unknown) => unknown) =>
        select(new Map([['a', { running: true, completionUnread: false }]]))) as never,
    });
    const row = rowOf(container, '会话 a');

    expect(row.querySelector('.indicator')).not.toBeNull();
    expect(row.querySelector('[data-wg-test-slot="sidebar.session.row.leading"]')).toBeNull();
  })

  it('draws the trailing occupant and the row action occupant', async () => {
    const container = await mount({ rowSlots: slots([ROW_SLOTS.trailing, ROW_SLOTS.action]) });
    const row = rowOf(container, '会话 a');

    expect(row.querySelector('[data-wg-test-slot="sidebar.session.row.trailing"]')).not.toBeNull();
    expect(row.querySelector('[data-wg-test-slot="sidebar.workspaces.session.row.action"]')).not.toBeNull();
  })

  it('leaves a blank row without any occupant', async () => {
    const container = await mount({
      rowSlots: slots([ROW_SLOTS.leading, ROW_SLOTS.trailing, ROW_SLOTS.action]),
    });
    const row = rowOf(container, '新会话');

    // 空白会话只是「准备开始一个新会话」的占位，那几个格子对它没有意义
    expect(row.querySelectorAll('[data-wg-test-slot]')).toHaveLength(0);
  })
})
