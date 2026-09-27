/**
 * 「类名必须走编译后的映射」的静态检查
 *
 * 类名在构建期被哈希（`row` → `cgu9Ka_row`），因此源码里把类名当裸字符串用
 * （拼 className、传给原语的 listClassName、做 querySelector）会静默失效
 * 类型是对的、编译通过、测试若只断言 DOM 结构也照样过，只有界面上少了那点样式
 *
 * 类名去前缀后与普通单词同形（`row`、`group`、`list`、`panel`）
 * 靠「看起来像类名」判断会大量误判，因此改为按出现位置判断
 * 只在 className / listClassName / querySelector 这几处检查
 * 且只报「恰好等于本包某个类名」的字符串
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { readAllCss } from './readCss.ts'

/** 会被扫描的源码目录（相对包根） */
const SCAN_ROOT = 'src'

/** 声明文件按定义列出全部类名，不该参与本检查 */
const EXEMPT = [/css-modules\.d\.ts$/]

/** 取类名当值传下去的属性名 */
const CLASS_ATTRS = ['className', 'listClassName']

/** 本包样式表定义的全部类名 */
export const OWN_CLASSES: ReadonlySet<string> = new Set(
  [...readAllCss().matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1] ?? ''),
)

/** 一处裸类名用法 */
export interface BareUsage {
  /** 出问题的写法片段 */
  literal: string
  /** 所在行号（1 起） */
  line: number
  /** 出现在哪种位置 */
  kind: 'attribute' | 'selector'
}

/** 去掉注释，保留行号：注释里的类名只是说明，不代表代码用它 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
}

/** 找出 `{` 起、与之配对的 `}` 之间的内容（不含花括号本身） */
function braceBody(code: string, openIndex: number): string {
  let depth = 0
  for (let i = openIndex; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}') {
      depth--
      if (depth === 0) return code.slice(openIndex + 1, i)
    }
  }
  return code.slice(openIndex + 1)
}

/** 一段文本里的字面量（单引号、双引号、模板串都取） */
function stringLiterals(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) out.push(m[2] ?? '')
  return out
}

/** 一个字面量里出现的、属于本包的类名 */
function ownClassTokens(literal: string): string[] {
  return [...new Set(literal.split(/\s+/).filter((t) => OWN_CLASSES.has(t)))]
}

/**
 * 找出一份源码里裸用类名的位置
 * @param source - 文件内容
 * @returns 每处裸用法，带行号与位置类型
 */
export function findBareClassUsage(source: string): BareUsage[] {
  const code = stripComments(source)
  const out: BareUsage[] = []
  const lineOf = (index: number): number => code.slice(0, index).split('\n').length

  // 1) className="row" 这类直接写字面量的属性
  for (const attr of CLASS_ATTRS) {
    for (const m of code.matchAll(new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, 'g'))) {
      const tokens = ownClassTokens(m[1] ?? '')
      if (tokens.length > 0) out.push({ literal: tokens.join(' '), line: lineOf(m.index), kind: 'attribute' })
    }
    // 2) className={...} 里出现 'row' 这类字面量（含 + 拼接与模板插值）
    for (const m of code.matchAll(new RegExp(`\\b${attr}\\s*=\\s*\\{`, 'g'))) {
      const open = m.index + m[0].length - 1
      for (const literal of stringLiterals(braceBody(code, open))) {
        const tokens = ownClassTokens(literal)
        if (tokens.length > 0) out.push({ literal: tokens.join(' '), line: lineOf(open), kind: 'attribute' })
      }
    }
  }

  // 3) querySelector('.row') 这类选择器字面量
  //    前导 (?<![\w$]) 排除 `styles.row` 这种成员访问（它的点前面是标识符）
  for (const m of code.matchAll(/querySelector(?:All)?\s*(?:<[^>]*>)?\s*\(\s*(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    const selector = m[2] ?? ''
    const tokens = [...new Set([...selector.matchAll(/(?<![\w$])\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((x) => x[1] ?? ''))]
    const hit = tokens.filter((t) => OWN_CLASSES.has(t))
    if (hit.length > 0) out.push({ literal: hit.join(' '), line: lineOf(m.index), kind: 'selector' })
  }

  return out
}

/**
 * 扫描 src 下全部 ts/tsx
 * @returns 每个含裸类名用法的文件及其命中
 */
export function scanBareClassUsage(): Map<string, BareUsage[]> {
  const files = execSync(`find ${SCAN_ROOT} -name '*.ts' -o -name '*.tsx'`)
    .toString()
    .trim()
    .split('\n')
    .sort()
  const out = new Map<string, BareUsage[]>()
  for (const file of files) {
    if (EXEMPT.some((re) => re.test(file))) continue
    const hits = findBareClassUsage(readFileSync(join(process.cwd(), file), 'utf8'))
    if (hits.length > 0) out.set(file, hits)
  }
  return out
}
