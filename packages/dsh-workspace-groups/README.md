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

- **新建分组**：工作区行右侧 `...` 菜单里的第一项，输入名称即可。
- **重命名 / 删除工作区**：同一个 `...` 菜单里的后两项，与官方工作区菜单
  一致（重命名在前、删除在后）。两者都直接调用官方工作区控制器
  （`ctx.workspaces.rename` / `delete`），不另造 RPC。删除只移除工作区注册，
  文件夹与会话记录由宿主保留。
- **重命名 / 删除分组**：分组行右侧的铅笔与叉号；删除只解散分组，
  组内会话移出分组，会话本身不受影响。
- **展开折叠**：工作区行与分组行都可折叠，两者状态互不影响。
- **新建会话**：工作区行右侧的 `+`。
- **会话可见性**：与官方组件一致 —— 已归档、子代理来源的会话不显示；
  空白会话只保留当前选中的那一条。

### 工作区行的按钮形态

与官方 `ui-workspace` 逐项对齐：行内只放两个操作，`...` 与 `+`。

| 按钮 | 图标 | 行为 |
| --- | --- | --- |
| `...` | `IconEllipsisOutline16` | 打开菜单：新建分组 / 重命名工作区 / 删除工作区 |
| `+` | `IconPlusOutline16` | 在该工作区新建会话（与官方 `onCreate` 语义一致） |

**「新建分组」收进 `...`**：它不像新建会话那样高频，因此不占行内位置。
官方的 `+` 语义是「新建会话」而非「新建分组」，这里与官方保持一致；
本包原有的气泡图标（`IconNewChatOutline16`）随之让位给官方的 `+`。

菜单里的「新建分组」带 `+` 图标，与官方 `menu.addWorkspace` 用 `IconPlusOutline16`
的写法一致；官方菜单项的两个图标（`IconEditOutline16` / `IconTrashOutline16`）
原样复用。

**会话归组入口暂未渲染。** 会话行尾现在是 `...` 省略号占位按钮：
外观、位置与悬停行为都对齐官方，但点击暂时没有动作。宿主侧的
`moveSession` 接口与 props 契约原样保留，等阶段二换成产品内菜单再接上。
因此目前虽然可以建组、改名、删组，但还**不能把会话放进分组**。

**只有用户创建过分组，才会出现分组结构。** 没有分组时，会话直接平铺在工作区下，
与原生列表一致；未归组的会话也平铺在工作区下，不会被塞进一个凭空造出来的
「未分组」分组。

一个会话至多属于一个分组：移入新分组时会自动从原分组摘除。

### 未分组的工作区

不属于任何工作区的会话（典型来源：工作区被删除后遗留的会话）会收进
列表末尾一个隐式的**「未分组」工作区**区段，与官方一致 —— 官方在
`groupByWorkspace` 里把无所属会话收集成 `workspaceId === undefined` 的分组，
标题取 `group.ungrouped`。

这个区段只在存在无所属会话时才渲染，因此平时不可见。
它的会话行**不带**行尾归组菜单：这些会话没有工作区归属，归组操作无处落。
它的工作区行也**不带** `+`：官方虽然照常渲染这个按钮，但处理函数被
`workspaceId !== undefined` 拦成空操作，是个点不动的死按钮；这里直接不渲染。

注意这与工作区**内部**的分组是两回事：工作区内不会凭空造一个
「未分组分组」——未归组的会话直接平铺在工作区下。工作区一级的「未分组」
容器是另一个层级的概念。

## 阶段一未提供的功能

以下原属于官方组件的功能**暂未实现**：

- 新增工作区（Add workspace）
- 搜索（含 Host 内容检索）
- 拖拽排序（工作区与会话两级）
- 归档会话、fork、重命名会话
- 每工作区 5 条折叠与 Show more
- manual / updated 两种排序
- 待交互警示点、Schedule 告警标记

当前界面会在区域底部显示一行说明，提示这是实验版本。
建组与改名的输入框、删除确认、以及全部图标都走官方
`@deepseek-ai/dsh-client-ui-primitives`（见下节）。

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

文字层级与官方逐条对齐：

- **工作区标题与会话标题同色同字号**：都是 `--dsw-alias-label-primary`
  14px / 20px，且都**不加字重**。官方 `ui-workspace` 的 `.title` 是两者共用的类，
  层级只由行高（34px vs 32px）承担——这里以前误用了更暗的 `label-secondary`
  加 `font-weight: 500`，与官方不一致。
- 容器行（官方 `projectRow`）底色是 `label-primary`，`label-tertiary` 只属于
  其中的图标槽。分组标题是官方没有的层级，刻意保留 `label-tertiary`
  以示「比工作区低一级」。
- 字号与行高成对写在叶子上（官方 `.title` 即如此）；根节点只设 `font-size: 14px`，
  **不设 `line-height`**，与官方侧栏根一致。

两处结构性对齐，都是照官方 DOM 复刻的：

- **工作区行**：静止时显示文件夹（展开/收起两态），行悬停时文件夹隐藏、
  换成实心三角箭头。两个槽都常驻同一 16px 图标列，因此切换时标题不位移。
- **会话行**：行首保留一个同宽的图标占位列（官方放状态点，本包暂不渲染状态），
  行尾是操作位。标题因此落在工作区标题的同一横向线上，与官方几何一致。

