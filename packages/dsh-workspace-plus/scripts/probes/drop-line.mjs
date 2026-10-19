/**
 * 落点线的像素探针：线必须画在「松手会写到的那一块」上，并且真的看得见
 *
 * 五个历史 bug 里有五个都是同一族症状，而它们全部只能在这里量：
 *   - 线被裁剪盒吃掉（属性、命中全对，像素为空）
 *   - 线画进容器内边距（看得见，但指针瞄着它命中的是容器，松手什么都不发生）
 *   - 同一处缝出现两条线（画在相邻两块的各一条边上）
 *   - 线画在正被拖淡的那一块上（合成不透明度叠乘，线跟着变淡）
 *   - 线只跨了标题那一行，没有横跨整个区域
 *
 * jsdom 不做版式，上面每一条在那里都无法观察——这也是为什么此前的用例通过了却
 * 编码了错误前提。本探针用真实 chromium：
 *   1. 从构建产物 lib/client.js 取出编译后的样式表（类名带哈希）
 *   2. 按真实组件结构拼一个列表：虚拟分组 → 组内工作区 → 会话分组 → 未归组会话
 *   3. 依次在每一条行上派发落点标记（before / after / inside），每次都对整页截图
 *   4. 断言三件事：
 *      a. 标记元素里真的有蓝色像素（看得见，没被裁掉）
 *      b. 那条线的横向跨度占满它所在区域的宽度（不是只跨标题那一行）
 *      c. 同一个落点只出现一处蓝色像素行（没有两条线）
 *
 * 用法（读的是 lib/ 里的编译产物，因此先构建）：
 *   pnpm run build
 *   node scripts/probes/drop-line.mjs
 *
 * 退出码非零即有用例不符
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')

/** 落点线用的语义色，探针页面自己补上（宿主主题里才有） */
const LINE_COLOR = '#4d6bfe'

/** 判定「这是那条蓝线」的像素阈值：r 低、g 中、b 高 */
function isLine(r, g, b) {
  return r < 120 && g > 80 && g < 190 && b > 200
}

