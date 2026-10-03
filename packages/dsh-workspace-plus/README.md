<h1 align="center">dsh-workspace-plus</h1>

<p align="center">把 DeepSeek Harness 侧边栏的工作区列表变成可分组的树：工作区能打包成组，会话能在工作区内归类，子目录工作区自动嵌套在父工作区体内，点区域标题还能把整个列表聚焦到某一组或某一个工作区。</p>

它接替官方侧边栏的 `sidebar.workspaces` 一个区域，其余界面（logo、面板列表、设置、底部操作）保持原样。一个分组都没建时，列表看起来与官方一致。

## 为什么需要它

官方侧边栏的**分组方式**在按工作区、按工作区树与单列表之间切换，其中最细的一档（按工作区树）按目录层级嵌套工作区，但三者都只有「按什么排」而没有**可命名、可重组的容器**。工作区与会话一多，就只能靠肉眼扫：

- 一个工作区里几十个会话排成长队，没有归类；按工作区树也只按目录层级展开工作区，工作区内部仍是平铺的会话列表；
- 目录层级只体现路径关系，同一批工作区若不在同一目录下，就没法收进一个具名的组；
- 想只看某一个项目，只能靠搜索或拖滚动条。

本插件在官方列表之上加了工作区分组与会话分组两级可命名的容器，并让按 `cwd` 推导的层级在分组之内继续成立，把「找得到」变成「分得开」。

## 功能

- **工作区分组**：把若干工作区打包成列表最外层的一个容器，可折叠、重命名、删除。删除只解散分组，工作区本身不受影响。
- **会话分组**：在单个工作区内部给会话归类。未归组的会话仍平铺在原位，可以逐组渐进整理。
- **子工作区嵌套**（默认开启）：`cwd` 位于某工作区之下的工作区不再与它并列，而是渲染在它体内，层级与目录结构一致，深度不限。
- **工作区选择器**：点区域标题打开的下拉面板，把整个列表聚焦到某一个工作区分组或独立工作区，范围外的一律不渲染，因此分组再多也只需一眼。面板分「最近使用」「置顶」「全部」三块，条目行内直接给出重命名、删除、置顶，聚焦对象与置顶都持久化在服务端，换浏览器仍保留。
- **搜索**：按会话标题与工作区标题过滤，结果行带出所属分组。
- **添加工作区**：复用官方的目录选择交互登记新工作区，并在其中开一个新会话。新工作区落在当前聚焦范围之外时先让它可见：聚焦在工作区分组上就放进那个分组，聚焦在别的工作区上则问一句要不要把视图聚焦过去。
- **会话操作**：重命名、分叉、归档、归组与置顶，三类行共用的行内 `...` 菜单与右键菜单。
- **置顶会话**：区域顶部常驻一块置顶区，跨工作区列出全部置顶会话，列表怎么滚它都留在原位；溢出时悬停展开或区内滚动，可收起。置顶读取与写入都走官方注册表，本包只负责渲染与数量上限。
- **视图选项**：展示方式（按工作区 / 平铺）、状态指示器样式（图标 / 色条）、置顶溢出给法、置顶会话显示方式（仅置顶区 / 置顶区 + 分组内）、子工作区嵌套开关；选择存在浏览器本地。置顶区的显示条数与置顶数量上限是插件配置项，当前改法是编辑 profile 的 `cordis.patch.yml`（见下节）。
- **悬停详情卡片**：补全行上被截断的工作区目录、创建时刻与会话状态。

## 安装

需要 dsh `0.2.0-rc.1` 及以上，覆盖整个 `0.2.x`。

本包从仓库的包目录安装（下称 profile `web`，换成你自己的 profile 名即可）：

```sh
dsh plugin --profile web add "github:yumemowo/dsh-plugins#path:packages/dsh-workspace-plus"
```

pnpm 会先拦一次要求放行构建脚本，把本包对应的键写进 profile 的 `pnpm-workspace.yaml`，再重跑上面的命令：

```yaml
allowBuilds:
  '@yumemowo/dsh-workspace-plus@git+https://github.com/yumemowo/dsh-plugins.git': true
```

这条键不随仓库提交失效。旧版 pnpm（含 Desktop 内置的 11.8.0）只认 `add` 报错里那条含 commit 的键，改用那条即可。

重启 `dsh web`（或 Desktop）后生效。确认配置已组合：

```sh
dsh --profile web --dump-config | grep -A2 '== @yumemowo/dsh-workspace-plus'
```

更新显式指定本包：

```sh
dsh plugin --profile web update @yumemowo/dsh-workspace-plus
```

<details>
<summary>从本地 checkout 开发</summary>

```sh
git clone https://github.com/yumemowo/dsh-plugins
cd dsh-plugins
pnpm install && pnpm run build
dsh plugin --profile web add ./packages/dsh-workspace-plus
```

改源码时，客户端半边要重新构建并刷新页面，宿主半边要重启 `dsh`。

</details>

## 配置置顶区的两个数字

