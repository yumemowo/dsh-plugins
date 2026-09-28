// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { readAllCss } from './readCss.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { viewModeProps } from './viewMode-stub.ts'

/**
 * 工作区分组的真实 DOM 结构
 *
 * `render.test.ts` 用自制 dispatcher 直接调用函数组件，只能看到元素树
 * 层级缩进却是一组按真实 DOM 结构写的选择器（`.virtualWorkspaceBody > .workspace > .collapse > ...`）
 * 选择器写错时界面只是「没有缩进」，不会有任何报错
 * 这里用真 `react-dom` 渲染一遍并断言那些选择器确实命中，守住这条静默失效的边界
 *
 * 套用与 hoverDom.test.tsx 同一份注入面构造
 */

/** 造一份注入面完整的数据 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const created = new Date(2026, 0, 1, 0, 0).getTime()
  const byId: Record<string, unknown> = {
    // `a` 设成运行中：状态指示器只在有状态时渲染，缺一条就无从验证它那条按结构写的落点规则
    a: { id: 'a', displayTitle: '修复登录超时', running: true, blank: false, retainedBy: {}, updatedAt: 1_000 },
    // 未归组的会话：它的缩进走 `.sessions > .row` 那一档，与组内会话不同
    // 缺了它那条规则就无从验证
    b: { id: 'b', displayTitle: '散落会话', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
    orphan: { id: 'orphan', displayTitle: 'Orphan', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
  }
  const workspaces = [
    {
      workspaceId: 'w1',
      path: '/tmp/w1',
      title: 'W1',
      sessionIds: ['a', 'b'],
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(created).toISOString(),
    },
    {
      workspaceId: 'w2',
      path: '/tmp/w2',
      title: 'W2',
      sessionIds: [],
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(created).toISOString(),
    },
  ]
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [] })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'b', 'orphan'], byId, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) =>
      select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () =>
      snapshot({
        byWorkspace: { w1: [{ id: 'g1', name: '会话分组', sessionIds: ['a'] }] },
        workspaceGroups: [
          { id: 'wg1', name: '工作区分组', workspaceIds: ['w1'] },
          // 空分组一起渲染，它的空态占位也有一条按结构写的缩进规则
          // 缺了它那条规则在下面那条「逐条命中」的断言里无从验证
          { id: 'wg2', name: '空组', workspaceIds: [] },
        ],
      }),
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
 * 取样式表里那些按工作区分组结构写的缩进 / 引导线选择器
 *
 * 读的是各组件的 `.module.css` 源文本，类名取的是源文件里的原名
 * 本测试直接挂载组件、不走 `apply`，因此页面上并没有本包的 style 标签
 */
function groupScopedRules(): { selectors: string[]; body: string }[] {
  const css = readAllCss().replace(/\/\*[\s\S]*?\*\//g, '')
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({
      selectors: (match[1] ?? '')
        .split(',')
        .map((selector) => selector.trim().replace(/\s+/g, ' ')),
      body: (match[2] ?? '').trim(),
    }))
    .filter((rule) => rule.selectors.some((selector) => selector.includes('virtualWorkspaceBody')))
}

