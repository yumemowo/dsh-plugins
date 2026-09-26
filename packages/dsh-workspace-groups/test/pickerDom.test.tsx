// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import type { WorkspaceGroupsProps } from '../src/client/components/WorkspaceGroupsRegion.tsx'
import { officialAddLabels, officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { regionTranslate, sidebarTranslate, workspaceTranslate } from './locale-stub.ts'
import { snapshot } from './snapshot-stub.ts'
import { viewModeProps } from './viewMode-stub.ts'
import { rootVirtualKey, rootWorkspaceKey } from '../src/rootEntry.ts'

/**
 * 对话框要用真实 DOM 断言
 * 而共享替身把官方 `Modal` / `Button` / `Input` 一律渲染成 `null`（见 `primitives-stub.mjs`）
 * jsdom 里因此读不到它们。这里为本文件换一份 渲染进 DOM 的最小实现：
 * 只多出「对话框内容可见」这一件事，其余（图标、菜单）仍与共享替身一致
 * 其它测试文件不受影响
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

/**
 * 工作区下拉菜单与聚焦列表的真实 DOM
 *
 * 菜单面板 portal 到 `document.body`，而列表在容器里
 * 聚焦后的「根节点不再重复渲染组头」「未分组区段整段隐藏」两条都只能按真实 DOM 断言——
 * 元素树里看不出 portal 与容器的区别，选择器写错时界面只是「菜单不见了」
 * 不会有任何报错
 */

/** 造一份注入面完整的数据，`focused` / `pinned` 决定菜单与列表的初始状态 */
function props(overrides: Partial<WorkspaceGroupsProps> = {}): WorkspaceGroupsProps {
  const created = new Date(2026, 0, 1, 0, 0).toISOString()
  const byId: Record<string, unknown> = {
    a: { id: 'a', displayTitle: '修复登录超时', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
    // 无所属工作区的会话：它在末尾那个隐式「未分组」区段里，聚焦时整段要消失
    orphan: { id: 'orphan', displayTitle: 'Orphan', running: false, blank: false, retainedBy: {}, updatedAt: 1_000 },
  }
  const workspaces = [
    { workspaceId: 'w1', path: '/tmp/w1', title: 'W1', sessionIds: ['a'], createdAt: created, updatedAt: created },
    { workspaceId: 'w2', path: '/tmp/w2', title: 'W2', sessionIds: [], createdAt: created, updatedAt: created },
    { workspaceId: 'w3', path: '/tmp/w3', title: 'W3', sessionIds: [], createdAt: created, updatedAt: created },
  ]
  return {
    wide: true,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [] })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'orphan'], byId, phase: 'ready' })) as never,
    useSessionStatus: ((select: (s: unknown) => unknown) => select(new Map())) as never,
    useDirectoryFlow: ((select: (occupied: boolean) => unknown) => select(true)) as never,
    useHostInfo: ((select: (info: { home: string | undefined }) => unknown) =>
      select({ home: '/tmp' })) as never,
    openSession: () => {},
    startSession: async () => 'fresh',
    loadGroups: async () =>
      snapshot({
        workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }],
        picker: { focused: '', recent: [], pinned: [] },
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

/** 已挂载的根，收尾时统一卸载，见 `afterEach` */
const roots: { unmount: () => void }[] = []

/** 挂载区域并等分组元数据落地 */
async function mount(
  overrides: Partial<WorkspaceGroupsProps> = {},
): Promise<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> {
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
  return { container, root }
}

/** 面板在 body 上，不在容器里 */
function panel(): HTMLElement | null {
  return document.body.querySelector('.wg-picker-menu')
}

/** 点开菜单：header 那个两行标题按钮 */
async function openMenu(container: HTMLElement): Promise<void> {
  await act(async () => {
    ;(container.querySelector('.wg-header-title') as HTMLElement).click()
  })
}

/**
 * 点 header 里的「新建工作区分组」入口
 *
 * 那个按钮是入口组里的第二个 `.wg-header-action`（第一个是视图选项）
 */
