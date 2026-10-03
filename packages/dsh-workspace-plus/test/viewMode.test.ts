import { afterEach, describe, expect, it } from 'vitest'
import {
  VIEW_MODE_PERSIST_KEY,
  createViewModeStore,
  expandedAt,
  indicatorOf,
  modeOf,
  sessionGroupExpansionOf,
  sessionGroupKey,
  sharedViewModeStore,
  virtualExpansionOf,
  workspaceExpansionOf,
} from '../src/client/store/viewMode.ts'

/**
 * 展示方式、指示器样式与三层折叠态的存储
 *
 * 这些状态都是浏览器本地偏好：初值给默认、写下去即持久化、刷新后读回来
 * 对照模式下区域挂在会话作用域的座位上，因此还要守住「两条路径读的是同一份设置」这一条
 *
 * 折叠态是三态：缺键表示「用户从未碰过」，生效值由消费侧按结构现推，因此这里只断言记录与归一化的缺省
 */

afterEach(() => {
  // localStorage 在 node 测试环境里不存在，删掉可能残留的替身
  delete (globalThis as { localStorage?: unknown }).localStorage
})

/** 装一个最小的 localStorage，行为与浏览器的这一部分一致 */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
    },
  })
  return entries
}

/** 初值：三份空展开表加上置顶区的三个默认值，写进断言里省得每处重复一遍 */
const EMPTY_EXPANSION = {
  mode: 'workspace',
  indicator: 'icon',
  expansion: { workspace: {}, virtualWorkspace: {}, group: {} },
  pinOverflow: 'expand',
  pinScope: 'section',
  pinSectionCollapsed: false,
}

