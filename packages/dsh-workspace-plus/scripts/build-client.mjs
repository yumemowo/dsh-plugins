/**
 * 把浏览器半边打成 DSH 客户端可加载的 bundle
 *
 * 产物必须包成 `window.__ModuleLoader__.load({ id, factory })`：
 * 客户端的模块系统按这个契约登记工厂，`id` 必须与 package.json 的包名一致
 * React 等基线模块不打包进产物，而是从工厂的 `require` 参数解析
 *
 * `.module.css` 由 lightningcss 编译成「类名映射 + 注入带 data-plugin 标记的 `<style>`」的虚拟模块
 *
 * 用法：node scripts/build-client.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { transform } from 'lightningcss'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
const outFile = join(packageDir, 'lib/client.js')

// shell 会把这些模块从平台基线表里解析，打进产物会出现第二份实例
// 类型专用导入会被 esbuild 当作无副作用而消除，因此这里只需列出值导入
// clsx 不在基线表里，它随组件样式一起打进产物
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-dom/client',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** 样式标签归属本插件的标识前缀，与运行时注入的 data-plugin 取值同源 */
const PLUGIN_ID = manifest.name

/**
 * 把 `.module.css` 编译成「注入样式 + 导出类名映射」的虚拟模块
 *
 * 虚拟 id 必须不以 `.css` 结尾，否则会被 esbuild 的样式管线接走
 */
const CSS_MODULE_NAMESPACE = 'wg-css-module'

/**
 * 建插件：接管 `.module.css`，产出可被 TS 直接消费的 ESM 源码
 *
 * 只认 `.module.css`：普通 `.css` 留给 esbuild 自己处理，免得两套管线对同一路径各写一次产物
 */
function cssModulesPlugin() {
  return {
    name: 'wg-css-modules',
    setup(build) {
      build.onResolve({ filter: /\.module\.css$/ }, (args) => ({
        path: join(args.resolveDir, args.path),
        namespace: CSS_MODULE_NAMESPACE,
      }))
      build.onLoad({ filter: /.*/, namespace: CSS_MODULE_NAMESPACE }, async (args) => {
        const source = await readFile(args.path, 'utf8')
        // pattern 与官方 tsdown 预设一致：[hash]_[local]
        // 哈希把类名限定在各自模块内，跨模块引用即失效，这正是要的边界
        const { code, exports } = transform({
          filename: args.path,
          code: Buffer.from(source),
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap = {}
        // lightningcss 给出的 exports 键序不稳定，逐次构建会产出不同的字节
        // 排序后再写入，产物因此可复现
        for (const local of Object.keys(exports ?? {}).sort()) classMap[local] = exports[local].name
        // 标签 id 取「包名 + 相对 src 的路径」，与官方预设同构
        const tagId = `${PLUGIN_ID}/${args.path.slice(packageDir.length + 1)}`
        const contents = [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
          "  const tag = document.createElement('style');",
          `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
        return { contents, loader: 'js', resolveDir: dirname(args.path) }
      })
    },
  }
}

mkdirSync(dirname(outFile), { recursive: true })

const result = await build({
  entryPoints: [join(packageDir, 'src/client/index.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: EXTERNAL,
  minify: true,
  write: false,
  logLevel: 'warning',
  // 产物由下面的包装步骤写成单个文件，这里不要额外产物
  outfile: outFile,
  plugins: [cssModulesPlugin()],
})

// 样式已折进 JS，产物应当只有 client.js 一个
// 多出 .css 说明有样式漏过了上面那条只认 .module.css 的规则
const bundled = result.outputFiles.find((file) => file.path === outFile)
if (bundled === undefined) throw new Error('esbuild produced no client bundle')
const stray = result.outputFiles.filter((file) => file.path !== outFile)
if (stray.length > 0) {
  throw new Error(
    `esbuild emitted stray assets: ${stray.map((file) => file.path).join(', ')}`,
  )
}

// 以 CommonJS 形式加载：工厂拿到 require 并返回模块导出
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(manifest.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    (function (module, exports, require) {
${indent(bundled.text, 6)}
    }).call(exports, module, exports, require);
    return module.exports;
  },
});
`

writeFileSync(outFile, wrapped)
console.log(`client bundle written: ${outFile} (${wrapped.length} bytes)`)

/** 给一段代码的每一行加缩进，方便嵌进包装模板 */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n')
}