describe('workspace group DOM structure', () => {
  it('nests each grouped workspace under the group body', async () => {
    const { container, root } = await mount()

    const groupHead = container.querySelector('.virtualWorkspaceHead')
    const body = container.querySelector('.virtualWorkspaceBody')
    expect(groupHead?.textContent).toContain('工作区分组')
    expect(body).not.toBeNull()

    // 被归组的工作区落在组体里，未归组的那个留在根节点上
    const grouped = body?.querySelector('.workspace')
    expect(grouped?.querySelector('.workspaceTitle')?.textContent).toBe('W1')
    const loose = Array.from(container.querySelectorAll('.workspace')).find(
      (section) => section.closest('.virtualWorkspaceBody') === null,
    )
    expect(loose?.querySelector('.workspaceTitle')?.textContent).toBe('W2')

    await act(async () => root.unmount())
  })

  it('matches the nested indentation selectors against the rendered tree', async () => {
    const { container, root } = await mount()

    // 逐条把样式表里那批选择器拿去真实 DOM 里查：任何一条都不命中
    // 就说明它对应的那一层没有缩进——界面静默失效，不会有报错
    const rules = groupScopedRules()
    // 这批规则是本包为工作区分组新写的，先守住「确实读到了它们」
    // 否则下面的断言会在空列表上假通过
    expect(rules.length).toBeGreaterThan(0)

    // 每条规则至少有一个选择器命中真实 DOM
    // 规则里常同时写「直接子项」与「隔一层包装」两档（挂了悬停卡片的工作区行会被官方 HoverCard 的根节点包一层）
    // 因此按规则而不是按单个选择器断言，任一档命中就说明这层缩进真的作用到了行上
    for (const { selectors, body } of rules) {
      // 伪元素本身没有可查询的节点，但它的宿主元素有
      // 剥掉 ::before 后照样能验证引导线挂在哪个元素上，宿主不存在的话那条线根本不会画出来
      const queryable = selectors.map((selector) => selector.split('::')[0] ?? selector)
      const matched = queryable.filter(
        (selector) => container.querySelectorAll(selector).length > 0,
      )
      expect(matched, `no selector matched for rule { ${body} }`).not.toEqual([])
    }

    // 这一层的缩进不再按固定层数写死选择器，子工作区可以是任意层
    // 整棵子树抬高多少，由各容器累加出来的 --wg-depth-offset 承担
    const all = rules.flatMap((rule) => rule.selectors)
    expect(all).toContain('.virtualWorkspaceBody')
    // 组内工作区行不再单独写一条缩进规则，它读的是抬高后的 --wg-depth
    expect(all).not.toContain('.virtualWorkspaceBody > .workspace > .workspaceHead')

    await act(async () => root.unmount())
  })

  it('matches every indentation rule against the rendered tree', async () => {
    // 层级缩进是一组按真实 DOM 结构写穿的选择器，容器里多一层包装就会让它们整组失配
    // 缩进与引导线静默消失、没有任何报错。这条测试把那批规则逐条拿去真实 DOM 里查
    const { container, root } = await mount()

    const css = readAllCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((match) => ({
        selectors: (match[1] ?? '')
          .split(',')
          .map((selector) => selector.trim().replace(/\s+/g, ' '))
          .filter((selector) => selector !== ''),
        body: (match[2] ?? '').trim(),
      }))
      // 只看那些按结构链写出来、且真的决定缩进位置的规则：
      // - 值里带 `--wg-depth` 换算的 padding-left / left（各层缩进与引导线）
      // - 或落点读 `--wg-row-start` 的 left（状态指示器，它跟着缩进走）
      // 两类都会因容器多一层包装而整组失配，且失配时界面只是「位置不对」，没有任何报错
      .filter((rule) => {
        const positions = /padding-left:/.test(rule.body) || /left:\s*calc\(/.test(rule.body)
        if (!positions) return false
        return /--wg-depth/.test(rule.body) || /--wg-row-start/.test(rule.body)
      })

    // 这批规则确实读到了，否则下面的断言会在空列表上假通过
    expect(rules.length).toBeGreaterThan(0)
    // 平铺列表那两条只在平铺态渲染，这里挂的是按工作区的树，查不到它们
    // 它们是固定值（8px），不含 --wg-depth 换算，由平铺那条用例另行覆盖
    const grouped = rules.filter(
      (rule) => !rule.selectors.some((selector) => selector.startsWith('.flatList')),
    )
    expect(grouped.length).toBeGreaterThan(0)

    for (const rule of grouped) {
      // 伪元素本身没有可查询的节点，但宿主元素有，剥掉 ::before 后照样能验证引导线挂在谁身上
      const queryable = rule.selectors.map((selector) => selector.split('::')[0] ?? selector)
      const matched = queryable.filter((selector) => {
        try {
          return container.querySelectorAll(selector).length > 0
        } catch {
          return false
        }
      })
      expect(matched, `no selector matched for rule { ${rule.body} }`).not.toEqual([])
    }

    await act(async () => root.unmount())
  })

  it('keeps the session rows of a grouped workspace mounted under their groups', async () => {
    const { container, root } = await mount()

    // 组内工作区里的会话分组与会话行都还在文档里（收起也是靠折叠体收轨道，不卸载）
    const session = container.querySelector('.virtualWorkspaceBody .row')
    expect(session?.querySelector('.rowTitle')?.textContent).toBe('修复登录超时')
    expect(container.querySelector('.virtualWorkspaceBody .groupLabel')?.textContent).toBe(
      '会话分组',
    )

    await act(async () => root.unmount())
  })

  it('survives a host half that has not been restarted yet', async () => {
    // 浏览器半边随热重载换新，宿主半边要重启 dsh 才换，那段窗口里收到的是旧形状的快照（只有 byWorkspace）
    // 缺格直接遍历会抛 `groups is not iterable`，把整片区域打挂，这里用真 DOM 走一遍
    // 确认它退化成「没有工作区分组」
    const { container, root } = await mount({
      loadGroups: async () => ({ byWorkspace: {} }) as never,
    })

    expect(container.querySelector('.virtualWorkspaceHead')).toBeNull()
    // 工作区照常平铺，区域整体仍在渲染
    expect(container.querySelectorAll('.workspace').length).toBeGreaterThan(0)
    expect(container.querySelector('.root')).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('marks the group row with the dashed folder, not a real one', async () => {
    const { container, root } = await mount()

    // 分组头的文件夹槽走虚线，工作区分组形状上像一个工作区
    // 但本身不是一个真实工作区（没有目录、没有会话）。实线文件夹留给真实的工作区行
    const folder = container.querySelector('.virtualWorkspaceHead .folder')
    expect(folder?.innerHTML).toContain('stroke-dasharray')
    // 它也有独立的箭头槽，与工作区行同一套「悬停时文件夹换成箭头」
    expect(container.querySelector('.virtualWorkspaceHead .chevron')).not.toBeNull()

    // 组内真实工作区行仍然是实线文件夹
    const realFolder = container.querySelector('.workspaceHead .folder')
    expect(realFolder?.innerHTML ?? '').not.toContain('stroke-dasharray')

    await act(async () => root.unmount())
  })

  it('renders an empty workspace group body with its placeholder', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({ workspaceGroups: [{ id: 'wg1', name: '空组', workspaceIds: [] }] }),
    })

    const body = container.querySelector('.virtualWorkspaceBody')
    expect(body?.querySelector('.empty')?.textContent).toBe('这个工作区分组里还没有工作区')

    await act(async () => root.unmount())
  })
})
