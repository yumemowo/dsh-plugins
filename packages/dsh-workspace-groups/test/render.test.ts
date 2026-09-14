import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { WorkspaceGroupsRegion } from '../src/client/region.ts'
import type { WorkspaceGroupsProps } from '../src/client/region.ts'

/**
 * 区域组件的渲染冒烟。
 *
 * node 环境没有 react-dom，这里用一个最小 dispatcher 直接调用函数组件，
 * 验证渲染期不抛错、关键结构（工作区菜单、隐式「未分组」区段、行尾菜单
 * 数量）符合预期。类型检查看不到 hook 调用次序与结构分支这类问题。
 *
 * 测试替身把 Menu 渲染成 null，因此按 props 形状识别菜单元素而不下钻。
 */
const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

const dispatcher = {
  useState: (initial: unknown) => [typeof initial === 'function' ? (initial as () => unknown)() : initial, () => {}],
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (fn: () => unknown) => fn(),
}

/** 渲染整棵树；Menu 元素被收集起来而不下钻（stub 返回 null）。 */
function render(node: unknown, out: { menus: unknown[]; text: string[] }): void {
  const walk = (n: unknown): void => {
    if (n === null || n === undefined || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') {
      out.text.push(String(n))
      return
    }
    if (Array.isArray(n)) {
      for (const child of n) walk(child)
      return
    }
    if (!React.isValidElement(n)) return
    const el = n as React.ReactElement & { type: unknown; props: Record<string, unknown> }
    if (typeof el.type === 'function') {
      // 测试替身把 Menu 渲染成 null，因此按 props 形状识别，而不是函数名。
      if (Array.isArray(el.props.items) && el.props.anchor !== undefined) {
        out.menus.push(el)
        return
      }
      const prev = internals.ReactCurrentDispatcher.current
      internals.ReactCurrentDispatcher.current = dispatcher
      let rendered: unknown
      try {
        rendered = (el.type as (p: unknown) => unknown)(el.props)
      } finally {
        internals.ReactCurrentDispatcher.current = prev
      }
      walk(rendered)
      return
    }
    walk(el.props.children as unknown)
  }
  walk(node)
}

/** 把所有已渲染 Menu 的条目 id 读出来。 */
function menuItems(out: { menus: unknown[] }): string[][] {
  return out.menus.map((m) =>
    ((m as { props: { items: { id: string }[] } }).props.items).map((item) => item.id),
  )
}

function props(wide: boolean): WorkspaceGroupsProps {
  const byId: Record<string, unknown> = {
    a: { id: 'a', displayTitle: 'A', running: false, blank: false, updatedAt: 0 },
    orphan: { id: 'orphan', displayTitle: 'Orphan', running: false, blank: false, updatedAt: 0 },
  }
  const workspaces = [
    {
      workspaceId: 'w1',
      path: '/tmp/w1',
      title: 'W1',
      sessionIds: ['a'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ]
  return {
    wide,
    expandSidebar: () => {},
    useWorkspaces: ((select: (s: unknown) => unknown) =>
      select({ items: workspaces, archivedSessionIds: [] })) as never,
    useSessions: ((select: (s: unknown) => unknown) =>
      select({ ids: ['a', 'orphan'], byId, current: undefined, phase: 'ready' })) as never,
    openSession: () => {},
    startSession: () => {},
    loadGroups: async () => ({ w1: [{ id: 'g1', name: '前端', sessionIds: [] }] }),
    onReady: () => () => {},
    createGroup: async () => {},
    renameGroup: async () => {},
    deleteGroup: async () => {},
    moveSession: async () => {},
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    labels: {
      title: '工作区',
      newGroup: '新建分组',
      newSessionIn: (n) => `在「${n}」中新建会话`,
      workspaceActions: (n) => `工作区「${n}」的操作`,
      renameWorkspace: '重命名工作区',
      deleteWorkspace: '删除工作区',
      confirmDeleteWorkspace: (n) => `删除工作区「${n}」？`,
      workspaceNamePrompt: '工作区名称',
      workspaceConflict: (n) => `已存在名为「${n}」的工作区。`,
      ungrouped: '未分组',
      groupNamePrompt: '分组名称',
      renameGroup: '重命名分组',
      deleteGroup: '删除分组',
      confirmDeleteGroup: (n) => `删除分组「${n}」？`,
      confirmLabel: '确定',
      cancelLabel: '取消',
      closeLabel: '关闭',
      sessionActions: '会话操作',
      moveToGroup: '分组',
      ungroup: '取消分组',
      compareTabDescription: '对照',
      empty: '暂无会话',
      unimplemented: '实验特性',
    },
  }
}

describe('WorkspaceGroupsRegion render', () => {
  it('renders the wide region without throwing', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    expect(() => render(React.createElement(WorkspaceGroupsRegion, props(true)), out)).not.toThrow()

    // 每个工作区行一个菜单；未分组区段的会话行没有菜单。
    expect(menuItems(out)).toContainEqual(['new-group', 'rename', 'delete'])
  })

  it('renders an ungrouped section only when a stray session exists', () => {
    const withStray = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), withStray)
    // 孤会话（无所属工作区）应落在「未分组」区段里。
    expect(withStray.text).toContain('未分组')
    expect(withStray.text).toContain('Orphan')

    const none = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(false)), none)
    expect(none.text).not.toContain('未分组')
  })

  it('gives the ungrouped row no more-actions menu', () => {
    const out = { menus: [] as unknown[], text: [] as string[] }
    render(React.createElement(WorkspaceGroupsRegion, props(true)), out)

    // 只有工作区行与归组会话行带菜单；stray 行没有可用的归组操作。
    expect(menuItems(out)).toHaveLength(2)
  })
})
