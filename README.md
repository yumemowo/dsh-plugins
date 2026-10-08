# dsh-plugins

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件的 monorepo。

## 包含的插件

<details>
<summary><code>@yumemowo/dsh-workspace-plus</code> —— 侧边栏的分组工作区列表</summary>

把 dsh Web 侧边栏的工作区列表换成分组视图，在官方列表之上多出两级容器：**工作区分组**把一组工作区打包管理、只出现在列表最外层；**会话分组**在单个工作区内部归类会话。此外还有按 `cwd` 推导的子工作区嵌套、工作区选择器、搜索、添加工作区、会话操作与悬停详情卡片。建组、移入移出、重命名删除、展开折叠都是手动操作，未归组的会话仍平铺在原位，因此一个分组都没建时界面与官方列表一致。

它接替的只是 `sidebar.workspaces` 一个区域，logo、面板列表、设置与底部操作的插槽不受影响。完整功能清单、与官方组件的复用关系，以及尚未实现的官方功能见[该包 README](packages/dsh-workspace-plus/README.md)。

</details>

## 安装

下称 profile `web`，换成你自己的 profile 名即可；装完重启 `dsh web`（或 Desktop）生效。

### 从 npm 安装

`@yumemowo/dsh-workspace-plus` 已发布到 npm，包内是预构建的 `lib/`，安装时不需要编译：

```sh
dsh plugin --profile web add @yumemowo/dsh-workspace-plus
```

升级要显式指定包名：

```sh
dsh plugin --profile web update @yumemowo/dsh-workspace-plus
```

### 从仓库安装

不经过 npm，直接装仓库里的包目录，改完源码无需重新发布：

```sh
dsh plugin --profile web add "github:yumemowo/dsh-plugins#path:packages/dsh-workspace-plus"
```

本仓库不提交 `lib/`，这条通道靠 `prepare` 在安装时现编译入口，而 pnpm 默认拦截 git 依赖的构建脚本。首次 `add` 会失败并打印该包的 `allowBuilds` 键，把它加进 profile 的 `pnpm-workspace.yaml` 后重跑即可；各包的具体键见对应的包 README。

放行等于允许该包在安装时于本机执行代码，只对可信来源使用。

## 版本兼容

各插件需要 dsh `0.2.0-rc.1` 及以上，覆盖整个 `0.2.x`。

## 开发

```bash
pnpm install           # 安装工作区依赖
pnpm run build         # 编译各包到 packages/*/lib
pnpm run typecheck     # 校验 src 与 test 两个工程，不产出文件
pnpm run test          # 逐包执行 vitest run
pnpm run verify:compat # 校验各包的 dsh 兼容声明
pnpm run verify:mount  # 组装并启动一个包含各插件的临时 profile
pnpm run check         # 以上全部，按顺序执行
```

环境要求：Node.js ≥ 22.19、pnpm 11（`corepack enable pnpm`）。`pnpm run verify:mount` 还需要 PATH 中有 `dsh`。

`verify:mount` 会把 `DSH_HOME` 指向 `.tmp/verify-home`，不影响真实的 `~/.dsh`。它校验的是构建产物：真实的 `dsh` 启动器能否解析插件入口与 patch、并接受配置 schema，这是单元测试覆盖不到的一环。

`dsh-workspace-plus` 改完客户端代码后必须重新构建产物，否则 GUI 加载的仍是旧的 `lib/client.js`；改了宿主半边则要重启 `dsh`。

## 目录结构

```
.
├── packages/
│   ├── dsh-hello/                # 纯宿主参考插件，复制它作为新插件的起点
│   └── dsh-workspace-plus/       # 侧边栏分组插件（宿主 + 浏览器双半）
├── scripts/
│   ├── verify-plugin-compat.mjs  # dsh 兼容声明的静态校验
│   └── verify-profile-mount.mjs  # 端到端挂载校验
├── pnpm-workspace.yaml           # 工作区、依赖 catalog 与 pnpm 设置
└── tsconfig.base.json            # 各包继承的编译选项
```

## 环境说明

pnpm 11 从 `pnpm-workspace.yaml` 读取 `storeDir` / `cacheDir`，不从 `.npmrc` 读取，因此本仓库把这两项写在工作区文件里。删掉它们则会回落到 pnpm 默认的全局 store 与 cache。
