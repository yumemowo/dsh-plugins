#!/usr/bin/env node
/**
 * 挂载校验：证明每个插件包能被真实的 `dsh` 启动器加载，而不仅仅是单测通过。
 *
 * 对每个声明了 `dsh.bundle.patch` 的工作区包，本脚本会：
 *  1. 在 `.tmp/verify-home` 下生成一个临时 profile，把该包列为 bundle 层；
 *  2. 运行 `dsh --profile <name> --dump-config`，确认组合后的树中确实包含该包的行
 *     —— 这证明 bundle patch 能被解析且行在分层后保留；
 *  3. 短暂启动该 profile，若加载器报出加载或配置错误则失败
 *     —— 这证明入口模块可解析，且其 `Config` schema 接受 patch 中的值。
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

/** 必须限时结束：不含 app 的 profile 会一直运行到被中断。 */
const BOOT_TIMEOUT_MS = 20_000

/**
 * 找出可安装为 dsh bundle 层的工作区包。
 * @returns 声明了 bundle patch 的包及其行信息。
 */
function discoverBundlePlugins() {
  const found = []
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = join(packagesDir, entry.name)
    const manifestPath = join(dir, 'package.json')
    if (!existsSync(manifestPath)) continue

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const patch = manifest.dsh?.bundle?.patch
    if (typeof patch !== 'string') continue

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
 * @param timeout - 子进程被终止前的毫秒数。
 * @returns 退出状态、信号以及合并后的输出。
 */
function runDsh(args, timeout) {
  const result = spawnSync(dshBin, args, {
    cwd: repoRoot,
    env: sandboxEnv(),
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGTERM',
  })
  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(`无法运行 \`${dshBin}\`：PATH 中未找到（可用 DSH_BIN 覆盖）`)
  }
  return {
    status: result.status,
    signal: result.signal,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}

/** 加载器在行失败时输出的特征文本。 */
function findLoadFailure(output) {
  return /failed to load|failed to apply loader entry|invalid config|Cannot find module/i.test(output)
}

let failures = 0
const plugins = discoverBundlePlugins()
if (plugins.length === 0) {
  console.error('verify-mount: 没有任何包声明 dsh.bundle.patch —— 无需校验')
  process.exit(1)
}

rmSync(dshHome, { recursive: true, force: true })
mkdirSync(dshHome, { recursive: true })

for (const plugin of plugins) {
  const profileName = writeProfile(plugin)

  const dumped = runDsh(['--profile', profileName, '--dump-config'], 120_000)
  if (dumped.status !== 0) {
    console.error(`✗ ${plugin.name}: --dump-config 失败\n${dumped.output}`)
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

  // 不含 app 的 profile 永不退出，因此超时才是正常结果：
  // 关键是在启动过程中加载器没有报出失败。
  const booted = runDsh(['--profile', profileName], BOOT_TIMEOUT_MS)
  if (findLoadFailure(booted.output)) {
    console.error(`✗ ${plugin.name}: profile 加载失败\n${booted.output}`)
    failures += 1
    continue
  }

  console.log(`✓ ${plugin.name}: 行已组合，profile 加载正常`)
}

if (failures > 0) {
  console.error(`\nverify-mount: ${failures} 个包校验失败`)
  process.exit(1)
}
console.log(`\nverify-mount: ${plugins.length} 个包挂载成功`)
