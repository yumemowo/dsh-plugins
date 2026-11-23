// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { snapshot } from './snapshot-stub.ts'
import { registryStub } from './support/menuRegistryStub.ts'
import { shellSeats, summary } from './support/dndDom.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 工作区行也接官方右键菜单注册表
 *
 * 官方 `ui-workspace` 往 `workspace` 目标注册了两项（重命名 / 删除），第三方插件也可能注册进这个目标
 * 本包接替了那个区域，必须自己解析一次那类目标，否则第三方注册进来的条目永远不会出现
 *
 * 官方那两项的 `run` 写进官方组件内部的请求源，执行者是官方 `WorkspaceBrowser` 里的对话框
 * 本包接替区域后那份请求没人读，因此它们由本包实现，注册表交来的同 id 条目排掉
 */

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    Menu: ({
      items,
      onSelect,
      anchor,
    }: {
      items?: { id: string; label?: React.ReactNode; disabled?: boolean }[]
      onSelect?: (id: string) => void
      anchor?: React.ReactNode
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
        // 真原语把锚点按钮渲染在面板旁，这里照做：行尾那枚 `...` 因此留在文档里可点
        anchor,
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

function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({
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
        archivedSessionIds: [],
        pinnedSessionIds: [],
        phase: 'ready',
      })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a'], byId: { a: summary('a', 1_000) }, phase: 'ready' })) as never,
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

/** 工作区标题行（那一段的第一个 `.workspaceHead`） */
function workspaceHead(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>('.workspaceHead')
  if (found === null) throw new Error('no workspace head')
  return found
}

/** 展开工作区行自己的菜单 */
async function openHeadMenu(head: HTMLElement): Promise<void> {
  const button = head.querySelector<HTMLButtonElement>('.rowAction')
  if (button === null) throw new Error('workspace head has no action button')
  await act(async () => button.click())
}

/**
 * 一行上渲染出来的菜单项 id
 *
 * 行的右键面板与行内 `...` 菜单是两份面板，各自渲染同一批条目，因此按集合去重
 * @param head - 工作区行元素
 * @returns 去重后的菜单项 id
 */
function itemIds(head: HTMLElement): string[] {
  return [
    ...new Set(
      Array.from(head.querySelectorAll('[data-wg-test-item]')).map(
        (entry) => entry.getAttribute('data-wg-test-item') ?? '',
      ),
    ),
  ]
}

describe('workspace row over the official context-menu registry', () => {
  it('resolves the workspace target so third-party entries can appear', async () => {
    const targets: { kind: string }[] = []
    const container = await mount({
      menuRegistry: registryStub({
        targets: targets as never,
        byKind: { workspace: [{ id: 'thing', provider: 'plugin.workspace', label: '第三方动作' }] },
      }),
    })
    const head = workspaceHead(container)
    await openHeadMenu(head)

    // 第三方注册进 workspace 目标的条目出现了
    expect(itemIds(head)).toContain('plugin.workspace/thing')
    // 解析用的是 workspace 这一类目标，不是 session
    expect(targets.map((target) => target.kind)).toContain('workspace')
  })

  it('runs a third-party entry through the registry instead of the row', async () => {
    const executed: string[] = []
    const container = await mount({
      menuRegistry: registryStub({
        run: (id) => executed.push(id),
        byKind: { workspace: [{ id: 'thing', provider: 'plugin.workspace', label: '第三方动作' }] },
      }),
    })
    const head = workspaceHead(container)
    await openHeadMenu(head)

    await act(async () =>
      head.querySelector<HTMLButtonElement>('[data-wg-test-item="plugin.workspace/thing"]')?.click(),
    )

    // 官方那两项在本包走自己的实现，因此注册表只收到第三方的这一项
    expect(executed).toEqual(['plugin.workspace/thing'])
  })

  it('drops the registry copies of rename and delete, keeping its own', async () => {
    // 提供者 id 与动作 id 都照官方那两条给，投影后正是 workspace.rename/rename 与 workspace.delete/delete
    const container = await mount({
      menuRegistry: registryStub({
        byKind: {
          workspace: [
            { id: 'rename', provider: 'workspace.rename', label: '注册表的重命名' },
            { id: 'delete', provider: 'workspace.delete', label: '注册表的删除' },
          ],
        },
      }),
    })
    const head = workspaceHead(container)
    await openHeadMenu(head)

    const ids = itemIds(head)
    // 两项都还在（本包自己实现的那两条），且各自只出现一次
    expect(ids.filter((id) => id === 'rename')).toHaveLength(1)
    expect(ids.filter((id) => id === 'delete')).toHaveLength(1)
    // 文案取自本包，不是注册表交来的那份
    const rename = head.querySelector('[data-wg-test-item="rename"]')
    expect(rename?.textContent).toBe('重命名')
  })

  it('shows a real third-party workspace entry alongside the own ones', async () => {
    // 官方生态里 open-in-app 注册进 workspace 目标的正是「在文件夹显示」这一条
    const executed: string[] = []
    const container = await mount({
      menuRegistry: registryStub({
        run: (id) => executed.push(id),
        byKind: {
          workspace: [
            { id: 'rename', provider: 'workspace.rename', label: '重命名' },
            { id: 'reveal', provider: 'open-in-app.workspace', label: '在文件夹显示' },
            { id: 'delete', provider: 'workspace.delete', label: '删除工作区' },
          ],
        },
      }),
    })
    const head = workspaceHead(container)
    await openHeadMenu(head)

    const ids = itemIds(head)
    // 第三方那条在，官方那两条被排掉换成本包的
    expect(ids).toContain('open-in-app.workspace/reveal')
    expect(ids).not.toContain('workspace.rename/rename')
    expect(ids).not.toContain('workspace.delete/delete')
    // 本包的删除只出现一次，不是「官方那条 + 本包那条」
    expect(ids.filter((id) => id === 'delete')).toHaveLength(1)

    await act(async () =>
      head.querySelector<HTMLButtonElement>('[data-wg-test-item="open-in-app.workspace/reveal"]')?.click(),
    )
    expect(executed).toEqual(['open-in-app.workspace/reveal'])
  })

  it('passes the workspace path to the registry', async () => {
    // 官方的 open-in-app 按 path stat 目录再打开文件管理器，缺了它会静默退化成禁用项
    const targets: { kind: string; value: Record<string, unknown> }[] = []
    const container = await mount({
      menuRegistry: registryStub({
        targets: targets as never,
        byKind: { workspace: [] },
      }),
    })
    await openHeadMenu(workspaceHead(container))

    const workspaceTarget = targets.find((target) => target.kind === 'workspace')
    expect(workspaceTarget?.value['path']).toBe('/tmp/w1')
    expect(workspaceTarget?.value['workspaceId']).toBe('w1')
  })

  it('keeps the own entries when no registry is installed', async () => {
    const container = await mount({ menuRegistry: undefined })
    const head = workspaceHead(container)
    await openHeadMenu(head)

    // 没有注册表时本包那几条照常可用
    expect(itemIds(head)).toContain('rename')
    expect(itemIds(head)).toContain('delete')
  })
})