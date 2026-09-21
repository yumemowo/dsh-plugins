import { describe, expect, it } from 'vitest'
import {
  focusedLayout,
  pickerSections,
  resolveFocus,
  rootPickerEntries,
} from '../src/client/data/picker.ts'
import { RECENT_HISTORY_LIMIT, RECENT_SHOWN } from '../src/pickerState.ts'
import { rootVirtualKey, rootWorkspaceKey } from '../src/rootEntry.ts'

/**
 * 下拉菜单的条目与分区
 *
 * 菜单只列根节点单元格：工作区分组与未归组的独立工作区。分组内部的工作区不进菜单
 * 因此这里的断言同时守住「菜单不会长出与列表层级重复的一层」
 */

/** 造一个工作区视图；只有标题会被菜单读到 */
function view(id: string, title: string): { workspaceId: string; title: string } {
  return { workspaceId: id, title }
}

/** 把工作区列表收成 `rootPickerEntries` 要的索引 */
function index(...items: { workspaceId: string; title: string }[]) {
  return new Map(items.map((item) => [item.workspaceId, item as never]))
}

const LAYOUT = {
  groups: [
    { id: 'vg1', label: '前端仓库', workspaceIds: ['w1', 'w2'] },
    { id: 'vg2', label: '空组', workspaceIds: [] },
  ],
  loose: ['w3', 'w4'],
}
const VIEWS = index(view('w1', 'W1'), view('w2', 'W2'), view('w3', 'W3'), view('w4', 'W4'))

describe('rootPickerEntries', () => {
  it('lists the root cells in list order', () => {
    // 「全部」分区要与列表逐行对应：先是各分组，再是未归组的独立工作区
    expect(rootPickerEntries(LAYOUT, VIEWS)).toEqual([
      { key: rootVirtualKey('vg1'), id: 'vg1', label: '前端仓库', kind: 'virtual' },
      { key: rootVirtualKey('vg2'), id: 'vg2', label: '空组', kind: 'virtual' },
      { key: rootWorkspaceKey('w3'), id: 'w3', label: 'W3', kind: 'workspace' },
      { key: rootWorkspaceKey('w4'), id: 'w4', label: 'W4', kind: 'workspace' },
    ])
  })

  it('never lists a workspace that is inside a group', () => {
    // 组内的 W1 / W2 不单独列出：聚焦它们与聚焦所属分组是同一片内容
    const keys = rootPickerEntries(LAYOUT, VIEWS).map((entry) => entry.key)

    expect(keys).not.toContain(rootWorkspaceKey('w1'))
    expect(keys).not.toContain(rootWorkspaceKey('w2'))
  })

  it('skips a workspace the snapshot no longer has', () => {
    // 布局与工作区快照可能短暂不一致，缺视图时跳过而不是渲染一个无名条目
    const entries = rootPickerEntries(LAYOUT, index(view('w3', 'W3')))

    expect(entries.map((entry) => entry.key)).toEqual([
      rootVirtualKey('vg1'),
      rootVirtualKey('vg2'),
      rootWorkspaceKey('w3'),
    ])
  })

  it('reports nothing for an empty root', () => {
    expect(rootPickerEntries({ groups: [], loose: [] }, VIEWS)).toEqual([])
  })
})

