import { describe, expect, it } from 'vitest'
import { COMPARE_TAB_ID, registerCompareTab } from '../src/client/compare.ts'
import type { RegionActions } from '../src/client/compare.ts'
import type { Context } from '@deepseek-ai/cordis'

/** 造一份最小可用的注入动作与文案。 */
function actions(): RegionActions {
  return {
    openSession: () => {},
    startSession: () => {},
    onReady: () => () => {},
    loadGroups: async () => ({}),
    createGroup: async () => {},
    renameGroup: async () => {},
    deleteGroup: async () => {},
    moveSession: async () => {},
    renameWorkspace: async () => {},
    deleteWorkspace: async () => {},
    labels: {
      title: '工作区',
      newGroup: '新建分组',
      newSessionIn: (name: string) => `在「${name}」中新建会话`,
      workspaceActions: (name: string) => `工作区「${name}」的操作`,
      renameWorkspace: '重命名工作区',
      deleteWorkspace: '删除工作区',
      confirmDeleteWorkspace: (name: string) => `删除工作区「${name}」？`,
      workspaceNamePrompt: '工作区名称',
      workspaceConflict: (name: string) => `已存在名为「${name}」的工作区。`,
      ungrouped: '未分组',
      groupNamePrompt: '分组名称',
      renameGroup: '重命名分组',
      deleteGroup: '删除分组',
      confirmDeleteGroup: () => '删除该分组？',
      confirmLabel: '确定',
      cancelLabel: '取消',
      closeLabel: '关闭',
      sessionActions: '会话操作',
      moveToGroup: '分组',
      ungroup: '取消分组',
      compareTabDescription: '对照视图',
      empty: '暂无会话',
      unimplemented: '实验特性',
    },
  }
}

/** 造一个记录 tab 注册与打开的 betterSidebar。 */
function fakeSidebar() {
  const registered: {
    id: string
    title: string | (() => string)
    description?: string | (() => string)
    order?: number
    single?: boolean
    component: (props: { ctx: Context }) => unknown
  }[] = []
  const opened: { type: string; target?: string }[] = []
  return {
    registered,
    opened,
    service: {
      registerTab: (descriptor: (typeof registered)[number]) => {
        registered.push(descriptor)
        return () => {}
      },
      openTab: (seed: { type: string; target?: string }) => {
        opened.push(seed)
      },
    },
  }
}

/** 造一个把注入依赖立即视为就绪的客户端 context。 */
function fakeContext(options: { betterSidebar?: unknown } = {}): Context {
  const services: Record<string, unknown> = {
    betterSidebar: options.betterSidebar,
  }
  return {
    get: (name: string) => services[name],
    inject: (_deps: string[], callback: (ctx: { get: (name: string) => unknown }) => unknown) => {
      const dispose = callback({ get: (name: string) => services[name] })
      return { dispose: async () => { void dispose } }
    },
  } as unknown as Context
}

describe('registerCompareTab', () => {
  it('registers the compare tab under its own id', () => {
    const sidebar = fakeSidebar()
    registerCompareTab(fakeContext({ betterSidebar: sidebar.service }), actions())

    expect(sidebar.registered.map((tab) => tab.id)).toEqual([COMPARE_TAB_ID])
  })

  it('opens the registered tab in the right sidebar', () => {
    const sidebar = fakeSidebar()
    registerCompareTab(fakeContext({ betterSidebar: sidebar.service }), actions())

    // 右侧栏是 DSH 原生列；落到 bottom 会变成 better-sidebar 自己的底部面板。
    expect(sidebar.opened).toEqual([{ type: COMPARE_TAB_ID, target: 'right' }])
  })

  it('makes the tab single-instance so repeated opens focus the same one', () => {
    const sidebar = fakeSidebar()
    registerCompareTab(fakeContext({ betterSidebar: sidebar.service }), actions())

    expect(sidebar.registered[0]?.single).toBe(true)
  })

  it('reads its copy through thunks so a language switch needs no re-registration', () => {
    const sidebar = fakeSidebar()
    registerCompareTab(fakeContext({ betterSidebar: sidebar.service }), actions())

    const tab = sidebar.registered[0]
    expect(typeof tab?.title).toBe('function')
    expect(typeof tab?.description).toBe('function')
  })

  it('skips registration when better-sidebar is absent', () => {
    const sidebar = fakeSidebar()
    // 没装 better-sidebar 时不该抛错，宿主半边与存储照常工作。
    expect(() => registerCompareTab(fakeContext(), actions())).not.toThrow()
    expect(sidebar.registered).toEqual([])
  })
})
