import { describe, expect, it } from 'vitest'
import { abbreviateHomePath } from '../src/client/utils/pathUtils.ts'

/**
 * 路径缩写的规则与官方 `ui-workspace` 的 `abbreviateHomePath` 逐条对齐
 *
 * 卡片里显示缩写路径，复制出去的仍是完整路径，本模块只负责那一处排版
 */
describe('abbreviateHomePath', () => {
  it('abbreviates the home directory itself as a bare tilde', () => {
    expect(abbreviateHomePath('/home/user', '/home/user')).toBe('~')
  })

  it('abbreviates descendants of the home directory', () => {
    expect(abbreviateHomePath('/home/user/src/dsh_plugins', '/home/user')).toBe(
      '~/src/dsh_plugins',
    )
  })

  it('leaves a path outside the home directory untouched', () => {
    expect(abbreviateHomePath('/srv/data', '/home/user')).toBe('/srv/data')
  })

  it('does not abbreviate a sibling that merely shares a prefix', () => {
    // /home/user-other 不是 /home/user 的后代：按整段比，不能只比前缀字符串
    expect(abbreviateHomePath('/home/user-other/x', '/home/user')).toBe('/home/user-other/x')
  })

  it('tolerates a trailing slash on either side', () => {
    expect(abbreviateHomePath('/home/user/', '/home/user')).toBe('~')
    expect(abbreviateHomePath('/home/user/src/', '/home/user/')).toBe('~/src/')
  })

  it('skips abbreviation when the home is unknown', () => {
    // 首个 ready 帧到达前 home 是空的，那时原样显示而不是拼出一个假的 `~`
    expect(abbreviateHomePath('/home/user/src', undefined)).toBe('/home/user/src')
    expect(abbreviateHomePath('/home/user/src', '')).toBe('/home/user/src')
  })

  it('skips abbreviation for Windows-style paths', () => {
    // 盘符与 UNC 路径没有 `~` 约定，整条跳过
    expect(abbreviateHomePath('C:\\Users\\user\\src', 'C:\\Users\\user')).toBe(
      'C:\\Users\\user\\src',
    )
    expect(abbreviateHomePath('\\\\server\\share\\x', '/home/user')).toBe('\\\\server\\share\\x')
  })

  it('skips abbreviation for a root home', () => {
    // home 是 `/` 时把整棵树都缩成 `~` 反而更没用
    expect(abbreviateHomePath('/home/user', '/')).toBe('/home/user')
  })
})
