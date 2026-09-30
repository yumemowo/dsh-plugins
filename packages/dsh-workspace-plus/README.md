<h1 align="center">dsh-workspace-plus</h1>

<p align="center">把 DeepSeek Harness 侧边栏的工作区列表变成可分组的树：工作区能打包成组，会话能在工作区内归类，子目录工作区自动嵌套在父工作区体内。</p>

它接替官方侧边栏的 `sidebar.workspaces` 一个区域，其余界面（logo、面板列表、设置、底部操作）保持原样。一个分组都没建时，列表看起来与官方一致。

## 为什么需要它

官方侧边栏把所有工作区平铺成一排，每个工作区下面的会话也平铺直叙。工作区一多，就只能靠肉眼扫：

- 同一项目的几个 checkout（`/repo`、`/repo/packages/a`、`/repo/packages/b`）各占一行，看不出彼此关系；
- 一个工作区里几十个会话排成长队，没有归类，也不能折叠；
- 想只看某一个项目，只能靠搜索或拖滚动条。

本插件在官方列表之上加了两级容器和一层按目录推导的嵌套，把「找得到」变成「分得开」。

## 功能

- **工作区分组**：把若干工作区打包成列表最外层的一个容器，可折叠、重命名、删除。删除只解散分组，工作区本身不受影响。
- **会话分组**：在单个工作区内部给会话归类。未归组的会话仍平铺在原位，可以逐组渐进整理。
- **子工作区嵌套**（默认开启）：`cwd` 位于某工作区之下的工作区不再与它并列，而是渲染在它体内，层级与目录结构一致，深度不限。
- **工作区选择器**：点区域标题打开的下拉面板，把列表聚焦到某一个工作区分组或独立工作区；分「最近使用」「置顶」「全部」三块，条目行内直接给出重命名、删除、置顶。
- **搜索**：按会话标题与工作区标题过滤，结果行带出所属分组。
- **添加工作区**：复用官方的目录选择交互登记新工作区，并在其中开一个新会话。
- **会话操作**：重命名、分叉、归档与归组，三类行共用的行内 `...` 菜单与右键菜单。
- **视图选项**：展示方式（按工作区 / 平铺）、状态指示器样式（图标 / 色条）、子工作区嵌套开关；选择存在浏览器本地。
- **悬停详情卡片**：补全行上被截断的工作区目录、创建时刻与会话状态。

## 安装

装进一个 profile（下称 `web`，换成你自己的 profile 名即可）：

```sh
# 本地 checkout 开发
dsh plugin --profile web add "$PWD/packages/dsh-workspace-plus"

# 从 git 仓库的包目录安装（#path: 指向 monorepo 里的包根）
dsh plugin --profile web add "git+https://github.com/yumemowo/dsh_plugins.git#path:packages/dsh-workspace-plus"
```

从 git 安装时，pnpm 会拦截包的构建脚本——本包靠 `prepare` 在安装时现编译出 `lib/`。第一次 `add` 会失败并打印它要求的精确键，照抄进 profile 的 `pnpm-workspace.yaml` 再试：

```yaml
# 键由 pnpm 打印，形如 <包名>@<git 源>#<commit>&path:<包目录>
allowBuilds:
  '@yumemowo/dsh-workspace-plus@git+https://github.com/yumemowo/dsh_plugins.git#<commit>&path:packages/dsh-workspace-plus': true
```

这条授权等于允许该包在安装时于本机执行代码，且不在 agent 沙箱内；只对可信来源放行，并锁定 commit。

安装后启动 `dsh web`（或重启 Desktop）。确认配置已组合：

```sh
dsh --profile web --dump-config | grep -A2 '== @yumemowo/dsh-workspace-plus'
```

本地开发时，改完客户端代码要重新构建产物并刷新页面；改到宿主半边则要重启 `dsh`：

```sh
pnpm run build
```

## 已知限制

以下官方组件自带的能力**暂未提供**：

- 搜索里的 Host 内容检索（本地标题匹配已提供）
- 视图选项里的排序（展示方式已提供）
- 拖拽排序（工作区与会话两级）
- 每工作区 5 条折叠与 Show more
- Schedule 告警标记（会话状态点已提供）

本插件只影响 `sidebar.workspaces` 一个区域；`conversation.hero.workspace` 等工作区相关区域仍由官方组件负责。

## 文档

本 README 只讲插件是什么、怎么用。设计论证、对齐依据与踩过的坑按主题记在 `docs/`：

| 文档 | 内容 |
| --- | --- |
| [开发约定](docs/conventions.md) | 改这个包要守的硬约束，**动手前先读** |
| [客户端代码结构](docs/code-structure.md) | 目录分层与状态归属 |
| [数据存储](docs/data-storage.md) | 存储位置、记录结构与版本策略 |
| [子工作区嵌套](docs/sub-workspace-nesting.md) | 父子判定、渲染段序与缩进模型 |
| [与官方实现的复用关系](docs/official-reuse.md) | 插槽接替、官方原语与语言包的借用 |
| [交互细节与官方对齐依据](docs/ui-details.md) | 菜单、命名、时间、状态点、悬停卡片等 |
| [布局与样式对齐](docs/layout-and-styling.md) | 尺寸、留白、色阶与缩进取值来源 |
| [组件样式的模块划分](docs/component-styles.md) | 样式表为何这样拆、类名哈希的硬约束 |
| [撑开动效](docs/expand-motion.md) | 轨道、两段式展开与节奏参数 |
| [渲染性能与行级缓存](docs/render-performance.md) | 行级 memo 怎样才命中（含实测） |
| [自绘图标](docs/custom-icons.md) | 官方没有的字形从何而来 |
| [客户端集成](docs/client-integration.md) | 对照模式、热重载与基线模块 |
| [会话行指示器的备选方案](docs/session-row-indicator/README.md) | 指示器几何的六种解法与取舍 |

## 许可证

[MIT](../../LICENSE)
