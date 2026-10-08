#!/usr/bin/env node
/**
 * 挂载校验：证明每个可发布插件包能被真实的 `dsh` 启动器加载，
 * 而不仅仅是单测通过。
 *
 * 范围只覆盖可发布的包（manifest 声明 `repository`）——与 publish.yml 的门禁同一判据。
 * 不发布的包（如参考骨架）没有安装通道，校验它们的挂载组合没有意义。
 * 可用 `--only <包目录名>` 只校验指定包，供发布流程逐包校验使用。
 *
 * 对每个这样的包，本脚本会：
 *  1. 在 `.tmp/verify-home` 下生成一个临时 profile，把该包列为 bundle 层；
 *  2. 运行 `dsh --profile <name> --dump-config`，确认组合后的树中确实包含该包的行
 *     —— 这证明 bundle patch 能被解析且行在分层后保留；
 *  3. 断言输出里没有 `skipping profile bundle` 告警
 *     —— patch 解析失败时 dsh 不报错退出，只打这行告警并跳过该层，
 *     因此第 2 步的行存在性检查单独用会漏判。
 *
 * 不再短暂启动 profile：不含 app 的 profile 永不退出，只能等到超时，
 * 而它在这种情况下 stdout 与 stderr 都是空的，无从判定失败。
 *
 * 所有内容都限制在 `.tmp/` 内，不会触碰开发者真实的 `~/.dsh`。
 * 请先运行 `pnpm run build`：本脚本校验的是构建产物 `lib/` 入口，
 * 也就是发布包实际提供的内容。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(repoRoot, 'packages')
const tmpRoot = join(repoRoot, '.tmp')
const dshHome = join(tmpRoot, 'verify-home')
const dshBin = process.env.DSH_BIN ?? 'dsh'

/**
 * 判断一个包是否走 npm 发布通道。
 * @param manifest - 包的 package.json 内容。
 * @returns 该包是否声明了 repository（provenance 的前提条件）。
 */
function isPublishable(manifest) {
  return typeof manifest.repository === 'string' || Boolean(manifest.repository?.url)
}

/**
 * 找出可安装为 dsh bundle 层、且可发布的工作区包。
 * @param only - 指定时只返回该目录名的包。
 * @returns 声明了 bundle patch 的可发布包及其行信息。
 */
function discoverBundlePlugins(only) {
  const found = []
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (only !== undefined && entry.name !== only) continue
    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const patch = manifest.dsh?.bundle?.patch
    if (typeof patch !== 'string') continue
    if (!isPublishable(manifest)) continue

    const patchPath = resolve(dir, patch)
    if (!existsSync(patchPath)) {
      throw new Error(`${manifest.name}: dsh.bundle.patch 指向不存在的文件 ${patch}`)
    }

    const mainEntry = resolve(dir, manifest.main ?? 'lib/index.js')
    if (!existsSync(mainEntry)) {
      throw new Error(`${manifest.name}: 构建产物入口 ${mainEntry} 不存在 —— 请先运行 \`pnpm run build\``)
    }

    found.push({ dir, manifest, name: manifest.name, patchPath })
  }
  return found
}

/**
 * 生成一个临时 profile：bundle 栈为共享内核加一个插件，
 * 并按 `dsh plugin add` 的方式把插件链接进 profile 自己的 node_modules。
 * @param plugin - 待挂载的已发现包。
 * @returns 要启动的 profile 名。
 */
