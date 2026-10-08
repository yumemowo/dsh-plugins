#!/usr/bin/env node
/**
 * 发布目标判定：列出本次该发布的包。
 *
 * 两条入口共用这一套判据：
 *  - tag 推送：tag 名 `<包目录名>@<版本>`，只发布该 tag 指定的包；
 *  - 手动触发：不指定包，对全部可发布包按 registry 状态判定。
 *
 * 一个包被纳入发布，需要同时满足：
 *  1. manifest 声明 `repository`（provenance 的前提，与 publish.yml 的门禁同一判据）；
 *  2. 版本不是预发布版 —— pnpm 的 `--tag` 默认为 `latest`，且不像 npm 那样
 *     拒绝无 `--tag` 的预发布版，放任会把 `latest` 指向 rc；
 *  3. 该版本在 registry 上不存在 —— 已发布则跳过，使重跑与重复触发都是幂等的。
 *
 * 查询失败（网络、鉴权）一律让流程失败：把故障当成「尚未发布」会掩盖真实问题。
 *
 * 输出写入 `$GITHUB_OUTPUT`（`packages` 为 JSON 数组、`count` 为数量），
 * 同时把人类可读的判定过程打到 stdout。
 */
import { existsSync, readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import semver from 'semver'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(repoRoot, 'packages')

/**
 * 判断一个包是否走 npm 发布通道。
 * @param manifest - 包的 package.json 内容。
 * @returns 该包是否声明了 repository。
 */
function isPublishable(manifest) {
  return typeof manifest.repository === 'string' || Boolean(manifest.repository?.url)
}

/**
 * 查询某个版本是否已在 registry 上。
 * @param name - 包名。
 * @param version - 版本号。
 * @returns 已发布返回 true；确认不存在返回 false；其他失败直接抛出。
 */
function isPublished(name, version) {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (result.error) throw new Error(`查询 ${name}@${version} 失败：${result.error.message}`)
  if (result.status === 0) return true
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.includes('E404')) return false
  throw new Error(`查询 ${name}@${version} 失败，无法判断是否已发布：\n${output}`)
}

/**
 * 收集所有可发布包的清单。
 * @returns 包目录名、包名与 manifest。
 */
function discoverPublishable() {
  const found = []
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!isPublishable(manifest)) continue
    found.push({ dirName: entry.name, name: manifest.name, manifest })
  }
  return found
}

/**
 * 解析 tag 名，取出它指定的包目录名与版本。
 * @param tag - tag 名，形态 `<包目录名>@<版本>`。
 * @returns 包目录名与版本；形态不符返回 null。
 */
function parseTag(tag) {
  const at = tag.lastIndexOf('@')
  if (at <= 0) return null
  return { dirName: tag.slice(0, at), version: tag.slice(at + 1) }
}

const eventName = process.env.GITHUB_EVENT_NAME ?? ''
const refName = process.env.GITHUB_REF_NAME ?? ''

const all = discoverPublishable()
if (all.length === 0) {
  console.error('release-targets: 没有任何可发布包（manifest 未声明 repository）')
  process.exit(1)
}

let candidates = all
// 本 workflow 只在 tag 推送时由 push 触发，因此 push 事件总是携带 tag 名；
// 手动触发（workflow_dispatch）不带 tag，按 registry 状态判定全部。
if (eventName === 'push') {
  const parsed = parseTag(refName)
  if (parsed === null) {
    console.error(`release-targets: tag 名 ${refName} 不是 <包目录名>@<版本> 形态`)
    process.exit(1)
  }
  const matched = all.find((pkg) => pkg.dirName === parsed.dirName)
  if (matched === undefined) {
    console.error(`release-targets: tag ${refName} 指向的包目录 packages/${parsed.dirName} 不可发布或不存在`)
    process.exit(1)
  }
  // tag 自带版本，manifest 必须与之一致，否则发出去的版本不是打 tag 时看到的那份
  if (parsed.version !== matched.manifest.version) {
    console.error(
      `release-targets: tag 版本 ${parsed.version} 与 ${matched.name} 清单的 ${matched.manifest.version} 不一致`,
    )
    process.exit(1)
  }
  candidates = [matched]
  console.log(`tag ${refName} 只判定 packages/${parsed.dirName}`)
} else {
  console.log(`手动触发，判定全部 ${all.length} 个可发布包`)
}

const selected = []
for (const pkg of candidates) {
  const version = pkg.manifest.version
  const parsed = semver.parse(version)
  if (parsed === null) {
    console.error(`✗ ${pkg.name}: 版本 ${version} 不是合法 semver`)
    process.exit(1)
  }
  if (parsed.prerelease.length > 0) {
    console.log(`· ${pkg.name}@${version}：预发布版，跳过（避免占用 latest）`)
    continue
  }
  if (isPublished(pkg.name, version)) {
    console.log(`· ${pkg.name}@${version}：已在 registry 上，跳过`)
    continue
  }
  console.log(`✓ ${pkg.name}@${version}：待发布`)
  selected.push({ name: pkg.name, version, dir: pkg.dirName })
}

const line = `packages=${JSON.stringify(selected)}\ncount=${selected.length}\n`
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, line)
}
console.log(`\nrelease-targets: 本次发布 ${selected.length} 个包`)
