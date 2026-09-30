import { describe, expect, it } from 'vitest'
import {
  EMPTY_PICKER_STATE,
  RECENT_HISTORY_LIMIT,
  RECENT_SHOWN,
  normalizePickerState,
  withFocus,
  withPinnedToggled,
  withoutEntry,
} from '../src/pickerState.ts'
import { ALL_ENTRIES, addressKey, normalizeEntryAddress, sameAddress, virtualAddress, workspaceAddress } from '../src/rootEntry.ts'

/**
 * 菜单三份记录（聚焦 / 最近使用 / 置顶）的纯变换
 *
 * 宿主半边与浏览器半边共用这一层，因此这里固化的是两份实现共同依赖的语义：
 * 最近一次聚焦排最前、置顶按最近使用排序、删除对象时三处一起清掉
 */

const W1 = workspaceAddress('w1')
const W2 = workspaceAddress('w2')
const V1 = virtualAddress('vg1')

describe('recent use limits', () => {
  it('shows no more entries than the history can hold', () => {
    // 展示条数被记录上限兜住：调大 RECENT_SHOWN 而不动 RECENT_HISTORY_LIMIT 不会报错，
    // 只是超出的那几格永远空着——这条把两个常量的关系钉住
    expect(RECENT_SHOWN).toBeLessThanOrEqual(RECENT_HISTORY_LIMIT)
  })
})

describe('root entry addresses', () => {
  it('carries the kind so two id spaces cannot collide', () => {
    // 工作区与工作区分组的 id 由不同生成器产出，但仍可能撞值
    // 只存 id 会让一条记录在两种含义之间摇摆
    expect(sameAddress(W1, workspaceAddress('w1'))).toBe(true)
    expect(sameAddress(workspaceAddress('x'), virtualAddress('x'))).toBe(false)
  })

  it('models the "all" state as its own kind rather than a sentinel id', () => {
    expect(ALL_ENTRIES).toEqual({ kind: 'all' })
    expect(sameAddress(ALL_ENTRIES, virtualAddress('all'))).toBe(false)
  })

  it('gives every address a stable string form for React keys', () => {
    expect(addressKey(W1)).toBe('ws:w1')
    expect(addressKey(V1)).toBe('vw:vg1')
    expect(addressKey(ALL_ENTRIES)).toBe('all')
  })

  it('treats a malformed record as unreadable rather than throwing', () => {
    // 记录来自持久化文件，界面必须能在读到一条来路不明的记录时继续渲染
    expect(normalizeEntryAddress(W1)).toEqual({ kind: 'workspace', id: 'w1' })
    expect(normalizeEntryAddress({ kind: 'nope', id: 'x' })).toBeUndefined()
    expect(normalizeEntryAddress({ kind: 'workspace' })).toBeUndefined()
    expect(normalizeEntryAddress('ws:a')).toBeUndefined()
    expect(normalizeEntryAddress(null)).toBeUndefined()
  })
})

describe('normalizePickerState', () => {
  it('fills in every field of a half-written record', () => {
    // 旧版本的宿主可能没有这几格，缺格时不能抛
    expect(normalizePickerState({ recent: [workspaceAddress('a')] })).toEqual({
      focused: ALL_ENTRIES,
      recent: [workspaceAddress('a')],
      pinned: [],
    })
    expect(normalizePickerState(undefined)).toEqual(EMPTY_PICKER_STATE)
  })

  it('drops entries that are not addresses instead of rendering them', () => {
    expect(
      normalizePickerState({
        recent: [workspaceAddress('a'), 3, null, 'ws:b', { kind: 'nope' }, virtualAddress('g')],
      }).recent,
    ).toEqual([workspaceAddress('a'), virtualAddress('g')])
  })

  it('de-duplicates the pinned list', () => {
    // 重复项会在菜单里渲染成同一行两次，而两行点下去是同一件事
    expect(normalizePickerState({ pinned: [W1, workspaceAddress('w1')] }).pinned).toEqual([W1])
  })

  it('caps the history at the storage limit', () => {
    const many = Array.from({ length: RECENT_HISTORY_LIMIT + 10 }, (_, i) => workspaceAddress(`w${i}`))

    expect(normalizePickerState({ recent: many }).recent).toHaveLength(RECENT_HISTORY_LIMIT)
  })
})

describe('withFocus', () => {
  it('puts the newest focus first', () => {
    const state = withFocus(withFocus(EMPTY_PICKER_STATE, W1), W2)

    expect(sameAddress(state.focused, W2)).toBe(true)
    expect(state.recent).toEqual([W2, W1])
  })

  it('moves a repeated focus to the front instead of duplicating it', () => {
    // 最近使用按「最后一次」排序，反复聚焦同一个条目不该把它复制成两条
    const state = withFocus(withFocus(withFocus(EMPTY_PICKER_STATE, W1), W2), workspaceAddress('w1'))

    expect(state.recent).toEqual([W1, W2])
  })

  it('keeps the pinned list untouched', () => {
    const pinned = withPinnedToggled(EMPTY_PICKER_STATE, W1)

    expect(withFocus(pinned, W2).pinned).toEqual([W1])
  })

  it('focuses back to everything through the all address', () => {
    expect(withFocus(withFocus(EMPTY_PICKER_STATE, W1), ALL_ENTRIES).focused).toEqual(ALL_ENTRIES)
  })

  it('leaves the recent history untouched when all is focused', () => {
    // `all` 不对应任何条目，记进历史只会白挤掉一条真实历史
    const state = withFocus(withFocus(EMPTY_PICKER_STATE, W1), ALL_ENTRIES)

    expect(state.recent).toEqual([W1])
  })
})

describe('withPinnedToggled', () => {
  it('pins and unpins through the same method', () => {
    const on = withPinnedToggled(EMPTY_PICKER_STATE, W1)
    expect(on.pinned).toEqual([W1])

    // 去重按值：另造一个内容相同的定位也算同一个条目
    expect(withPinnedToggled(on, workspaceAddress('w1')).pinned).toEqual([])
  })

  it('leaves the focus and the history alone', () => {
    const state = withFocus(EMPTY_PICKER_STATE, W1)
    const toggled = withPinnedToggled(state, W2)

    expect(toggled.focused).toEqual(W1)
    expect(toggled.recent).toEqual([W1])
  })
})

describe('withoutEntry', () => {
  it('clears the entry from all three records', () => {
    // 被删除的对象不该留在任何一个列表里
    const state = { focused: W1, recent: [W1, W2], pinned: [W1, V1] }

    expect(withoutEntry(state, W1)).toEqual({
      focused: ALL_ENTRIES,
      recent: [W2],
      pinned: [V1],
    })
  })

  it('keeps the focus when a different entry disappears', () => {
    const state = { focused: W1, recent: [W1, W2], pinned: [W2] }

    expect(withoutEntry(state, W2)).toEqual({ focused: W1, recent: [W1], pinned: [] })
  })
})
