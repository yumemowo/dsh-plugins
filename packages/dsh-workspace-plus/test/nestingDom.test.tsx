// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { workspaceAddress, virtualAddress } from '../src/rootEntry.ts'
import type { RootEntryAddress } from '../src/rootEntry.ts'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { readAllCss } from './readCss.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { viewModeProps, viewModeStoreStub, storeViewModeProps } from './viewMode-stub.ts'

// 对话框与按钮在基线替身里渲染成 null，而「关闭前先确认」这条路径必须看得到名单
// 这里按 pickerDom 的同一套做法把它们渲染成可断言的真实结构
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async (importOriginal) => {
  const base = (await importOriginal()) as Record<string, unknown>
  const h = React.createElement
  return {
    ...base,
    Modal: ({ open, title, description, children, footer }: Record<string, unknown>) =>
      open === false
        ? null
        : h(
            'div',
            { 'data-wg-test-modal': '', role: 'dialog' },
            h('div', { 'data-wg-test-modal-title': '' }, title as React.ReactNode),
            description === undefined
              ? null
              : h('div', { 'data-wg-test-modal-desc': '' }, description as React.ReactNode),
            children as React.ReactNode,
            h('div', { 'data-wg-test-modal-footer': '' }, footer as React.ReactNode),
          ),
    Button: ({ children, onClick, ...rest }: Record<string, unknown>) =>
      h('button', { type: 'button', onClick, ...rest }, children as React.ReactNode),
    // 行菜单要用真实点击驱动：官方 Menu 在基线替身里是 null，那样点不到任何条目
    // 这里把它渲染成两层按钮——一级项与它的 submenu 都排在同一个列表里
    // 真实原语里 submenu 靠悬停展开，本测试只需要「能点到」
    Menu: ({
      items,
      onSelect,
    }: {
      items?: {
        id: string
        label?: React.ReactNode
        disabled?: boolean
        submenu?: { id: string; label?: React.ReactNode }[]
      }[]
      onSelect?: (id: string) => void
    }) =>
      h(
        'div',
        { 'data-wg-test-menu': '' },
        (items ?? []).flatMap((item) => [
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              'data-wg-test-item': item.id,
              // 真原语把 `disabled` 原样交给按钮，禁用的项点不动
              disabled: item.disabled === true,
              onClick: () => onSelect?.(item.id),
            },
            item.label as React.ReactNode,
          ),
          ...(item.submenu ?? []).map((sub) =>
            h(
              'button',
              {
                key: sub.id,
                type: 'button',
                'data-wg-test-item': sub.id,
                onClick: () => onSelect?.(sub.id),
              },
              sub.label as React.ReactNode,
            ),
          ),
        ]),
      ),
  }
})

/**
 * 子工作区嵌套的真实 DOM
 *
 * 层级由 cwd 路径现推，落盘的归属只决定渲染在哪一段：这些取舍在元素树里看不出来
 * 递归嵌出来的结构、缩进用的自定义属性、放进分组的那个落在谁的撑开体里，都不行
 * 这里用真 `react-dom` 渲染一遍并断言结构
 */

/** 造一份注入面完整的数据，`workspaces` 决定路径关系，`groups` / `nesting` 决定归属 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const created = new Date(2026, 0, 1, 0, 0).toISOString()
  const byId: Record<string, unknown> = {
    // `a` 设成运行中：状态指示器只在有状态时渲染，这次要断言它的字形与落点
    a: { id: 'a', displayTitle: '修复登录超时', running: true, blank: false, retainedBy: {}, updatedAt: 1_000 },
  }
  const view = (workspaceId: string, path: string, title: string) => ({
    workspaceId,
    path,
    title,
    sessionIds: workspaceId === 'w1' ? ['a'] : [],
    createdAt: created,
    updatedAt: created,
  })
  const workspaces = [
    view('w1', '/repo', 'W1'),
    view('w2', '/repo/a', 'W2'),
    view('w3', '/repo/a/b', 'W3'),
    view('w4', '/other', 'W4'),
  ]
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [], phase: 'ready' })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a'], byId, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/repo' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () => snapshot(),
    onReady: () => () => {},
    createGroup: async () => snapshot(),
    renameGroup: async () => snapshot(),
    deleteGroup: async () => snapshot(),
    moveSession: async () => snapshot(),
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
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    searchResultLimit: 20,
    t: regionTranslate(),
    tWorkspace: workspaceTranslate(),
    tSidebar: sidebarTranslate(),
    ...viewModeProps(),
    official: () => ({
      renameSession: async () => {},
      forkSession: () => {},
      archiveSession: async () => {},
      labels: officialSessionLabels(workspaceTranslate()),
      relativeTime: (updatedAt: number, now: number) =>
        timeLabel(updatedAt, now, workspaceTranslate()),
    }),
    addWorkspace: () => ({
      createWorkspace: async (path: string) => ({ workspaceId: `w-${path}`, title: path }),
      startSession: () => {},
      occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
      labels: officialAddLabels(workspaceTranslate()),
    }),
    ...overrides,
  }
}

/** 挂载区域并等分组元数据落地 */
async function mount(
  overrides: Partial<WorkspaceGroupsProps> = {},
): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, props(overrides)))
  })
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root }
}

/**
 * 面板与确认框都 portal 到 `document.body`，用例中途失败时它们会被留在文档里
 * 污染后续用例的全局查询。每个用例收尾后统一清一次
 */
afterEach(() => {
  for (const node of Array.from(document.body.querySelectorAll('.viewMenu, [role="dialog"]'))) {
    node.remove()
  }
})

