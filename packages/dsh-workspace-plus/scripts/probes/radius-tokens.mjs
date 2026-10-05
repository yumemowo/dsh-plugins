/**
 * 圆角令牌与焦点环的真实浏览器探针
 *
 * jsdom 不解析 `var()`，也不做版式，因此「行圆角真的是 12px」与「被裁容器里的
 * 焦点环真的画得出来」这两条只能在真实浏览器里量。本脚本做三件事：
 *   1. 从构建产物 `lib/client.js` 里取出**编译后**的样式表（类名已带哈希）
 *   2. 把主题里那批 `--dsw-radius-*` 令牌照官方定义补上，再拼一个最小页面
 *   3. 读 `getComputedStyle` 的解析结果，逐条断言「令牌解出来的像素值」与
 *      「焦点时 outline 的可见宽度」
 *
 * 页面内容全部在这里现造（假会话 `session-a`…），不读宿主的任何配置或真实数据。
 *
 * 用法（先起一个可远程调试的 Chromium，再直接跑本文件；不进 package.json 的 scripts）：
 *   /usr/bin/chromium --headless=new --no-sandbox --disable-gpu \
 *     --remote-debugging-port=9222 --user-data-dir=.preview/chrome-profile about:blank &
 *   node scripts/probes/radius-tokens.mjs
 *
 * 跑之前先 `pnpm run build`：读的是 `lib/` 里那份编译产物。
 *
 * 为什么焦点环要看「被裁容器」：`.headerActions` 与 `.search` 都带 `overflow: hidden`，
 * 外扩的环会被裁掉。这里因此不只断言 `outline-width`，还断言 `outline-offset` 为负，
 * 并实际截图比对「聚焦后容器内的像素是否变了」。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')
const PORT = process.env.CDP_PORT ?? '9222'

/** 从产物里取出一段 CSS 字符串字面量：入口是它开头的标记，取到未转义的收尾引号为止
 *  单双引号都要认——产物里不同的样式表用了不同的引号，只认双引号会从别的串里截出垃圾 */
function cssLiteral(source, marker) {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`产物里找不到样式表标记 ${marker}`)
  let quoteAt = -1
  for (let i = at; i >= 0; i -= 1) {
    if (source[i] === '"' || source[i] === "'") {
      quoteAt = i
      break
    }
  }
  if (quoteAt === -1) throw new Error(`标记 ${marker} 之前找不到引号`)
  const quote = source[quoteAt]
  let out = ''
  for (let i = quoteAt + 1; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') {
      out += source[i] + source[i + 1]
      i += 1
      continue
    }
    if (ch === quote) break
    out += ch
  }
  return JSON.parse(`"${out.replace(/"/g, '\\"')}"`)
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
const css = cssLiteral(bundle, 'header{')
const rowsCss = cssLiteral(bundle, 'workspaceHead{')

/** 取首个类的哈希前缀，据此把页面里的裸类名换掉 */
function prefixOf(source, name) {
  const m = source.match(new RegExp(`\\.([A-Za-z0-9_]+?)_${name}\\{`))
  if (m === null) throw new Error(`产物样式表里没找到 ${name} 类名`)
  return m[1]
}
const headerPrefix = prefixOf(css, 'header')
const rowsPrefix = prefixOf(rowsCss, 'workspaceHead')
const hashedHeader = (name) => `.${headerPrefix}_${name}`
const hashedRow = (name) => `.${rowsPrefix}_${name}`

// 官方 ui-theme 的 base.css 里那六个圆角令牌，照抄一份给页面用
const TOKENS = {
  '--dsw-radius-xs': '4px',
  '--dsw-radius-sm': '8px',
  '--dsw-radius-md': '12px',
  '--dsw-radius-lg': '16px',
  '--dsw-radius-xl': '20px',
  '--dsw-radius-panel': '28px',
  // 焦点环两个量也在主题里，取值照官方
  '--dsw-focus-ring-width': '2px',
  '--dsw-focus-ring-color': 'rgb(0, 128, 255)',
  // 面板与行用到的色阶，取不透明值即可，本探针只看几何
  '--dsw-alias-label-primary': '#111',
  '--dsw-alias-label-secondary': '#444',
  '--dsw-alias-label-tertiary': '#777',
  '--dsw-alias-label-caption': '#999',
  '--dsw-alias-interactive-bg-hover': '#eee',
  '--dsw-alias-border-l1': '#ddd',
  '--dsw-alias-border-l2': '#ddd',
  '--dsw-alias-border-l4': '#ccc',
  '--dsw-alias-state-business-primary': 'rgb(0, 128, 255)',
  '--dsw-specific-menu': 'rgb(250, 250, 250)',
  '--dsw-menu-backdrop-filter': 'none',
  '--dsw-elevation-prominent': 'none',
  '--ds-ease-in-out': 'ease',
}

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  :root { ${Object.entries(TOKENS).map(([k, v]) => `${k}: ${v};`).join(' ')} }
  body { margin: 0; font: 13px sans-serif; }
  ${css}
  ${rowsCss}
  /* 页面外壳这几项产物里由别的表或宿主给：栏宽 */
  .shell { width: 320px; }
  ${hashedHeader('headerActions')} { max-width: none; }
