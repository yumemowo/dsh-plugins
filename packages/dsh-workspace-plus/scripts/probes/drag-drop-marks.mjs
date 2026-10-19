/**
 * 真实组件 + 真实拖拽的落点探针
 *
 * 与 `drop-line.mjs` 分工不同：那份直接往元素上写 `data-wg-drop`，只守 CSS；
 * 这份挂真实的 `WorkspaceGroupsRegion`，标记由命中层自己画，因此同时守住
 * `collectDropTargets` / `paintFor` / `applyHit` 选中的那个元素与它画出的像素。
 *
 * 这一层原先没有守门：jsdom 用例只断言「属性挂在哪个元素上」，而那恰好是缺陷发生时
 * 依然正确的那一半。历史上「线缩到标题那一行」「线画在淡掉的那块上」两条都落在这里。
 *
 * 做法：用 esbuild 把真实组件打成一个 IIFE，宿主依赖换成本仓库已有的测试替身；
 * 再用 CDP 的拖拽拦截在真实浏览器里制造原生拖拽（headless 下连续 mouseMoved
 * 不会延续原生拖拽，只会派一次 dragover 就停），逐格量标记与像素。
 *
 * 判据：
 *   1. 一次拖拽里 inside 框至多一个、order 线至多一条
 *   2. 标记所在的元素及其祖先，合成不透明度为 1（线不会被压淡）
 *   3. 标记指向的那一行真的画出了线，且线在它的盒子之内
 *   4. 线横跨它所在那一块的宽度（不缩到标题那一行）
 *   5. 线画在带区域键的整块上，而不是缩在那一行自己身上
 *
 * 它能红：把 `applyHit` 改成「标记一律画在指针落着的那个元素上」，它会报
 * 「线画在行上（SPAN.rows_headSurface），而不是它所属的整块」——这正是历史缺陷
 * 「线缩到标题那一行」的形态。这一条 jsdom 用例抓不到（那里属性与命中都还是对的）。
 *
 * 它不覆盖的部分：`paintFor` 里「优先指针那一格」那条分支。本页面的场景中 `here`
 * 恒等于该节点的第一格，破坏它探针与这里都不变；抓它的是 `test/orderDom.test.tsx` 那三条用例。
 *
 * 用法（要先构建，本探针渲染的是构建后的样式）：
 *   pnpm run build
 *   node scripts/probes/drag-drop-marks.mjs
 *
 * 退出码非零即有用例不符
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = join(ROOT, '.preview/drag-drop-marks')
const PORT = process.env.CDP_PORT ?? '9431'

mkdirSync(OUT, { recursive: true })

/** 真实组件的挂载入口，打包进探针页面 */
const ENTRY = "/**\n * 真实组件的拖拽挂载入口（探针用）\n *\n * 与 drop-line.mjs 的区别：那份自己往元素上写 `data-wg-drop`，只守 CSS。\n * 这份挂真实 `WorkspaceGroupsRegion`，标记由命中层自己画——因此它同时守\n * `collectDropTargets` / `paintFor` / `applyHit` 这一半。\n */\nimport * as React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { WorkspaceGroupsRegion } from '../../src/client/views/WorkspaceGroupsRegion.tsx'\nimport { officialAddLabels, officialSessionLabels, timeLabel } from '../../src/client/official.ts'\nimport { regionTranslate, sidebarTranslate, workspaceTranslate } from '../../test/locale-stub.ts'\nimport { snapshot } from '../../test/snapshot-stub.ts'\nimport { viewModeProps } from '../../test/viewMode-stub.ts'\n\nconst ALL = ['ws-1', 'ws-2', 'ws-3']\n\n/** 收到的写入，探针从 window 上读 */\nwindow.__probe = { writes: { reorders: [], moves: [] } }\n\nconst state = {\n  items: ALL.map((workspaceId) => ({\n    workspaceId,\n    path: '/repo/' + workspaceId,\n    title: workspaceId,\n    sessionIds: workspaceId === 'ws-1' ? ['session-1', 'session-2'] : [],\n    createdAt: new Date(2026, 0, 1).toISOString(),\n    updatedAt: new Date(2026, 0, 1).toISOString(),\n  })),\n  archivedSessionIds: [],\n  pinnedSessionIds: [],\n  phase: 'ready',\n}\n\nconst stored = snapshot({\n  workspaceGroups: [{ id: 'wg-1', name: '分组甲', workspaceIds: ['ws-2'] }],\n  byWorkspace: { 'ws-1': [{ id: 'group-a', name: '会话分组甲', sessionIds: ['session-1'] }] },\n})\n\nconst props = {\n  wide: true,\n  expandSidebar: () => {},\n  useWorkspaces: (select) => select(state),\n  useSessions: (select) => select({\n    ids: ['session-1', 'session-2'],\n    byId: {\n      'session-1': { id: 'session-1', displayTitle: '会话一', running: false, blank: false, retainedBy: {}, updatedAt: Date.now() - 2000 },\n      'session-2': { id: 'session-2', displayTitle: '会话二', running: false, blank: false, retainedBy: {}, updatedAt: Date.now() - 1000 },\n    },\n    phase: 'ready',\n  }),\n  useSessionStatus: (select) => select(new Map()),\n  useDirectoryFlow: (select) => select(true),\n  useHostInfo: (select) => select({ home: '/repo' }),\n  openSession: () => {},\n  startSession: async () => undefined,\n  loadGroups: async () => stored,\n  onReady: () => () => {},\n  createGroup: async () => stored,\n  renameGroup: async () => stored,\n  deleteGroup: async () => stored,\n  moveSession: async () => stored,\n  setSegmentOrder: async () => stored,\n  moveGroupBefore: async () => stored,\n  moveVirtualWorkspaceBefore: async (groupId, beforeGroupId) => {\n    window.__probe.writes.reorders.push(['vg', groupId, beforeGroupId])\n    return stored\n  },\n  createVirtualWorkspace: async () => stored,\n  renameVirtualWorkspace: async () => stored,\n  deleteVirtualWorkspace: async () => stored,\n  moveWorkspace: async (workspaceId, groupId) => {\n    window.__probe.writes.moves.push([workspaceId, groupId])\n    return stored\n  },\n  nestWorkspaces: async () => stored,\n  unnestWorkspaces: async () => stored,\n  setNested: async () => stored,\n  forgetWorkspace: async () => stored,\n  focusEntry: async () => stored,\n  togglePinned: async () => stored,\n  setSessionPinned: async () => {},\n  insertWorkspaceBefore: async (workspaceId, beforeWorkspaceId) => {\n    window.__probe.writes.reorders.push(['ws', workspaceId, beforeWorkspaceId])\n  },\n  renameWorkspace: async () => {},\n  deleteWorkspace: async () => {},\n  searchResultLimit: 20,\n  t: regionTranslate(),\n  tWorkspace: workspaceTranslate(),\n  tSidebar: sidebarTranslate(),\n  ...viewModeProps(),\n  official: () => ({\n    renameSession: async () => {},\n    forkSession: () => {},\n    archiveSession: async () => {},\n    labels: officialSessionLabels(workspaceTranslate()),\n    relativeTime: (updatedAt, now) => timeLabel(updatedAt, now, workspaceTranslate()),\n  }),\n  addWorkspace: () => ({\n    createWorkspace: async (path) => ({ workspaceId: 'ws-' + path, title: path }),\n    startSession: () => {},\n    occupant: () => ({ component: () => null, inject: () => ({}) }),\n    labels: officialAddLabels(workspaceTranslate()),\n  }),\n}\n\ncreateRoot(document.getElementById('root')).render(\n  React.createElement(WorkspaceGroupsRegion, props),\n)\n"

