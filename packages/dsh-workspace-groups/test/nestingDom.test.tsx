// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { CSS } from '../src/client/styles.ts'
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
      items?: { id: string; label?: React.ReactNode; submenu?: { id: string; label?: React.ReactNode }[] }[]
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
 * 递归嵌出来的结构、缩进用的自定义属性、放进分组的那个落在谁的折叠体里，都不行
 * 这里用真 `react-dom` 渲染一遍并断言结构
 */

/** 造一份注入面完整的数据，`workspaces` 决定路径关系，`groups` / `nesting` 决定归属 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const created = new Date(2026, 0, 1, 0, 0).toISOString()
  const byId: Record<string, unknown> = {
    a: { id: 'a', displayTitle: '修复登录超时', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
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
      select({ items: workspaces, archivedSessionIds: [] })) as never,
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
      createWorkspace: async (path: string) => ({ workspaceId: `w-${path}` }),
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
  for (const node of Array.from(document.body.querySelectorAll('.wg-view-menu, [role="dialog"]'))) {
    node.remove()
  }
})

/** 取每个工作区块的标题与它下发的深度 */
function sections(container: HTMLElement): { title: string; depth: string }[] {
  return Array.from(container.querySelectorAll('.wg-workspace')).map((section) => {
    const element = section as HTMLElement
    return {
      title: section.querySelector('.wg-workspace-title')?.textContent ?? '',
      depth: element.style.getPropertyValue('--wg-depth'),
    }
  })
}

