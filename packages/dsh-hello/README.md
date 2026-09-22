# @your-scope/dsh-hello

本 monorepo 的参考 dsh 插件：提供一个 `hello` 服务（`ctx.hello`）与一个面向模型的
`hello_greet` 工具。新增插件时可复制本包作为起点。

## 命名

npm 包名带 scope（`@your-scope/dsh-hello`），但运行时标识符保持简短、不带 scope：

| 标识符 | 取值 | 位置 |
| --- | --- | --- |
| npm 包名 | `@your-scope/dsh-hello` | `package.json` 的 `name`，以及 patch 的 `name:` |
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

## 安装到 profile

```bash
dsh plugin --profile compat add "$PWD/packages/dsh-hello"
dsh --profile compat --dump-config | grep -A2 '== @your-scope/dsh-hello'
```

## 配置

本行只接受一个字段。可在 profile 自己的 patch 层中覆盖它：

```yaml
# $DSH_HOME/profiles/<名称>/cordis.patch.yml
- id: hello
  config:
    greeting: 你好
```

`greeting` 默认值为 `Hello`，因此 `hello_greet who="dsh"` 返回 `Hello, dsh!`。
传入非字符串值时会在加载插件树时被拒绝：

```
invalid config:
  - $.greeting expected string but got 12345 (at greeting)
```

## 禁用

```yaml
# $DSH_HOME/profiles/<名称>/cordis.patch.yml
- id: hello
  disabled: true
```
