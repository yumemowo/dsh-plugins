import { describe, expect, it } from 'vitest'
import {
  EMPTY_PICKER_STATE,
  RECENT_HISTORY_LIMIT,
  normalizePickerState,
  withFocus,
  withPinnedToggled,
  withoutEntry,
} from '../src/pickerState.ts'
import { parseRootEntryKey, rootVirtualKey, rootWorkspaceKey } from '../src/rootEntry.ts'

/**
 * 菜单三份记录（聚焦 / 最近使用 / 置顶）的纯变换
 *
 * 宿主半边与浏览器半边共用这一层，因此这里固化的是两份实现共同依赖的语义：
 * 最近一次聚焦排最前、置顶按最近使用排序、删除对象时三处一起清掉
 */

const W1 = rootWorkspaceKey('w1')
const W2 = rootWorkspaceKey('w2')
const V1 = rootVirtualKey('vg1')

describe('root entry keys', () => {
  it('carries the kind in the prefix so two id spaces cannot collide', () => {
    // 工作区与工作区分组的 id 由不同生成器产出，但仍可能撞值
    // 只存 id 会让一条记录在两种含义之间摇摆
    expect(rootWorkspaceKey('x')).toBe('ws:x')
    expect(rootVirtualKey('x')).toBe('vw:x')
    expect(rootWorkspaceKey('x')).not.toBe(rootVirtualKey('x'))
  })

  it('parses back the kind and the id', () => {
    expect(parseRootEntryKey(W1)).toEqual({ kind: 'workspace', id: 'w1' })
    expect(parseRootEntryKey(V1)).toEqual({ kind: 'virtual', id: 'vg1' })
  })

  it('treats an unknown prefix as unparseable rather than throwing', () => {
    // 键来自持久化记录，界面必须能在读到一条来路不明的记录时继续渲染
    expect(parseRootEntryKey('nope')).toBeUndefined()
    expect(parseRootEntryKey('')).toBeUndefined()
  })
})

describe('normalizePickerState', () => {
  it('fills in every field of a half-written record', () => {
    // 旧版本的宿主可能没有这几格，缺格时不能抛
    expect(normalizePickerState({ recent: ['ws:a'] })).toEqual({
      focused: '',
      recent: ['ws:a'],
      pinned: [],
    })
    expect(normalizePickerState(undefined)).toEqual(EMPTY_PICKER_STATE)
  })

  it('drops non-string entries instead of rendering them', () => {
    expect(normalizePickerState({ recent: ['ws:a', 3, null, 'ws:b'] }).recent).toEqual([
      'ws:a',
      'ws:b',
    ])
  })

  it('de-duplicates the pinned list', () => {
    // 重复项会在菜单里渲染成同一行两次，而两行点下去是同一件事
    expect(normalizePickerState({ pinned: [W1, W1] }).pinned).toEqual([W1])
  })

  it('caps the history at the storage limit', () => {
    const many = Array.from({ length: RECENT_HISTORY_LIMIT + 10 }, (_, i) => rootWorkspaceKey(`w${i}`))

    expect(normalizePickerState({ recent: many }).recent).toHaveLength(RECENT_HISTORY_LIMIT)
  })
})

describe('withFocus', () => {
  it('puts the newest focus first', () => {
    const state = withFocus(withFocus(EMPTY_PICKER_STATE, W1), W2)

    expect(state.focused).toBe(W2)
    expect(state.recent).toEqual([W2, W1])
  })

  it('moves a repeated focus to the front instead of duplicating it', () => {
    // 最近使用按「最后一次」排序，反复聚焦同一个条目不该把它复制成两条
    const state = withFocus(withFocus(withFocus(EMPTY_PICKER_STATE, W1), W2), W1)

    expect(state.recent).toEqual([W1, W2])
  })

  it('keeps the pinned list untouched', () => {
    const pinned = withPinnedToggled(EMPTY_PICKER_STATE, W1)

    expect(withFocus(pinned, W2).pinned).toEqual([W1])
  })

  it('accepts the empty key as a focus back to everything', () => {
    expect(withFocus(withFocus(EMPTY_PICKER_STATE, W1), '').focused).toBe('')
  })
})

describe('withPinnedToggled', () => {
  it('pins and unpins through the same method', () => {
    const on = withPinnedToggled(EMPTY_PICKER_STATE, W1)
    expect(on.pinned).toEqual([W1])

    expect(withPinnedToggled(on, W1).pinned).toEqual([])
  })

  it('leaves the focus and the history alone', () => {
    const state = withFocus(EMPTY_PICKER_STATE, W1)
    const toggled = withPinnedToggled(state, W2)

    expect(toggled.focused).toBe(W1)
    expect(toggled.recent).toEqual([W1])
  })
})

describe('withoutEntry', () => {
  it('clears the entry from all three records', () => {
    // 被删除的对象不该留在任何一个列表里
    const state = { focused: W1, recent: [W1, W2], pinned: [W1, V1] }

    expect(withoutEntry(state, W1)).toEqual({ focused: '', recent: [W2], pinned: [V1] })
  })

  it('keeps the focus when a different entry disappears', () => {
    const state = { focused: W1, recent: [W1, W2], pinned: [W2] }

    expect(withoutEntry(state, W2)).toEqual({ focused: W1, recent: [W1], pinned: [] })
  })
})