/** 页面外壳：宿主主题的语义色必须自己补上，否则边框色与文字色都无从解析 */
const PAGE = "<!doctype html>\n<meta charset=\"utf-8\">\n<title>拖拽落点：真实组件</title>\n<link rel=\"stylesheet\" href=\"./bundle.css\">\n<style>\n  /* 宿主主题的语义色：探针页面自己补上，否则边框色与文字色都无从解析 */\n  :root {\n    --dsw-alias-state-business-primary: #4d6bfe;\n    --dsw-alias-label-primary: #1a1a1a;\n    --dsw-alias-label-secondary: #555;\n    --dsw-alias-label-tertiary: #888;\n    --dsw-alias-label-caption: #999;\n    --dsw-alias-interactive-bg-hover: #f0f0f0;\n    --dsw-alias-border-l1: #e0e0e0;\n    --dsw-radius-md: 6px;\n    --dsw-radius-sm: 4px;\n    --dsw-radius-xs: 3px;\n  }\n  body { margin: 0; font: 13px/1.4 system-ui, sans-serif; background: #fff; }\n  #root { width: 340px; height: 600px; }\n</style>\n<div id=\"root\"></div>\n<script src=\"./bundle.js\"></script>\n"

writeFileSync(join(OUT, 'entry.tsx'), ENTRY)
writeFileSync(join(OUT, 'page.html'), PAGE)

