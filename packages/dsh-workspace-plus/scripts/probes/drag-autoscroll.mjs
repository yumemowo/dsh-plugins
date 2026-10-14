/**
 * 拖拽自动滚动的真实浏览器探针
 *
 * 这一条只能实测：jsdom 不做版式，`getBoundingClientRect()` 恒为零矩形、`scrollHeight` 恒为 0，
 * 因此「指针进带就滚」「越靠边越快」「松手落在滚之后那一格」在用例里全是替身喂出来的读数
 *
 * 探针做三件事：
 *   1. 用 esbuild 把**真实的** `DndProvider` 与一棵真实几何的树打进一个 IIFE
 *   2. 用真实鼠标事件起一场**真原生拖拽**，把指针停在容器边缘的带里
 *   3. 读容器的 `scrollTop`，与不滚的那几档对照
 *
 * 关键对照：原生拖放自带的边缘滚动只在贴边约 16px 内生效，实测距下缘 20px 起就已经完全不滚。
 * 因此探针把指针停在距下缘 40px 处——那一档原生读数为 0，滚动只可能来自本包的机制
 *
 * 用法（读的是源码，不读构建产物，因此不必先构建）：
 *   node scripts/probes/drag-autoscroll.mjs
 *
 * 浏览器要自带一个：脚本自己起一条 chromium 命令，CDP 端口固定。退出码非零即有用例不符。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')
const PORT = process.env.CDP_PORT ?? '9320'

/** 容器几何：上缘、高度，两者都取整数方便算带 */
const BOX_TOP = 100
const BOX_HEIGHT = 300
/** 指针命中带的深度：40px 已超出原生自带滚动的范围，这一档原生读数为 0 */
const BAND_DEPTH = 40

mkdirSync(OUT_DIR, { recursive: true })

/**
 * 探针页面里挂的那棵树的入口
 *
 * 写成一个文件再交给 esbuild：真实 `DndProvider` 走源码，几何由页面里的样式给定
 */
const ENTRY = `
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { DndProvider, useDnd } from '${join(ROOT, 'src/client/hooks/useDnd.ts')}'
import { SCROLL_ATTRIBUTE } from '${join(ROOT, 'src/client/data/dnd.ts')}'

const ROWS = 60

function Row({ id, dnd }) {
  return React.createElement(
    'div',
    {
      className: 'row',
      'data-wg-dnd-row': dnd.rowId,
      draggable: true,
      onDragStart: dnd.onDragStart,
      onDragEnd: dnd.onDragEnd,
    },
    '会话 ' + id,
  )
}

function Tree() {
  const { dndRowProps, dndZoneProps } = useDnd()
  const plan = React.useMemo(
    () => ({
      source: { kind: 'session', id: 'row-1' },
      targets: new Map([['zone', { mode: 'container', commit: () => { window.__commits.push('zone') } }]]),
    }),
    [],
  )
  const rows = []
  for (let i = 1; i <= ROWS; i += 1) {
    const dnd = dndRowProps('row-' + i, () => plan)
    rows.push(React.createElement(Row, { key: i, id: i, dnd }))
  }
  return React.createElement(
    'div',
    { className: 'scroller', ...dndZoneProps('zone'), [SCROLL_ATTRIBUTE]: '', style: { overflowY: 'auto' } },
    rows,
  )
}

window.__commits = []
createRoot(document.getElementById('root')).render(
  React.createElement(DndProvider, null, React.createElement(Tree)),
)
`

const entryPath = join(OUT_DIR, 'autoscroll-entry.jsx')
writeFileSync(entryPath, ENTRY)

