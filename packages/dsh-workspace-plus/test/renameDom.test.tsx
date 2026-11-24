// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { snapshot } from './snapshot-stub.ts'
import { shellSeats } from './support/dndDom.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 双击标题改名的真实 DOM
 *
 * 「按下那一击记不记得住」与「双击有没有连带打开会话」都只在真实事件序列里成立
 * 共享替身把 `Modal` / `Input` 渲染成 `null`，这里换一份最小可断言的实现，其余仍走共享替身
 */
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    Menu: () => null,
    Modal: ({ open, title, children, footer }: Record<string, unknown>) =>
      open === false
        ? null
        : h(
            'div',
            { 'data-wg-test-modal': '', role: 'dialog' },
            h('div', { 'data-wg-test-modal-title': '' }, title as React.ReactNode),
            children as React.ReactNode,
            h('div', { 'data-wg-test-modal-footer': '' }, footer as React.ReactNode),
          ),
    Button: ({ children, onClick, ...rest }: Record<string, unknown>) =>
      h('button', { type: 'button', onClick, ...rest }, children as React.ReactNode),
    Input: ({ value, onChange, ...rest }: Record<string, unknown>) =>
      h('input', {
        value,
        onChange: (event: { currentTarget: { value: string } }) => {
          ;(onChange as ((e: unknown) => void) | undefined)?.(event)
        },
        ...rest,
      }),
  }
})

const CREATED = new Date(2026, 0, 1, 0, 0).toISOString()

/** 会话快照：一条有标题的会话与一条新建中的空白会话 */
const SUMMARIES: Record<string, unknown> = {
  a: { id: 'a', displayTitle: '修复登录超时', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
  // 空白会话只在它是当前打开的那一条时才出现在列表里
  blank: { id: 'blank', displayTitle: '', running: false, blank: true, retainedBy: { mainView: 1 }, updatedAt: 2_000 },
}

function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const workspaces = [
    { workspaceId: 'w1', path: '/tmp/w1', title: 'W1', sessionIds: ['a', 'blank'], createdAt: CREATED, updatedAt: CREATED },
  ]
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready' })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'blank'], byId: SUMMARIES, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
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

/** 行标题元素，按标题文案定位 */
function titleOf(container: HTMLElement, text: string): HTMLElement {
  const found = Array.from(container.querySelectorAll<HTMLElement>('.rowTitle')).find(
    (title) => title.textContent === text,
  )
  if (found === undefined) throw new Error(`no row titled "${text}"`)
  return found
}

/**
 * 走一次真实的双击序列
 *
 * 浏览器在双击之前必先送出两次按下，第一次的 `detail` 是 1
 * 组件正是靠这一击决定要不要接住双击，因此不能只派发 `dblclick`
 */
async function doubleClick(title: HTMLElement): Promise<void> {
  await act(async () => {
    title.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, detail: 1 }))
    title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }))
  })
}

describe('renaming a session by double-clicking its title', () => {
  it('opens the rename dialog with the current title', async () => {
    const container = await mount()

    await doubleClick(titleOf(container, '修复登录超时'))

    const dialog = document.body.querySelector('[data-wg-test-modal]')
    expect(dialog).not.toBeNull()
    expect(document.body.querySelector('[data-wg-test-modal-title]')?.textContent).toBe('重命名会话')
    expect((document.body.querySelector('[data-wg-test-modal] input') as HTMLInputElement).value)
      .toBe('修复登录超时')
  })

  it('leaves the session closed while the dialog opens', async () => {
    const opened: string[] = []
    const container = await mount({ openSession: (id) => opened.push(id) })

    await doubleClick(titleOf(container, '修复登录超时'))

    // 改名不该顺带把会话打开：双击那一下已经 stopPropagation
    expect(opened).toEqual([])
  })

  it('ignores a double-click that no armed press preceded', async () => {
    const container = await mount()

    // macOS 上把后台窗口点到前面那一击不送达，紧接着的 dblclick 因此是 detail 2
    // 没有先前的 detail 1 按下就不进改名，否则「点一下窗口」就会弹出对话框
    await act(async () => {
      titleOf(container, '修复登录超时').dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
      )
    })

    expect(document.body.querySelector('[data-wg-test-modal]')).toBeNull()
  })

  it('arms again after the dialog is dismissed, so a second double-click still renames', async () => {
    const container = await mount()

    await doubleClick(titleOf(container, '修复登录超时'))
    expect(document.body.querySelector('[data-wg-test-modal]')).not.toBeNull()

    // 取消关掉对话框，再双击一次
    await act(async () => {
      const cancel = Array.from(
        document.body.querySelectorAll<HTMLButtonElement>('[data-wg-test-modal] button'),
      ).find((button) => button.textContent === '取消')
      cancel?.click()
    })
    expect(document.body.querySelector('[data-wg-test-modal]')).toBeNull()

    // 按下时置位、双击时清零，第二次双击前的按下会重新置位
    await doubleClick(titleOf(container, '修复登录超时'))
    expect(document.body.querySelector('[data-wg-test-modal]')).not.toBeNull()
  })

  it('has no rename dialog for a blank session', async () => {
    const container = await mount()

    // 新建中的空白会话只是占位，没有可改的名字
    await doubleClick(titleOf(container, '新会话'))

    expect(document.body.querySelector('[data-wg-test-modal]')).toBeNull()
  })

})
