/**
 * 拖拽引导三段的真实浏览器探针
 *
 * jsdom 不做版式也不算样式，因此「够不着的淡下去了」「够得着的没被额外上色」「指针下那一处抬高了」
 * 三条只能在真实浏览器里量。本脚本做三件事：
 *   1. 从构建产物 `lib/client.js` 里取出本包那张**编译后**的样式表（类名已带哈希）
 *   2. 按实际类名拼一个最小页面：三个工作区块分别代表三段 —— 够不着的、够得着的、指针下那一处
 *   3. 用 chromium 读每块的计算样式，要求压淡只落在第一块、后两块保持原样且第三块带落点标记
 *
 * 页面内容全部在这里现造（`分组一` 这类假名），不读宿主的任何配置或真实数据，因此换一台机器也能跑出同一份结论
 *
 * 为什么值得量：三段靠「只压够不着的」与「只抬指针下那一处」两件事分开
 * 两条都是计算样式层面的结论，DOM 属性断言只证得「标在哪」，证不了「看起来是什么样」
 * 尤其是「够得着的没有额外底色」——多上一道底色不会有任何属性变化，只有算出来的样式能发现
 *
 * 用法（读的是 `lib/` 里那份编译产物，因此先构建）：
 *   pnpm run build
 *   node scripts/probes/drag-guide.mjs
 *
 * 浏览器要自带一个：脚本自己起一条 chromium 命令，CDP 端口固定。
 * 退出码非零即有用例不符。不进 `package.json` 的 scripts：跑一次要自带浏览器、读构建产物，
 * 结论也不是那种能进 CI 的断言，写成一个命令会让人以为随便跑跑就行
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')
const PORT = process.env.CDP_PORT ?? '9310'

/**
 * 从产物里取出一段 CSS 字符串字面量：入口是它开头的标记，取到配对的收尾引号为止
 *
 * 从标记往回找最近的未被转义的引号当开引号，再解转义扫到收尾
 * 不能从头顺序扫字面量：产物里除了字符串，标识符与注释里也会出现引号，顺序扫会在那里错位
 * @param source - `lib/client.js` 的内容
 * @param marker - 该样式表里稳定出现的片段
 */
function cssLiteral(source, marker) {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`产物里找不到样式表标记 ${marker}`)
  for (let open = at; open >= 0; open -= 1) {
    const quote = source[open]
    if (quote !== '"' && quote !== "'") continue
    // 连续反斜杠个数为奇数表示这个引号被转义了，它不可能是开引号
    let slashes = 0
    for (let k = open - 1; k >= 0 && source[k] === '\\'; k -= 1) slashes += 1
    if (slashes % 2 === 1) continue
    let out = ''
    let closed = false
    for (let i = open + 1; i < source.length; i += 1) {
      const ch = source[i]
      if (ch === '\\') {
        out += source[i + 1]
        i += 1
        continue
      }
      if (ch === quote) {
        closed = true
        break
      }
      out += ch
    }
    // 样式表里出现的转义引号会截出残片，那一段不含标记，继续往前找真正的开引号
    if (closed && out.includes(marker)) return out
  }
  throw new Error(`产物里找不到含 ${marker} 的样式表字面量`)
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
// 产物里类名是 `[hash]_[name]`；取首个类的哈希前缀，据此把页面里的裸类名换掉
const css = cssLiteral(bundle, '_workspaceHead')
const prefix = css.match(/\.([A-Za-z0-9_]+?)_workspaceHead/)?.[1]
if (prefix === undefined) throw new Error('产物样式表里没找到 workspaceHead 类名')
const hashed = (name) => `.${prefix}_${name}`

// 引导与标记用到的宿主令牌：页面里不补这几项，var() 会整条失效，读数恒为透明
const TOKENS = {
  '--dsw-radius-md': '12px',
  '--dsw-alias-state-business-primary': 'rgb(0, 128, 255)',
  '--dsw-alias-label-primary': '#111',
  '--dsw-alias-interactive-bg-hover': '#eee',
}