置顶区静止时显示几条、置顶数量上限是多少，是两个插件配置项，默认 `5` 与 `20`。**设置页里没有这两项**：dsh 只把带 volatile 字段的插件列成可配置条目，具体表单要插件自己在客户端注册渲染页，本包没有注册（原因见 [置顶会话的实现计划](docs/session-pinning/implementation-plan.md)）。

改法是编辑 profile 的 patch 层（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`）：

```yaml
- id: workspace-plus
  config:
    pinnedVisibleCount: 3
    pinnedLimit: 8
```

该文件在长驻进程里会热加载，而这两个字段都是 volatile 的：新值直接写进插件已持有的引用，不需要重启 `dsh`。改完若界面没变，刷新页面即可。

数量上限是**本包自己实施的**：官方置顶集合没有上限参数，本包无法让宿主拒绝写入，因此上限表现为达到后把置顶入口置为禁用态。调低上限不会取消已有的置顶，它只拦新增。

## 已知限制

以下官方组件自带的能力**暂未提供**：

- 搜索里的 Host 内容检索（本地标题匹配已提供）
- 视图选项里的排序（展示方式已提供）
- 拖拽排序（工作区与会话两级）
- 每工作区 5 条折叠与 Show more
- Schedule 告警标记（会话状态点已提供）

本插件只影响 `sidebar.workspaces` 一个区域；`conversation.hero.workspace` 等工作区相关区域仍由官方组件负责。

## 和生态内其他类似插件的差异

侧边栏的工作区与会话整理是社区插件最密集的方向之一。同类插件都顶替官方那个工作区浏览区域，因此彼此互斥——HyperForce 的 `dsh-workspace-groups` 就在安装说明里要求先移除 `dsh-better-workspace`。下表基于 2026-10 的公开 README。

| 插件 | 覆盖范围 | 分组从何而来 | 分组数据存哪 |
| --- | --- | --- | --- |
| 本包 | 工作区分组 + 会话分组 + 按 `cwd` 推导的子工作区嵌套 | 显式记录，分组可任意命名 | 官方存储域，`$DSH_HOME/storages/workspace_plus.json` |
| [KannaKuron/dsh-better-workspace](https://github.com/KannaKuron/dsh-better-workspace) | 按磁盘目录嵌套 + 工作区与会话名称里 `/` 的分组，同一棵树也用于新会话页的选择器 | 名称与 `cwd` 的投影，改名即归组 | 无独立数据，分组是名称的函数 |
| [EugeneVl/dsh_session_folders](https://github.com/EugeneVl/dsh_session_folders) | 只有会话文件夹，每个工作区一层 | 显式记录 | 官方存储域 |
| [HyperForce/dsh-workspace-groups](https://github.com/HyperForce/dsh-workspace-groups) | 只有工作区分组，可多层嵌套 | 显式记录 | `<home>/.dsh/workspace-groups.json` |
| [z-col/dsh-workspace-groups](https://github.com/z-col/dsh-workspace-groups) | 分类 → 项目 → 会话的三级树 | 侧挂 YAML 规则自动归类，手动拖拽可覆盖 | 规则文件 + `~/.dsh/workspace-groups.manual.json` |

其中值得单独说明的三条：

- **顶部的工作区选择器。** 点区域标题打开下拉面板，把整个列表聚焦到某一组或某一个工作区，范围外不渲染；面板分「最近使用」「置顶」「全部」，条目行内可直接重命名、删除、置顶。上表各同类插件没有等价物，最接近的 `dsh_session_folders` 是在工作区行上切换聚焦，只有开与关两种状态，没有最近使用与置顶，且重启即失效；本包的聚焦对象与置顶写在官方存储域里，换浏览器仍保留。
- **分组是数据还是投影。** 本包把分组存成记录，因此分组名与工作区名彼此独立，也能把不相干的目录归到一起；代价是归组要经本包的菜单，多一份需要维护的数据。`dsh-better-workspace` 反过来把分组做成名称与路径的投影——没有第二份要同步的数据，重命名即时重排，代价是分组名受工作区名称的写法约束。
- **能力规模。** `dsh-better-workspace` 是本包最直接的同类，覆盖范围与本包相当，并多出拖拽归组、逐项外观自定义、跨端同步与多层会话分组（本包的会话分组只有一层）。本包目前只做分组本身与官方对齐的交互，把外观交给主题。

拖拽排序、视图排序、逐项外观自定义与 Host 内容检索等能力，上表部分插件已提供而本包尚未提供，其中官方自带的那几项列在上一节。

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
| [置顶会话的最终设计](docs/session-pinning/design.md) | 最终设计有哪些元素、各自做什么 |
| [置顶会话的实现计划](docs/session-pinning/implementation-plan.md) | 落地步骤、可调项归属与验收方式 |
| [置顶会话的实现记录](docs/session-pinning/implementation-notes.md) | 落地时与计划正文不一致的三处与原因 |
| [置顶会话的设计过程](docs/session-pinning/design-options.md) | 八个方案、被否理由与实测依据 |
| [置顶会话的对照稿](docs/session-pinning/pinning-mockups.html) | 八个方案并排的可交互页面 |

## 许可证

[MIT](../../LICENSE)
