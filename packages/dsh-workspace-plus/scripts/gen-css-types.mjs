/**
 * 由 `.module.css` 生成 `.d.ts` 类名声明
 *
 * 构建脚本把样式表编译成「类名映射」模块，键是局部名、值是哈希类名
 * tsc 看不到这层映射，需要一份声明
 * 逐个列出类名而不是用 `Record<string, string>`，是为了在本仓库开启 noUncheckedIndexedAccess 时
 * 取值仍是 string（不是 string | undefined），顺带把类名写错变成编译错误
 *
 * 生成的声明随源码提交，构建与 typecheck 前都会重新生成，因此不会漂移
 *
 * 用法：node scripts/gen-css-types.mjs
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const clientDir = join(packageDir, 'src/client')
const outFile = join(clientDir, 'css-modules.d.ts')

/** 递归收集 client 下的 .module.css */
function collect(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collect(full))
    else if (entry.name.endsWith('.module.css')) out.push(full)
  }
  return out
}

/** 样式表里定义的全部局部类名 */
function classNames(file) {
  const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  // 类名写作 camelCase，不带包前缀。只取类选择器，跳过伪类与属性选择器
  return [...new Set([...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]))].sort()
}

const files = collect(clientDir).sort()

// tsc 只认通配形式的 ambient module，写死相对路径（'./x.module.css'）不生效
// 而消费方各按自己的位置写路径（'./rows.module.css' 与 '../../menus.module.css'）
// 因此只能按文件名通配，这要求各样式表文件名唯一，下面的断言守住它
const byBase = new Map()
for (const file of files) {
  const base = file.slice(file.lastIndexOf('/') + 1)
  const seen = byBase.get(base)
  if (seen !== undefined) {
    throw new Error(`module.css 文件名重复，声明会互相覆盖：${seen} 与 ${file}`)
  }
  byBase.set(base, file)
}

const blocks = files.map((file) => {
  const names = classNames(file)
  const base = file.slice(file.lastIndexOf('/') + 1)
  const members = names.map((n) => `    readonly ${JSON.stringify(n)}: string`).join('\n')
  // 通配前缀必须有斜杠：消费方写 './x.module.css' 或 '../../x.module.css'
  return `declare module '*/${base}' {\n  const classes: {\n${members}\n  }\n  export default classes\n}`
})

const header = `/**
 * \`.module.css\` 的类名声明（由 scripts/gen-css-types.mjs 生成，不要手工改）
 *
 * 构建脚本用 lightningcss 把样式表编译成「局部名 → 哈希类名」的映射模块
 * 这里逐条列出类名：取值因此是 string 而不是 string | undefined
 * （本仓库开启 noUncheckedIndexedAccess），类名写错也会在编译期报出来
 */

`
writeFileSync(outFile, header + blocks.join('\n\n') + '\n')
console.log(`css module types written: ${outFile} (${files.length} sheets)`)
