/**
 * 测试用的样式表读取
 *
 * 组件样式拆在各自的 `.module.css` 里，而测试要按「整份样式表」断言
 * （层级缩进公式、行距、reduced-motion 块这些都跨文件）
 * 这里把全部样式表按稳定顺序拼成一份文本，读的是磁盘上的源文件
 *
 * 类名在构建期才会被哈希，源文件里是未哈希的局部名
 * 因此断言可以直接写 `.row` 这类选择器
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 用 import.meta.dirname 而不是 fileURLToPath(new URL(...))：
// jsdom 环境下 node:url 的 fileURLToPath 不接受 vitest 给出的 URL
const CLIENT_DIR = join(import.meta.dirname, '..', 'src', 'client')

/** 递归收集 client 下的 .module.css */
function collect(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collect(full))
    else if (entry.name.endsWith('.module.css')) out.push(full)
  }
  return out
}

/**
 * 全部组件样式表的合并文本，按路径排序因此顺序稳定
 *
 * 拼接处补一个换行：文件末尾的规则与下一个文件开头的规则不能连成一条
 */
export function readAllCss(): string {
  return collect(CLIENT_DIR)
    .sort()
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
}

/**
 * 全部 `@media (prefers-reduced-motion: reduce)` 块的内容（不含包裹层）
 *
 * 样式表拆开后每个文件各带一份 reduced-motion 块，只看第一条会漏掉其余
 * 因此返回全部块拼起来的文本，调用方通常断言「这些块合起来包含某条规则」
 */
export function readReducedMotionCss(): string {
  const blocks = readAllCss().matchAll(
    /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g,
  )
  return [...blocks].map((m) => m[1] ?? '').join('\n')
}