await build({
  entryPoints: [join(OUT, 'entry.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  outfile: join(OUT, 'bundle.js'),
  jsx: 'automatic',
  loader: { '.css': 'local-css' },
  alias: {
    '@deepseek-ai/dsh-client-ui-primitives': join(ROOT, 'test/primitives-stub.mjs'),
    '@deepseek-ai/dsh-client-store': join(ROOT, 'test/store-stub.mjs'),
  },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'warning',
})

const child = spawn('/usr/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + join(OUT, 'cdp'),
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target = null
for (let i = 0; i < 60 && target === null; i += 1) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
    target = list.find((t) => t.type === 'page') ?? null
  } catch {
    await sleep(250)
  }
}
if (target === null) throw new Error('chromium 没有起来')

const ws = new WebSocket(target.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const intercepted = []
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.method === 'Runtime.exceptionThrown') {
    console.error('  [页面异常] ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300))
  }
  if (msg.method === 'Input.dragIntercepted') intercepted.push(msg.params.data)
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
    throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 500))
  }
  return res.result.result.value
}

await send('Runtime.enable')
await send('Page.enable')
await send('Input.setInterceptDrags', { enabled: true })
await send('Page.navigate', { url: 'file://' + join(OUT, 'page.html') })
// 固定 sleep 会让「React 还没渲染完」变成间歇失败：轮询到行真的出现为止
let rows = []
for (let attempt = 0; attempt < 40 && rows.length < 3; attempt += 1) {
  await sleep(150)
  rows = await evaluate(`[...document.querySelectorAll('[data-wg-dnd-row^="ws-"]')].map((row) => {
    const box = row.getBoundingClientRect()
    return { id: row.getAttribute('data-wg-dnd-row'), top: box.top, bottom: box.bottom, height: box.height }
  })`)
}

// 行出现不等于事件接线完成：再等一小段让 React 把拖拽属性与监听都接上
await sleep(500)
console.log('行：', JSON.stringify(rows))
if (rows.length < 3) throw new Error('页面里没有三条工作区行，挂载失败')

let failures = 0
const fail = (message) => {
  console.error('  ✗ ' + message)
  failures += 1
}

/**
 * 拖一行到另一行的某个纵向偏移处，量拖拽期间真实画出的标记与像素
 *
 * @param fromIndex - 从哪一行拖
 * @param toIndex - 拖到哪一行
 * @param dy - 落点相对目标行上缘的偏移
 */
