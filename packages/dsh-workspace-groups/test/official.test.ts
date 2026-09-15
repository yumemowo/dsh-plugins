import { describe, expect, it } from 'vitest'
import { officialSessionLabels, timeLabel } from '../src/client/official.ts'
import { workspaceTranslate } from './locale-stub.ts'

/**
 * 官方 `workspace` 语言包的替身在 `locale-stub.ts`：它按官方键名手写，
 * 官方改键名时这里不会静默通过——真实代码里那份是类型约束的
 * `TranslateNS<'workspace'>`
 */
describe('officialSessionLabels', () => {
  it('reads every label from the official workspace dictionary', () => {
    const labels = officialSessionLabels(workspaceTranslate())

    expect(labels).toEqual({
      rename: '重命名',
      renameTitle: '重命名会话',
      sessionNamePrompt: '会话名称',
      fork: '分叉会话',
      archive: '归档会话',
    })
  })
})

describe('timeLabel', () => {
  const t = workspaceTranslate()
  const now = 1_700_000_000_000

  it('labels sub-minute distances as the now bucket', () => {
    expect(timeLabel(now - 30_000, now, t)).toBe('刚刚')
  })

  it('labels minute distances with the minute template', () => {
    expect(timeLabel(now - 5 * 60_000, now, t)).toBe('5分钟')
  })

  it('labels hour distances with the hour template', () => {
    expect(timeLabel(now - 3 * 60 * 60_000, now, t)).toBe('3小时')
  })

  it('labels day distances with the day template', () => {
    expect(timeLabel(now - 2 * 24 * 60 * 60_000, now, t)).toBe('2天')
  })

  it('formats against an explicit now rather than the wall clock', () => {
    const earlier = now - 10 * 60_000

    // 基准时刻是入参：官方在渲染时取 Date.now()，本包把这一刻传进来，因此
    // 同一个 updatedAt 在不同 now 下读出不同的文案
    expect(timeLabel(earlier, now, t)).toBe('10分钟')
    expect(timeLabel(earlier, now + 60 * 60_000, t)).toBe('1小时')
  })
})