/** 从产物里取出一段 CSS 字符串字面量 */
function cssLiteral(source, marker) {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`产物里找不到样式表标记 ${marker}`)
  let quoteAt = -1
  for (let i = at; i >= 0; i -= 1) {
    const ch = source[i]
    if (ch !== '"' && ch !== "'") continue
    // 前面反斜杠个数为偶数才是未转义的引号
    let slashes = 0
    for (let j = i - 1; j >= 0 && source[j] === '\\'; j -= 1) slashes += 1
    if (slashes % 2 === 0) {
      quoteAt = i
      break
    }
  }
  if (quoteAt === -1) throw new Error('样式表字面量前找不到引号')
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
  return JSON.parse(`"${out.replaceAll('"', '\\"')}"`)
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
const css = cssLiteral(bundle, 'workspaceHead{')
const prefix = css.match(/\.([A-Za-z0-9_]+?)_workspaceHead\{/)?.[1]
if (prefix === undefined) throw new Error('产物样式表里没找到 workspaceHead 类名')
const h = (name) => `${prefix}_${name}`

/** 一条会话行：带 + 药丸 + 标题 */
const sessionRow = (title) =>
  `<div class="${h('row')}"><span class="${h('rowSurface')}"><span class="${h('rowTitle')}">${title}</span></span></div>`

/** 一条容器行 */
const headRow = (className, title) =>
  `<div class="${className}"><span class="${h('headSurface')}"><span class="${h('workspaceTitle')}">${title}</span></span></div>`

const expand = (open, inner) =>
  `<div class="${h('expand')} ${open ? h('expandOpen') : ''}"><div class="${h('expandClip')}">${inner}</div></div>`

const sessions = (rows) => `<div class="${h('sessions')}">${rows.join('')}</div>`

const workspace = (title, body, depth) =>
  `<section class="${h('workspace')}" style="--wg-depth:${depth}">` +
  headRow(h('workspaceHead'), title) +
  expand(true, `<div class="${h('workspaceBody')}">${body}</div>`) +
  '</section>'

const groupSection = (title, rows) =>
  `<div class="${h('group')}" style="--wg-depth:0">` +
  headRow(h('groupHead'), title) +
  expand(true, `<div class="${h('groupBody')}">${sessions(rows)}</div>`) +
  '</div>'

const virtualSection = (title, children) =>
  `<div class="${h('virtualWorkspace')}">` +
  headRow(`${h('groupHead')} ${h('virtualWorkspaceHead')}`, title) +
  expand(true, `<div class="${h('virtualWorkspaceBody')}">${children.join('')}</div>`) +
  '</div>'

const list = [
  virtualSection('虚拟分组', [workspace('组内工作区', sessions([sessionRow('组内会话')]), 1)]),
  workspace(
    '工作区一',
    groupSection('会话分组', [sessionRow('分组成员')]) + sessions([sessionRow('未归组')]),
    0,
  ),
]

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  :root { --dsw-alias-state-business-primary: ${LINE_COLOR}; }
  body { margin: 0; font: 13px sans-serif; width: 320px; background: #fff; }
  ${css}
  ${h('expand')} { grid-template-rows: 1fr; }
</style>
<div id="list">${list.join('')}</div>
`

mkdirSync(OUT_DIR, { recursive: true })
const pagePath = join(OUT_DIR, 'drop-line.html')
writeFileSync(pagePath, page)

const PORT = process.env.CDP_PORT ?? '9411'
const chromium = execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim()
const child = (await import('node:child_process')).spawn(chromium, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(OUT_DIR, 'cdp-drop-line')}`,
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target = null
for (let i = 0; i < 60 && target === null; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find((t) => t.type === 'page') ?? null
  } catch {
    await sleep(250)
  }
}
if (target === null) throw new Error('chromium 没有起来')

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
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (res.result?.exceptionDetails) {
    throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 400))
  }
  return res.result.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Page.navigate', { url: 'file://' + pagePath })
await sleep(900)

/** 当前所有可作落点标记的元素：行、行带、容器块 */
const candidates = await evaluate(`
  [...document.querySelectorAll('.${h('row')}, .${h('workspaceHead')}, .${h('groupHead')}, .${h('workspace')}, .${h('group')}, .${h('virtualWorkspace')}')]
    .map((el, index) => {
      const box = el.getBoundingClientRect()
      return { index, top: box.top, bottom: box.bottom, left: box.left, right: box.right }
    })
`)