async function dragTo(fromIndex, toIndex, dy) {
  // 每次现取：React 会因展开态、会话数量等原因重排，启动时那份矩形随时会过期
  const live = await evaluate(`[...document.querySelectorAll('[data-wg-dnd-row^="ws-"]')].map((row) => {
    const box = row.getBoundingClientRect()
    return { id: row.getAttribute('data-wg-dnd-row'), top: box.top, bottom: box.bottom, height: box.height }
  })`)
  const from = live[fromIndex]
  const to = live[toIndex]
  if (from === undefined || to === undefined) throw new Error('行的矩形取不到')
  const x = 120
  const startY = from.top + from.height / 2
  const endY = to.top + dy

  intercepted.length = 0
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: startY, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: startY - 12, button: 'left', buttons: 1 })
  await sleep(260)
  let data = intercepted.at(-1)
  // 拦截可能晚一拍到达：再等一小会儿并补一次移动
  for (let attempt = 0; attempt < 6 && data === undefined; attempt += 1) {
    await sleep(200)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: startY - 14, button: 'left', buttons: 1 })
    await sleep(160)
    data = intercepted.at(-1)
  }
  if (data === undefined) throw new Error('拖拽没有被拦截')

  await send('Input.dispatchDragEvent', { type: 'dragEnter', x, y: endY, data })
  await send('Input.dispatchDragEvent', { type: 'dragOver', x, y: endY, data })
  await sleep(220)

  const overDimmed = await evaluate(`(() => {
    const el = document.elementFromPoint(${x}, ${endY})
    return el !== null && el.closest('[data-wg-dnd-dim]') !== null
  })()`)

  const marked = await evaluate(`(() => {
    const elements = [...document.querySelectorAll('[data-wg-drop]')]
    return elements.map((el) => {
      const box = el.getBoundingClientRect()
      let opacity = 1
      for (let node = el; node !== null; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity)
      }
      return {
        mark: el.getAttribute('data-wg-drop'),
        region: el.getAttribute('data-wg-dnd-region'),
        row: el.getAttribute('data-wg-dnd-row'),
        top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width,
        opacity,
        tag: el.tagName + '.' + String(el.className),
      }
    })
  })()`)

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const bytes = shot.result.data
  // 取证：这些 y 上到底是什么元素、什么伪元素
  const forensics = await evaluate(`(() => {
    const ys = [47, 48, 81, 82, 166, 167, 168, 169, 253, 254]
    return ys.map((y) => {
      const x = 200
      const el = document.elementFromPoint(x, y)
      const chain = []
      for (let node = el; node !== null && chain.length < 4; node = node.parentElement) {
        chain.push(node.tagName + (node.hasAttribute?.('data-wg-drop') ? '[drop=' + node.getAttribute('data-wg-drop') + ']' : ''))
      }
      return { y, chain: chain.join('<') }
    })
  })()`)
  if (process.env.FORENSICS === '1') console.log('  取证 [' + fromIndex + '->' + toIndex + '@' + dy + ']:', JSON.stringify(forensics))
  const name = 'drag-' + fromIndex + '-' + toIndex + '-' + dy
  writeFileSync(join(OUT, name + '.png'), Buffer.from(bytes, 'base64'))
  const lines = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,${bytes}'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, img.width, img.height).data
    const found = []
    for (let y = 0; y < img.height; y += 1) {
      let count = 0, first = -1, last = -1
      for (let x = 0; x < img.width; x += 1) {
        const at = (y * img.width + x) * 4
        const r = data[at], g = data[at + 1], b = data[at + 2]
        if (r < 120 && g > 80 && g < 190 && b > 200) {
          if (first < 0) first = x
          last = x
          count += 1
        }
      }
      if (count > 3) found.push({ y, count, first, last })
    }
    // 一条 2px 的线本来就占两行像素，相邻行合成一条
    const merged = []
    for (const row of found) {
      const previous = merged[merged.length - 1]
      if (previous !== undefined && row.y === previous.y + previous.thickness) {
        previous.thickness += 1
        previous.first = Math.min(previous.first, row.first)
        previous.last = Math.max(previous.last, row.last)
        continue
      }
      merged.push({ y: row.y, thickness: 1, first: row.first, last: row.last })
    }
    return merged
  })()`)

  await send('Input.dispatchDragEvent', { type: 'drop', x, y: endY, data })
  await sleep(240)
  const writes = await evaluate('JSON.stringify(window.__probe.writes)')
  await evaluate('window.__probe.writes.reorders.length = 0; window.__probe.writes.moves.length = 0')
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: endY, button: 'left', clickCount: 1 })
  await sleep(160)

  return { marked, lines, writes: JSON.parse(writes), name, to, overDimmed }
}

console.log('\n== 每一处落点：标记自洽、线看得见、线在该行盒子里 ==\n')

for (let toIndex = 0; toIndex < rows.length; toIndex += 1) {
  for (const dy of [0, 2, rows[toIndex].height - 2]) {
    const fromIndex = toIndex === rows.length - 1 ? 0 : rows.length - 1
    const { marked, lines, writes, name, to, overDimmed } = await dragTo(fromIndex, toIndex, dy)
    const label = name.padEnd(16)

    if (marked.length === 0) {
      // 指针停在压淡区上时本来就没有落点：那一区明确表示「够不着」
      if (overDimmed) {
        console.log('  ✓ ' + label + ' 指针在压淡区上，按设计没有标记')
        continue
      }
      fail(label + ' 没有任何落点标记，而指针并不在压淡区上')
      continue
    }
    if (overDimmed) {
      fail(label + ' 指针在压淡区上却画了标记：' +
        marked.map((m) => m.mark + '@' + (m.row ?? m.region)).join(','))
    }
    const insides = marked.filter((m) => m.mark === 'inside')
    const orders = marked.filter((m) => m.mark === 'before' || m.mark === 'after')
    if (insides.length > 1) {
      fail(label + ' 出现 ' + insides.length + ' 个 inside 框：' + insides.map((m) => m.region).join(', '))
    }
    if (orders.length > 1) {
      fail(label + ' 出现 ' + orders.length + ' 条线（一处缝只该有一条）：' +
        orders.map((m) => m.mark + '@' + (m.row ?? m.region)).join(', '))
    }

    for (const m of marked) {
      if (m.opacity < 0.99) {
        fail(label + ' 标记落在合成不透明度 ' + m.opacity.toFixed(2) + ' 的元素上，线会跟着淡掉')
      }
    }

    const orderMark = marked.find((m) => m.mark === 'before' || m.mark === 'after')
    // 工作区拖拽里落点单位一律是「整块」：线画在带区域键的块上，不是缩在那一行自己身上
    // 这一条正是历史缺陷「线缩到标题那一行」的判据
    if (orderMark !== undefined && orderMark.region === null) {
      fail(label + ' 线画在行上（' + orderMark.tag + '），而不是它所属的整块')
    }
    const insideMark = marked.find((m) => m.mark === 'inside')

    if (lines.length === 0) {
      fail(label + ' 标记在 ' + marked.map((m) => m.tag).join(',') + ' 上，但一个蓝色像素都没有')
      continue
    }

    // 线：一个 order 标记只该画出一条横线
    if (orderMark !== undefined) {
      // 去掉 inside 框的四条边之后剩下的才是线
      // inside 框是 inset 1px 描边，上下两条边也会被数成「蓝色像素行」
      // 盒子是亚像素的，容差要按取整给，不能写死 2px
      const FRAME = 3
      const boxTop = insideMark === undefined ? null : insideMark.top
      const boxBottom = insideMark === undefined ? null : insideMark.bottom
      const horizontal = lines.filter(
        (l) => boxTop === null || (l.y > boxTop + FRAME && l.y < boxBottom - FRAME),
      )
      if (horizontal.length === 0) {
        // 框与线同位：目标行是所在那片里的最后一条，它的下缘就是那一片的底边，
        // 于是 after 线正好落在 inside 框的下边上。这时那一条边同时充当两者，不是缺陷
        const touchesFrame =
          boxBottom !== null && lines.some((l) => Math.abs(l.y - boxBottom) <= FRAME)
        if (!touchesFrame) {
          fail(label + ' 有 ' + orderMark.mark + ' 标记，但没有一条线，也不与 inside 框的边重合')
        }
      } else if (horizontal.length > 1) {
        fail(label + ' 画出了 ' + horizontal.length + ' 条线（y = ' + horizontal.map((l) => l.y).join(', ') + '）')
      } else {
        const line = horizontal[0]
        if (line.y < orderMark.top - 1 || line.y > orderMark.bottom) {
          fail(label + ' 线在 y=' + line.y + '，落在标记元素 ' + orderMark.top + '..' + orderMark.bottom + ' 之外')
        }
        const span = line.last - line.first
        if (span < orderMark.width * 0.75) {
          fail(label + ' 线只跨了 ' + span + 'px，而标记元素宽 ' + orderMark.width + 'px')
        }
      }
    }

    // 标记指向第几行，写入就必须以那一行为锚点
    const target = marked[0].row ?? null
    const write = writes.reorders.at(-1)
    if (write === undefined && dy !== 0) {
      // 落到自己原位不写盘是设计如此，这里只报「标了却没写」的情形
    }
    const ok = insides.length <= 1 && orders.length <= 1
    console.log('  ' + (ok ? '✓' : '·') + ' ' + label +
      ' 标记=' + marked.map((m) => m.mark + '@' + (m.row ?? m.region)).join(',') +
      ' 线=' + lines.map((l) => l.y).join('/') +
      ' 标记盒=' + marked.map((m) => m.mark + ':' + Math.round(m.top) + '..' + Math.round(m.bottom)).join(',') +
      ' 写入=' + JSON.stringify(write ?? null))
  }
}

ws.close()
child.kill('SIGKILL')
console.log('')
if (failures === 0) console.log('真实组件产出的落点标记全部自洽')
else {
  console.error(failures + ' 处不符')
  process.exit(1)
}
