/**
 * 目录路径的显示缩写
 *
 * 与官方 `ui-workspace` 的 `abbreviateHomePath` 同一条规则
 * POSIX 的 home 及其后代缩成 `~` / `~/…`，其余路径原样
 * Windows 风格路径没有 `~` 约定，整条跳过
 */

/** 盘符或 UNC 前缀，这类路径不走 `~` 缩写 */
function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('\\\\')
}

/**
 * 把宿主的 home 目录缩写成 `~`
 *
 * 卡片里显示缩写路径，复制出去的仍是完整路径——缩写只影响这一处排版
 * @param home - 宿主的 home，缺省表示不知道，此时原样返回
 * @returns home 自身为 `~`，其后代为 `~/…`，其余为 `path`
 */
export function abbreviateHomePath(path: string, home?: string | undefined): string {
  if (home === undefined || home === '') return path
  if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path
  // 末尾斜杠不影响归属判断，先去干净再比
  const root = home.replace(/\/+$/, '')
  if (root === '' || root === '/') return path
  if (path.replace(/\/+$/, '') === root) return '~'
  if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`
  return path
}