</style>
<div class="shell">
  <div class="${headerPrefix}_header">
    <div class="${headerPrefix}_headerActions">
      <button class="${headerPrefix}_headerAction" id="act">A</button>
    </div>
  </div>
  <div class="${rowsPrefix}_row" id="row">会话</div>
  <div class="${rowsPrefix}_pickerRow" id="picker">条目</div>
</div>
`

mkdirSync(OUT_DIR, { recursive: true })
const pagePath = join(OUT_DIR, 'radius-tokens-probe.html')
writeFileSync(pagePath, page)

const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
const target = await res.json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
await new Promise((resolve) => ws.addEventListener('open', resolve))
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const callId = ++id
    pending.set(callId, resolve)
    ws.send(JSON.stringify({ id: callId, method, params }))
  })

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}

await send('Page.enable')
await send('Page.navigate', { url: `file://${pagePath}` })
await new Promise((resolve) => setTimeout(resolve, 400))

/** 用真实的 Tab 按键把焦点移到目标元素上
 *  :focus-visible 只认键盘模态，脚本 el.focus() 在 Chromium 下不触发它，
 *  因此必须走 Input.dispatchKeyEvent，测的才是用户按 Tab 时那条路径 */
async function tabTo(id) {
  await evaluate(`document.getElementById(${JSON.stringify(id)}).blur()`)
  await evaluate(`document.body.focus()`)
  for (let i = 0; i < 8; i += 1) {
    await send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab',
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, key: 'Tab', code: 'Tab',
    })
    const hit = await evaluate(`document.activeElement && document.activeElement.id`)
    if (hit === id) return true
  }
  return false
}

const failures = []
const check = (label, actual, expected) => {
  const ok = actual === expected
  if (!ok) failures.push(`${label}: 期望 ${expected}，实测 ${actual}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} = ${actual}`)
}

// 1) 令牌解出来的像素值：这几个数就是官方 base.css 里的定义
check('行圆角 (--dsw-radius-md)', await evaluate(
  `getComputedStyle(document.getElementById('row')).borderTopLeftRadius`), '12px')
check('条目行圆角 (--dsw-radius-md)', await evaluate(
  `getComputedStyle(document.getElementById('picker')).borderTopLeftRadius`), '12px')
check('header 入口圆角 (--dsw-radius-sm)', await evaluate(
  `getComputedStyle(document.getElementById('act')).borderTopLeftRadius`), '8px')

// 2) 被裁容器里的焦点环：outline-offset 必须为负，否则环画在容器外被 overflow 裁掉
const reached = await tabTo('act')
check('Tab 能聚焦到 header 入口', reached, true)
const actionMetrics = await evaluate(`(() => {
  const s = getComputedStyle(document.getElementById('act'))
  return { width: s.outlineWidth, offset: s.outlineOffset, style: s.outlineStyle }
})()`)
check('聚焦后 outline-style', actionMetrics.style, 'solid')
check('聚焦后 outline-width', actionMetrics.width, '2px')
check('聚焦后 outline-offset（负值才收在容器内）', actionMetrics.offset, '-2px')

// 3) 真正画得出来：截图比对聚焦前后容器区域是否变化
const clip = await evaluate(`(() => {
  const r = document.getElementById('act').getBoundingClientRect()
  return { x: Math.floor(r.x) - 4, y: Math.floor(r.y) - 4, width: Math.ceil(r.width) + 8, height: Math.ceil(r.height) + 8 }
})()`)
// 静止态：先把焦点交给 body，否则上一步留下的聚焦态会让「前」也带着环
await evaluate(`document.getElementById('act').blur(); document.body.focus()`)
const before = (await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } }))
  .result?.data
check('重新 Tab 能聚焦到 header 入口', await tabTo('act'), true)
const after = (await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } }))
  .result?.data
check('聚焦让容器内像素真的变了', before !== after, true)

ws.close()
await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`)

console.log(failures.length === 0 ? '\n全部通过' : `\n${failures.length} 条不符：\n${failures.join('\n')}`)
process.exit(failures.length === 0 ? 0 : 1)