/** 取每个工作区块的标题与它下发的深度 */
function sections(container: HTMLElement): { title: string; depth: string }[] {
  return Array.from(container.querySelectorAll('.workspace')).map((section) => {
    const element = section as HTMLElement
    return {
      title: section.querySelector('.workspaceTitle')?.textContent ?? '',
      depth: element.style.getPropertyValue('--wg-depth'),
    }
  })
}

/**
 * 点开某个工作区行尾的 `...`，交回该行的标题行
 *
 * 替身把菜单就地渲染而不是 portal 出去，因此每一行的那份条目都留在文档里
 * 断言某个工作区的菜单时要按交回的这段范围查，否则会读到它体内子工作区那几行
 */
async function openRowMenu(container: HTMLElement, title: string): Promise<Element> {
  const section = Array.from(container.querySelectorAll('.workspace')).find(
    (candidate) => candidate.querySelector('.workspaceTitle')?.textContent === title,
  )
  if (section === undefined) throw new Error(`no workspace section titled ${title}`)
  await act(async () => {
    ;(section.querySelector('.rowActionSlot button') as HTMLButtonElement | undefined)?.click()
  })
  // 悬停卡片替身会给标题行再套一层锚点盒，因此按后代取而不是 `:scope >`
  const head = section.querySelector('.workspaceHead')
  if (head === null) throw new Error(`no workspace head in section titled ${title}`)
  return head
}

/**
 * 某一行菜单里的条目 id，按文档序并去重
 *
 * 一份行菜单在文档里出现两次（行内 `...` 那份与右键那份），两者条目相同，断言只关心集合
 */
function rowMenuItems(head: Element): string[] {
  return [
    ...new Set(
      Array.from(head.querySelectorAll('[data-wg-test-item]')).map(
        (entry) => entry.getAttribute('data-wg-test-item') ?? '',
      ),
    ),
  ]
}