async function openCreateDialog(container: HTMLElement): Promise<void> {
  const buttons = Array.from(
    container.querySelectorAll<HTMLElement>('.wg-header-actions .wg-header-action'),
  )
  const create = buttons.find((button) => button.getAttribute('aria-label') === '新建工作区分组')
  if (create === undefined) throw new Error('the header has no new-workspace-group entry')
  await act(async () => {
    create.click()
  })
}

/** 面板里文案为 `label` 的那一行，找不到时抛错，避免断言在 undefined 上假通过 */
function rowOf(label: string): HTMLElement {
  const row = Array.from(document.body.querySelectorAll<HTMLElement>('.wg-picker-row')).find(
    (item) => item.querySelector('.wg-picker-label')?.textContent === label,
  )
  if (row === undefined) throw new Error(`no picker row labelled "${label}"`)
  return row
}

/** 行内某枚操作按钮，按无障碍标签定位（三枚都只有字形） */
function actionOf(row: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(row.querySelectorAll<HTMLButtonElement>('.wg-row-action')).find(
    (item) => item.getAttribute('aria-label') === label,
  )
  if (button === undefined) throw new Error(`no action "${label}" in row "${row.textContent}"`)
  return button
}

/** 当前打开的对话框，没有时抛错，避免断言在 null 上假通过 */
function dialog(): HTMLElement {
  const found = document.body.querySelector<HTMLElement>('[data-wg-test-modal]')
  if (found === null) throw new Error('no dialog is open')
  return found
}

/** 对话框标题 */
function dialogTitle(): string {
  return dialog().querySelector('[data-wg-test-modal-title]')?.textContent ?? ''
}

/** 对话框里文本输入框的当前值 */
function dialogInputValue(): string | undefined {
  return dialog().querySelector<HTMLInputElement>('input')?.value
}

/** 对话框里的勾选框，没有时抛错 */
function dialogCheckbox(): HTMLInputElement {
  const box = dialog().querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (box === null) throw new Error('the dialog has no checkbox')
  return box
}

/**
 * 点下对话框里的确认按钮
 *
 * 取页脚最后一个按钮：
 * 两个对话框都把「翻页脚最后一格」留给确认，命名框是 `variant="primary"`
 * 删除框是带 `wg-danger-action` 的 outline，因此按位置取比按样式取更稳——
 * 删除框那两个按钮的 variant 恰好相同
 */
function confirmDialog(): void {
  const buttons = Array.from(
    dialog().querySelectorAll<HTMLButtonElement>('[data-wg-test-modal-footer] button'),
  )
  const confirm = buttons[buttons.length - 1]
  if (confirm === undefined) throw new Error('the dialog has no footer button')
  confirm.click()
}

/** 面板里一条条目的文案，按文档序 */
function rowLabels(): string[] {
  return Array.from(document.body.querySelectorAll('.wg-picker-row .wg-picker-label')).map(
    (node) => node.textContent ?? '',
  )
}

/**
 * 面板 portal 到 `document.body`，而用例中途失败时它会被留在文档里
 * 污染后续用例的全局查询。收尾按「先卸载、再清残留」：
 * 根节点必须在 React 还认领它那份 DOM 时卸载
 * 直接清空 body 会让 portal 组件在卸载时抛错
 */
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount())
  }
  document.body.innerHTML = ''
})

