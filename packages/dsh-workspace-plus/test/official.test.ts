import { describe, expect, it } from 'vitest'
import {
  officialAddLabels,
  officialHoverLabels,
  officialSearchLabels,
  officialSessionLabels,
  timeLabel,
} from '../src/client/official.ts'
import { workspaceTranslate } from './locale-stub.ts'

/**
 * 官方 `workspace` 语言包的替身在 `locale-stub.ts`：它按官方键名手写
 * 官方改键名时这里不会静默通过，真实代码里那份是受 `TranslateNS<'workspace'>` 类型约束的
 */
describe('officialSessionLabels', () => {
  it('reads every label from the official workspace dictionary', () => {
    const labels = officialSessionLabels(workspaceTranslate())

    expect(labels).toEqual({
      pin: '置顶会话',
      unpin: '取消置顶',
      rename: '重命名',
      renameTitle: '重命名会话',
      sessionNamePrompt: '会话名称',
      fork: '分叉会话',
      archive: '归档会话',
    })
  })
})

describe('officialAddLabels', () => {
  it('reads the header entry and the flow error copy from the official dictionary', () => {
    expect(officialAddLabels(workspaceTranslate())).toEqual({
      // header 入口用 workspace.add，menu.addWorkspace 是工作区列表菜单里的那一项
      add: '添加工作区',
      folderErrorTitle: '无法打开文件夹',
      folderErrorRetry: '重新选择',
      viewOptions: '视图选项',
    })
  })

  it('does not confuse the header entry with the workspace menu item', () => {
    // 两个键官方都提供，但语义不同：菜单项带省略号，表示还要再选一次
    expect(workspaceTranslate()('workspace.add')).toBe('添加工作区')
    expect(workspaceTranslate()('menu.addWorkspace')).toBe('添加工作区…')
  })
})

describe('officialSearchLabels', () => {
  it('reads the search entry, input and result copy from the official dictionary', () => {
    const labels = officialSearchLabels(workspaceTranslate())

    expect(labels.entry).toBe('搜索会话')
    expect(labels.placeholder).toBe('搜索会话…')
    expect(labels.clear).toBe('清除搜索')
    expect(labels.results).toBe('搜索结果')
    expect(labels.noMatches).toBe('无匹配会话')
    // 上限由调用方传入，官方那句模板里带 {n}
    expect(labels.truncated(20)).toBe('仅显示前 20 条结果，请缩小搜索范围。')
  })

  it('takes the entry tooltip from the shared common word, not the object-named key', () => {
    // 官方入口按钮的 tooltip 用通用词「搜索」（common 命名空间，由查找链兜住）
    // 无障碍标签才点明对象，两者不是同一个键
    expect(workspaceTranslate()('search')).toBe('搜索')
    expect(workspaceTranslate()('search.sessions.aria')).toBe('搜索会话')
  })
})

describe('timeLabel', () => {  const t = workspaceTranslate()
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

/**
 * 悬停卡片的文案与格式
 *
 * 与行尾那份相对时间的区别只有一层：距离要套官方的「…前」模板。这里同时钉住
 * 「刚刚那一档不加后缀」——官方的注释写明了理由，「now ago」不成话
 */
describe('officialHoverLabels', () => {
  const t = workspaceTranslate()
  const labels = officialHoverLabels(t)
  const now = 1_700_000_000_000

  it('takes the copy affordance from the shared common vocabulary', () => {
    // 卡片整体可点即复制，因此用通用词而不是点明对象的说法，它在 common 里
    expect(labels.copy).toBe('复制')
    expect(labels.copied).toBe('已复制')
  })

  it('wraps distances in the ago template', () => {
    expect(labels.timeAgo(now - 5 * 60_000, now)).toBe('5分钟前')
    expect(labels.timeAgo(now - 3 * 60 * 60_000, now)).toBe('3小时前')
    expect(labels.timeAgo(now - 2 * 24 * 60 * 60_000, now)).toBe('2天前')
  })

  it('leaves the now bucket bare rather than saying now ago', () => {
    expect(labels.timeAgo(now - 30_000, now)).toBe('刚刚')
  })

  it('formats the creation instant through the official date template', () => {
    // 年月日走 date.ymd，时钟部分补零，不用 toLocaleString——那会跟着浏览器语言走
    const createdAt = new Date(2026, 8, 14, 3, 31).getTime()
    expect(labels.created(createdAt)).toBe('创建于 2026年9月14日 03:31')
  })

  it('pads single-digit clock parts to two places', () => {
    const createdAt = new Date(2026, 0, 5, 9, 7).getTime()
    expect(labels.created(createdAt)).toBe('创建于 2026年1月5日 09:07')
  })
})
