# dsh-plugins

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件的 monorepo。

当前仓库包含两个插件：

| 包 | 作用 | 形态 |
| --- | --- | --- |
| `@your-scope/dsh-hello` | 参考骨架：Cordis 入口、服务、工具、配置 schema | 纯宿主 |
| `@your-scope/dsh-workspace-groups` | 侧边栏工作区会话分组（替换 `sidebar.workspaces`） | 宿主 + 浏览器双半 |

`dsh-hello` 是体量最小但**结构完整**的示例，用于理解一个插件包需要哪些部分。
`dsh-workspace-groups` 则是一个真实的 UI 插件，演示了插槽接替、浏览器 bundle 打包
与 Host↔Client 数据通道。

> `@your-scope` 是占位符。发布前请把它替换为你真实的 npm scope（或 GitHub 组织/用户名），
> 每个包需要改两处：`package.json` 与 `cordis.patch.yml`。

## 命名

一个 dsh 插件有**两个身份**，而且它们是刻意不同的：

| 身份 | 示例 | 所在位置 | 用途 |
| --- | --- | --- | --- |
| npm 包名 | `@your-scope/dsh-hello` | `package.json` 的 `name`、patch 的 `name:` | 包的发布与解析方式 |
| 运行时行 id | `hello` | patch 的 `id:` | 用户覆盖插件时定位的行 |
| 插件/fiber 名 | `hello` | `src/index.ts` 的 `export const name` | 诊断信息与日志前缀 |

```yaml
# cordis.patch.yml
- insert:
    - id: hello                    # 简短、不带 scope —— 面向用户的定位键
      name: '@your-scope/dsh-hello'  # 完整包身份，包含 scope
```

这种做法背后的约定：

- **npm 包名要带 scope**（`@scope/dsh-<名称>`），并设置
  `"publishConfig": { "access": "public" }`。scoped 包在 npm 上默认是私有的，
  不设置这一项 `npm publish` 会失败。
- **目录名与包名 basename 保持一致**（`@your-scope/dsh-hello` 对应
  `packages/dsh-hello`）。pnpm 与 `dsh plugin add <路径>` 操作的都是包目录，
  这样在 monorepo 里也更容易辨认。
- **行 `id` 保持简短、不带 scope**（同时去掉 scope 与 `dsh-` 前缀）。它不是打包元数据：
  用户在自己的 patch 层里写 `- id: hello` 来覆盖或禁用该行；它同时还是 Web 端的
  client bundle id（`/plugins/<id>/client.js`）。重命名它等于破坏所有已有的用户 patch。
- **源码里的 `name` 导出与行 `id` 保持一致**，而不是等于包名。它命名的是 fiber，不是包。

这与官方插件的做法一致：`@deepseek-ai/dsh-command-goal` 导出的
`name = 'command-goal'`；第三方插件 `@linxin666/dsh-client-ui-git-graph` 的行 id 是
`ui-git-graph`。

## dsh 插件的构成

dsh 的 profile 是在空插件树之上叠加的 **patch 层栈**。一个插件包贡献其中一层：

| 部分 | 位置 | 作用 |
| --- | --- | --- |
| Cordis 插件入口 | `src/index.ts`，导出 `name`、`inject`、`apply` | 实际运行的代码 |
| Bundle patch | `cordis.patch.yml`，含一条 `insert:` 行 | 向 profile 树插入一行 |
| Bundle 声明 | `package.json` 的 `dsh.bundle.patch` | 让安装本包的 profile 把它当作一个层 |
| 行配置 schema | `Config`（schemastery） | 加载器在 `apply` 运行前校验 patch 中的 `config` |

`dsh plugin --profile <名称> add <路径或包名>` 会把包装进 profile，并自动追加到
`dsh.profile.bundles` —— 安装流程就这一步。带 scope 的包名同样可用，profile 清单中记录的
是完整的 scoped 包名。

行的身份由 `id` 决定，且**逐行以最后一层为准**。用户因此无需 fork 你的包就能覆盖默认值：

```yaml
# $DSH_HOME/profiles/<名称>/cordis.patch.yml
- id: hello
  config:
    greeting: 你好
```

## 目录结构

```
.
├── packages/
│   ├── dsh-hello/                 # 纯宿主插件（最小参考骨架）
│   │   ├── src/
│   │   │   ├── index.ts           # 插件入口：name / inject / apply
│   │   │   ├── service.ts         # ctx.hello，生命周期绑定 fiber 的 Cordis Service
│   │   │   ├── tool.ts            # hello_greet，面向模型的工具
│   │   │   └── config.ts          # 行配置 schema
│   │   ├── test/hello.test.ts
│   │   ├── cordis.patch.yml       # bundle patch
│   │   └── package.json
│   └── dsh-workspace-groups/      # 双半插件（宿主 + 浏览器）
│       ├── src/
│       │   ├── index.ts           # 宿主入口：storage + 服务 + typert 绑定
│       │   ├── service.ts         # 分组读写逻辑
│       │   ├── spec.ts            # 持久化域与 zod schema
│       │   ├── typert.ts          # Host 面 Remote 清单
│       │   └── client/            # 浏览器半边
│       │       ├── index.ts       # 注册 sidebar.workspaces（priority: -1）
│       │       ├── region.ts      # 分组树渲染
│       │       └── remote.ts      # 客户端 Remote 贡献
│       ├── scripts/build-client.mjs  # esbuild 打包 __ModuleLoader__ bundle
│       ├── test/
│       ├── cordis.patch.yml
│       └── package.json
├── scripts/
│   └── verify-profile-mount.mjs   # 端到端挂载校验
├── pnpm-workspace.yaml            # 工作区 + 依赖 catalog + pnpm 设置
└── tsconfig.base.json             # 各包继承的编译选项
```

