# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件的 monorepo。

## 包含的插件

| 包 | 作用 | 形态 |
| --- | --- | --- |
| `@your-scope/dsh-workspace-groups` | 侧边栏的分组工作区列表，接替官方 `sidebar.workspaces` 区域 | 宿主 + 浏览器双半 |
| `@your-scope/dsh-hello` | 参考骨架：一个 `ctx.hello` 服务与一个 `hello_greet` 工具 | 纯宿主 |

> `@your-scope` 是占位符。发布前替换为真实的 npm scope，每个包需要改 `package.json` 与 `cordis.patch.yml` 两处。

### dsh-workspace-groups

把 dsh Web 侧边栏的工作区列表换成分组视图，在官方列表之上多出两级容器：**工作区分组**把一组工作区打包管理、只出现在列表最外层；**会话分组**在单个工作区内部归类会话。建组、移入移出、重命名删除、展开折叠都是手动操作，未归组的会话仍平铺在原位，因此一个分组都没建时界面与官方列表一致。

除分组本身，这个包还提供：

- **工作区选择器**：区域标题打开的下拉面板，把整个列表聚焦到某一个工作区分组或独立工作区上。面板分「最近使用」「置顶」「全部」三块，条目行内直接给出重命名、删除、置顶三个动作。
- **搜索**：按会话标题与工作区标题过滤列表，结果行的路径带上所属分组。
- **添加工作区**：复用官方的目录选择交互登记新工作区，并在其中开一个新会话。
- **会话操作**：重命名、分叉、归档与归组，以及三类行共用的行内 `...` 菜单和右键菜单。
- **悬停详情卡片**：补全行上被截断的工作区目录、创建时刻与会话状态。

它接替的只是 `sidebar.workspaces` 一个区域，logo、面板列表、设置与底部操作的插槽不受影响。完整功能清单、与官方组件的复用关系，以及尚未实现的官方功能见[该包 README](packages/dsh-workspace-groups/README.md)。

### dsh-hello

体量最小但结构完整的 dsh 插件，含 Cordis 入口、生命周期绑定 fiber 的服务、面向模型的工具与行配置 schema。可用它了解一个插件包由哪些部分组成，功能说明见[该包 README](packages/dsh-hello/README.md)。

## 安装

```bash
dsh plugin --profile web add "$PWD/packages/dsh-workspace-groups"
dsh --profile web --dump-config | grep -A2 '== @your-scope/dsh-workspace-groups'
```

把路径换成 `packages/dsh-hello` 即可安装示例插件。

`dsh-workspace-groups` 改完客户端代码后必须重新构建产物，否则 GUI 加载的仍是旧的 `lib/client.js`；改了宿主半边则要重启 `dsh`。

## 环境要求

- Node.js ≥ 22.19
- pnpm 11（`corepack enable pnpm`）
- `pnpm run verify:mount` 需要 PATH 中有 `dsh`

## 常用命令

```bash
pnpm install          # 安装工作区依赖
pnpm run build        # 编译各包到 packages/*/lib
pnpm run typecheck    # 校验 src 与 test 两个工程，不产出文件
pnpm run test         # 逐包执行 vitest run
pnpm run verify:mount # 组装并启动一个包含各插件的临时 profile
pnpm run check        # 以上全部，按顺序执行
```

`verify:mount` 会把 `DSH_HOME` 指向 `.tmp/verify-home`，不影响真实的 `~/.dsh`。它校验的是构建产物：真实的 `dsh` 启动器能否解析插件入口与 patch、并接受配置 schema，这是单元测试覆盖不到的一环。

## 目录结构

```
.
├── packages/
│   ├── dsh-hello/                # 纯宿主参考插件
│   └── dsh-workspace-groups/     # 侧边栏分组插件（宿主 + 浏览器双半）
├── scripts/
│   └── verify-profile-mount.mjs  # 端到端挂载校验
├── pnpm-workspace.yaml           # 工作区、依赖 catalog 与 pnpm 设置
└── tsconfig.base.json            # 各包继承的编译选项
```

## 环境说明

本 checkout 所在的沙箱中 `$HOME` 只读，因此 `pnpm-workspace.yaml` 把 `storeDir` / `cacheDir` 固定在了仓库内（pnpm 11 从工作区文件读取这两项，而不是 `.npmrc`）。在普通机器上可以删掉这两行，改用共享的全局 store。