describe('pickerSections', () => {
  const entries = rootPickerEntries(LAYOUT, VIEWS)

  it('shows the recent entries newest first and caps the shown count', () => {
    // 记录里可以有很多条（置顶区排序要用到），但「最近使用」只展示前几条
    const recent = Array.from({ length: RECENT_HISTORY_LIMIT }, () => rootWorkspaceKey('w3'))
    const sections = pickerSections(entries, {
      focused: '',
      recent: [rootWorkspaceKey('w4'), ...recent],
      pinned: [],
    })

    expect(sections.recent[0]).toEqual({
      key: rootWorkspaceKey('w4'),
      id: 'w4',
      label: 'W4',
      kind: 'workspace',
    })
    expect(sections.recent).toHaveLength(RECENT_SHOWN)
  })

  it('drops recorded entries that no longer exist', () => {
    const sections = pickerSections(entries, {
      focused: '',
      recent: [rootWorkspaceKey('gone'), rootWorkspaceKey('w3')],
      pinned: [rootVirtualKey('vg-gone'), rootVirtualKey('vg1')],
    })

    expect(sections.recent.map((entry) => entry.label)).toEqual(['W3'])
    expect(sections.pinned.map((entry) => entry.label)).toEqual(['前端仓库'])
  })

  it('orders the pinned section by recent use, never-used last', () => {
    // 「置顶按最近使用顺序排序」：记录里的位置就是「上一次用到它是多久以前」
    // 从没用过的（没进 recent）排在最后
    const sections = pickerSections(entries, {
      focused: '',
      recent: [rootWorkspaceKey('w4'), rootVirtualKey('vg1')],
      pinned: [rootWorkspaceKey('w3'), rootWorkspaceKey('w4'), rootVirtualKey('vg1')],
    })

    expect(sections.pinned.map((entry) => entry.label)).toEqual(['W4', '前端仓库', 'W3'])
  })

  it('keeps the pinned order stable among entries with no history', () => {
    const sections = pickerSections(entries, {
      focused: '',
      recent: [],
      pinned: [rootWorkspaceKey('w4'), rootWorkspaceKey('w3')],
    })

    expect(sections.pinned.map((entry) => entry.label)).toEqual(['W4', 'W3'])
  })

  it('gives the all section the full list in display order', () => {
    const sections = pickerSections(entries, { focused: '', recent: [], pinned: [] })

    expect(sections.all.map((entry) => entry.label)).toEqual(['前端仓库', '空组', 'W3', 'W4'])
  })
})

describe('resolveFocus', () => {
  const entries = rootPickerEntries(LAYOUT, VIEWS)

  it('finds the entry a key points at', () => {
    expect(resolveFocus(entries, rootVirtualKey('vg1'))?.label).toBe('前端仓库')
    expect(resolveFocus(entries, rootWorkspaceKey('w3'))?.label).toBe('W3')
  })

  it('treats the empty key as no focus', () => {
    expect(resolveFocus(entries, '')).toBeUndefined()
  })

  it('treats a key whose target is gone as no focus', () => {
    // 记录比列表活得久：聚焦的条目被删掉之后不能继续按那个键过滤
    // 否则列表整片空掉而第二行还写着一个不存在的名字
    expect(resolveFocus(entries, rootWorkspaceKey('gone'))).toBeUndefined()
    expect(resolveFocus(entries, rootVirtualKey('gone'))).toBeUndefined()
  })
})

describe('focusedLayout', () => {
  const entries = rootPickerEntries(LAYOUT, VIEWS)

  it('returns the whole layout when nothing is focused', () => {
    expect(focusedLayout(LAYOUT, entries, '')).toEqual(LAYOUT)
  })

  it('returns only the group members when a group is focused', () => {
    const layout = focusedLayout(LAYOUT, entries, rootVirtualKey('vg1'))

    // 组头不再重复渲染（第二行已经写着组名），因此 groups 是空的
    expect(layout).toEqual({ groups: [], loose: ['w1', 'w2'] })
  })

  it('returns only that workspace when a loose workspace is focused', () => {
    const layout = focusedLayout(LAYOUT, entries, rootWorkspaceKey('w4'))

    expect(layout).toEqual({ groups: [], loose: ['w4'] })
  })

  it('drops a focused group that is no longer a root cell', () => {
    // 工作区被移进某个分组后就不再是 root 单元格，聚焦它的记录随之失效
    const layout = focusedLayout(LAYOUT, entries, rootWorkspaceKey('w1'))

    expect(layout).toEqual(LAYOUT)
  })

  it('falls back to the whole layout when the focused key is unknown', () => {
    // 记录被手改过：退回整片内容，而不是渲染一个空列表
    expect(focusedLayout(LAYOUT, entries, 'nonsense')).toEqual(LAYOUT)
  })

  it('renders an empty group as an empty focused list', () => {
    // 空分组是通常状态，聚焦它得到空列表是正确的：列表里没有东西可显示
    expect(focusedLayout(LAYOUT, entries, rootVirtualKey('vg2'))).toEqual({
      groups: [],
      loose: [],
    })
  })
})
