/**
 * 把浏览器半边打成 DSH 客户端可加载的 bundle。
 *
 * 产物必须包成 `window.__ModuleLoader__.load({ id, factory })`：
 * 客户端的模块系统按这个契约登记工厂，`id` 必须与 package.json 的包名一致。
 * React 等基线模块不打包进产物，而是从工厂的 `require` 参数解析。
 *
 * 用法：node scripts/build-client.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
const outFile = join(packageDir, 'lib/client.js')

// shell 会把这些模块从平台基线表里解析；打进产物会出现第二份实例。
// 类型专用导入会被 esbuild 当作无副作用而消除，因此这里只需列出值导入。
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-dom/client',
  '@deepseek-ai/dsh-client-ui-primitives',
]

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
  // 产物由下面的包装步骤写成单个文件，这里不要额外产物。
  outfile: outFile,
})

const bundled = result.outputFiles[0]
if (bundled === undefined) throw new Error('esbuild produced no output')

// 以 CommonJS 形式加载：工厂拿到 require 并返回模块导出。
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

/** 给一段代码的每一行加缩进，方便嵌进包装模板。 */
function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? line : pad + line))
    .join('\n')
}