行内操作按钮默认隐藏（并同时 `pointer-events: none`，否则会留下看不见却能
点中的热区），只在三种情况下显示：**所在行悬停**、**菜单展开期间**、
**键盘导航聚焦**（`:focus-visible`）。

这里刻意**不用** `:focus`、`:focus-within` 和选中态：鼠标点过按钮后焦点会留在
按钮或行上，这三条会让按钮一直显示；`:focus-visible` 只在键盘操作时命中，
既消除鼠标残留，又保留清晰可见的键盘焦点。官方 `ui-workspace` 同理 ——
它只认 `:hover` 与菜单展开态。

三种显示状态都需要「行」自身获得焦点或悬停，因此行与容器行的
`onKeyDown` 会忽略由行内按钮冒泡上来的按键（`event.target !== event.currentTarget`），
否则在按钮上按 Enter 会连带折叠工作区或打开会话。

### 复用官方原子组件

按官方 [Web UI 样式参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md)
「重新设计控件样式之前先复用控件」的要求，本包不再自绘这些控件：

| 位置 | 用的官方原语 |
| --- | --- |
| 建组 / 改名 / 工作区重命名 | `Modal` + `Input` + `Button`（`outline` / `primary`） |
| 删除分组 / 删除工作区 | `Modal` + `Button`（`outline`，确认按钮着错误色） |
| 文件夹、三角、省略号 | `IconFolderClose16` / `IconFolderOpen16` / `IconTriangleRightFill14` / `IconEllipsisOutline16` |
| 新建会话、新建分组、改名、删除 | `IconPlusOutline16` / `IconEditOutline16` / `IconTrashOutline16` |
| 窄栏展开入口 | `IconPanelLeftOutline16`（与官方侧栏折叠按钮同一字形） |

原语的样式属于 ui-theme / ui-primitives：本包不为它们写颜色、阈值或高亮，
只在 `styles.ts` 里保留自己的布局约定。

两处刻意的取舍：

- **删除分组用普通 `Modal`，不用 `RiskConfirmation`。** 后者自带警告图标与
  「须勾选确认」的复选框，而删除分组只解散分组、不动会话本身，达不到那个
  破坏级别。危险语义改由确认按钮的错误色承载（`.wg-danger-action` 设
  `--dsw-alias-state-error-primary`）——这与官方 `ui-workspace` 的删除按钮
  是同一做法：`Button` 没有 `danger` variant，改色就靠传 `className`。
- **行内 16px 图标按钮保留自绘。** 官方 `ui-workspace` 的行内按钮也是它自己的
  CSS Module（16px 命中区、4px 圆角、悬停提亮文字色），primitives 没有等价的
  16px 行内按钮；换成 primitives 的 `Button`（28px 高、带悬停底色）会让行外观
  明显偏离官方。因此几何保留同一份 16px 约定，图标取原语。

primitives 的值导入集中在 `src/client/runtime.ts`，打包脚本把它标成 external
由宿主从基线模块表解析；它是 shell 静态模块表的成员，不会多出第二份实例。


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

## 客户端代码结构

浏览器半边按「入口 / 契约 / 数据 / 组件」分层，每个模块只做一件事；组件
用 `.tsx` 写 JSX，纯逻辑留在 `.ts`（tsconfig 与 vitest 都已包含 `**/*.tsx`）。

```
src/client/
├── index.ts                    插件入口：语言包注册、remote 挂载、插槽注册、对照开关
├── labels.ts                   中英文案表、RegionLabels 契约、命名空间声明
├── actions.ts                  RegionActions / RegionDataHooks（组件与宿主的接口）
├── compare.tsx                 对照模式：挂进 better-sidebar 右侧栏 tab
├── remote.ts                   Remote 贡献声明与调用封装
├── runtime.ts                  primitives 值导入的唯一出口（external）
├── styles.ts                   本包样式表
├── data/                       无 React 依赖的纯逻辑
│   ├── types.ts                SessionRow / GroupSection / WorkspaceLayout / 草稿类型
│   ├── layout.ts               分组元数据 → 渲染布局
│   └── sessions.ts             会话快照 → 渲染行（含可见性过滤、未分组收集）
└── components/
    ├── WorkspaceGroupsRegion.tsx   区域容器：状态与编排
    ├── WorkspaceSection.tsx        一个工作区区块（标题 + 折叠体 + 空态）
    ├── WorkspaceRow.tsx            工作区标题行（文件夹/箭头、`...`、`+`）
    ├── GroupSection.tsx            一个分组（分组头 + 组内会话）
    ├── SessionRowView.tsx          会话行外壳（状态位列、标题、可选操作位）
    ├── SessionRowMenu.tsx          带归组菜单的会话行
    ├── WorkspaceRail.tsx           窄栏展开入口
    ├── IconButton.tsx              16px 行内图标按钮
    ├── rowKeyboard.ts              Enter/Space 行激活（忽略行内按钮冒泡）
    └── dialogs/
        ├── NameDialog.tsx          建组 / 改名 / 重命名工作区共用的单行输入框
        └── DeleteDialog.tsx        破坏性操作确认框
```

状态的归属只有一处：折叠态与四个对话框草稿留在 `WorkspaceGroupsRegion`，
菜单开合留在持有锚点的行组件内，行的外观组件保持无状态。

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