/**
 * 一个工作区块：带范围标记，体内一个会话分组
 * @param name - 块名，同时当区域键的一段
 * @param attrs - 加在块上的引导属性
 */
const block = (name, scopeAttrs, groupAttrs = '') => `
<section class="${prefix}_workspace" data-wg-dnd-scope data-case="${name}" ${scopeAttrs}>
  <div class="${prefix}_workspaceHead">${name}</div>
  <div class="${prefix}_group" data-wg-dnd="sessionGroup/${name}/g1" ${groupAttrs}>
    <div class="${prefix}_groupHead" data-wg-dnd="groupHead/${name}/g1">分组一</div>
  </div>
</section>`

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  :root { ${Object.entries(TOKENS).map(([k, v]) => `${k}: ${v};`).join(' ')} }
  body { margin: 0; font: 13px sans-serif; background: #fff; }
  ${css}
  /* 产物里这几项由别的表或宿主给：块宽与行高 */
  ${hashed('workspace')} { width: 280px; }
  ${hashed('workspaceHead')}, ${hashed('groupHead')} { height: 28px; line-height: 28px; }
</style>
${block('unreachable', 'data-wg-dnd-dim')}
${block('reachable', '')}
${block('landing', '', 'data-wg-drop="inside"')}
`

mkdirSync(OUT_DIR, { recursive: true })
const pagePath = join(OUT_DIR, 'drag-guide-probe.html')
writeFileSync(pagePath, page)

// chromium 用一条独立命令起，跑完即退；CDP 端口固定，探针自己连上去读
spawn(
  'chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(OUT_DIR, 'cdp-profile-guide')}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
).unref()
await new Promise((r) => setTimeout(r, 1400))

const target = await (
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })
).json()
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
    const n = ++id
    pending.set(n, resolve)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: `file://${pagePath}` })
await new Promise((r) => setTimeout(r, 700))

// 读工作区块自己的计算样式：压淡挂在它身上，落点标记挂在它体内的分组块上
const seen = await evaluate(`(() => {
    const out = {}
    for (const block of document.querySelectorAll('[data-case]')) {
      const group = block.querySelector('[data-wg-dnd^="sessionGroup"]')
      out[block.dataset.case] = {
        opacity: getComputedStyle(block).opacity,
        groupBackground: getComputedStyle(group).backgroundColor,
        groupShadow: getComputedStyle(group).boxShadow,
      }
    }
    return { blocks: out, marks: document.querySelectorAll('[data-wg-drop]').length }
  })()`)

const shot = await send('Page.captureScreenshot', { format: 'png' })
const shotPath = join(OUT_DIR, 'drag-guide-probe.png')
writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'))

const failures = []
const check = (name, ok, detail) => {
  if (!ok) failures.push(`${name}: ${detail}`)
}
const plain = (v) => v === 'rgba(0, 0, 0, 0)' || v === 'transparent'
const none = (v) => v === 'none'

check('够不着的那一块压淡了', Number(seen.blocks.unreachable.opacity) < 1, seen.blocks.unreachable.opacity)
check('够得着的那一块保持原样', Number(seen.blocks.reachable.opacity) === 1, seen.blocks.reachable.opacity)
check(
  '够得着的那一块没有额外底色',
  plain(seen.blocks.reachable.groupBackground),
  seen.blocks.reachable.groupBackground,
)
check('落点那一块保持原样', Number(seen.blocks.landing.opacity) === 1, seen.blocks.landing.opacity)
check('落点那一块描了一圈', !none(seen.blocks.landing.groupShadow), seen.blocks.landing.groupShadow)
check('全页只出现一圈落点', seen.marks === 1, String(seen.marks))

for (const [name, values] of Object.entries(seen.blocks)) {
  console.log(`${name.padEnd(12)} opacity=${values.opacity} groupShadow=${values.groupShadow}`)
}
ws.close()
if (failures.length > 0) {
  console.error(`\n${failures.length} 条不符：`)
  for (const line of failures) console.error(`  ${line}`)
  process.exit(1)
}
console.log(`\n全部符合\n截图：${shotPath}`)
process.exit(0)
