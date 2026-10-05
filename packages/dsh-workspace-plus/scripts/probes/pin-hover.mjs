/**
 * 置顶区悬停展开的真实浏览器探针
 *
 * jsdom 不算版式、也不算 `:hover`，因此「指针在预览行上时整块浮出」「行上开着面板时浮出不收回」
 * 这两条只能在真实浏览器里量。本脚本做三件事：
 *   1. 从构建产物 `lib/client.js` 里取出置顶区那张**编译后**的样式表（类名已带哈希）
 *   2. 按它的实际类名拼一个最小页面，把 `--wg-pin-*` 四个变量照组件下发的值给上
 *   3. 用 CDP 移动指针并读 `getComputedStyle`，逐条打印结论
 *
 * 页面内容全部在这里现造（7 条假会话 `session-a`…`session-g`），不读宿主的任何配置或真实数据，
 * 因此换一台机器也能跑出同一份结论。
 *
 * 用法（先起一个可远程调试的 Chromium，再直接跑本文件；不进 package.json 的 scripts）：
 *   /usr/bin/chromium --headless=new --no-sandbox --disable-gpu \
 *     --remote-debugging-port=9222 --user-data-dir=.preview/chrome-profile about:blank &
 *   node scripts/probes/pin-hover.mjs
 *
 * 跑之前先 `pnpm run build`：读的是 `lib/` 里那份编译产物。
 *
 * 媒体档的处理：浮出规则整条包在 `(hover: hover)` 里，而 headless 恒定报 `(hover: none)`，
 * 于是它在默认环境里根本不生效。这里用 CDP 的媒体模拟把页面当成一台有指针的设备来量——
 * 量的是「真机上有悬停时会发生什么」，触屏档本身由 `test/styles.test.ts` 的用例守着。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')
const PORT = process.env.CDP_PORT ?? '9222'

/** 从产物里取出一段 CSS 字符串字面量：入口是它开头的标记，取到未转义的收尾引号为止 */
function cssLiteral(source, marker) {
  const at = source.indexOf(marker)
  if (at === -1) throw new Error(`产物里找不到样式表标记 ${marker}`)
  const start = source.lastIndexOf('"', at) + 1
  let out = ''
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') {
      out += source[i] + source[i + 1]
      i += 1
      continue
    }
    if (ch === '"') break
    out += ch
  }
  return JSON.parse(`"${out}"`)
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
// 产物里类名是 `[hash]_[name]`；取首个类的哈希前缀，据此把页面里的裸类名换掉
// 哈希自己是下划线开头的（如 `_1tMrrq`），字符集因此含下划线与数字
const css = cssLiteral(bundle, 'pinnedSection{')
const prefix = css.match(/\.([A-Za-z0-9_]+?)_pinnedSection\{/)?.[1]
if (prefix === undefined) throw new Error('产物样式表里没找到 pinnedSection 类名')

/** 把裸类名换成产物里的哈希类名，让被测的就是构建产物那份规则 */
const hashed = (name) => `.${prefix}_${name}`
// 7 条假会话：可见 5 条，因此后 2 条应当被裁掉
const ROWS = ['session-a', 'session-b', 'session-c', 'session-d', 'session-e', 'session-f', 'session-g']
const page = `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 13px sans-serif; }
  ${css}
  /* 页面外壳这几项产物里由别的表或宿主给：宽度、行高与行距 */
  ${hashed('pinnedSection')} { width: 300px; }
  ${hashed('pinScroll')} > * + * { margin-top: 2px; }
  ${hashed('pinScroll')} > * { height: 32px; line-height: 32px; }
</style>
<div class="${prefix}_pinnedSection ${prefix}_pinExpand" data-wg-expandable>
  <div class="${prefix}_pinHead">置顶</div>
  <div class="${prefix}_pinScroll" data-wg-overflowing>
    ${ROWS.map(
      (id, i) =>
        `<div class="row"${i >= 5 ? ' data-wg-clipped' : ''}>${id}</div>`,
    ).join('\n    ')}
  </div>
  <div class="${prefix}_pinDivider"></div>
</div>
<script>
  // 组件按可见条数下发的那五个变量：可见 5 条 = 168，全部 7 条 = 236，段头 30，段头空隙 6，分隔 13
  const section = document.querySelector('.${prefix}_pinnedSection')
  section.style.setProperty('--wg-pin-rest', '168px')
  section.style.setProperty('--wg-pin-full', '236px')
  section.style.setProperty('--wg-pin-head', '30px')
  section.style.setProperty('--wg-pin-gap', '6px')
  section.style.setProperty('--wg-pin-divider', '13px')
</script>
`

mkdirSync(OUT_DIR, { recursive: true })
const pagePath = join(OUT_DIR, 'pin-hover-probe.html')
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
    const n = ++id
    pending.set(n, resolve)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result?.result?.value
}
const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Runtime.enable')
await send('Page.enable')
// 在导航之前设好媒体模拟：媒体特性在文档加载时求值，导航之后再设对已加载的页面无效
await send('Emulation.setEmulatedMedia', {
  features: [
    { name: 'hover', value: 'hover' },
    { name: 'pointer', value: 'fine' },
  ],
})
await send('Page.navigate', { url: `file://${pagePath}` })
await wait(600)