function writeProfile(plugin) {
  const profileName = `verify-${plugin.manifest.name.replace(/^@/, '').replace(/[/\\]/g, '-')}`
  const profileDir = join(dshHome, 'profiles', profileName)
  rmSync(profileDir, { recursive: true, force: true })
  mkdirSync(join(profileDir, 'node_modules'), { recursive: true })

  writeFileSync(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: `dsh-profile-${profileName}`,
        private: true,
        dependencies: { [plugin.name]: `link:${plugin.dir}` },
        dsh: {
          profile: {
            // 共享内核放在前面，使插件叠加在真实的树上。
            bundles: ['@deepseek-ai/dsh-base', plugin.name],
            patchReload: 'startup',
          },
        },
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(
    join(profileDir, 'cordis.patch.yml'),
    '# 由 scripts/verify-profile-mount.mjs 生成 —— 空的用户层。\n[]\n',
  )
  writeFileSync(join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')

  // 一个普通符号链接即可：它与 profile 安装产生的结构一致。
  // 带 scope 的包名需要先建出 scope 目录（`node_modules/@scope`）。
  const linkPath = join(profileDir, 'node_modules', plugin.name)
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(plugin.dir, linkPath, 'dir')

  return profileName
}

/** 让所有 dsh 写入都落在 `.tmp/` 内的环境变量。 */
function sandboxEnv() {
  return {
    ...process.env,
    DSH_HOME: dshHome,
    XDG_DATA_HOME: join(tmpRoot, 'xdg-data'),
    XDG_CACHE_HOME: join(tmpRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: join(tmpRoot, 'xdg-config'),
  }
}

/**
 * 运行启动器并捕获输出。
 * @param args - 启动器参数。
 * @returns 退出状态与合并后的输出。
 */
function runDsh(args) {
  const result = spawnSync(dshBin, args, {
    cwd: repoRoot,
    env: sandboxEnv(),
    encoding: 'utf8',
    timeout: 120_000,
    killSignal: 'SIGTERM',
  })
  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(`无法运行 \`${dshBin}\`：PATH 中未找到（可用 DSH_BIN 覆盖）`)
  }
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

/** 启动器跳过 bundle 层时输出的特征文本。 */
function findSkippedBundle(output) {
  return /skipping profile bundle/i.test(output)
}

/** 解析 `--only <包目录名>`。 */
function parseOnly(argv) {
  const index = argv.indexOf('--only')
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value) throw new Error('--only 需要一个包目录名')
  return value
}

let failures = 0
const only = parseOnly(process.argv.slice(2))
const plugins = discoverBundlePlugins(only)
if (plugins.length === 0) {
  console.error(
    only === undefined
      ? 'verify-mount: 没有任何可发布包声明 dsh.bundle.patch —— 无需校验'
      : `verify-mount: packages/${only} 不是可发布包 —— 无从校验`,
  )
  process.exit(1)
}

rmSync(dshHome, { recursive: true, force: true })
mkdirSync(dshHome, { recursive: true })

for (const plugin of plugins) {
  const profileName = writeProfile(plugin)

  const dumped = runDsh(['--profile', profileName, '--dump-config'])
  if (dumped.status !== 0) {
    console.error(`✗ ${plugin.name}: --dump-config 失败\n${dumped.output}`)
    failures += 1
    continue
  }

  // patch 解析失败时 dsh 不报错退出，只打告警并跳过该层，必须先拦下来
  if (findSkippedBundle(dumped.output)) {
    console.error(`✗ ${plugin.name}: bundle 层被跳过\n${dumped.output}`)
    failures += 1
    continue
  }

  // YAML 输出器会给需要转义的名字加引号：带 scope 的包显示为
  // `name: '@scope/pkg'`，不带 scope 的显示为 `name: pkg`。两种写法都接受。
  const rowSpellings = [`name: ${plugin.name}`, `name: '${plugin.name}'`]
  if (!rowSpellings.some((spelling) => dumped.output.includes(spelling))) {
    console.error(`✗ ${plugin.name}: 组合后的树中没有命名该包的行`)
    failures += 1
    continue
  }

  console.log(`✓ ${plugin.name}: 行已组合，patch 已被解析`)
}

if (failures > 0) {
  console.error(`\nverify-mount: ${failures} 个包校验失败`)
  process.exit(1)
}
console.log(`\nverify-mount: ${plugins.length} 个可发布包挂载成功`)