describe('workspace picker in a real DOM', () => {
  it('wraps both title lines in a single button', async () => {
    const { container, root } = await mount()

    // 两行合起来是一个按钮，它们表达同一件事，即当前在看哪个工作区、点开可以换一个
    // 分成两个可点区域只会让「点上面还是点下面」变成一个需要试的问题
    const trigger = container.querySelector('.wg-header-title')
    expect(trigger?.tagName).toBe('BUTTON')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(trigger?.getAttribute('aria-label')).toBe('切换工作区：全部工作区')

    // 两行都在这个按钮里面
    expect(trigger?.querySelector('.wg-header-heading .wg-header-label')?.textContent).toBe(
      '工作区',
    )
    expect(trigger?.querySelector('.wg-header-focus')?.textContent).toBe('全部工作区')

    // 箭头不是独立按钮，它就是这块按钮自己的开合指示。整块标题下因此一个按钮都没有——
    // 这一条正是「两行合成一个按钮」最容易退回两处可点区域的地方
    expect(container.querySelectorAll('.wg-header-title button')).toHaveLength(0)
    // 上行是「文字 + 箭头」两个节点。测试替身把官方图标渲染成文本节点
    // 因此这里数的是子节点而不是元素：箭头被删掉时这一条会失败
    const heading = trigger?.querySelector('.wg-header-heading')
    expect(heading?.childNodes).toHaveLength(2)
    expect(heading?.textContent).toContain('工作区')

    await act(async () => root.unmount())
  })

  it('opens the panel on the body with the three sections', async () => {
    const { container, root } = await mount()

    expect(panel()).toBeNull()
    await openMenu(container)

    const menu = panel()
    expect(menu).not.toBeNull()
    // 没有聚焦、没有置顶时只有「全部」一栏，而它没有标题
    expect(menu?.querySelector('.wg-picker-section-title')).toBeNull()
    // 虚拟分组只列它自己，w1 已归入 vg1，因此不在菜单里单独出现
    // 未归组的 W2 / W3 平铺在后面（它们之间没有 cwd 父子关系）
    expect(rowLabels()).toEqual(['前端仓库', 'W2', 'W3'])

    await act(async () => root.unmount())
  })

  it('indents only the ungrouped sub-workspaces in the panel', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          byWorkspace: {},
          workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w2'] }],
        }),
    })
    await openMenu(container)

    const rows = Array.from(document.body.querySelectorAll('.wg-picker-row'))
    const labelOf = (row: Element): string =>
      row.querySelector('.wg-picker-label')?.textContent ?? ''
    const depthOf = (label: string): string =>
      (rows.find((row) => labelOf(row) === label) as HTMLElement | undefined)?.style.getPropertyValue(
        '--wg-picker-depth',
      ) ?? ''

    // 虚拟分组与它名下的成员都不缩进，未归组的父子才按层级缩进
    expect(labelOf(rows[0]!)).toBe('前端仓库')
    expect(depthOf('前端仓库')).toBe('0')
    // w1 不在任何虚拟分组里，w2 已归组，因此这一段没有父子关系可缩进
    expect(depthOf('W1')).toBe('0')

    await act(async () => root.unmount())
  })

  it('renders only the group members once a group is focused, without the group head', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }],
          picker: { focused: rootVirtualKey('vg1'), recent: [rootVirtualKey('vg1')], pinned: [] },
        }),
    })

    expect(container.querySelector('.wg-header-focus')?.textContent).toBe('前端仓库')
    // 根节点那层不再重复渲染组头：第二行已经写着组名
    expect(container.querySelector('.wg-virtual-workspace-head')).toBeNull()
    // 组内工作区照常渲染，未归组的 W2 / W3 不再出现
    const titles = Array.from(container.querySelectorAll('.wg-workspace-title')).map(
      (node) => node.textContent,
    )
    expect(titles).toEqual(['W1'])

    await act(async () => root.unmount())
  })

  it('hides the ungrouped section while a workspace is focused', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          picker: { focused: rootWorkspaceKey('w2'), recent: [rootWorkspaceKey('w2')], pinned: [] },
        }),
    })

    // 无所属工作区的会话落在末尾那个隐式区段，聚焦时整段不出现
    expect(container.textContent).not.toContain('未分组')
    const titles = Array.from(container.querySelectorAll('.wg-workspace-title')).map(
      (node) => node.textContent,
    )
    expect(titles).toEqual(['W2'])

    await act(async () => root.unmount())
  })

  it('falls back to the whole list when the focused entry is gone', async () => {
    // 记录比列表活得久：聚焦的条目已经被删掉时
    // 第二行退回「全部工作区」而不是显示一个不存在的名字，列表也不能整片空掉
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }],
          picker: { focused: rootWorkspaceKey('gone'), recent: [rootWorkspaceKey('gone')], pinned: [] },
        }),
    })

    expect(container.querySelector('.wg-header-focus')?.textContent).toBe('全部工作区')
    // 分组层整段回来：没有聚焦时列表与没有这个特性时完全一致
    expect(container.querySelector('.wg-virtual-workspace-head')).not.toBeNull()
    const titles = Array.from(container.querySelectorAll('.wg-workspace-title')).map(
      (node) => node.textContent,
    )
    expect(titles).toContain('W2')

    await act(async () => root.unmount())
  })

  it('offers the all-workspaces entry only while something is focused', async () => {
    const { container, root } = await mount()
    await openMenu(container)
    expect(document.body.querySelector('.wg-picker-reset')).toBeNull()
    await act(async () => root.unmount())

    // 已聚焦时它是恢复入口
    const focused = await mount({
      loadGroups: async () =>
        snapshot({
          picker: { focused: rootWorkspaceKey('w2'), recent: [rootWorkspaceKey('w2')], pinned: [] },
        }),
    })
    await openMenu(focused.container)
    expect(document.body.querySelector('.wg-picker-reset')?.textContent).toContain('全部工作区')
    await act(async () => focused.root.unmount())
  })

  it('shows the recent and pinned sections only once they have entries', async () => {
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }],
          picker: {
            focused: '',
            recent: [rootWorkspaceKey('w3'), rootVirtualKey('vg1')],
            pinned: [rootVirtualKey('vg1')],
          },
        }),
    })
    await openMenu(container)

    // 「最近使用」与「置顶」两栏各有标题，「全部」那一栏没有
    const titles = Array.from(document.body.querySelectorAll('.wg-picker-section-title')).map(
      (node) => node.textContent,
    )
    expect(titles).toEqual(['最近使用', '置顶'])
    // 已置顶的条目在它出现的每一个分区里都显示为按下态（同一个条目可能同时在「最近使用」「置顶」「全部」里）
    // 未置顶的那几条始终是抬起态
    const pressed = Array.from(document.body.querySelectorAll<HTMLElement>('.wg-picker-row'))
      .filter((row) =>
        Array.from(row.querySelectorAll('.wg-row-action')).some(
          (button) => button.getAttribute('aria-pressed') === 'true',
        ),
      )
      .map((row) => row.querySelector('.wg-picker-label')?.textContent)
    expect(new Set(pressed)).toEqual(new Set(['前端仓库']))

    await act(async () => root.unmount())
  })

  it('focuses an entry from the panel through the host action', async () => {
    const calls: string[] = []
    const { container, root } = await mount({
      focusEntry: async (key: string) => {
        calls.push(key)
        return snapshot()
      },
    })
    await openMenu(container)

    // 行的可点区就是行本身（按钮嵌在它里面）
    await act(async () => {
      rowOf('W3').click()
    })

    expect(calls).toEqual([rootWorkspaceKey('w3')])
    // 选完菜单收起
    expect(panel()).toBeNull()

    await act(async () => root.unmount())
  })

  it('toggles a pin without closing the panel', async () => {
    const calls: string[] = []
    const { container, root } = await mount({
      togglePinned: async (key: string) => {
        calls.push(key)
        return snapshot()
      },
    })
    await openMenu(container)

    await act(async () => {
      actionOf(rowOf('前端仓库'), '置顶“前端仓库”').click()
    })

    expect(calls).toEqual([rootVirtualKey('vg1')])
    // 置顶是就地组织菜单，不该把用户弹出菜单
    expect(panel()).not.toBeNull()

    await act(async () => root.unmount())
  })

  it('reports the open state on the single button', async () => {
    const { container, root } = await mount()
    await openMenu(container)

    expect(panel()).not.toBeNull()
    expect(container.querySelector('.wg-header-title')?.getAttribute('aria-expanded')).toBe('true')

    await act(async () => root.unmount())
  })

  it('hides the panel while a search is running', async () => {
    // 搜索展开时标题整块让位（指针事件也关掉）
    // 面板若还开着就悬在一片与它无关的结果列表上
    const { container, root } = await mount()
    await openMenu(container)
    expect(panel()).not.toBeNull()

    const input = container.querySelector('.wg-search-input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    await act(async () => {
      setter?.call(input, 'x')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.querySelector('.wg-search-results')).not.toBeNull()
    expect(panel()).toBeNull()

    await act(async () => root.unmount())
  })

  it('renames a workspace from its row through the official dialog', async () => {
    const called: string[] = []
    const { container, root } = await mount({
      renameWorkspace: async (workspaceId: string, title: string) => {
        called.push(`${workspaceId}:${title}`)
      },
    })

    // W2 是未归组的独立工作区：重命名走工作区那个改名框
    await openMenu(container)
    await act(async () => {
      actionOf(rowOf('W2'), '重命名“W2”').click()
    })

    // 改名是对话形态，菜单让位，对话框里是官方的「重命名工作区」，初值是该工作区的名字
    expect(panel()).toBeNull()
    expect(dialogTitle()).toBe('重命名工作区')
    expect(dialogInputValue()).toBe('W2')

    // 改成别的名字再确认，改成同名是空操作（`commitWorkspaceRename` 会直接返回）
    // 那样这条断言就测不出东西
    const input = dialog().querySelector('input') as HTMLInputElement
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    await act(async () => {
      setValue?.call(input, 'W2 改名')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      confirmDialog()
      await Promise.resolve()
    })
    // 确认后走官方工作区控制器，带的是裸 id（不带 `ws:` 前缀）
    expect(called).toEqual(['w2:W2 改名'])

    await act(async () => root.unmount())
  })

  it('deletes a workspace group from its row after confirmation', async () => {
    const called: string[] = []
    const { container, root } = await mount({
      deleteVirtualWorkspace: async (groupId: string) => {
        called.push(groupId)
        return snapshot()
      },
    })

    await openMenu(container)
    await act(async () => {
      actionOf(rowOf('前端仓库'), '删除“前端仓库”').click()
    })
    expect(panel()).toBeNull()

    // 确认框是既有的那个：删掉的正是菜单里这一行的对象，带裸 id
    await act(async () => {
      confirmDialog()
      await Promise.resolve()
    })
    expect(called).toEqual(['vg1'])

    await act(async () => root.unmount())
  })

  it('separates the row actions from the row itself', async () => {
    // 点「重命名」却跳去聚焦那个工作区是这里最容易踩的一处：三枚按钮必须是独立的热区
    // 不能嵌在行按钮里面
    const focused: string[] = []
    const { container, root } = await mount({
      focusEntry: async (key: string) => {
        focused.push(key)
        return snapshot()
      },
    })
    await openMenu(container)

    // 行本身是可点的 div（按钮不能嵌按钮），三枚操作按钮是它的后代
    const row = rowOf('W2')
    expect(row.tagName).toBe('DIV')
    expect(row.getAttribute('role')).toBe('button')
    expect(row.querySelectorAll('.wg-row-action')).toHaveLength(3)
    await act(async () => {
      actionOf(row, '置顶“W2”').click()
    })
    // 点置顶不该顺手聚焦
    expect(focused).toEqual([])

    await act(async () => root.unmount())
  })

  it('offers the switch-to-new-workspace checkbox only while not showing everything', async () => {
    // 正看着全部工作区，没有可切的目的地，勾选项因此不出现
    const showingAll = await mount()
    await openCreateDialog(showingAll.container)
    expect(dialogTitle()).toBe('新建工作区分组')
    expect(dialog().querySelector('input[type="checkbox"]')).toBeNull()
    await act(async () => showingAll.root.unmount())

    // 已聚焦到一个工作区：勾选项出现，且默认不勾
    const focused = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }],
          picker: { focused: rootWorkspaceKey('w2'), recent: [], pinned: [] },
        }),
    })
    await openCreateDialog(focused.container)
    expect(dialogCheckbox().checked).toBe(false)
    expect(dialog().textContent).toContain('切换到新工作区')
    await act(async () => focused.root.unmount())
  })

  it('focuses the group it just created when the switch checkbox is ticked', async () => {
    const focused: string[] = []
    let groups = [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }]
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: groups,
          picker: { focused: rootWorkspaceKey('w2'), recent: [], pinned: [] },
        }),
      createVirtualWorkspace: async (name: string) => {
        groups = [...groups, { id: 'vg2', name, workspaceIds: [] }]
        return snapshot({ workspaceGroups: groups, picker: { focused: '', recent: [], pinned: [] } })
      },
      focusEntry: async (key: string) => {
        focused.push(key)
        return snapshot({
          workspaceGroups: groups,
          picker: { focused: key, recent: [key], pinned: [] },
        })
      },
    })

    await openCreateDialog(container)
    await act(async () => {
      ;(dialog().querySelector('input') as HTMLInputElement).focus()
    })
    const box = dialogCheckbox()
    await act(async () => {
      box.click()
    })
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    const nameInput = dialog().querySelector('input:not([type="checkbox"])') as HTMLInputElement
    await act(async () => {
      setValue?.call(nameInput, '新分组')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      confirmDialog()
      await Promise.resolve()
      await Promise.resolve()
    })

    // 新建的分组排在最后，聚焦的是它（裸 id 拼上 `vw:` 前缀）
    expect(focused).toEqual([rootVirtualKey('vg2')])

    await act(async () => root.unmount())
  })

  it('keeps the current focus when the switch checkbox is left unticked', async () => {
    const focused: string[] = []
    let groups = [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }]
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: groups,
          picker: { focused: rootWorkspaceKey('w2'), recent: [], pinned: [] },
        }),
      createVirtualWorkspace: async (name: string) => {
        groups = [...groups, { id: 'vg2', name, workspaceIds: [] }]
        return snapshot({ workspaceGroups: groups, picker: { focused: '', recent: [], pinned: [] } })
      },
      focusEntry: async (key: string) => {
        focused.push(key)
        return snapshot()
      },
    })

    await openCreateDialog(container)
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    const nameInput = dialog().querySelector('input') as HTMLInputElement
    await act(async () => {
      setValue?.call(nameInput, '新分组')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      confirmDialog()
      await Promise.resolve()
      await Promise.resolve()
    })

    // 没勾就不动聚焦，建组本身照做，但不把用户从当前视野里带走
    expect(focused).toEqual([])

    await act(async () => root.unmount())
  })

  it('cycles the arrow keys through rows, skipping their action buttons', async () => {
    // 行尾三枚按钮不该参与方向键循环，否则按↓会逐枚停在按钮上，走过三条条目要按九次
    // 可聚焦的是「行」这一层
    const { container, root } = await mount({
      loadGroups: async () =>
        snapshot({
          workspaceGroups: [{ id: 'vg1', name: '前端仓库', workspaceIds: ['w1'] }],
          picker: { focused: '', recent: [rootWorkspaceKey('w2')], pinned: [] },
        }),
    })
    await openMenu(container)

    // 按元素身份取序列：
    // 同一个工作区可能同时出现在「最近使用」与「全部」两栏（标签文本因此会重复）
    // 按文本查位置会命中前面那一条
    const rows = Array.from(document.body.querySelectorAll<HTMLElement>('.wg-picker-row'))
    expect(rows.length).toBeGreaterThan(1)

    const press = async (key: string): Promise<void> => {
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key }))
      })
    }
    /** 当前聚焦行在列表里的位置，焦点不在行上时抛错 */
    const at = (): number => {
      const active = document.activeElement as HTMLElement
      if (!active.classList.contains('wg-picker-row')) {
        throw new Error(`focus is on <${active.tagName}.${active.className}>, not a row`)
      }
      return rows.indexOf(active)
    }

    rows[0]?.focus()
    expect(at()).toBe(0)

    // 逐次 ↓ 恰好走过每一条：中间不会停在行尾按钮上
    for (let i = 1; i < rows.length; i++) {
      await press('ArrowDown')
      expect(at()).toBe(i)
    }
    // 到底后回到第一条
    await press('ArrowDown')
    expect(at()).toBe(0)
    // 反向同理：从头回到末尾
    await press('ArrowUp')
    expect(at()).toBe(rows.length - 1)
    // End / Home 到两端
    await press('Home')
    expect(at()).toBe(0)
    await press('End')
    expect(at()).toBe(rows.length - 1)

    await act(async () => root.unmount())
  })

  it('closes the panel on Escape and on an outside pointerdown', async () => {
    const { container, root } = await mount()
    await openMenu(container)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(panel()).toBeNull()

    await openMenu(container)
    await act(async () => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(panel()).toBeNull()

    await act(async () => root.unmount())
  })
})
