import { describe, expect, it } from 'vitest'
import { officialSessionLabels, relativeTimeLabel } from '../src/client/official.ts'
import type { WorkspaceTranslate } from '../src/client/official.ts'

/**
 * 官方 `workspace` 语言包的替身。
 *
 * 键名与官方 `dsh-client-ui-workspace` 的字典一致；测试因此在官方改键名时
 * 不会静默通过——真实代码里那份是类型约束的 `TranslateNS<'workspace'>`。
 */
function translate(): WorkspaceTranslate {
  const dict: Record<string, string> = {
    rename: '重命名',
    'rename.session.title': '重命名会话',
    'field.sessionName': '会话名称',
    'menu.fork': '分叉会话',
    'menu.archiveSession': '归档会话',
    // close / cancel 来自 common 命名空间的回退链。
    close: '关闭',
    cancel: '取消',
    'time.now': '刚刚',
    'time.minutes': '{n}分钟',
    'time.hours': '{n}小时',
    'time.days': '{n}天',
    'time.months': '{n}个月',
    'time.years': '{n}年',
  }
  return ((key: string, params?: Record<string, unknown>) => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    )
  }) as WorkspaceTranslate
}

describe('officialSessionLabels', () => {
  it('reads every label from the official workspace dictionary', () => {
    const labels = officialSessionLabels(translate())

    expect(labels).toEqual({
      rename: '重命名',
      renameTitle: '重命名会话',
      sessionNamePrompt: '会话名称',
      fork: '分叉会话',
      archive: '归档会话',
      closeLabel: '关闭',
      cancelLabel: '取消',
    })
  })
})

describe('relativeTimeLabel', () => {
  const t = translate()
  const now = 1_700_000_000_000

  it('labels sub-minute distances as the now bucket', () => {
    expect(relativeTimeLabel(now - 30_000, now, t)).toBe('刚刚')
  })

  it('labels minute distances with the minute template', () => {
    expect(relativeTimeLabel(now - 5 * 60_000, now, t)).toBe('5分钟')
  })

  it('labels hour distances with the hour template', () => {
    expect(relativeTimeLabel(now - 3 * 60 * 60_000, now, t)).toBe('3小时')
  })

  it('labels day distances with the day template', () => {
    expect(relativeTimeLabel(now - 2 * 24 * 60 * 60_000, now, t)).toBe('2天')
  })

  it('clamps a future timestamp to the now bucket', () => {
    // 时钟回拨或宿主时间超前时不该出现负数。
    expect(relativeTimeLabel(now + 60_000, now, t)).toBe('刚刚')
  })
})