## 两种插件形态

| | 纯宿主（`dsh-hello`） | 双半（`dsh-workspace-groups`） |
| --- | --- | --- |
| 入口 | `exports["."]` | `exports["."]` + `exports["./client"]` |
| 清单 | `dsh.bundle.patch` | 同上 + `dsh.client.platform: "web"` |
| 构建 | `tsc` | `tsc` + esbuild 打 `lib/client.js` |
| 用途 | 工具、服务、命令 | 需要改动 Web UI 时 |

浏览器半边的产物必须包成 `window.__ModuleLoader__.load({ id, factory })`，
`id` 与包名一致；React 等基线模块从工厂的 `require` 解析，不打包进产物，
否则会出现第二份运行时实例。参考 `packages/dsh-workspace-groups/scripts/build-client.mjs`。

## 环境要求

- Node.js ≥ 22.19（本仓库在 Node 26 上验证）
- pnpm 11（`corepack enable pnpm`）
- `pnpm run verify:mount` 需要 PATH 中有 `dsh`

## 常用命令

```bash
pnpm install          # 安装工作区依赖
pnpm run build        # tsc 编译到 packages/*/lib
pnpm run typecheck    # 校验 src 与 test 两个工程，不产出文件
pnpm run test         # 逐包执行 vitest run
pnpm run verify:mount # 组装并启动一个包含各插件的临时 profile
pnpm run check        # 以上全部，按顺序执行
```

其中 `verify:mount` 最关键。单元测试只能证明你的逻辑；只有它能证明真实启动器可以解析你的
入口模块、解析你的 patch，并接受你的配置 schema。

### 用你自己的 dsh 验证

`verify:mount` 会把 `DSH_HOME` 指向 `.tmp/verify-home`，因此绝不会影响你真实的 `~/.dsh`。
若想手动交互式验证插件：

```bash
dsh plugin --profile compat add "$PWD/packages/dsh-hello"
dsh --profile compat --dump-config | grep -A2 '== @your-scope/dsh-hello'
```

`--dump-config` 只打印组装后的树、不启动它 —— 这是确认自己的行是否存在、以及最终配置是什么样
最快的方式。注意它会给带 scope 的 `name:` 加引号（`name: '@your-scope/dsh-hello'`），
用 grep 查找时容易漏掉。

## 新增一个插件

1. `mkdir packages/dsh-<名称>`，把 `packages/dsh-hello` 的内容复制过去。
2. 在 `package.json` 与 patch 的 `name:` 中设置 npm 包名（`@your-scope/dsh-<名称>`）；
   把行 `id:` 设为简短名称。
3. 把 `src/index.ts` 的 `export const name` 改成与行 `id` 一致。
4. 新增的共用依赖加进 `pnpm-workspace.yaml` 的 `catalog:` 块，然后在包内用 `"catalog:"`
   引用，这样所有插件会一起升级。
5. 运行 `pnpm run check`。

只有当你确实想破坏按它定位的用户 patch 时，才重命名行 `id`：`id` 是覆盖契约，
包 `name` 只是要加载的模块。

## 本仓库固化的约定

- **包名带 scope，行 id 取短名。** `package.json` 用 `@your-scope/dsh-<名称>`，
  patch 用 `id: <名称>` —— 见[命名](#命名)。
- **设置 `publishConfig.access: public`。** scoped npm 包默认私有，不设置会导致发布失败。
- **始终导入带 scope 的 `@deepseek-ai/cordis`。** 不带 scope 的 `cordis` 是另一份模块身份，
  混用会静默破坏 Context 类型增强，`ctx.tools` 等类型会消失。
- **`@deepseek-ai/*` 运行时包一律放 `peerDependencies`。** 加载期你的插件与宿主进程共享模块实例，
  打包一份私有副本会让服务身份分裂。只在开发期使用的包才放 `devDependencies`。
- **所有清理逻辑都挂在 fiber 上。** 通过 `ctx` 注册（`Service` 与 `ctx.tools.register` 都是如此）
  意味着卸载该行时会一并移除服务、工具与各监听器，无需额外记录。
  `unregisters the tool and service when the plugin is disposed` 这条测试就是在固化这一点。
- **需要什么服务就在 `inject` 中声明。** Cordis 会先把插件挂起，直到这些服务就绪，
  因此 `apply` 中无需判空。
- **每一行的配置都要有 schema。** 这样启动器会以明确的报错拒绝错误的 patch，
  而不是让非法值进入你的代码。
- **源码中的 import 带 `.ts` 扩展名**（如 `./service.ts`），由
  `rewriteRelativeImportExtensions` 在 `lib/` 中产出 `.js`。这样源码可直接被 Node 的类型擦除
  运行，同时对外发布的是普通 JavaScript。

## 环境说明

本 checkout 所在的沙箱中 `$HOME` 是只读的，因此 `pnpm-workspace.yaml` 把
`storeDir`/`cacheDir` 固定在了仓库内（pnpm 11 从工作区文件读取这两项，而不是 `.npmrc`）。
在普通机器上可以删除这两行，改用共享的全局 store。
