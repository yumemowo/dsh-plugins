/**
 * 行带没有空档的真实浏览器探针
 *
 * 行与行之间的那点间距原先写成相邻兄弟的 `margin-top`，撑开体里那道 2px 则写成体内容器的上内边距。
 * 两处都是「不属于任何一行」的像素：命中测试落到上面时拿到的是容器（`.sessions` / `.workspaceBody`），
 * 因此按元素命中算落点的拖拽逻辑在指针停进那条缝里时读不出可用的行。
 *
 * 现在改成每一行自己带着那点间距：外层是一条「带」，上内边距 `--wg-row-lead` 吃掉与上一行之间的空隙，
 * 内层「药丸」保持原来的可见尺寸。本探针做三件事：
 *   1. 从构建产物 `lib/client.js` 里取出**编译后**的样式表（类名已带哈希）
 *   2. 按实际类名拼一个最小页面，覆盖列表里全部行边界：虚拟分组头 → 工作区行 → 子工作区行 → 会话分组头 → 会话行，
 *      其中一段会话行还套上官方悬停卡片那层包装
 *   3. 用 chromium 沿整条列表的纵向逐像素做命中测试，要求每一像素都落在某条行（或它的后代）上
 *
 * 同时量三件回退的东西：
 *   - 这些行上没有任何 margin（改了样式却漏删一处时最先坏的就是这条）
 *   - 药丸尺寸仍是 32 / 34（视觉不因带变高而变）
 *   - 相邻两条的「药丸上缘」间距仍是改之前那几个值：段内 2px、顶层两个工作区之间 4px
 *
 * 用法（读的是 `lib/` 里那份编译产物，因此先构建）：
 *   pnpm run build
 *   node scripts/probes/row-band.mjs
 *
 * 退出码非零即有用例不符
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const OUT_DIR = join(ROOT, '.preview')

/** 会话行药丸 32，容器行 / 分组头药丸 34，会话溢出按钮 28，与官方同值 */
const ROW_HEIGHT_PX = 32
const HEAD_HEIGHT_PX = 34
const OVERFLOW_HEIGHT_PX = 28
/** 容器行下缘到空态文案的距离：改之前的 2px 体内间距 + 空态自身 16px 上内边距 */
const EMPTY_GAP_PX = 18
/** 亚像素取整的容差 */
const TOLERANCE_PX = 0.5

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
const css = cssLiteral(bundle, 'workspaceHead{')
const prefix = css.match(/\.([A-Za-z0-9_]+?)_workspaceHead\{/)?.[1]
if (prefix === undefined) throw new Error('产物样式表里没找到 workspaceHead 类名')

/** 把源文件里的裸类名换成产物里的哈希类名，被测的就是构建产物那份规则 */
const h = (name) => `${prefix}_${name}`

/** 一条会话行：带 + 药丸 + 标题，与 `SessionRowView` 的实际结构同形 */
const sessionRow = (title) =>
  `<div class="${h('row')}"><span class="${h('rowSurface')}">` +
  `<span class="${h('rowTitle')}">${title}</span></span></div>`

/** 挂上官方悬停卡片的会话行：行外面多一层包装（官方原语的根节点，display: block 的 span） */
const wrappedSessionRow = (title) => `<span class="hover-card">${sessionRow(title)}</span>`

/** 一条容器行（工作区行 / 会话分组头 / 工作区分组头）：带 + 药丸 + 标题 */
const headRow = (className, title) =>
  `<div class="${className}"><span class="${h('headSurface')}">` +
  `<span class="${h('workspaceTitle')}">${title}</span></span></div>`

/** 撑开体：轨道 + 裁剪区 + 体 */
const expand = (inner) =>
  `<div class="${h('expand')} ${h('expandOpen')}"><div class="${h('expandClip')}">${inner}</div></div>`

/** 会话溢出按钮：与行同段，最后一项 */
const overflowButton = (label) =>
  `<button type="button" class="${h('sessionOverflow')}">${label}</button>`

const sessions = (rows) => `<div class="${h('sessions')}">${rows.join('')}</div>`

/** 一个工作区块，深度由参数下发（样式表只把它当数值用） */
const workspace = (title, body, depth) =>
  `<section class="${h('workspace')}" style="--wg-depth:${depth}">` +
  headRow(h('workspaceHead'), title) +
  expand(`<div class="${h('workspaceBody')}">${body}</div>`) +
  `</section>`

/** 一个空的工作区块：撑开体里只有那句占位文案（它自己承担那点间距，见 rows.module.css） */
const emptyWorkspace = (title) =>
  `<section class="${h('workspace')}" style="--wg-depth:0">` +
  headRow(h('workspaceHead'), title) +
  expand(`<div class="${h('workspaceBody')}"><div class="${h('empty')}" data-wg-stagger="">暂无会话</div></div>`) +
  `</section>`

/** 一个会话分组：分组头 + 撑开体里的会话段 */
const groupSection = (title, rows) =>
  `<div class="${h('group')}" style="--wg-depth:0">` +
  headRow(h('groupHead'), title) +
  expand(`<div class="${h('groupBody')}">${sessions(rows)}</div>`) +
  `</div>`

/** 一个工作区分组：与工作区行同形的分组头 + 组内的工作区 */
const virtualSection = (title, children) =>
  `<div class="${h('virtualWorkspace')}">` +
  headRow(`${h('groupHead')} ${h('virtualWorkspaceHead')}`, title) +
  expand(`<div class="${h('virtualWorkspaceBody')}">${children.join('')}</div>`) +
  `</div>`

// 结构覆盖全部行边界：虚拟分组头 → 组内工作区行 → 子工作区行 → 会话分组头 → 会话行，并有一条行套着悬停卡片包装
const list = [
  virtualSection('虚拟分组', [
    workspace('组内工作区', sessions([sessionRow('组内会话')]), 1),
    workspace('组内工作区二', sessions([sessionRow('组内会话二')]), 1),
  ]),
  workspace(
    '工作区一',
    [
      `<div class="${h('nest')}">`,
      workspace('子工作区', sessions([sessionRow('子会话')]), 1),
      workspace('子工作区二', sessions([sessionRow('子会话二')]), 1),
      '</div>',
      groupSection('会话分组', [sessionRow('分组成员'), sessionRow('分组成员二')]),
      sessions([
        sessionRow('未归组一'),
        wrappedSessionRow('未归组二'),
        overflowButton('展开其余 3 个会话'),
      ]),
    ].join(''),
    0,
  ),
  workspace('工作区二', sessions([sessionRow('第二条工作区的会话')]), 0),
].join('')

const ROW = h('row')
const HEAD = h('workspaceHead')
const GROUP_HEAD = `${h('groupHead')}`
const SURFACE = h('rowSurface')
const OVERFLOW = h('sessionOverflow')

const page = `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 13px sans-serif; width: 300px; }
  /* 官方悬停卡片的包装盒：display: block 的 span，自身不带内外边距 */
  .hover-card { display: block; }
  ${css}
  /* 页面外壳这几项产物里由别的表或宿主给：撑开体恒展开（animate 的时长变量） */
  ${h('expand')} { grid-template-rows: 1fr; }
</style>
<div id="list">${list}</div>
<!-- 空态不是行，不参与逐像素命中测试：它单列出来量「容器行下缘 → 占位文案」这一段 -->
<div id="extra">${emptyWorkspace('空工作区')}</div>
<script>
  const list = document.getElementById('list')

  /** 全部「带」：会话行、工作区行、分组头、会话溢出按钮，按文档序 */
  const bands = [
    ...list.querySelectorAll('.${ROW}, .${HEAD}, .${GROUP_HEAD}, .${OVERFLOW}'),
  ]

  /**
   * 一条带的几何：整条带的盒子、里面那颗药丸的盒子、以及带自己的 margin
   *
   * 溢出按钮本身既是带也是可见盒（它没有药丸那一层），因此它的「药丸高」按带高减去上内边距算
   */
  const band = (element) => {
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const surface = element.firstElementChild
    const surfaceBox = surface === null ? null : surface.getBoundingClientRect()
    return {
      title:
        (element.querySelector('.${h('rowTitle')}, .${h('workspaceTitle')}') || {}).textContent ||
        (element.textContent || ''),
      kind: element.classList.contains('${h('row')}')
        ? 'row'
        : element.classList.contains('${OVERFLOW}')
          ? 'overflow'
          : 'head',
      top: box.top,
      bottom: box.bottom,
      surfaceTop: surfaceBox === null ? box.top + parseFloat(style.paddingTop || '0') : surfaceBox.top,
      surfaceHeight:
        surfaceBox === null ? box.height - parseFloat(style.paddingTop || '0') : surfaceBox.height,
      lead: style.getPropertyValue('--wg-row-lead'),
      marginTop: style.marginTop,
      marginBottom: style.marginBottom,
    }
  }

  // 整条列表的纵向逐像素命中测试：每一像素都必须落在某一条带（或它的后代）上
  const first = bands[0].getBoundingClientRect()
  const last = bands[bands.length - 1].getBoundingClientRect()
  const x = Math.round(first.left + 20)
  const gaps = []
  for (let y = Math.ceil(first.top); y < Math.floor(last.bottom); y += 1) {
    const hit = document.elementFromPoint(x, y + 0.5)
    const owner = hit && hit.closest('.${ROW}, .${HEAD}, .${GROUP_HEAD}, .${OVERFLOW}')
    if (owner === null) {
      gaps.push({ y, tag: hit ? hit.tagName : 'null', cls: hit ? String(hit.className) : '' })
    }
  }

  // 空态那一段：容器行下缘到占位文案上缘的距离。
  // 改之前它是「体内容器 2px + 空态自己 16px」，现在是「空态自己 18px」，两版必须相等
  const emptyHost = document.getElementById('extra')
  const emptyHead = emptyHost.querySelector('.${HEAD}')
  const emptyText = emptyHost.querySelector('.${h('empty')}')
  const emptyGap =
    emptyHead === null || emptyText === null
      ? null
      : emptyText.getBoundingClientRect().top +
        parseFloat(getComputedStyle(emptyText).paddingTop || '0') -
        emptyHead.getBoundingClientRect().bottom

  document.body.setAttribute('data-report', JSON.stringify({
    bands: bands.map(band),
    gaps,
    emptyGap,
  }))
</script>
`

mkdirSync(OUT_DIR, { recursive: true })
const pagePath = join(OUT_DIR, 'row-band.html')
writeFileSync(pagePath, page)

// 必须带 --user-data-dir：默认目录在只读环境下会让 chromium 直接起不来
const dom = execFileSync(
  '/usr/bin/chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    // 视口要容得下整条列表，否则逐像素命中测试在视口之外一律拿到 null
    '--window-size=360,2000',
    `--user-data-dir=${join(OUT_DIR, 'cp-row-band-probe')}`,
    '--dump-dom',
    `file://${pagePath}`,
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
)

const at = dom.indexOf('data-report="')
const end = dom.indexOf('"', at + 'data-report="'.length)
const report = JSON.parse(dom.slice(at + 'data-report="'.length, end).replaceAll('&quot;', '"'))
const bands = report.bands

const failures = []
const fail = (message) => failures.push(message)
const near = (actual, expected) => Math.abs(actual - expected) <= TOLERANCE_PX

// 1) 这些行上不可能有 margin：margin 不属于任何一行，命中测试会落到容器上
for (const entry of bands) {
  if (entry.marginTop !== '0px' || entry.marginBottom !== '0px') {
    fail(`「${entry.title}」带着 margin：top=${entry.marginTop} bottom=${entry.marginBottom}`)
  }
}

// 2) 逐像素命中：整条列表从头到尾不该有一处落在容器上
if (report.gaps.length > 0) {
  const sample = report.gaps
    .slice(0, 6)
    .map((gap) => `y=${gap.y} <${gap.tag} class="${gap.cls}">`)
    .join(', ')
  fail(`${report.gaps.length} 个像素落在容器上而不是某条行上：${sample}`)
}

// 3) 视觉不变：药丸仍是 32（会话行）/ 34（容器行与分组头）/ 28（会话溢出按钮）
for (const entry of bands) {
  const expected =
    entry.kind === 'row' ? ROW_HEIGHT_PX : entry.kind === 'overflow' ? OVERFLOW_HEIGHT_PX : HEAD_HEIGHT_PX
  if (!near(entry.surfaceHeight, expected)) {
    fail(`「${entry.title}」的药丸高 ${entry.surfaceHeight}，应为 ${expected}`)
  }
}

// 4) 行距仍是改之前那几个值：相邻两条的药丸上缘之差 = 上一条药丸高 + 这条带自己吃下的间距
//    间距只有改之前那三种：段内第一条 0（体内首条行本来就没有空隙）、其余 2px、
//    顶层两个工作区之间 4px
const leads = new Set()
for (let index = 1; index < bands.length; index += 1) {
  const previous = bands[index - 1]
  const current = bands[index]
  const lead = Number((current.lead || '0').replace('px', '').trim() || '0')
  leads.add(lead)
  if (lead !== 0 && lead !== 2 && lead !== 4) {
    fail(`「${current.title}」吃下的间距是 ${lead}px，改之前只有 0 / 2 / 4`)
  }
  const pitch = current.surfaceTop - previous.surfaceTop
  if (!near(pitch, previous.surfaceHeight + lead)) {
    fail(
      `「${previous.title}」→「${current.title}」的实际间距 ` +
        `${(pitch - previous.surfaceHeight).toFixed(1)}px，与下发的 ${lead}px 不符`,
    )
  }
}
// 顶层两个工作区之间那 4px 必须仍然存在，否则工作区块之间会贴在一起
if (!leads.has(4)) fail('没有任何一条带吃下 4px：顶层两个工作区之间的间距丢了')

// 5) 空态不是行，没有带可以承担那 2px：改之前是「体内 2px + 自身 16px」，现在由它自己出 18px，
//    两种写法的文案落点必须一致（这一档只在真实浏览器里量得出来）
if (report.emptyGap === null) {
  fail('页面里没量到空态那一段')
} else if (!near(report.emptyGap, EMPTY_GAP_PX)) {
  fail(`「容器行 → 空态文案」是 ${report.emptyGap.toFixed(1)}px，改之前是 ${EMPTY_GAP_PX}px`)
}

console.log(`${bands.length} 条行带，逐像素 ${Math.round(bands[bands.length - 1].bottom - bands[0].top)} 个采样点`)
for (const entry of bands) {
  console.log(
    `  ${entry.title.padEnd(14)} 药丸高 ${entry.surfaceHeight.toFixed(1).padStart(5)}` +
      `  带高 ${(entry.bottom - entry.top).toFixed(1).padStart(5)}` +
      `  --wg-row-lead ${(entry.lead || '0').trim()}`,
  )
}

if (failures.length > 0) {
  console.error(`\n行带没有空档这条不成立：\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('\n行与行之间没有一处空档，药丸尺寸与行距与改之前逐项相同')
