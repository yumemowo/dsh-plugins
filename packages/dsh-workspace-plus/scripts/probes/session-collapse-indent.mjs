/**
 * 会话溢出按钮缩进落点的真实浏览器探针
 *
 * jsdom 不算版式，因此「按钮文字与同段会话行标题落在同一条竖线上」只能在真实浏览器里量
 * 本脚本做三件事：
 *   1. 从构建产物 `lib/client.js` 里取出本包那张**编译后**的样式表（类名已带哈希）
 *   2. 按实际类名拼一个最小页面：两层容器（工作区体内、会话分组内）各配三个缩进深度，每个范围一串会话行 + 一条溢出按钮
 *   3. 用 chromium 量每行的标题左缘与按钮文字左缘，要求逐条相同
 *
 * 页面内容全部在这里现造（`会话 s0` 这类假会话），不读宿主的任何配置或真实数据，因此换一台机器也能跑出同一份结论
 *
 * 为什么值得量：按钮与行共用一条选择器表给出 `--wg-row-start`，而标题在那条缩进线上还要多让出
 * `.rowTitle` 的左外边距。少了那个补偿量时按钮只偏 4px，DOM 结构与样式选择器断言都看不出来
 *
 * 用法（读的是 `lib/` 里那份编译产物，因此先构建）：
 *   pnpm run build
 *   node scripts/probes/session-collapse-indent.mjs
 *
 * 退出码非零即有用例不符。不进 `package.json` 的 scripts：跑一次要自带浏览器、读构建产物，
 * 结论也不是那种能进 CI 的断言，写成一个命令会让人以为随便跑跑就行
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')

/** 按钮与行标题应当落在同一条竖线上的两个量，允许的偏差（亚像素取整） */
const TOLERANCE_PX = 0.5

/** 按钮的几何，取自官方那条同类控件 */
const EXPECTED_HEIGHT_PX = 28
const EXPECTED_FONT_SIZE_PX = 12

/**
 * 从产物里取出一段 CSS 字符串字面量
 *
 * 入口是它开头的标记，再回到它前面那个未转义的引号取到收尾引号
 * @param source - `lib/client.js` 的内容
 * @param marker - 该段样式表开头的标记
 */
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
const css = cssLiteral(bundle, 'sessionOverflow{')
const prefix = css.match(/\.([A-Za-z0-9_]+?)_sessionOverflow\{/)?.[1]
if (prefix === undefined) throw new Error('产物样式表里没找到 sessionOverflow 类名')

/** 把源文件里的裸类名换成产物里的哈希类名，被测的就是构建产物那份规则 */
const hashed = (name) => `${prefix}_${name}`

/**
 * 一个展示范围：若干会话行 + 一条溢出按钮
 * @param depth - 该范围下发的缩进层级
 * @param inGroup - 为真时按「工作区内的一个会话分组」的结构拼，否则按「工作区的未归组会话」
 */
function scope(depth, inGroup) {
  const rows = ['会话 s0', '会话 s1'].map(
    (title) =>
      `<div class="${hashed('row')}">` +
      `<span class="${hashed('rowTitle')}">${title}</span></div>`,
  )
  const button = `<button type="button" class="${hashed('sessionOverflow')}">展开其余 3 个会话</button>`
  const sessions = `<div class="${hashed('sessions')}">${rows.join('')}${button}</div>`
  const body = inGroup
    ? `<div class="${hashed('groupBody')}">${sessions}</div>`
    : `<div class="${hashed('workspaceBody')}">${sessions}</div>`
  const inner = inGroup
    ? `<div class="${hashed('expand')} ${hashed('expandOpen')}">` +
      `<div class="${hashed('expandClip')}">${body}</div></div>`
    : body
  const shell = inGroup
    ? `<div class="${hashed('group')}" style="--wg-depth:${depth}">${inner}</div>`
    : `<div class="${hashed('workspace')}" style="--wg-depth:${depth}">${inner}</div>`
  return shell
}

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 13px sans-serif; width: 300px; }
  ${css}
</style>
${[0, 1, 2].map((depth) => scope(depth, false)).join('\n')}
${[0, 1, 2].map((depth) => scope(depth, true)).join('\n')}
<script>
  // 每个按钮与它同段的第一条会话行配对：按全局序号配对会错位（每个范围有两条行）
  const buttons = [...document.querySelectorAll('.${hashed('sessionOverflow')}')]
  const report = buttons.map((button, index) => {
    const scope = button.parentElement
    const row = scope.querySelector('.${hashed('row')}')
    const style = getComputedStyle(button)
    const box = button.getBoundingClientRect()
    return {
      scope: index < 3 ? 'workspace-' + index : 'group-' + (index - 3),
      titleLeft: row.querySelector('.${hashed('rowTitle')}').getBoundingClientRect().left,
      buttonTextLeft: box.left + parseFloat(style.paddingLeft),
      height: box.height,
      fontSize: parseFloat(style.fontSize),
      right: box.right,
      rowRight: row.getBoundingClientRect().right,
    }
  })
  document.body.setAttribute('data-report', JSON.stringify(report))
</script>
`

mkdirSync(OUT_DIR, { recursive: true })
const pagePath = join(OUT_DIR, 'session-collapse-indent.html')
writeFileSync(pagePath, page)

// 必须带 --user-data-dir：默认目录在只读环境下会让 chromium 直接起不来
const dom = execFileSync(
  '/usr/bin/chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${join(OUT_DIR, 'cp-collapse-probe')}`,
    '--dump-dom',
    `file://${pagePath}`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)

const at = dom.indexOf('data-report="')
const end = dom.indexOf('"', at + 'data-report="'.length)
const report = JSON.parse(dom.slice(at + 'data-report="'.length, end).replaceAll('&quot;', '"'))

const failures = []
for (const entry of report) {
  const offset = Math.abs(entry.buttonTextLeft - entry.titleLeft)
  const aligned = offset <= TOLERANCE_PX
  const sized = entry.height === EXPECTED_HEIGHT_PX && entry.fontSize === EXPECTED_FONT_SIZE_PX
  const full = Math.abs(entry.right - entry.rowRight) <= TOLERANCE_PX
  if (!aligned || !sized || !full) failures.push(entry.scope)
  console.log(
    `${entry.scope.padEnd(11)} 标题左缘 ${entry.titleLeft.toFixed(1).padStart(6)}` +
      `  按钮文字左缘 ${entry.buttonTextLeft.toFixed(1).padStart(6)}` +
      `  高度 ${entry.height}  字号 ${entry.fontSize}` +
      `  右缘 ${entry.right.toFixed(1)} / 行 ${entry.rowRight.toFixed(1)}` +
      `  ${aligned && sized && full ? 'ok' : 'FAIL'}`,
  )
}

if (report.length === 0) {
  console.error('页面里一个溢出按钮也没有：探针没量到东西')
  process.exit(1)
}
if (failures.length > 0) {
  console.error(`缩进落点不符：${failures.join(', ')}`)
  process.exit(1)
}
console.log(`\n${report.length} 个落点全部与同段会话行的标题对齐，按钮几何与官方一致`)