describe('view mode store', () => {
  it('starts on the grouped view with the icon indicator', () => {
    expect(createViewModeStore().create().getSnapshot()).toEqual(EMPTY_EXPANSION)
  })

  it('persists the picked mode under its own key', () => {
    const entries = installStorage()
    const instance = createViewModeStore().create()

    instance.actions.setMode('flat')

    expect(entries.get(VIEW_MODE_PERSIST_KEY)).toBe(JSON.stringify({ ...EMPTY_EXPANSION, mode: 'flat' }))
  })

  it('reads the persisted mode back on the next instance', () => {
    // 刷新页面后要停在上次选的方式上，否则每次重载都要重选一遍
    installStorage()
    createViewModeStore().create().actions.setMode('flat')

    expect(createViewModeStore().create().getSnapshot()).toEqual({ ...EMPTY_EXPANSION, mode: 'flat' })
  })

  it('falls back per field when the stored payload predates the indicator', () => {
    // 早于指示器那格写入的 JSON 里没有 indicator，引擎读盘时整份替换状态、不给合并钩子
    // 读取处一律走 modeOf / indicatorOf，因此老数据只会让缺的那格落到默认值，不会变成 undefined
    const entries = installStorage()
    entries.set(VIEW_MODE_PERSIST_KEY, JSON.stringify({ mode: 'flat' }))

    const state = createViewModeStore().create().getSnapshot()

    expect(modeOf(state)).toBe('flat')
    expect(indicatorOf(state)).toBe('icon')
  })

  it('keeps the stored key apart from the official workspace view store', () => {
    // 官方 ui-workspace 的 groupBy 存在 dsh.workspace.view.* 下，两者是两套独立的界面状态
    expect(VIEW_MODE_PERSIST_KEY.startsWith('dsh.workspace.view.')).toBe(false)
  })

  it('hands out one instance through the shared handle', () => {
    // 对照模式下座位是会话作用域的，渲染器会按会话反复调 create
    // 共享句柄让那些调用都落回同一个实例，展示方式因此不按会话分开存
    installStorage()
    const handle = sharedViewModeStore(createViewModeStore())
    const first = handle.create()
    const second = handle.create('session-a')

    expect(second).toBe(first)
    first.actions.setMode('flat')
    expect(second.getSnapshot()).toEqual({ ...EMPTY_EXPANSION, mode: 'flat' })
  })

  it('scopes the persist key by session only when the handle allows it', () => {
    // 共享实例建在根作用域上，因此持久化键不带会话后缀
    const entries = installStorage()
    sharedViewModeStore(createViewModeStore()).create('session-a').actions.setMode('flat')

    expect([...entries.keys()]).toEqual([VIEW_MODE_PERSIST_KEY])
  })

  it('records an explicit expansion choice per layer', () => {
    // 三格各存各的：写一层不动另外两层，会话分组那格落的是编码后的键
    // 断言里写死那份格式是有意的——它是持久化身份，改它等于丢掉用户已有的记录，因此要在这里钉住
    installStorage()
    const { actions, getSnapshot } = createViewModeStore().create()

    actions.setWorkspaceExpanded('w1', false)
    actions.setVirtualWorkspaceExpanded('wg1', false)
    actions.setSessionGroupExpanded({ workspaceId: 'w1', groupId: 'g1' }, true)

    expect(workspaceExpansionOf(getSnapshot())).toEqual({ w1: false })
    expect(virtualExpansionOf(getSnapshot())).toEqual({ wg1: false })
    expect(sessionGroupExpansionOf(getSnapshot())).toEqual({ 'w1:g1': true })
  })

  it('fills in the expansion object when the stored payload predates it', () => {
    // 早于折叠态写入的那份 JSON 里连 `expansion` 这一格都没有
    // 写入要能就地补出整条路径，否则用户的第一次点击会静默丢掉
    const entries = installStorage()
    entries.set(VIEW_MODE_PERSIST_KEY, JSON.stringify({ mode: 'flat', indicator: 'icon' }))
    const { actions, getSnapshot } = createViewModeStore().create()

    actions.setWorkspaceExpanded('w1', false)

    expect(workspaceExpansionOf(getSnapshot())).toEqual({ w1: false })
    expect(modeOf(getSnapshot())).toBe('flat')
  })

  it('normalizes every layer to an empty record when the payload predates folding', () => {
    // 缺口时消费侧读到的是空表，而不是 undefined 漏进渲染
    const entries = installStorage()
    entries.set(VIEW_MODE_PERSIST_KEY, JSON.stringify({ mode: 'flat', indicator: 'bar' }))

    const state = createViewModeStore().create().getSnapshot()

    expect(workspaceExpansionOf(state)).toEqual({})
    expect(virtualExpansionOf(state)).toEqual({})
    expect(sessionGroupExpansionOf(state)).toEqual({})
  })

  it('drops the workspace keys that no longer exist and keeps the rest', () => {
    installStorage()
    const { actions, getSnapshot } = createViewModeStore().create()
    actions.setWorkspaceExpanded('w1', false)
    actions.setWorkspaceExpanded('w2', true)
    // 哨兵键代表末尾的「未分组」桶，它没有真实 workspaceId，但必须留着
    actions.setWorkspaceExpanded('', false)

    actions.retainWorkspaceKeys(['', 'w1'])

    expect(workspaceExpansionOf(getSnapshot())).toEqual({ w1: false, '': false })
  })

  it('leaves the expansion object untouched when nothing has been recorded', () => {
    // 一层都没碰过时整格缺席，清理不该平白写入一份空表
    installStorage()
    const instance = createViewModeStore().create()

    instance.actions.retainWorkspaceKeys(['w1'])

    expect(workspaceExpansionOf(instance.getSnapshot())).toEqual({})
  })

  it('reads a key through the structure-derived default when it is absent', () => {
    // 三态语义的收口：显式选择优先，缺键时落到调用方给的默认
    expect(expandedAt({ w1: false }, 'w1', true)).toBe(false)
    expect(expandedAt({}, 'w1', true)).toBe(true)
    expect(expandedAt({}, 'w1', false)).toBe(false)
  })

  it('survives keys written by another version or another shape', () => {
    // 键来自持久化记录：手改过的、或早先版本留下的键都不能让读取抛错
    // 归一化只兜 `undefined`（`??`），因此这里不承诺把非法形状修成合法值，只承诺读取与查询不炸
    // 未知的键不会被任何一次查询命中，一律落到调用方给的默认
    const entries = installStorage()
    entries.set(
      VIEW_MODE_PERSIST_KEY,
      JSON.stringify({
        mode: 'flat',
        indicator: 'bar',
        expansion: {
          // 三格混进了别的形状：多个未知键、一个数组、一个 null
          workspace: { '': true, 'ws:w1': false, w1: 'yes' },
          virtualWorkspace: [],
          group: null,
        },
      }),
    )

    const state = createViewModeStore().create().getSnapshot()

    expect(() => {
      workspaceExpansionOf(state)
      virtualExpansionOf(state)
      sessionGroupExpansionOf(state)
    }).not.toThrow()
    // 形状对的那一格照原样读出，查询只认命中的键
    expect(workspaceExpansionOf(state)['ws:w1']).toBe(false)
    expect(expandedAt(workspaceExpansionOf(state), 'ws:w1', true)).toBe(false)
    // 没命中过的键落到调用方给的默认
    expect(expandedAt(workspaceExpansionOf(state), 'never-seen', false)).toBe(false)
    expect(expandedAt(workspaceExpansionOf(state), 'never-seen', true)).toBe(true)
  })

  it('encodes a session group coordinate into its persisted key', () => {
    // 编码只此一处，格式由这条用例钉住：它同时是 localStorage 里的键，改名 / 改分隔符都等于丢记录
    expect(sessionGroupKey({ workspaceId: 'w1', groupId: 'g1' })).toBe('w1:g1')
    // 工作区不同、分组 id 相同是两条不同的记录——分组 id 只在自己那个工作区内唯一
    expect(sessionGroupKey({ workspaceId: 'w1', groupId: 'g1' })).not.toBe(
      sessionGroupKey({ workspaceId: 'w2', groupId: 'g1' }),
    )
  })
})
