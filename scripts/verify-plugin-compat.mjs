#!/usr/bin/env node
/**
 * 版本兼容校验：保证每个包声明的兼容范围与它的 dsh peer 范围自洽。
 *
 * 宿主在挂载插件时只检查 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的 peer 范围，
 * 不读 `engines.dsh`（后者只供插件市场展示）。因此一个包可能出现两种自相矛盾：
 * peer 比 `engines.dsh` 更严 —— rc.1 上的用户被挂载阶段直接拒绝；
 * peer 比 `engines.dsh` 更松 —— 老版本用户通过挂载检查，却在运行期撞上缺失的 API。
 * 两种都不会让构建与单测变红。
 *
 * 每个包自己的 `engines.dsh` 是判定其兼容范围的锚点，据此断言三件事：
 *  1. 每个 dsh peer 范围都接受 `engines.dsh` 的下界，判定选项与宿主一致（带 prerelease）；
 *  2. 每个 peer 范围的下界不早于该下界（拦住 `*`、`>=0.1.0` 这类放宽）；
 *  3. peer 范围是字面量而不是 `catalog:` —— git 安装通道不解析 catalog，
 *     原样透传的 `catalog:` 会让消费者报 missing peer。
 *
 * 只检查、不改写。包与 peer 条目都少，手工对齐的代价低于维护改写脚本。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import semver from 'semver'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(repoRoot, 'packages')

/** 宿主判定 peer 范围时使用的选项：prerelease 必须显式纳入比较。 */
const HOST_OPTIONS = { includePrerelease: true }

/**
 * 判断一个 peer 名是否由 dsh 宿主提供。
 * @param name - peerDependencies 中的包名。
 * @returns 该包是否属于 dsh 运行时。
 */
function isDshPeer(name) {
  return name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')
}

/**
 * 找出需要校验的插件包。
 * @returns 声明了 bundle patch 的包名、目录与清单。
 */
function discoverPlugins() {
  const found = []
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (typeof manifest.dsh?.bundle?.patch !== 'string') continue
    found.push({ dir, manifest, name: manifest.name })
  }
  return found
}

/**
 * 校验单个包的兼容声明是否自洽。
 * @param plugin - 待校验的包。
 * @returns 人类可读的问题列表，空数组表示通过。
 */
function checkPlugin(plugin) {
  const problems = []
  const { manifest } = plugin
  const enginesRange = manifest.engines?.dsh

  if (typeof enginesRange !== 'string') {
    problems.push('engines.dsh 未声明，无从判定兼容范围')
    return problems
  }
  if (semver.validRange(enginesRange) === null) {
    problems.push(`engines.dsh: 范围 ${enginesRange} 无法解析`)
    return problems
  }

  const engineFloor = semver.minVersion(enginesRange)
  if (engineFloor === null) {
    problems.push(`engines.dsh: 范围 ${enginesRange} 取不到下界`)
    return problems
  }
  const floor = engineFloor.version

  const peers = manifest.peerDependencies ?? {}
  const dshPeers = Object.entries(peers).filter(([peer]) => isDshPeer(peer))
  if (dshPeers.length === 0) problems.push('没有声明任何 dsh peer')

  for (const [peer, range] of dshPeers) {
    if (String(range).includes('catalog:')) {
      problems.push(`${peer}: peer 不能写 catalog:，git 安装通道不解析它`)
      continue
    }
    if (semver.validRange(range) === null) {
      problems.push(`${peer}: 范围 ${range} 无法解析`)
      continue
    }
    if (!semver.satisfies(floor, range, HOST_OPTIONS)) {
      problems.push(`${peer}: 范围 ${range} 比 engines.dsh 更严，不接受 ${floor}`)
      continue
    }
    const peerFloor = semver.minVersion(range)
    if (peerFloor !== null && semver.lt(peerFloor, engineFloor, HOST_OPTIONS)) {
      problems.push(`${peer}: 范围 ${range} 比 engines.dsh 更松，还接受 ${peerFloor.version}`)
    }
  }

  return problems
}

const plugins = discoverPlugins()
if (plugins.length === 0) {
  console.error('verify-compat: 没有任何包声明 dsh.bundle.patch —— 无需校验')
  process.exit(1)
}

let failures = 0
for (const plugin of plugins) {
  const problems = checkPlugin(plugin)
  if (problems.length > 0) {
    console.error(`✗ ${plugin.name}`)
    for (const problem of problems) console.error(`    ${problem}`)
    failures += 1
    continue
  }
  console.log(`✓ ${plugin.name}: peer 范围与 engines.dsh ${plugin.manifest.engines.dsh} 自洽`)
}

if (failures > 0) {
  console.error(`\nverify-compat: ${failures} 个包校验失败`)
  process.exit(1)
}
console.log(`\nverify-compat: ${plugins.length} 个包兼容声明自洽`)
