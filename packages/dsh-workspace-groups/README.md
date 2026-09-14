# @your-scope/dsh-workspace-groups

为 dsh Web 侧边栏的**每个工作区**提供会话分组：手动建组、把会话归入分组、展开折叠。

> `@your-scope` 是占位符，发布前替换为你自己的 npm scope（改 `package.json` 与 `cordis.patch.yml` 两处）。

## 它替换了什么

侧边栏 shell（`dsh-client-ui-sidebar`）把工作区浏览区域声明为插槽 `sidebar.workspaces`，
官方由 `dsh-client-ui-workspace` 填充。本包接替这个区域。

`sidebar.workspaces` 是 **single** 类型的插槽，规则是：

- 同一优先级重复注册会抛错；
- **优先级数值更低者渲染**。

官方用默认优先级 `0`，因此本包以 **`priority: -1`** 注册成为渲染者，
无需禁用官方那一行。官方组件仍留在注册表中，只是不再渲染。

**只影响这一个区域。** logo（`sidebar.brand.*`）、面板列表（`sidebar.panellist`）、
设置与底部操作（`sidebar.settings` / `sidebar.footer.action`）都是并列的兄弟插槽，不受影响。
`conversation.hero.workspace`（新会话页的工作区选择器）也仍由官方组件负责。

## 对照模式（开发期）

官方 `ui-workspace` 只导出 `apply`，`WorkspaceBrowser` 并未导出，因此**无法**
在别处复现官方渲染。想和官方同屏比对，只能反过来：把左侧交还官方，
本区域改挂到右侧栏。

`src/client/index.ts` 里的编译期常量 `COMPARE_MODE` 控制两种形态：

| 取值 | 形态 |
| --- | --- |
| `true` | 左侧 `sidebar.workspaces` 归官方 ui-workspace；本区域注册成 `dsh-better-sidebar` 的右侧栏 tab（`workspace-groups:compare`），左右并排。 |
| `false` | 本包以 `priority: -1` 接替左侧区域（产品形态）。 |

之所以是编译期常量而不是配置项：这是开发期的对照开关，不是要交付给用户的
能力，配置化还要多一套 schema 与文档。改完重新 `pnpm run build` 并刷新页面即可。

对照 tab 走的是 better-sidebar 对外的 `registerTab`：它会把每个描述符
**同步注册进 DSH 原生右侧栏**，所以外部插件不需要直接碰 `ctx.sidebarRightTabs`。
`betterSidebar` 缺失时静默跳过，宿主半边与存储不受影响。

## 已提供的功能

- **新建分组**：工作区行右侧的 `+`，输入名称即可。
- **重命名 / 删除分组**：分组行右侧的铅笔与叉号；删除只解散分组，
  组内会话移出分组，会话本身不受影响。
- **展开折叠**：工作区行与分组行都可折叠，两者状态互不影响。
- **新建会话**：工作区行右侧的气泡按钮。
- **会话可见性**：与官方组件一致 —— 已归档、子代理来源的会话不显示；
  空白会话只保留当前选中的那一条。

**会话归组入口暂未渲染。** 会话行尾现在是 `...` 省略号占位按钮：
外观、位置与悬停行为都对齐官方，但点击暂时没有动作。宿主侧的
`moveSession` 接口与 props 契约原样保留，等阶段二换成产品内菜单再接上。
因此目前虽然可以建组、改名、删组，但还**不能把会话放进分组**。

**只有用户创建过分组，才会出现分组结构。** 没有分组时，会话直接平铺在工作区下，
与原生列表一致；未归组的会话也平铺在工作区下，不会被塞进一个凭空造出来的
「未分组」分组。

一个会话至多属于一个分组：移入新分组时会自动从原分组摘除。

## 阶段一未提供的功能

以下原属于官方组件的功能**暂未实现**：

- 新增工作区（Add workspace）
- 搜索（含 Host 内容检索）
- 拖拽排序（工作区与会话两级）
- 归档会话、fork、重命名会话
- 删除/重命名工作区
- 每工作区 5 条折叠与 Show more
- manual / updated 两种排序
- 待交互警示点、Schedule 告警标记

当前界面会在区域底部显示一行说明，提示这是实验版本。
建组与改名的输入框目前用浏览器原生 `prompt`，阶段二会替换为产品内组件。

### 样式对齐

样式取值取自官方侧边栏组件（`dsh-client-ui-sidebar` 与
`dsh-client-ui-workspace` 0.1.5-rc.2）的实际规则，而不是自定数值：

