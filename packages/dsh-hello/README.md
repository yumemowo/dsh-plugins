# @yumemowo/dsh-hello

本 monorepo 的参考骨架，新增 dsh 插件时复制本包作为起点。

## 命名

npm 包名带 scope（`@yumemowo/dsh-hello`），但运行时标识符保持简短、不带 scope：

| 标识符 | 取值 | 位置 |
| --- | --- | --- |
| 包名 | `@yumemowo/dsh-hello` | `package.json` 的 `name`，以及 patch 的 `name:` |
| 行 id | `hello` | `cordis.patch.yml` 的 `id:` |
| 插件/fiber 名 | `hello` | `src/index.ts` 的 `export const name` |
| 服务名 | `hello` | `ctx.hello` |
| 工具名 | `hello_greet` | 模型调用时使用的名字 |

`dsh-` 前缀与 npm scope 属于包身份，而非运行时身份：行 `id` 是面向用户的覆盖键，
同时也是 client bundle id，因此保持简短。这与官方插件一致 ——
`@deepseek-ai/dsh-command-goal` 的运行时名是 `command-goal`，
`@linxin666/dsh-client-ui-git-graph` 的行 id 是 `ui-git-graph`。

## 示例内容

| 文件 | 展示的内容 |
| --- | --- |
| `src/index.ts` | 插件入口：`name`、`inject`、`apply` |
| `src/service.ts` | 生命周期绑定 fiber 的 Cordis `Service`，对外暴露为 `ctx.hello` |
| `src/tool.ts` | `defineTool`，以及注册到 `ctx.tools` |
| `src/config.ts` | 由加载器校验的 schemastery 行配置 schema |
| `cordis.patch.yml` | 插入 `hello` 行的 bundle patch |
| `test/hello.test.ts` | 在其真实依赖之上挂载该插件 |