describe('nested sub-workspaces in a real DOM', () => {
  it('nests a child workspace inside its parent by cwd path', async () => {
    const { container, root } = await mount()

    // /repo/a 与 /repo/a/b 都是 /repo 的后代，因此只有 /repo 留在根节点
    expect(sections(container)).toEqual([
      { title: 'W1', depth: '0' },
      // 子工作区是父撑开体里的一个完整工作区块，深度沿层级递增
      { title: 'W2', depth: '1' },
      { title: 'W3', depth: '2' },
      { title: 'W4', depth: '0' },
    ])
    // 层级真的嵌在文档里：W2 在 W1 的撑开体内
    const w1 = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.querySelector('.workspaceTitle')?.textContent === 'W1',
    )
    const w2 = w1?.querySelector('.workspaceBody .nest > .workspace')
    expect(w2?.querySelector('.workspaceTitle')?.textContent).toBe('W2')

    await act(async () => root.unmount())
  })

  it('nests two workspaces that were put into the same virtual workspace', async () => {
    // 真实场景：/src/dsh_plugins 与它下面的 /src/dsh_plugins/packages/dsh-workspace-plus
    // 都由用户收进了同一个虚拟分组。收进去之后层级仍要读得出来，不能散成平铺的一排
    const created = new Date(2026, 0, 1).toISOString()
    const view = (workspaceId: string, path: string, title: string) => ({
      workspaceId,
      path,
      title,
      sessionIds: [],
      createdAt: created,
      updatedAt: created,
    })
    const workspaces = [
      view('repo', '/src/dsh_plugins', 'dsh_plugins'),
      view('pkg', '/src/dsh_plugins/packages/dsh-workspace-plus', 'dsh-workspace-plus'),
      view('other', '/src/other-plugins/example-plugin', 'example-plugin'),
    ]
    const { container, root } = await mount({
      useWorkspaces: ((select: (s: unknown) => unknown) =>
        select({ items: workspaces, archivedSessionIds: [], phase: 'ready' })) as never,
      useSessions: ((select: (s: unknown) => unknown) =>
        select({ ids: [], byId: {}, phase: 'ready' })) as never,
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [
            { id: 'vg', name: 'dsh plugins', workspaceIds: ['other', 'repo', 'pkg'] },
          ],
        }),
    })

    // 三者都在同一个虚拟分组里，按分组记录的顺序渲染，repo 是这一段的顶层，pkg 嵌在它体内
    // 下发的层级就是最终层级（含虚拟分组那一格），不再由 CSS 另行累加
    expect(sections(container)).toEqual([
      { title: 'example-plugin', depth: '1' },
      { title: 'dsh_plugins', depth: '1' },
      { title: 'dsh-workspace-plus', depth: '2' },
    ])
    const repo = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.querySelector('.workspaceTitle')?.textContent === 'dsh_plugins',
    )
    // 层级真的嵌在文档里，而不只是深度数值不同
    expect(
      repo?.querySelector('.workspaceBody .nest > .workspace .workspaceTitle')
        ?.textContent,
    ).toBe('dsh-workspace-plus')

    await act(async () => root.unmount())
  })

  it('indents the empty label of a child workspace as deep as the child itself', async () => {
    // 空态占位是「这一层没有一个会话」的说明，它必须与同一层的行对齐
    // 否则子工作区里那句「暂无会话」会停在根节点那一列，看起来像属于父工作区
    const { container, root } = await mount()

    // W3 是最深的一层（/repo/a/b），它既没有会话也没有子工作区，因此由它显示空态
    const empty = container.querySelector('.workspaceBody > .empty')
    expect(empty?.textContent).toBe('暂无会话')
    // 空态属于它自己那一层，而不是跑回根节点那一列
    const owner = empty?.closest('.workspace')
    expect(owner?.querySelector('.workspaceTitle')?.textContent).toBe('W3')
    expect(owner?.getAttribute('style')).toContain('--wg-depth: 2')
    // 样式表里必须有一条按结构写的规则给它换算左边距，缺了它那 16px 内边距会盖住
    // 刚才那条对齐，空态停在根节点那一列而不会有任何报错
    const css = readAllCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) =>
      (match[1] ?? '').includes('.workspaceBody > .empty'),
    )
    expect(rule, 'no .workspaceBody > .empty rule in the stylesheet').toBeDefined()
    expect(rule?.[2] ?? '').toContain('var(--wg-depth')

    await act(async () => root.unmount())
  })

  it('puts a child workspace into an ancestor group through the real menu', async () => {
    // 「移动到分组…」这条路径要真的写下去、并且把宿主回的整份快照写进本地状态
    // 少了后者归属其实已落盘，界面却停在旧快照上——读起来正是「移入没有生效」
    const writes: string[][] = []
    const created = new Date(2026, 0, 1).toISOString()
    const view = (workspaceId: string, path: string, title: string) => ({
      workspaceId,
      path,
      title,
      sessionIds: [],
      createdAt: created,
      updatedAt: created,
    })
    const workspaces = [
      view('repo', '/src/dsh_plugins', 'dsh_plugins'),
      view('pkg', '/src/dsh_plugins/packages/dsh-workspace-plus', 'dsh-workspace-plus'),
    ]
    const { container, root } = await mount({
      useWorkspaces: ((select: (s: unknown) => unknown) =>
        select({ items: workspaces, archivedSessionIds: [], phase: 'ready' })) as never,
      useSessions: ((select: (s: unknown) => unknown) =>
        select({ ids: [], byId: {}, phase: 'ready' })) as never,
      loadGroups: async () =>
        snapshot({
          // 父工作区体内有一个会话分组，新工作区落成的是它自己的归属
          byWorkspace: { repo: [{ id: 'gm', name: 'better-workspace', sessionIds: [] }] },
        }),
      nestWorkspaces: async (ids, parent, group) => {
        writes.push([...ids, parent, group])
        return snapshot({
          byWorkspace: { repo: [{ id: 'gm', name: 'better-workspace', sessionIds: [] }] },
          nesting: Object.fromEntries(
            ids.map((id) => [id, { workspaceId: parent, groupId: group }]),
          ),
        })
      },
    })

    // 打开子工作区那一行的 `...` 菜单
    await openRowMenu(container, 'dsh-workspace-plus')

    // 点一级项「移动到分组…」，再点它子菜单里那个分组
    const entry = document.body.querySelector<HTMLButtonElement>('[data-wg-test-item="move-to-parent-group"]')
    expect(entry).not.toBeNull()
    await act(async () => entry?.click())
    const target = document.body.querySelector<HTMLButtonElement>('[data-wg-test-item="pg:repo:gm"]')
    expect(target, 'the submenu must offer the ancestor group').not.toBeNull()
    await act(async () => target?.click())
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // 归属真的写下，它自己没有分组，父工作区的分组是 gm
    expect(writes).toEqual([['pkg', 'repo', 'gm']])
    // 宿主回的快照被写进本地状态，子工作区因此渲染在父体内那个分组里
    const group = Array.from(container.querySelectorAll('.group')).find(
      (section) => section.querySelector('.groupLabel')?.textContent === 'better-workspace',
    )
    expect(
      group?.querySelector('.nest .workspaceTitle')?.textContent,
    ).toBe('dsh-workspace-plus')

    await act(async () => root.unmount())
  })

  it('hides the ancestor group the child workspace already sits in', async () => {
    // 子工作区已在 w1 的 g1 里，候选里不该再出现 g1——点它是一次无意义的操作
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: {
            w1: [
              { id: 'g1', name: '前端', sessionIds: [] },
              { id: 'g2', name: '后端', sessionIds: [] },
            ],
          },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const row = await openRowMenu(container, 'W2')

    expect(rowMenuItems(row).filter((id) => id.startsWith('pg:'))).toEqual(['pg:w1:g2'])
    await act(async () => root.unmount())
  })

  it('leaves the parent-group entry disabled while the workspace sits in its only group', async () => {
    // 没有别的目标可移入，但「移出分组」还在，因此这一项以禁用态占位而不是整项消失
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const row = await openRowMenu(container, 'W2')

    const entry = row.querySelector<HTMLButtonElement>('[data-wg-test-item="move-to-parent-group"]')
    expect(entry, 'the entry must stay visible as a disabled placeholder').not.toBeNull()
    expect(entry?.disabled).toBe(true)
    expect(row.querySelector('[data-wg-test-item="ungroup-child-workspace"]')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('renders no parent-group entry while the workspace has neither a group nor a target', async () => {
    // W3 在 /repo/a/b 下，它没有分组；它的祖先 W1、W2 名下也没有任何分组，因此整项不渲染
    const { container, root } = await mount()

    const row = await openRowMenu(container, 'W3')

    expect(row.querySelector('[data-wg-test-item="move-to-parent-group"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it('keeps a parent session row and its child workspace in the same body', async () => {
    const { container, root } = await mount()

    // 父体内分三段：子工作区 → 会话分组 → 平铺会话
    // 这里没有会话分组，因此是「子工作区在前、会话行在后」
    const body = container.querySelector('.workspaceBody')
    const order = Array.from(body?.children ?? []).map((child) => child.className)
    expect(order[0]).toBe('nest')
    expect(order[1]).toBe('sessions')
    expect(body?.querySelector('.nest .workspaceTitle')?.textContent).toBe('W2')
    expect(body?.querySelector('.sessions .rowTitle')?.textContent).toBe('修复登录超时')

    await act(async () => root.unmount())
  })

  it('leaves the session run unlabelled even when folders share the same body', async () => {
    // 会话行不再靠小标题与容器段区分：指示器不占行内流，它的标题因此落在容器的图标列上
    // 与子工作区行、会话分组头的名字列都不重合，那行小标题整个去掉了
    const { container, root } = await mount()

    const body = container.querySelector('.workspaceBody')
    expect(body?.querySelector('.nest')).not.toBeNull()
    expect(body?.querySelector('.sessionsTitle')).toBeNull()
    // 会话那一段仍然渲染，只是没有标题
    const run = body?.querySelector('.sessions')
    expect(run?.querySelector('.rowTitle')?.textContent).toBe('修复登录超时')

    await act(async () => root.unmount())
  })

  it('leaves the session run unlabelled even when only a session group shares its body', async () => {
    // 会话分组与未归组会话行现在缩进同一档，但指示器把两者的标题错开了，因此标题仍不需要
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nested: false,
        }),
    })

    const body = container.querySelector('.workspaceBody')
    expect(body?.querySelector('.group')).not.toBeNull()
    expect(body?.querySelector('.sessionsTitle')).toBeNull()

    await act(async () => root.unmount())
  })

  it('renders no session run title inside a group that also holds a child workspace', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const groupBody = container.querySelector('.groupBody')
    expect(groupBody?.querySelector('.nest')).not.toBeNull()
    expect(groupBody?.querySelector('.sessionsTitle')).toBeNull()

    await act(async () => root.unmount())
  })

  it('renders a child inside the group it was placed into', async () => {
    // W2 被放进 W1 的 g1 分组，W3 没放进去，但它跟着 W2 落在同一个分组里
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const groupBody = container.querySelector('.groupBody')
    expect(groupBody?.querySelector('.workspaceTitle')?.textContent).toBe('W2')
    // 未归组的会话仍在组外那一段
    expect(container.querySelector('.workspaceBody > .sessions')).not.toBeNull()
    // 根节点上不再出现 W2
    expect(
      Array.from(container.querySelectorAll('.workspaceHead')).length,
    ).toBe(4)

    await act(async () => root.unmount())
  })

  it('nests a workspace placed in a group under that group body, one level past its head', async () => {
    // 放进分组的子工作区与同组的会话行同处 .groupBody，因此两者缩进同档
    // 少了这一层包裹，它会与分组头停在同一个缩进上，读起来像分组的兄弟而不是组内的内容
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const w2 = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.querySelector('.workspaceTitle')?.textContent === 'W2',
    )
    // 结构上确实落在那个分组的体内（.groupBody），因此会跟着它累加一格偏移
    expect(w2?.closest('.groupBody')).not.toBeNull()
    // 而按 cwd 嵌套、没被放进分组的那一个落在工作区体内的 .nest 里
    expect(w2?.closest('.nest')).not.toBeNull()

    const w1Section = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.querySelector('.workspaceTitle')?.textContent === 'W1',
    )
    const depthOf = (workspace: Element | undefined): number =>
      Number((workspace as HTMLElement).style.getPropertyValue('--wg-depth'))
    const placed = depthOf(w2)
    const host = depthOf(w1Section)
    // 各行的基准不同（工作区行 8px、分组头 24px），因此不能直接比 depth 数值
    // 要比的是最终内边距：放进分组的子工作区是 levelOf 多算的一格（+2 而非 +1），它必须落在分组头之下
    const placedIndent = 8 + 16 * placed
    const groupHeadIndent = 24 + 16 * host
    expect(placedIndent).toBeGreaterThan(groupHeadIndent)

    // CSS 里没有「容器偏移」那层变量：偏移靠自引用累加是循环引用，浏览器会整条丢掉
    // 层级因此全部由 JS 算好下发，样式表只把它当数值用
    const css = readAllCss().replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toContain('--wg-depth-offset')
    expect(css).toMatch(/--wg-row-start:\s*calc\(8px \+ 16px \* var\(--wg-depth, 0\)\)/)

    await act(async () => root.unmount())
  })

  it('flattens every workspace back to the root when nesting is off', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
          nested: false,
        }),
    })

    // 关掉后四个工作区都是根节点上的顶层，缩进全部归零
    expect(sections(container)).toEqual([
      { title: 'W1', depth: '0' },
      { title: 'W2', depth: '0' },
      { title: 'W3', depth: '0' },
      { title: 'W4', depth: '0' },
    ])
    // 关掉时明确说一句，而不是让界面与「本来就没有这个特性」无从区分
    expect(container.querySelector('.noteNested')?.textContent).toContain('嵌套已关闭')

    await act(async () => root.unmount())
  })

  it('survives a host half that has not been restarted yet', async () => {
    // 新客户端可能收到旧宿主回的、没有 nesting / nested 这两格的快照
    const { container, root } = await mount({
      loadGroups: async () => ({ byWorkspace: {} }) as never,
    })

    expect(container.querySelector('.root')).not.toBeNull()
    expect(sections(container).length).toBeGreaterThan(0)

    await act(async () => root.unmount())
  })

  it('offers the nesting switch in the view options panel', async () => {
    const { container, root } = await mount()

    // 视图选项按钮不再是 disabled 占位
    const trigger = container.querySelector<HTMLButtonElement>(
      '.headerAction[aria-label="视图选项"]',
    )
    expect(trigger?.disabled).toBe(false)
    await act(async () => trigger?.click())

    const options = document.body.querySelectorAll('.viewOption')
    expect(options).toHaveLength(1)
    // 文案是设置名，不随开关状态变化，状态由控件自己的 aria-checked 表达
    expect(options[0]?.textContent).toContain('子工作区嵌套')
    const toggle = options[0]?.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(toggle?.getAttribute('aria-checked')).toBe('true')

    await act(async () => root.unmount())
  })

  it('offers every view preference as a titled pair of mutually exclusive options', async () => {
    const { container, root } = await mount()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.headerAction[aria-label="视图选项"]')
        ?.click()
    })

    // 四组「标题 + 两条互斥可选项」，标题说明各自选的是哪件事；开关那一组不带这个标题行
    expect(
      Array.from(document.body.querySelectorAll('.viewGroupLabel')).map((el) => el.textContent),
    ).toEqual(['展示方式', '指示器', '置顶溢出', '置顶显示'])
    const rows = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.viewOptionRow'),
    )
    // 图标的替身把字形名渲染成文本，因此文案取自行内那一格，不看整行的 textContent
    expect(rows.map((element) => element.querySelector('.viewOptionLabel')?.textContent)).toEqual([
      '按工作区',
      '平铺',
      '图标',
      '色条',
      '悬停展开',
      '区内滚动',
      '仅置顶区',
      '置顶区 + 分组内',
    ])
    // 当前值由 aria-pressed 与行尾那个勾表达，两者不会各说一套
    expect(rows.map((row) => row.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'true',
      'false',
      'true',
      'false',
      'true',
      'false',
    ])
    // 勾与字形都取官方图标，替身把字形名渲染成文本；替身不吃 className，因此按文本来认
    for (const [index, row] of rows.entries()) {
      expect(row.textContent?.includes('IconCheckOutlineRegular')).toBe(index % 2 === 0)
    }
    // 展示方式那两条各取自己的字形：文件夹 / 单列表，与官方那组「分组方式」同字形
    expect(rows[0]?.textContent).toContain('IconFolderCloseRegular')
    expect(rows[1]?.textContent).toContain('IconFlatListOutlineRegular')
    // 指示器那两条取本包自绘的点与条：自绘字形渲染成真 SVG（不像官方替身那样把名字变成文本）
    // 因此按图元认——一枚圆 vs 一根圆角矩形
    expect(rows[2]?.querySelector('.viewOptionIcon circle')).not.toBeNull()
    expect(rows[3]?.querySelector('.viewOptionIcon rect')).not.toBeNull()
    // 置顶那两组取官方图钉两态
    expect(rows[4]?.textContent).toContain('IconPinFillRegular')
    expect(rows[5]?.textContent).toContain('IconPinOutlineRegular')
    expect(rows[6]?.textContent).toContain('IconPinOutlineRegular')
    expect(rows[7]?.textContent).toContain('IconPinFillRegular')
    // 四组设置与末尾那个开关之间各有一条分隔线
    expect(document.body.querySelectorAll('.viewSeparator').length).toBe(4)

    await act(async () => root.unmount())
  })

  it('switches the indicator style on the list root', async () => {
    const store = viewModeStoreStub()
    const { container, root } = await mount(storeViewModeProps(store))

    // 样式挂在区域根节点上，列表里每一行读同一个值，不必逐行下发
    expect(container.querySelector('.root')?.getAttribute('data-wg-indicator')).toBe('icon')

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.headerAction[aria-label="视图选项"]')
        ?.click()
    })
    await act(async () => {
      // 第二组的第二项（色条）
      document.body.querySelectorAll<HTMLButtonElement>('.viewOptionRow')[3]?.click()
    })

    expect(container.querySelector('.root')?.getAttribute('data-wg-indicator')).toBe('bar')

    await act(async () => root.unmount())
  })

  it('writes the picked display mode and re-renders the list as one flat column', async () => {
    const store = viewModeStoreStub()
    const { container, root } = await mount(storeViewModeProps(store))
    const sectionsIn = (): number => container.querySelectorAll('.workspace').length
    expect(sectionsIn()).toBeGreaterThan(0)
    expect(container.querySelector('.flatList')).toBeNull()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.headerAction[aria-label="视图选项"]')
        ?.click()
    })
    const flat = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.viewOptionRow'),
    ).find((element) => element.querySelector('.viewOptionLabel')?.textContent === '平铺')
    await act(async () => flat?.click())

    // 选中的方式真的写进了存储，界面也换成了那条平铺列表：工作区分组结构整个消失
    expect(store.getSnapshot().mode).toBe('flat')
    expect(container.querySelector('.flatList')).not.toBeNull()
    expect(sectionsIn()).toBe(0)
    // 会话仍在，只是不再按工作区分组
    expect(container.querySelector('.flatList .rowTitle')?.textContent).toBe(
      '修复登录超时',
    )
    // 平铺行也读同一档缩进，指示器同样出流：那条按结构写的落点规则在平铺态也要命中
    expect(container.querySelector('.flatList .row')?.getAttribute('data-wg-state')).toBe('ongoing')
    expect(container.querySelector('.flatList .indicator')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('switches the indicator glyph without moving the title', async () => {
    // 两种样式只换字形，几何完全一致：都锚在行的 --wg-row-start 上
    // 用可订阅的存储替身：切换要真的触发重渲染，一次性读数那份替身做不到
    const store = viewModeStoreStub()
    const { container, root } = await mount(storeViewModeProps(store))

    const rowWithStatus = (): Element | null =>
      container.querySelector(".sessions .row[data-wg-state='ongoing']")
    expect(rowWithStatus()?.querySelector('.indicator')).not.toBeNull()
    expect(rowWithStatus()?.querySelector('.indicatorBar')).toBeNull()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.headerAction[aria-label="视图选项"]')
        ?.click()
    })
    await act(async () => {
      document.body.querySelectorAll<HTMLButtonElement>('.viewOptionRow')[3]?.click()
    })

    // 换成色条：根部属性与字形都跟着换，仍是同一枚指示器
    expect(container.querySelector('.root')?.getAttribute('data-wg-indicator')).toBe('bar')
    const row = rowWithStatus()
    expect(row?.querySelector('.indicator')).not.toBeNull()
    expect(row?.querySelector('.indicatorBar')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('keeps the picker as the only filter in the flat list', async () => {
    // 平铺下聚焦语义照旧：它把这批内容收窄到某个工作区，而不是让第二行写着聚焦对象、列表却无动于衷
    const { container, root } = await mount({
      ...viewModeProps('flat'),
      loadGroups: async () => snapshot({ picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] } }),
    })

    // 聚焦在 w2 上，而 w2 名下没有会话，因此平铺列表是空的，w1 那条会话不再出现
    expect(container.querySelector('.flatList')).not.toBeNull()
    expect(container.querySelector('.rowTitle')).toBeNull()
    expect(container.querySelector('.empty')?.textContent).toBe('暂无会话')

    await act(async () => root.unmount())
  })

  it('asks for confirmation and lists the workspaces before turning nesting off', async () => {
    const calls: boolean[] = []
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
      setNested: async (enabled: boolean) => {
        calls.push(enabled)
        return snapshot({ nested: enabled })
      },
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      '.headerAction[aria-label="视图选项"]',
    )
    await act(async () => trigger?.click())
    // 点的是开关本身，条目行不可点，否则一条里会有两个控件
    await act(async () => {
      ;(document.body.querySelector('[role="switch"]') as HTMLElement | null)?.click()
    })

    // 没有直接写盘，先弹出确认框，并列出会被解除嵌套的那个工作区
    expect(calls).toEqual([])
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('W2')

    await act(async () => root.unmount())
  })

  it('turns nesting off right away when no child workspace was put into a group', async () => {
    // 默认数据里 W2、W3 只是按 cwd 路径推导出来的层级，没有任何归属落盘
    // 关掉它不解除任何人的嵌套，因此不必问一句
    const calls: boolean[] = []
    const { container, root } = await mount({
      setNested: async (enabled: boolean) => {
        calls.push(enabled)
        return snapshot({ nested: enabled })
      },
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      '.headerAction[aria-label="视图选项"]',
    )
    await act(async () => trigger?.click())
    await act(async () => {
      ;(document.body.querySelector('[role="switch"]') as HTMLElement | null)?.click()
    })

    expect(calls).toEqual([false])
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it('asks nothing about groups, whichever parent the new workspace lands under', async () => {
    // 采纳成功后的回调由「添加工作区」那个组件回传，这里直接驱动它
    // 采纳路径只处理「新工作区可不可见」，不再替用户改归属：放进分组要用户自己移
    const placed: { ids: readonly string[]; parent: string; group: string }[] = []
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }], w2: [], w3: [], w4: [] },
        }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
      nestWorkspaces: async (ids, parent, group) => {
        placed.push({ ids, parent, group })
        return snapshot()
      },
    })

    expect(adopted).toBeTypeOf('function')
    // /repo/a 之下的新工作区，它的父工作区 w2 没有任何分组
    await act(async () => adopted?.('w-new', '/repo/a/c', '新工作区'))
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    // /repo 之下的新工作区，w1 恰好只有一个分组——此前会在这里问一句，现在也不问
    await act(async () => adopted?.('w-new', '/repo/x', '新工作区'))
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(placed).toEqual([])

    await act(async () => root.unmount())
  })

  it('adds a newly adopted workspace to the virtual workspace that the view is focused on', async () => {
    // 聚焦虚拟工作区分组时列表只列那一片，新工作区落在外面就看不见
    // 直接把它放进该分组是唯一能替用户做的写入，因此不问，也不新建会话之外的额外步骤
    const moved: { workspaceId: string; groupId: string }[] = []
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [{ id: 'vg1', name: 'dsh plugins', workspaceIds: ['w1'] }],
          picker: { focused: virtualAddress('vg1'), recent: [], pinned: [] },
        }),
      moveWorkspace: async (workspaceId, groupId) => {
        moved.push({ workspaceId, groupId })
        return snapshot()
      },
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    // /other 与 vg1 里的 /repo 毫无路径关系，因此不是「本来就看得见」那一类
    await act(async () => adopted?.('w-new', '/other', '新工作区'))
    await act(async () => {
      await Promise.resolve()
    })

    expect(moved).toEqual([{ workspaceId: 'w-new', groupId: 'vg1' }])
    // 放进分组是替用户做的，不该再弹一个框问他
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it('asks whether to focus the new workspace when it is out of the focused range', async () => {
    // 聚焦真实工作区 w2（/repo/a）时那一片只有它自己与渲染在它体内的子工作区
    // /repo/x 不在 /repo/a 之下，紧接着打开的新会话因此看不见，问一句要不要改换聚焦对象
    const focused: RootEntryAddress[] = []
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({ picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] } }),
      focusEntry: async (address) => {
        focused.push(address)
        return snapshot({ picker: { focused: address, recent: [], pinned: [] } })
      },
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/repo/x', '新工作区'))
    const dialog = document.body.querySelector('[role="dialog"]')
    // 两个名字都要点到：用户据此判断改换聚焦对象之后看到的是哪一个
    expect(dialog?.textContent).toContain('新工作区')
    expect(dialog?.textContent).toContain('W2')
    const confirm = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === '聚焦',
    )
    await act(async () => confirm?.click())
    await act(async () => {
      await Promise.resolve()
    })

    expect(focused).toEqual([{ kind: 'workspace', id: 'w-new' }])

    await act(async () => root.unmount())
  })

  it('keeps the focus where it is when the operator declines the new workspace', async () => {
    const focused: RootEntryAddress[] = []
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({ picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] } }),
      focusEntry: async (address) => {
        focused.push(address)
        return snapshot({ picker: { focused: address, recent: [], pinned: [] } })
      },
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/other', '新工作区'))
    const dialog = document.body.querySelector('[role="dialog"]')
    const cancel = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === '取消',
    )
    await act(async () => cancel?.click())

    expect(focused).toEqual([])
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it('asks nothing when the new workspace already renders inside the focused workspace', async () => {
    // 聚焦在 w2（/repo/a）上，而新工作区 /repo/a/c 正是它的后代：默认的嵌套渲染就把它放在那一片里
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({ picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] } }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/repo/a/c', '新工作区'))

    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => root.unmount())
  })

  it('asks about focus even when the new workspace is a cwd descendant, if nesting is off', async () => {
    // 关掉嵌套时任何工作区都不渲染在另一个工作区体内，聚焦在 w2（/repo/a）上的那一片就只剩它自己
    // /repo/a/c 虽在它的路径之下，也不会出现在那一片里，因此同样要问
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({
          nested: false,
          picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] },
        }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/repo/a/c', '新工作区'))

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('新工作区')
    expect(dialog?.textContent).toContain('W2')

    await act(async () => root.unmount())
  })

  it('writes no folding record when confirming focus with nesting off', async () => {
    // 关掉嵌套时每个工作区都是自己那个容器的顶层，展开是白送的
    // 确认聚焦这一步与采纳路径一样按嵌套是否生效判断，不能因为「聚焦后只看它自己」就补一条记录
    const store = viewModeStoreStub()
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      ...storeViewModeProps(store),
      loadGroups: async () =>
        snapshot({
          nested: false,
          picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] },
        }),
      focusEntry: async (address) =>
        snapshot({ picker: { focused: address, recent: [], pinned: [] } }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/repo/a/c', '新工作区'))
    const confirm = Array.from(
      document.body.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent === '聚焦')
    await act(async () => confirm?.click())
    await act(async () => {
      await Promise.resolve()
    })

    expect(store.getSnapshot().expansion?.workspace ?? {}).toEqual({})

    await act(async () => root.unmount())
  })

  it('writes no folding record when confirming focus without any parent in reach', async () => {
    // /other 之下没有任何现存工作区，新工作区落成自己那个容器的顶层，本来就默认展开
    const store = viewModeStoreStub()
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      ...storeViewModeProps(store),
      loadGroups: async () =>
        snapshot({ picker: { focused: workspaceAddress('w2'), recent: [], pinned: [] } }),
      focusEntry: async (address) =>
        snapshot({ picker: { focused: address, recent: [], pinned: [] } }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/other', '新工作区'))
    const confirm = Array.from(
      document.body.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [],
    ).find((button) => button.textContent === '聚焦')
    await act(async () => confirm?.click())
    await act(async () => {
      await Promise.resolve()
    })

    expect(store.getSnapshot().expansion?.workspace ?? {}).toEqual({})

    await act(async () => root.unmount())
  })

  it('expands a newly added workspace together with its parent chain', async () => {
    // 采纳之后紧接着会在新工作区里开一个新会话，展开是那一步的副作用
    // 新工作区自己有父、默认折叠，不写记录的话新会话会落在看不见的撑开体里
    const store = viewModeStoreStub()
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      ...storeViewModeProps(store),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    // /repo/a/b 之下的新工作区：父是 w3，它自己的父链是 w3 → w2 → w1
    await act(async () => adopted?.('w-new', '/repo/a/b/c', '新工作区'))

    // 新工作区自己与整条父链都被显式写成展开；父链顶层 w1 本就是默认展开，这里也记一条（判据看记录、不看生效值）
    expect(store.getSnapshot().expansion?.workspace).toEqual({
      'w-new': true,
      w3: true,
      w2: true,
      w1: true,
    })
    // 与它无关的那一个没被碰过
    expect(store.getSnapshot().expansion?.workspace?.['w4']).toBeUndefined()

    await act(async () => root.unmount())
  })

  it('writes no folding record when the new workspace cannot land under any parent', async () => {
    // /other 之下没有任何现存工作区，新工作区落成自己那个容器的顶层，本来就默认展开
    // 这时不该写任何记录：写了就等于把「用户没碰过」变成「用户选了展开」
    const store = viewModeStoreStub()
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      ...storeViewModeProps(store),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/tmp/elsewhere', '新工作区'))

    expect(store.getSnapshot().expansion?.workspace ?? {}).toEqual({})

    await act(async () => root.unmount())
  })

  it('writes no folding record when nesting is off', async () => {
    // 关掉嵌套时每个工作区都是自己那个容器的顶层，父链在渲染上不存在，展开是白送的
    const store = viewModeStoreStub()
    let adopted: ((workspaceId: string, path: string, name: string) => void) | undefined
    const { root } = await mount({
      ...storeViewModeProps(store),
      loadGroups: async () => snapshot({ nested: false }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new', title: '新工作区' }),
          startSession: () => {},
          occupant: () => ({ component: (() => null) as never, inject: () => ({}) }),
          labels: officialAddLabels(workspaceTranslate()),
        }
      },
    })

    await act(async () => adopted?.('w-new', '/repo/a/b/c', '新工作区'))

    expect(store.getSnapshot().expansion?.workspace ?? {}).toEqual({})

    await act(async () => root.unmount())
  })

  it('turns nesting on without asking, since nothing is released', async () => {
    const calls: boolean[] = []
    const { container, root } = await mount({
      loadGroups: async () => snapshot({ nested: false }),
      setNested: async (enabled: boolean) => {
        calls.push(enabled)
        return snapshot({ nested: enabled })
      },
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      '.headerAction[aria-label="视图选项"]',
    )
    await act(async () => trigger?.click())
    await act(async () => {
      ;(document.body.querySelector('[role="switch"]') as HTMLElement | null)?.click()
    })

    expect(calls).toEqual([true])

    await act(async () => root.unmount())
  })

  /**
   * 一层的撑开体是否展开
   *
   * 展开态挂在撑开体根节点的类名上，与实现同一份判据（`rows.module.css` 的 `.expandOpen`）
   */
  function isExpanded(section: Element): boolean {
    return section.querySelector(':scope > .expand')?.classList.contains('expandOpen') ?? false
  }

  /** 按标题取一个工作区块 */
  function sectionNamed(container: HTMLElement, title: string): Element {
    const found = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.querySelector('.workspaceTitle')?.textContent === title,
    )
    if (found === undefined) throw new Error(`no workspace section titled ${title}`)
    return found
  }

  it('expands a top-level workspace but collapses a child one by default', async () => {
    // 三态的默认按结构分层：没有父工作区的展开，子工作区折叠
    // 这与官方「有孩子就展开、叶子折叠」不是同一条规则，反例是「有父且自己还有子节点」的那种
    const { container, root } = await mount()

    expect(isExpanded(sectionNamed(container, 'W1'))).toBe(true)
    expect(isExpanded(sectionNamed(container, 'W2'))).toBe(false)
    expect(isExpanded(sectionNamed(container, 'W4'))).toBe(true)

    await act(async () => root.unmount())
  })

  it('collapses a session group by default and opens it on click', async () => {
    const store = viewModeStoreStub()
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      loadGroups: async () =>
        snapshot({ byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] } }),
    })

    const group = container.querySelector('.group')
    if (group === null) throw new Error('no session group rendered')
    expect(isExpanded(group)).toBe(false)

    await act(async () => {
      group.querySelector<HTMLElement>('.groupHead')?.click()
    })

    // 点开之后写盘的是「这一层显式展开」，而界面上也跟着展开
    expect(store.getSnapshot().expansion?.group).toEqual({ 'w1:g1': true })
    expect(isExpanded(container.querySelector('.group') ?? document.body)).toBe(true)

    await act(async () => root.unmount())
  })

  it('collapses a top-level workspace on click and remembers the choice', async () => {
    // 第一下点击的语义由默认值决定：顶层默认展开，因此它是折叠
    const store = viewModeStoreStub()
    const { container, root } = await mount(storeViewModeProps(store))

    await act(async () => {
      sectionNamed(container, 'W4').querySelector<HTMLElement>('.workspaceHead')?.click()
    })

    expect(store.getSnapshot().expansion?.workspace).toEqual({ w4: false })
    expect(isExpanded(sectionNamed(container, 'W4'))).toBe(false)

    await act(async () => root.unmount())
  })

  it('keeps the picked folding state across a remount', async () => {
    // 折叠态存在浏览器本地 store 里，因此重新挂载后仍停在上次的开合上
    const store = viewModeStoreStub()
    const first = await mount(storeViewModeProps(store))
    await act(async () => {
      sectionNamed(first.container, 'W1').querySelector<HTMLElement>('.workspaceHead')?.click()
    })
    expect(isExpanded(sectionNamed(first.container, 'W1'))).toBe(false)
    await act(async () => first.root.unmount())

    const second = await mount(storeViewModeProps(store))

    expect(isExpanded(sectionNamed(second.container, 'W1'))).toBe(false)
    // 没碰过的那一层仍按结构默认：W4 无父，照常展开
    expect(isExpanded(sectionNamed(second.container, 'W4'))).toBe(true)

    await act(async () => second.root.unmount())
  })

  it('swaps the structure default for the recorded choice on a child workspace', async () => {
    // 子工作区默认折叠，显式写了 true 之后要按记录展开——三态的两边都要走通
    const store = viewModeStoreStub()
    store.setWorkspaceExpanded('w2', true)
    const { container, root } = await mount(storeViewModeProps(store))

    expect(isExpanded(sectionNamed(container, 'W2'))).toBe(true)

    await act(async () => root.unmount())
  })

  it('shows the ungrouped bucket expanded by default', async () => {
    // 「未分组」桶的键是哨兵空串，它按「无父」那一档默认展开
    // 桶只在真有无所属工作区的会话时才渲染，因此这里补一条挂在不存在的工作区上的会话
    const store = viewModeStoreStub()
    const byId = {
      orphan: { id: 'orphan', displayTitle: '无主会话', blank: false, retainedBy: {}, updatedAt: 1_000 },
    }
    const { container, root } = await mount({
      ...storeViewModeProps(store),
      useSessions: ((select: (s: unknown) => unknown) =>
        select({ ids: ['orphan'], byId, phase: 'ready' })) as never,
    })

    const ungrouped = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.querySelector('.workspaceTitle')?.textContent === '未分组',
    )
    expect(ungrouped).toBeDefined()
    expect(isExpanded(ungrouped ?? document.body)).toBe(true)

    // 点一下它的行是「折叠」，写下的键是哨兵空串——与工作区层共用同一份记录
    await act(async () => {
      ungrouped?.querySelector<HTMLElement>('.workspaceHead')?.click()
    })
    expect(store.getSnapshot().expansion?.workspace).toEqual({ '': false })

    await act(async () => root.unmount())
  })

  it('does not clean up the folding records while the workspace list is still pending', async () => {
    // `pending` 期间 items 是空的，据它清理会把用户的记录清光——官方那条守卫防的就是这个
    const store = viewModeStoreStub()
    store.setWorkspaceExpanded('gone', false)
    const { root } = await mount({
      ...storeViewModeProps(store),
      useWorkspaces: ((select: (s: unknown) => unknown) =>
        select({ items: [], archivedSessionIds: [], phase: 'pending' })) as never,
    })

    expect(store.getSnapshot().expansion?.workspace).toEqual({ gone: false })

    await act(async () => root.unmount())
  })

  it('drops the folding records of workspaces that no longer exist once the list is ready', async () => {
    const store = viewModeStoreStub()
    store.setWorkspaceExpanded('gone', false)
    store.setWorkspaceExpanded('w1', false)
    const { root } = await mount(storeViewModeProps(store))

    expect(store.getSnapshot().expansion?.workspace).toEqual({ w1: false })

    await act(async () => root.unmount())
  })
})