const hoverCapable = await evaluate(`matchMedia('(hover: hover)').matches`)

const scrollSel = hashed('pinScroll')
const probe = () =>
  evaluate(`(() => {
    const scroll = document.querySelector('${scrollSel}')
    return {
      maxHeight: getComputedStyle(scroll).maxHeight,
      clippedVisibility: getComputedStyle(document.querySelector('[data-wg-clipped]')).visibility,
      sectionHeight: Math.round(document.querySelector('${hashed('pinnedSection')}').getBoundingClientRect().height),
    }
  })()`)
const rect = JSON.parse(
  await evaluate(`JSON.stringify(document.querySelector('${scrollSel}').getBoundingClientRect())`),
)
const overRow = { x: 150, y: Math.round(rect.top + 40) }
// 段外：展开后弹出盒也不会盖到这里，指针才算真的离开
const away = { x: 600, y: 600 }

const steps = []
const step = async (name, action) => {
  await action()
  await wait(150)
  steps.push([name, await probe()])
}

await step('静止（指针在段外）', () => move(away.x, away.y))
await step('指针在预览行上', () => move(overRow.x, overRow.y))
await step('指针离开', () => move(away.x, away.y))
await step('行上面板开着、指针在段外', async () => {
  await evaluate(`document.querySelector('${scrollSel} .row').setAttribute('data-wg-panel-open', '')`)
  await move(away.x, away.y)
})
await step('面板关闭', () =>
  evaluate(`document.querySelector('${scrollSel} .row').removeAttribute('data-wg-panel-open')`),
)
await step('闸门关闭（没有行被裁掉）+ 指针在预览行上', async () => {
  await evaluate(`document.querySelector('${hashed('pinnedSection')}').removeAttribute('data-wg-expandable')`)
  await move(overRow.x, overRow.y)
})

const expected = [
  ['174px', 'hidden'],
  ['242px', 'visible'],
  ['174px', 'hidden'],
  ['242px', 'visible'],
  ['174px', 'hidden'],
  ['174px', 'visible'],
]
console.log(`媒体档：(hover: hover) = ${hoverCapable}`)
if (!hoverCapable) {
  console.error('媒体模拟没生效：页面仍按 (hover: none) 求值，悬停那条规则不会生效')
}
let failed = !hoverCapable
steps.forEach(([name, got], i) => {
  const [maxHeight, clippedVisibility] = expected[i]
  const ok = got.maxHeight === maxHeight && got.clippedVisibility === clippedVisibility
  if (!ok) failed = true
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(34)} max-height=${got.maxHeight.padEnd(7)} ` +
      `被裁行=${got.clippedVisibility.padEnd(7)} 段高=${got.sectionHeight}`,
  )
})
ws.close()
process.exit(failed ? 1 : 0)