| 项 | 取值 |
| --- | --- |
| 工作区与分组行高 | `34px` |
| 会话行高 | `32px` |
| 行内水平内边距 / 圆角 | `8px` / `8px` |
| 图标列宽 | `16px`（`height: 20px`） |
| 悬停与选中底色 | `--dsw-alias-interactive-bg-hover` |
| 展开且含当前会话的文件夹 | `--dsw-alias-state-business-primary` |
| 文本色阶 | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` |
| 滚动条留白 | `--dsh-session-list-scrollbar-width` / `-offset` |
| 过渡 | `--ds-ease-in-out`，并遵守 `prefers-reduced-motion` |

两处结构性对齐，都是照官方 DOM 复刻的：

- **工作区行**：静止时显示文件夹（展开/收起两态），行悬停时文件夹隐藏、
  换成实心三角箭头。两个槽都常驻同一 16px 图标列，因此切换时标题不位移。
- **会话行**：行首保留一个同宽的图标占位列（官方放状态点，本包暂不渲染状态），
  行尾是操作位。标题因此落在工作区标题的同一横向线上，与官方几何一致。

图标路径数据内联自官方 `@deepseek-ai/dsh-client-ui-primitives`
（`IconFolderClose16` / `IconFolderOpen16` / `IconTriangleRightFill14` /
`IconEllipsisOutline16`）：shell 的基线模块表里虽然有那个命名空间，
但本包不引它的值导出，内联同一份路径可以避免多一份实例。

行内操作按钮默认隐藏，悬停或键盘聚焦时才显示，避免常驻噪音。

### 为什么不能只做增量扩展

官方组件**没有**暴露会话行级别的插槽，因此无法在它内部追加分组。
唯一的做法是接替整个区域。

### 目录选择器为什么不能用

`ui-workspace` 声明了子插槽 `sidebar.workspaces.directoryFlow`，目录选择器插件
（`directory-picker-browse` / `-native`）注册到那里。而**一个插槽只能有一个声明者**：
被接替后该子插槽随之消失，本包再声明同名子插槽会直接抛错（已实测验证）。

因此阶段一不声明该子插槽，也不提供新增工作区入口。

## 数据存储

分组元数据存在 `$DSH_HOME/storages/workspace_groups.json`，由宿主半边通过
`dsh-storage-domain` 读写——与工作区记录本身同一套存储机制。

按 workspaceId 分表，结构为：

```json
{
  "w_abc": { "groups": [{ "id": "g1", "name": "前端", "sessionIds": ["s_1", "s_2"] }] },
  "w_def": { "groups": [] }
}
```

**不侵入工作区数据**：这里只保存「哪些会话属于哪个分组」的结构信息，
不修改 `workspaceRegistry` 的会话归属，也不改变会话顺序。
把最后一个分组删掉时整条工作区记录会被移除，避免留下死数据。

「未分组」不是存储概念，只是「不在任何分组的 `sessionIds` 里」这一事实的呈现。
元数据里出现但已不在会话列表中的 id 会被静默跳过，未归组或元数据失效的会话
平铺在工作区下，因此即使元数据与真实列表出现偏差，界面也不会丢行。

## 安装

```bash
dsh plugin --profile web add "$PWD/packages/dsh-workspace-groups"
dsh --profile web --dump-config | grep -A2 '== @your-scope/dsh-workspace-groups'
```

改完客户端代码后重新构建并刷新页面：

```bash
pnpm run build          # tsc（宿主）+ esbuild（浏览器 bundle）
```

## 构建产物

| 产物 | 内容 |
| --- | --- |
| `lib/index.js` | 宿主半边：存储、服务、typert 绑定 |
| `lib/typert.js` | Host 面 Typert 清单，被 `typert-loader` 自动发现 |
| `lib/client.js` | 浏览器半边，包成 `window.__ModuleLoader__.load({ id, factory })` |

客户端 bundle 由 `scripts/build-client.mjs` 用 esbuild 打出，React 等基线模块
从工厂的 `require` 解析而不打进产物。`lib/client.js` 必须存在，否则 Web 客户端
启动时会直接报缺产物。

## 开发

```bash
pnpm run typecheck   # src 与 test 两个工程
pnpm run test        # 分组切分逻辑 + 宿主服务
pnpm run build
```

`pnpm run verify:mount`（仓库根）会用真实 `dsh` 启动器验证本包能被加载。