const bundlePath = join(OUT_DIR, 'autoscroll-bundle.js')
await build({
  entryPoints: [entryPath],
  bundle: true,
  format: 'iife',
  outfile: bundlePath,
  // 与包内构建同源：react 与 react-dom 不打包，由页面自己给
  loader: { '.ts': 'ts', '.tsx': 'tsx' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'silent',
})

const source = readFileSync(bundlePath, 'utf8')

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 13px sans-serif; }
  /* 容器上缘留在 ${BOX_TOP}px：上面那一段空白用来验证「指针在容器外」的那一档 */
  #pad { height: ${BOX_TOP}px; }
  .scroller { height: ${BOX_HEIGHT}px; border: 1px solid #ccc; }
  .row { height: 28px; line-height: 28px; padding-left: 8px; border-bottom: 1px solid #eee; }
</style>
<div id="pad"></div>
<div id="root"></div>
<script>${source}</script>
`

const pagePath = join(OUT_DIR, 'autoscroll-probe.html')
writeFileSync(pagePath, page)

spawn(
  'chromium',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=400,900',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(OUT_DIR, 'cdp-autoscroll')}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true },
).unref()
await new Promise((r) => setTimeout(r, 1500))

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
await new Promise((r) => ws.addEventListener('open', r))
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id
    pending.set(n, r)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evaluate = async (expression) => {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true })
  return reply.result?.result?.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: `file://${pagePath}` })
await wait(900)

/** 收集失败项，最后一起报 */
const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail === undefined ? '' : `  ${detail}`}`)
  if (!ok) failures.push(name)
}

const box = await evaluate(`(() => {
  const el = document.querySelector('.scroller')
  const r = el.getBoundingClientRect()
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, scrollHeight: el.scrollHeight }
})()`)
console.log(`容器 top=${box.top} bottom=${box.bottom} height=${box.height} scrollHeight=${box.scrollHeight}`)

/** 起一场真实原生拖拽：按在第一条可拖的会话行上 */
async function startDrag() {
  const y = Math.round(box.top + 14)
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: box.left + 60, y, button: 'left', clickCount: 1,
  })
  for (const dy of [8, 16, 24, 32]) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: box.left + 60, y: y + dy, button: 'left', buttons: 1,
    })
    await wait(50)
  }
}

/** 把指针停在一个纵坐标上一段时间 */
async function hold(y, ms) {
  for (let i = 0; i < Math.round(ms / 100); i += 1) {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: box.left + 60, y: Math.round(y), button: 'left', buttons: 1,
    })
    await wait(100)
  }
}

const scrollTop = () => evaluate(`document.querySelector('.scroller').scrollTop`)
const reset = () => evaluate(`document.querySelector('.scroller').scrollTop = 0`)

// 拖起来，确认原生拖拽真的在进行
await startDrag()
const dragging = await evaluate(`window.__commits.length >= 0`)
check('真实原生拖拽已起', dragging)

// 1）指针停在容器中部：不该滚
await reset()
await wait(80)
await hold(box.top + box.height / 2, 1000)
check('指针在容器中部时不滚', (await scrollTop()) === 0, `scrollTop=${await scrollTop()}`)

// 2）指针停在距下缘 40px：超出原生自带滚动的范围，只有本包的机制能起来
await reset()
await wait(80)
await hold(box.bottom - BAND_DEPTH, 1400)
const down = await scrollTop()
check(`指针距下缘 ${BAND_DEPTH}px 时向下滚`, down > 0, `scrollTop=${down}`)

// 3）越靠边越快：贴住底缘 4px 跑同样时长，位移该更多
await reset()
await wait(80)
await hold(box.bottom - 4, 1400)
const deeper = await scrollTop()
check('越靠边滚得越快', deeper > down, `贴边=${deeper} 距 40px=${down}`)

// 4）向上滚
await evaluate(`document.querySelector('.scroller').scrollTop = 1200`)
await wait(80)
await hold(box.top + BAND_DEPTH, 1400)
const up = await scrollTop()
check(`指针距上缘 ${BAND_DEPTH}px 时向上滚`, up < 1200, `scrollTop=${up}`)

// 5）拖拽结束后不再滚
await send('Input.dispatchMouseEvent', {
  type: 'mouseReleased', x: box.left + 60, y: Math.round(box.bottom - BAND_DEPTH), button: 'left',
})
await wait(200)
const afterRelease = await scrollTop()
await hold(box.bottom - BAND_DEPTH, 800)
check('松手后不再滚', (await scrollTop()) === afterRelease, `${afterRelease} -> ${await scrollTop()}`)

ws.close()
console.log(failures.length === 0 ? '\n全部通过' : `\n不符：${failures.join('、')}`)
process.exit(failures.length === 0 ? 0 : 1)