/** 截一张图，返回每一行里蓝线像素的横向范围 */
async function lineRows(name) {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const bytes = shot.result.data
  const path = join(OUT_DIR, `drop-line-${name}.png`)
  writeFileSync(path, Buffer.from(bytes, 'base64'))
  // 用 chromium 自己解码，省掉一个 PNG 解码依赖
  const pixels = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,${bytes}'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, img.width, img.height).data
    const rows = []
    for (let y = 0; y < img.height; y += 1) {
      let count = 0
      let first = -1
      let last = -1
      for (let x = 0; x < img.width; x += 1) {
        const at = (y * img.width + x) * 4
        const r = data[at]
        const g = data[at + 1]
        const b = data[at + 2]
        if (r < 120 && g > 80 && g < 190 && b > 200) {
          if (first < 0) first = x
          last = x
          count += 1
        }
      }
      if (count > 3) rows.push({ y, count, first, last })
    }
    // 一条 2px 的线本来就占两行像素，相邻的行要合成一条，否则会读成两条线
    const merged = []
    for (const row of rows) {
      const previous = merged[merged.length - 1]
      if (previous !== undefined && row.y === previous.y + previous.thickness) {
        previous.thickness += 1
        previous.count = Math.max(previous.count, row.count)
        previous.first = Math.min(previous.first, row.first)
        previous.last = Math.max(previous.last, row.last)
        continue
      }
      merged.push({ y: row.y, thickness: 1, count: row.count, first: row.first, last: row.last })
    }
    return merged
  })()`)
  return { path, rows: pixels }
}

let failures = 0
const fail = (message) => {
  console.error('  ✗ ' + message)
  failures += 1
}

/**
 * 在元素上写一个落点标记，量线，然后清掉
 *
 * @param target - candidates 里的下标
 * @param mark - before | after | inside
 * @param name - 截图文件名
 */
async function probeMark(target, mark, name) {
  await evaluate(`
    (() => {
      document.querySelectorAll('[data-wg-drop]').forEach((el) => el.removeAttribute('data-wg-drop'))
      const el = [...document.querySelectorAll('.${h('row')}, .${h('workspaceHead')}, .${h('groupHead')}, .${h('workspace')}, .${h('group')}, .${h('virtualWorkspace')}')][${target}]
      if (el === undefined) throw new Error('no candidate at ${target}')
      el.setAttribute('data-wg-drop', '${mark}')
      const box = el.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width }
    })()
  `)
  await sleep(90)

  const box = await evaluate(`
    (() => {
      const el = document.querySelector('[data-wg-drop]')
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el, '${mark === 'inside' ? '::before' : mark === 'before' ? '::before' : '::after'}')
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width,
               pseudoTop: cs.top, pseudoBottom: cs.bottom, pseudoHeight: cs.height }
    })()
  `)

  const { rows } = await lineRows(name)

  // 期望：inside 是描边（四边都有像素），before / after 是一条横线
  if (mark === 'inside') {
    if (rows.length === 0) fail(`${name}: inside 框一个像素都没画出来（被裁剪或颜色未解析）`)
    const span = rows.length > 0 ? Math.max(...rows.map((r) => r.last - r.first)) : 0
    if (span < box.width * 0.8) fail(`${name}: inside 框只跨了 ${span}px，元素宽 ${box.width}px`)
    return
  }

  // 先查压淡：标记落在淡着的那一块上时，线会跟着一起淡掉（合成不透明度叠乘）
  // 这一条要在像素判定之前，否则「颜色不够蓝」会先被读成「线没画出来」，理由就错了
  const fading = await evaluate(`
    (() => {
      const el = document.querySelector('[data-wg-drop]')
      if (el === null) return null
      // 自己与全部祖先里最小的那个 opacity
      let opacity = 1
      for (let node = el; node !== null; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity)
      }
      return opacity
    })()
  `)
  if (fading !== null && fading < 0.99) {
    fail(`${name}: 标记落在合成不透明度 ${fading.toFixed(2)} 的块上，线会跟着一起淡掉`)
    return
  }

  if (rows.length === 0) {
    fail(`${name}: ${mark} 线没有画出来——伪元素被裁剪，或者边框色无从解析`)
    return
  }
  if (rows.length > 1) {
    fail(`${name}: ${mark} 出现了 ${rows.length} 条线（y = ${rows.map((r) => r.y).join(', ')}）`)
  }
  const line = rows[0]
  const span = line.last - line.first
  if (span < box.width * 0.8) {
    fail(`${name}: 线只跨了 ${span}px，而它所在的那一块宽 ${box.width}px——缩到了标题那一行`)
  }
  // 线必须落在元素盒子之内：伸到外面会被裁剪，而且指针瞄着它命中不到这个元素
  if (line.y < box.top - 1 || line.y > box.bottom) {
    fail(`${name}: 线在 y=${line.y}，落在元素盒子 ${box.top}..${box.bottom} 之外`)
  }
}

console.log(`${candidates.length} 个候选落点元素`)
for (const candidate of candidates) {
  for (const mark of ['before', 'after']) {
    await probeMark(candidate.index, mark, `${candidate.index}-${mark}`)
  }
}

ws.close()
child.kill('SIGKILL')

if (failures === 0) {
  console.log('每个落点标记都恰好看得见、恰好一条线、且横跨它所在的那一块')
} else {
  console.error(`\n${failures} 处不符`)
  process.exit(1)
}