describe('nested sub-workspaces in a real DOM', () => {
  it('nests a child workspace inside its parent by cwd path', async () => {
    const { container, root } = await mount()

    // /repo/a 与 /repo/a/b 都是 /repo 的后代，因此只有 /repo 留在根节点
    expect(sections(container)).toEqual([
      { title: 'W1', depth: '0' },
      // 子工作区是父折叠体里的一个完整工作区块，深度沿层级递增
      { title: 'W2', depth: '1' },
      { title: 'W3', depth: '2' },
      { title: 'W4', depth: '0' },
    ])
    // 层级真的嵌在文档里：W2 在 W1 的折叠体内
    const w1 = Array.from(container.querySelectorAll('.wg-workspace')).find(
      (section) => section.querySelector('.wg-workspace-title')?.textContent === 'W1',
    )
    const w2 = w1?.querySelector('.wg-workspace-body .wg-nest > .wg-workspace')
    expect(w2?.querySelector('.wg-workspace-title')?.textContent).toBe('W2')

    await act(async () => root.unmount())
  })

  it('nests two workspaces that were put into the same virtual workspace', async () => {
    // 真实场景：/src/dsh_plugins 与它下面的 /src/dsh_plugins/packages/dsh-workspace-groups
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
      view('pkg', '/src/dsh_plugins/packages/dsh-workspace-groups', 'dsh-workspace-groups'),
      view('other', '/src/other-plugins/example-plugin', 'example-plugin'),
    ]
    const { container, root } = await mount({
      useWorkspaces: ((select: (s: unknown) => unknown) =>
        select({ items: workspaces, archivedSessionIds: [] })) as never,
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
      { title: 'dsh-workspace-groups', depth: '2' },
    ])
    const repo = Array.from(container.querySelectorAll('.wg-workspace')).find(
      (section) => section.querySelector('.wg-workspace-title')?.textContent === 'dsh_plugins',
    )
    // 层级真的嵌在文档里，而不只是深度数值不同
    expect(
      repo?.querySelector('.wg-workspace-body .wg-nest > .wg-workspace .wg-workspace-title')
        ?.textContent,
    ).toBe('dsh-workspace-groups')

    await act(async () => root.unmount())
  })

  it('indents the empty label of a child workspace as deep as the child itself', async () => {
    // 空态占位是「这一层没有一个会话」的说明，它必须与同一层的行对齐
    // 否则子工作区里那句「暂无会话」会停在根节点那一列，看起来像属于父工作区
    const { container, root } = await mount()

    // W3 是最深的一层（/repo/a/b），它既没有会话也没有子工作区，因此由它显示空态
    const empty = container.querySelector('.wg-workspace-body > .wg-empty')
    expect(empty?.textContent).toBe('暂无会话')
    // 空态属于它自己那一层，而不是跑回根节点那一列
    const owner = empty?.closest('.wg-workspace')
    expect(owner?.querySelector('.wg-workspace-title')?.textContent).toBe('W3')
    expect(owner?.getAttribute('style')).toContain('--wg-depth: 2')
    // 样式表里必须有一条按结构写的规则给它换算左边距，缺了它那 16px 内边距会盖住
    // 刚才那条对齐，空态停在根节点那一列而不会有任何报错
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((match) =>
      (match[1] ?? '').includes('.wg-workspace-body > .wg-empty'),
    )
    expect(rule, 'no .wg-workspace-body > .wg-empty rule in the stylesheet').toBeDefined()
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
      view('pkg', '/src/dsh_plugins/packages/dsh-workspace-groups', 'dsh-workspace-groups'),
    ]
    const { container, root } = await mount({
      useWorkspaces: ((select: (s: unknown) => unknown) =>
        select({ items: workspaces, archivedSessionIds: [] })) as never,
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
    const pkg = Array.from(container.querySelectorAll('.wg-workspace')).find(
      (section) => section.querySelector('.wg-workspace-title')?.textContent === 'dsh-workspace-groups',
    )
    await act(async () => {
      ;(pkg?.querySelector('.wg-row-action-slot button') as HTMLButtonElement | undefined)?.click()
    })

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
    const group = Array.from(container.querySelectorAll('.wg-group')).find(
      (section) => section.querySelector('.wg-group-label')?.textContent === 'better-workspace',
    )
    expect(
      group?.querySelector('.wg-nest .wg-workspace-title')?.textContent,
    ).toBe('dsh-workspace-groups')

    await act(async () => root.unmount())
  })

  it('keeps a parent session row and its child workspace in the same body', async () => {
    const { container, root } = await mount()

    // 父体内分三段：子工作区 → 会话分组 → 平铺会话
    // 这里没有会话分组，因此是「子工作区在前、会话行在后」
    const body = container.querySelector('.wg-workspace-body')
    const order = Array.from(body?.children ?? []).map((child) => child.className)
    expect(order[0]).toBe('wg-nest')
    expect(order[1]).toBe('wg-sessions')
    expect(body?.querySelector('.wg-nest .wg-workspace-title')?.textContent).toBe('W2')
    expect(body?.querySelector('.wg-sessions .wg-row-title')?.textContent).toBe('修复登录超时')

    await act(async () => root.unmount())
  })

  it('labels the session run only when folders share the same body', async () => {
    // 子工作区与会话行的缩进公式相同，两段的行文字左缘落在同一条竖线上
    // 这时会话那一段要加一个小标题，否则读不出下面那几行是会话
    const { container, root } = await mount()

    const body = container.querySelector('.wg-workspace-body')
    expect(body?.querySelector('.wg-nest')).not.toBeNull()
    expect(body?.querySelector('.wg-sessions-title')?.textContent).toBe('会话')
    // 标题排在会话行之前，不插进它们中间
    const run = body?.querySelector('.wg-sessions')
    expect(run?.firstElementChild?.className).toBe('wg-sessions-title')
    expect(run?.querySelector('.wg-row-title')?.textContent).toBe('修复登录超时')

    await act(async () => root.unmount())
  })

  it('leaves the session run unlabelled when it is alone in its body', async () => {
    // 关掉嵌套、W1 也没有会话分组：体内只有会话行，没有任何东西需要与它区分
    // 这时不该多出一个标题：它既没有可区分的对象，又占掉一行高度
    const { container, root } = await mount({
      loadGroups: async () => snapshot({ nested: false }),
    })

    const body = container.querySelector('.wg-workspace-body')
    expect(body?.querySelector('.wg-sessions')).not.toBeNull()
    expect(body?.querySelector('.wg-nest')).toBeNull()
    expect(body?.querySelector('.wg-group')).toBeNull()
    expect(body?.querySelector('.wg-sessions-title')).toBeNull()

    await act(async () => root.unmount())
  })

  it('labels the session run when only a session group shares its body', async () => {
    // 会话分组的头与未归组的会话行缩进同档（都是 24 + 16d），左缘同样落在一条竖线上
    // 因此即使体内没有子工作区，这个标题也要在
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nested: false,
        }),
    })

    const body = container.querySelector('.wg-workspace-body')
    expect(body?.querySelector('.wg-group')).not.toBeNull()
    expect(body?.querySelector('.wg-sessions-title')?.textContent).toBe('会话')

    await act(async () => root.unmount())
  })

  it('labels the session run inside a group that also holds a child workspace', async () => {
    // 组体内同样是「子工作区 → 会话」，缩进同档，因此这一层也要标出来
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const groupBody = container.querySelector('.wg-group-body')
    expect(groupBody?.querySelector('.wg-nest')).not.toBeNull()
    expect(groupBody?.querySelector('.wg-sessions-title')?.textContent).toBe('会话')

    await act(async () => root.unmount())
  })

  it('leaves a group session run unlabelled when the group holds no child workspace', async () => {
    // 组里只有会话时，分组头已经说明这一段是什么，再加标题是同义反复
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({ byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: ['a'] }] } }),
    })

    const groupBody = container.querySelector('.wg-group-body')
    expect(groupBody?.querySelector('.wg-sessions')).not.toBeNull()
    expect(groupBody?.querySelector('.wg-sessions-title')).toBeNull()

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

    const groupBody = container.querySelector('.wg-group-body')
    expect(groupBody?.querySelector('.wg-workspace-title')?.textContent).toBe('W2')
    // 未归组的会话仍在组外那一段
    expect(container.querySelector('.wg-workspace-body > .wg-sessions')).not.toBeNull()
    // 根节点上不再出现 W2
    expect(
      Array.from(container.querySelectorAll('.wg-workspace-head')).length,
    ).toBe(4)

    await act(async () => root.unmount())
  })

  it('nests a workspace placed in a group under that group body, one level past its head', async () => {
    // 放进分组的子工作区与同组的会话行同处 .wg-group-body，因此两者缩进同档
    // 少了这一层包裹，它会与分组头停在同一个缩进上，读起来像分组的兄弟而不是组内的内容
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }] },
          nesting: { w2: { workspaceId: 'w1', groupId: 'g1' } },
        }),
    })

    const w2 = Array.from(container.querySelectorAll('.wg-workspace')).find(
      (section) => section.querySelector('.wg-workspace-title')?.textContent === 'W2',
    )
    // 结构上确实落在那个分组的体内（.wg-group-body），因此会跟着它累加一格偏移
    expect(w2?.closest('.wg-group-body')).not.toBeNull()
    // 而按 cwd 嵌套、没被放进分组的那一个落在工作区体内的 .wg-nest 里
    expect(w2?.closest('.wg-nest')).not.toBeNull()

    const w1Section = Array.from(container.querySelectorAll('.wg-workspace')).find(
      (section) => section.querySelector('.wg-workspace-title')?.textContent === 'W1',
    )
    const depthOf = (workspace: Element | undefined): number =>
      Number((workspace as HTMLElement).style.getPropertyValue('--wg-depth'))
    const placed = depthOf(w2)
    const host = depthOf(w1Section)
    // 各行的基准不同（工作区行 8px、分组头 24px、组内会话行 40px），因此不能直接比 depth 数值
    // 要比的是最终内边距：它必须落在分组头之下，且与同组会话行同档
    const placedIndent = 8 + 16 * placed
    const groupHeadIndent = 24 + 16 * host
    expect(placedIndent).toBeGreaterThan(groupHeadIndent)
    expect(placedIndent).toBe(40 + 16 * host)

    // CSS 里没有「容器偏移」那层变量：偏移靠自引用累加是循环引用，浏览器会整条丢掉
    // 层级因此全部由 JS 算好下发，样式表只把它当数值用
    const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toContain('--wg-depth-offset')
    expect(css).toMatch(/padding-left:\s*calc\(8px \+ 16px \* var\(--wg-depth, 0\)\)/)

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
    expect(container.querySelector('.wg-note-nested')?.textContent).toContain('嵌套已关闭')

    await act(async () => root.unmount())
  })

  it('survives a host half that has not been restarted yet', async () => {
    // 新客户端可能收到旧宿主回的、没有 nesting / nested 这两格的快照
    const { container, root } = await mount({
      loadGroups: async () => ({ byWorkspace: {} }) as never,
    })

    expect(container.querySelector('.wg-root')).not.toBeNull()
    expect(sections(container).length).toBeGreaterThan(0)

    await act(async () => root.unmount())
  })

  it('offers the nesting switch in the view options panel', async () => {
    const { container, root } = await mount()

    // 视图选项按钮不再是 disabled 占位
    const trigger = container.querySelector<HTMLButtonElement>(
      '.wg-header-action[aria-label="视图选项"]',
    )
    expect(trigger?.disabled).toBe(false)
    await act(async () => trigger?.click())

    const options = document.body.querySelectorAll('.wg-view-option')
    expect(options).toHaveLength(1)
    // 文案是设置名，不随开关状态变化，状态由控件自己的 aria-checked 表达
    expect(options[0]?.textContent).toContain('子工作区嵌套')
    const toggle = options[0]?.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(toggle?.getAttribute('aria-checked')).toBe('true')

    await act(async () => root.unmount())
  })

  it('offers both display modes above the nesting switch', async () => {
    const { container, root } = await mount()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.wg-header-action[aria-label="视图选项"]')
        ?.click()
    })

    // 这一组的标题与两条可选行都在，标题说明它们选的是哪件事
    expect(document.body.querySelector('.wg-view-group-label')?.textContent).toBe('展示方式')
    const rows = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.wg-view-option-row'),
    )
    // 图标的替身把字形名渲染成文本，因此文案取自行内那一格，不看整行的 textContent
    expect(rows.map((element) => element.querySelector('.wg-view-option-label')?.textContent)).toEqual([
      '按工作区',
      '平铺',
    ])
    // 当前值由 aria-pressed 与行尾那个勾表达，两者不会各说一套
    expect(rows[0]?.getAttribute('aria-pressed')).toBe('true')
    expect(rows[1]?.getAttribute('aria-pressed')).toBe('false')
    // 勾与字形都取官方图标，替身把字形名渲染成文本；替身不吃 className，因此按文本来认
    expect(rows[0]?.textContent).toContain('IconCheckOutlineRegular')
    expect(rows[1]?.textContent).not.toContain('IconCheckOutlineRegular')
    // 两条各取自己的字形：文件夹 / 单列表，与官方那组「分组方式」同字形
    expect(rows[0]?.textContent).toContain('IconFolderCloseRegular')
    expect(rows[1]?.textContent).toContain('IconFlatListOutlineRegular')
    // 两组设置之间有一条分隔线
    expect(document.body.querySelector('.wg-view-separator')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('writes the picked display mode and re-renders the list as one flat column', async () => {
    const store = viewModeStoreStub()
    const { container, root } = await mount(storeViewModeProps(store))
    const sectionsIn = (): number => container.querySelectorAll('.wg-workspace').length
    expect(sectionsIn()).toBeGreaterThan(0)
    expect(container.querySelector('.wg-flat-list')).toBeNull()

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('.wg-header-action[aria-label="视图选项"]')
        ?.click()
    })
    const flat = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('.wg-view-option-row'),
    ).find((element) => element.querySelector('.wg-view-option-label')?.textContent === '平铺')
    await act(async () => flat?.click())

    // 选中的方式真的写进了存储，界面也换成了那条平铺列表：工作区分组结构整个消失
    expect(store.getSnapshot().mode).toBe('flat')
    expect(container.querySelector('.wg-flat-list')).not.toBeNull()
    expect(sectionsIn()).toBe(0)
    // 会话仍在，只是不再按工作区分组
    expect(container.querySelector('.wg-flat-list .wg-row-title')?.textContent).toBe(
      '修复登录超时',
    )

    await act(async () => root.unmount())
  })

  it('keeps the picker as the only filter in the flat list', async () => {
    // 平铺下聚焦语义照旧：它把这批内容收窄到某个工作区，而不是让第二行写着聚焦对象、列表却无动于衷
    const { container, root } = await mount({
      ...viewModeProps('flat'),
      loadGroups: async () => snapshot({ picker: { focused: 'ws:w2', recent: [], pinned: [] } }),
    })

    // 聚焦在 w2 上，而 w2 名下没有会话，因此平铺列表是空的，w1 那条会话不再出现
    expect(container.querySelector('.wg-flat-list')).not.toBeNull()
    expect(container.querySelector('.wg-row-title')).toBeNull()
    expect(container.querySelector('.wg-empty')?.textContent).toBe('暂无会话')

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
      '.wg-header-action[aria-label="视图选项"]',
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

  it('asks before placing a newly added workspace into its parent group', async () => {
    // 采纳成功后的回调由「添加工作区」那个组件回传，这里直接驱动它，验证按路径做出的判断
    const placed: { ids: readonly string[]; parent: string; group: string }[] = []
    let adopted: ((workspaceId: string, path: string) => void) | undefined
    const { root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: { w1: [{ id: 'g1', name: '前端', sessionIds: [] }], w2: [], w3: [], w4: [] },
        }),
      addWorkspace: (onAdopted) => {
        adopted = onAdopted
        return {
          createWorkspace: async () => ({ workspaceId: 'w-new' }),
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
    await act(async () => adopted?.('w-new', '/repo/a/c'))
    await act(async () => {
      ;(document.body.querySelector('[role="dialog"]') as HTMLElement | null)
    })

    // 落在 /repo/a 之下，而它的父 w2 没有任何分组：不问，默认的嵌套渲染已经放好了
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => adopted?.('w-new', '/repo/x'))
    // 落在 /repo 之下，而 w1 恰好只有一个分组：问一句
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('前端')
    const confirm = Array.from(dialog?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === '放进分组',
    )
    await act(async () => confirm?.click())
    expect(placed).toEqual([{ ids: ['w-new'], parent: 'w1', group: 'g1' }])

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
      '.wg-header-action[aria-label="视图选项"]',
    )
    await act(async () => trigger?.click())
    await act(async () => {
      ;(document.body.querySelector('[role="switch"]') as HTMLElement | null)?.click()
    })

    expect(calls).toEqual([true])

    await act(async () => root.unmount())
  })
})
