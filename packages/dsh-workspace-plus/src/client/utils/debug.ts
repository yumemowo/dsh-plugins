/**
 * 拖拽链路上的诊断日志
 *
 * 两级：
 * - `debugWarn`：**不受开关管**，永远输出。链路骨架（起拖、提交、回写）与「本该发生却没发生」
 *   的分叉（松手无落点、写入被拒）都走它。拖拽出问题时最先要看的就是这几条，
 *   因此它们不能依赖用户事先打开什么开关
 * - `debugLog`：开关控制，默认关。逐格现场（命中详情里的每一格、计划全文）走它，
 *   一次拖拽会打出几十行，平时不需要
 *
 * 打开方式：浏览器控制台执行 `__workspacePlusDebug()`，当场生效、不必刷新；
 * 或 `localStorage.setItem('workspace-plus:debug', '1')` 之后刷新。
 */

/** localStorage 里的开关键 */
const DEBUG_STORAGE_KEY = 'workspace-plus:debug'

/** 日志前缀，便于在控制台按关键词过滤 */
const PREFIX = '[workspace-plus]'

let enabled: boolean | undefined

/** 读一次开关，之后走缓存：localStorage 在隐私模式下可能直接抛错 */
function isEnabled(): boolean {
  if (enabled !== undefined) return enabled
  try {
    enabled = globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    enabled = false
  }
  return enabled
}

/**
 * 打一条诊断日志
 *
 * 关着时只做一次布尔判断，参数不会被求值成字符串——调用处可以直接传对象
 * @param label - 这一条说的是链路里的哪一步
 * @param detail - 该步的现场，原样交给控制台，展开即可
 */
export function debugLog(label: string, detail?: unknown): void {
  if (!isEnabled()) return
  if (detail === undefined) console.info(`${PREFIX} ${label}`)
  // 一行紧凑文本而不是原样对象：控制台里不用逐层展开就能读完整条，
  // 复制出来贴进 issue 时也还是一行
  else console.info(`${PREFIX} ${label} ${compact(detail)}`)
}

/**
 * 把一份现场压成一行
 *
 * 对象压成 `k=v` 并用空格连接，数组压成 `[a|b]`，字符串原样。
 * 只求一眼能读，不求可机器解析——需要结构化时看的是调用点传进来的字段名
 * @param value - 要压的值
 */
function compact(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (Array.isArray(value)) return '[' + value.map(compact).join('|') + ']'
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .map(([key, inner]) => key + '=' + compact(inner))
      .join(' ')
  }
  return String(value)
}

/**
 * 打一条诊断警告
 *
 * 与 {@link debugLog} 分开：这一条在开关关着时也打，用来标记「本该发生却没发生」的那些分叉
 * @param label - 出了什么偏差
 * @param detail - 现场
 */
export function debugWarn(label: string, detail?: unknown): void {
  // 与 debugLog 同一套一行文本格式：控制台里不展开也能读完整条
  if (detail === undefined) console.warn(`${PREFIX} ${label}`)
  else console.warn(`${PREFIX} ${label} ${compact(detail)}`)
}

/** 浏览器控制台里的开关入口，挂在 window 上 */
declare global {
  interface Window {
    /** 打开或关闭本包的诊断日志，返回当前状态 */
    __workspacePlusDebug?: (on?: boolean) => boolean
  }
}

if (typeof window !== 'undefined' && window.__workspacePlusDebug === undefined) {
  window.__workspacePlusDebug = (on = true) => {
    enabled = on
    try {
      if (on) globalThis.localStorage?.setItem(DEBUG_STORAGE_KEY, '1')
      else globalThis.localStorage?.removeItem(DEBUG_STORAGE_KEY)
    } catch {
      // 存不进去不影响本次会话的开关
    }
    console.info(`${PREFIX} 诊断日志${on ? '已打开' : '已关闭'}`)
    return enabled
  }
}
