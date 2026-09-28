# @your-scope/dsh-workspace-groups

为 dsh Web 侧边栏提供两级分组与子工作区嵌套：**工作区分组**（把一组工作区打包管理，只出现在列表最外层）、**会话分组**（每个工作区内部的会话归类），以及按目录路径自动推导的**子工作区嵌套**（`/repo/a` 渲染在 `/repo` 体内）。

> `@your-scope` 是占位符，发布前替换为你自己的 npm scope（改 `package.json` 与 `cordis.patch.yml` 两处）。

## 它替换了什么

侧边栏 shell（`dsh-client-ui-sidebar`）把工作区浏览区域声明为插槽 `sidebar.workspaces`，官方由 `dsh-client-ui-workspace` 填充；本包以 `priority: -1` 注册成为渲染者，接替这个区域，**无需禁用官方那一行**。

**只影响这一个区域。** logo（`sidebar.brand.*`）、面板列表（`sidebar.panellist`）、设置与底部操作（`sidebar.settings` / `sidebar.footer.action`）都是并列的兄弟插槽，不受影响；`conversation.hero.workspace`（新会话页的工作区选择器）仍由官方组件负责。

本包对齐 **dsh 0.1.7-rc.1**：客户端与宿主两半的依赖都按那一版的接口写，图标名也按那一版的 primitives 导出表取。对照模式挂的是 DSH 原生右侧栏（`dsh-client-ui-sidebar-right`），不依赖第三方 sidebar 插件。

插槽的 single 语义、官方注册为何仍然留在注册表里并因此能继续提供子插槽 `sidebar.workspaces.directoryFlow`（添加工作区的目录选择交互来源），见 [与官方实现的复用关系](docs/official-reuse.md)。

## 已提供的功能

- **添加工作区**：区域 header 右侧的图标入口，借用官方目录选择交互选中一个目录后登记为工作区，并在其中开一个新会话。
- **工作区选择器**：header 两行标题（合起来是一个按钮）打开的下拉面板，把整个列表聚焦到根节点上的某一个条目。菜单只列虚拟工作区分组本身（不列它名下的成员，那与聚焦分组是同一片内容），未归组的独立工作区则按嵌套层级展开。菜单分「最近使用」（至多 5 个）、「置顶」、「全部」三块，前两块可向下展开收起、「全部」不带标题；条目行与工作区行同形（可点的行 + 行内三枚按钮：重命名、删除、置顶，前两项转到既有的对话框与宿主接口）。聚焦后整个 workspace 部分只显示那一片内容，根节点那层不再重复渲染组头；没有聚焦时列表与没有这个特性时完全一致。
- **新建分组时切过去**：已在聚焦状态下新建工作区分组时，命名框里多一个「切换到新工作区」勾选项——新分组追加在列表最末，不切过去就会落在视野之外。
- **搜索**：header 里的搜索入口，按标题（会话标题或工作区标题）过滤会话，动效与交互对齐官方；结果行的路径带上分组。只做本地标题匹配，不接 Host 内容检索。
- **新建分组**：工作区行右侧 `...` 菜单里的第一项，输入名称即可。
- **重命名 / 删除工作区**：同一个 `...` 菜单里的后两项，与官方工作区菜单一致，直接调用官方工作区控制器（`ctx.workspaces.rename` / `delete`），不另造 RPC。删除只移除工作区注册，文件夹与会话记录由宿主保留。
- **重命名 / 删除分组**：分组行右侧 `...` 菜单里的两项；删除只解散分组，组内会话移出分组，会话本身不受影响。
- **会话归组**：会话行 `...` 菜单（与行右键菜单）里的「移动到…」二级菜单，列出它所属工作区内的其他分组；已归组时下方还有「取消分组」。
- **工作区分组**：把一组工作区打包管理的**根节点**容器，只出现在列表最外层。两个入口：header 右侧的图标按钮（一眼可见，建出空分组），以及工作区行 `...` 菜单里的「移动到…」二级菜单（移动时顺手建组并把当前工作区放进去，另含移入已有分组）。分组行可折叠、可重命名、可删除。带二级菜单的菜单项在行尾带一个右箭头（「移动到… ▸」），补上官方 `Menu` 原语没有的「此处还有一层」可见提示。
- **子工作区嵌套**（默认开启）：`cwd` 在某工作区之下的工作区不再与它并列，而是在它体内的折叠体里渲染，层级与目录结构一致。父子关系由路径现推（不落盘），任意深度，中间层没登记时跨过去挂到更远的祖先；**同处一个虚拟工作区分组、或都不在任何分组里的工作区之间**才成父子（收进同一个分组不会把层级抹平）。父工作区内分三段：**子工作区 → 会话分组 → 平铺会话**；三段靠缩进区分（会话行的状态指示器不占行内流），不需要额外的段落标题。
- **放进父工作区的分组**：工作区行 `...` 菜单里的「移动到分组…」二级菜单，列出各祖先工作区体内可移入的会话分组；父由选中的那个分组决定。放进某个分组的子工作区渲染在那个分组里，它的子工作区一并跟随（已放进别处的会先问一句）。已归组时下方还有「移出分组」。这一块与进根节点工作区分组的「移动到…」各成一个块，菜单里用分隔线隔开。
- **嵌套开关**：header 右侧的视图选项按钮打开的面板里，渲染成官方 `Switch` 原语，默认开启。关闭前弹确认框并列出会被解除嵌套的工作区，关闭后列表底部给出一行说明。
- **展示方式**：同一个视图选项面板里的第一条设置，两条互斥的可选项——「按工作区」渲染分组结构（默认），「平铺」把全部可见会话收进一条列表，与官方「单列表」一致。选择存在浏览器本地，刷新后保留；工作区选择器的聚焦在平铺下照常收窄这条列表。
- **状态指示器**：会话行的运行 / 待交互 / 完成三态，两种样式在同一面板里互斥切换——「图标」用官方状态点（默认），「色条」用一根圆角竖条。指示器绝对定位在行的左侧、不占行内流，因此标题位置与状态无关；运行与待交互各带一层同色系浅底，完成与空闲不带底色。选择存在浏览器本地。
- **会话数**：分组行行尾显示组内会话数，与 session 行的相对时间同格同形。空分组不显示，悬停/菜单展开时与会话行的时间一样隐去。
- **展开折叠**：工作区行与分组行都可折叠，两者状态互不影响，展开/收起带过渡动作。
- **新建会话**：工作区行与分组行右侧的新建会话按钮（与官方工作区行同一枚字形）。分组行那枚会把新会话建在该分组所属工作区，并自动把它归入这个分组。建会话走官方导航服务，因此与官方组件一样复用同工作区已有的空白会话，连点两次不会攒出两条空会话。
- **会话可见性**：与官方组件一致 —— 已归档、子代理来源的会话不显示；空白会话只保留当前选中的那一条。
- **会话命名**：新建中的会话行显示官方的固定名「新会话」；会话正式启用后显示标题服务投影出的摘要名。
- **会话状态点**：行首用官方 `StateDot` 原语显示状态，取值与官方 `ui-workspace` 的 `sessionStatuses` 逐条一致。
- **会话重命名 / 分叉 / 归档**：会话行 `...` 菜单里直接复用官方接口与官方文案。
- **行右键菜单**：三类行都可右键唤出行操作菜单，条目与行内 `...` 菜单一致，面板落在指针处。
- **行尾最近更新时间**：官方风格的紧凑相对时间，格式化完全复用官方原语与语言包。
- **悬停详情卡片**：工作区行与会话行悬停后浮出官方 `HoverCard`，工作区那张给出名称、目录路径与创建时刻，会话那张给出完整标题、相对时间与逐条状态；两张都可以点一下复制被截断的那份值。

每项行为的逐条说明与对齐依据（菜单条目表、状态点优先级、搜索与添加工作区的流程、悬停卡片的两张正文、工作区选择器的菜单结构与聚焦语义）见 [交互细节与官方对齐依据](docs/ui-details.md)；子工作区嵌套的完整设计见[子工作区嵌套](docs/sub-workspace-nesting.md)。

## 未提供的功能

以下原属于官方组件的功能**暂未实现**：

- 搜索里的 **Host 内容检索**（本地标题匹配已提供）
- 视图选项里的**排序**（展示方式已提供：按工作区 / 平铺）
- 拖拽排序（工作区与会话两级）
- 每工作区 5 条折叠与 Show more
- manual / updated 两种排序
- Schedule 告警标记（会话状态点已提供）

会话的**重命名 / 分叉 / 归档**与**添加工作区**都已通过复用官方接口提供，不再是本包自己实现的功能。当前界面会在区域底部显示一行说明，提示这是实验版本；建组与改名的输入框、删除确认与全部图标都走官方 `@deepseek-ai/dsh-client-ui-primitives`（见 [与官方实现的复用关系](docs/official-reuse.md)）。

## 深入文档

README 只讲本包是什么、怎么用。设计论证、对齐依据与踩过的坑按主题记在 `docs/`：

| 文档 | 内容 |
| --- | --- |
| [与官方实现的复用关系](docs/official-reuse.md) | 插槽接替规则、目录选择器复用官方的洞、官方原语与语言包的借用 |
| [交互细节与官方对齐依据](docs/ui-details.md) | 行菜单 / 右键菜单 / 命名 / 时间 / 状态点 / 悬停卡片 / 搜索 / 添加工作区 / 工作区分组 / 工作区选择器 / 展示方式 |
| [布局与样式对齐](docs/layout-and-styling.md) | 尺寸、留白、色阶与层级缩进的取值来源 |
| [组件样式的模块划分](docs/component-styles.md) | 样式为什么按这条边界拆成 10 张表、类名哈希的硬约束、构建与测试的接法 |
| [折叠动效](docs/collapse-motion.md) | 折叠轨道、两段式展开、节奏参数、显隐为何必须 fail-open 与嵌套行为 |
| [渲染性能与行级缓存](docs/render-performance.md) | 行级 memo 要怎样才能命中、推导放在哪一层的取舍（含实测数据） |
| [自绘图标](docs/custom-icons.md) | 工作区分组两个字形的构图依据，以及 0.1.7-rc.1 起改用官方图标的几处 |
| [子工作区嵌套](docs/sub-workspace-nesting.md) | 父子关系怎么判定、渲染位置与段序、开关与确认框、放进分组时子工作区怎么跟随、缩进模型 |
| [数据存储](docs/data-storage.md) | 存储位置、记录结构（含嵌套归属 / 聚焦 / 最近使用 / 置顶）、版本策略与变更回快照；展示方式与折叠态为何不在这里 |
| [客户端集成](docs/client-integration.md) | cordis 代理语义、对照模式（`COMPARE_MODE`）、热重载与 `$mount` 配平、基线模块与 node 测试替身 |
| [会话行指示器的备选方案](docs/session-row-indicator/README.md) | 状态指示器为何要不占行内流、六种解法的实测几何与最终取舍，以及收起态为什么是指示器解决不了的问题（附[对照稿](docs/session-row-indicator/indicator-mockups.html)） |

## 安装

```bash
dsh plugin --profile web add "$PWD/packages/dsh-workspace-groups"
dsh --profile web --dump-config | grep -A2 '== @your-scope/dsh-workspace-groups'
```

改完客户端代码后重新构建并刷新页面：

```bash
pnpm run build          # tsc（宿主）+ esbuild（浏览器 bundle）
```

**改了宿主半边要重启 `dsh`。** `dsh-client-hmr` 只推客户端 bundle；宿主那半（`lib/index.js`）由 `dsh` 启动时加载，改它必须重启进程才生效。两端因此可能短暂不同步——浏览器半边已经是新版本，宿主还在回旧形状的快照；客户端的 `normalizeSnapshot` 会补齐缺格，界面退化成「没有工作区分组」而不是抛错崩掉。

宿主侧 `dsh-client-hmr` 会轮询客户端 bundle 的 mtime，内容变了就推一帧 `rebuilt`，浏览器半边据此把本插件卸载再重载，因此通常不必手动刷新。这条路径对挂载期资源的要求见 [客户端集成](docs/client-integration.md)。

## 客户端代码结构

浏览器半边按「入口 / 契约 / 数据 / 状态 / 渲染」分层，每个模块只做一件事；组件用 `.tsx` 写 JSX，纯逻辑留在 `.ts`（tsconfig 与 vitest 都已包含 `**/*.tsx`）。`rootEntry.ts` 与 `pickerState.ts` 留在 `src/` 而不是 `src/client/`，因为宿主半边也要用同一份修剪与排序规则。

```
src/client/
├── index.ts                    插件入口：语言包注册、remote 挂载、插槽注册、对照开关
├── locales.ts                  命名空间声明与中英字典（键名取官方叫法）
├── labels.ts                   文案契约与投影（TranslateNS → RegionLabels）
├── official.ts                 官方 workspace 语言包与相对时间的复用面
├── directoryFlow.ts            官方 directoryFlow 洞的占用者读数（添加工作区的交互来源）
├── hostInfo.ts                 宿主固定事实（home 目录）的读数（悬停卡片的路径缩写要用）
├── useFlipMarker.ts            量区域矩形、按需在 body 上挂浮层翻转标记
├── actions.ts                  RegionActions / RegionDataHooks（组件与宿主的接口）
├── useLocale.ts                区域文案的唯一读取入口（RegionLocaleProvider + useLocale）
├── compare.tsx                 对照模式：挂进原生右侧栏 tab
├── remote.ts                   Remote 贡献声明与调用封装
├── runtime.ts                  primitives 值导入的唯一出口（external）
├── icons.tsx                   自绘图标（官方没有的字形；规范见 [自绘图标](docs/custom-icons.md)）
├── menus.tsx                   菜单条目构造（工作区 / 分组 / 工作区分组行内菜单、右键菜单补全）
├── menus.module.css            菜单条目样式（文字 + 行尾箭头）
├── css-modules.d.ts            `.module.css` 的类名声明（由 scripts/gen-css-types.mjs 生成）
├── data/                       无 React 依赖的纯逻辑
│   ├── types.ts                SessionRow / GroupSection / WorkspaceLayout / RootLayout / 草稿类型
│   ├── layout.ts               分组元数据 → 渲染布局（会话那一层与根节点那一层）
│   ├── nest.ts                 子工作区嵌套推导（路径祖先关系、容器归属、段内森林）
│   ├── status.ts               会话状态位推导（待交互 / 运行 / 完成）
│   ├── search.ts               按标题搜索（查询净化、匹配、排序与截断）
│   ├── picker.ts               下拉菜单的条目与分区（根节点条目、三个分区、聚焦布局、聚焦解析）
│   ├── sessions.ts             会话快照 → 渲染行（含可见性过滤、空白行命名、未分组收集）
│   └── rows.ts                 会话行的显示事实（状态位与相对时间，两者都只依赖快照与文案）
├── utils/                      组件与样式表共用的零散常量
│   ├── collapseMotion.ts       折叠动画节奏常量（只 import React 类型，运行时无依赖）
│   ├── flip.ts                 浮层翻转的几何判定与标记名（纯函数，无 React 依赖）
│   └── pathUtils.ts             目录路径的 `~` 缩写（与官方同规则）
├── store/                      浏览器内持久化状态
│   └── viewMode.ts             展示方式的存储（官方 defineStore + localStorage，插槽 store 座位的句柄）
└── views/                      渲染层：区域容器、三块渲染区与行组件
    ├── WorkspaceGroupsRegion.tsx   区域容器：数据源、派生布局、交互状态与命令八个 hook，按区域分派渲染
    ├── RegionHeaderArea.tsx        区域顶部（宽栏两行标题 + 入口组 + 两张浮层面板，窄栏入口）
    ├── RegionListArea.tsx          列表区三条分支，含 WorkspaceNode 递归与会话行元素构造
    ├── RegionDialogs.tsx           全部对话框（RegionOverlay 可辨识联合，任意时刻至多开一个）
    ├── WorkspacePickerMenu.tsx     工作区下拉菜单（自绘面板：三个分区、与工作区行同形的条目行、键盘导航）
    ├── ViewOptionsMenu.tsx         视图选项面板（展示方式两条可选行 + 子工作区嵌套开关）
    ├── VirtualWorkspaceCreateControl.tsx  header 的「新建工作区分组」入口
    ├── SearchControl.tsx           搜索状态、入口、输入框与结果列表
    ├── AddWorkspaceControl.tsx     「添加工作区」入口与 picking 流程
    ├── WorkspaceSection.tsx        一个工作区区块（标题 + 折叠体 + 空态）
    ├── WorkspaceRow.tsx            工作区标题行（文件夹/箭头、`...`、`+`、悬停卡片）
    ├── VirtualWorkspaceSection.tsx   一个工作区分组（根节点分组头 + 组内工作区）
    ├── GroupSection.tsx            一个会话分组（分组头 + 组内会话）
    ├── RowActions.tsx              容器行行尾操作位（`...` 菜单 + 可选 `+`），三类行共用
    ├── SessionRowView.tsx          会话行外壳（状态位列、标题、时间、操作位、悬停卡片）
    ├── SessionRowMenu.tsx          带会话操作菜单的会话行
    ├── WorkspaceRail.tsx           窄栏展开入口
    ├── header.module.css           区域头部样式（宽栏两行标题 / 入口组 / 窄栏）
    ├── SearchControl.module.css    搜索入口、输入框与结果列表样式
    ├── WorkspacePickerMenu.module.css  工作区下拉面板样式
    ├── ViewOptionsMenu.module.css  视图选项面板样式
    ├── WorkspaceGroupsRegion.module.css  区域根、列表与 tab 外壳样式
    ├── WorkspaceRail.module.css    窄栏入口样式
    └── components/                 无状态、无特定业务状态的 tsx
        ├── CollapsibleBody.tsx     折叠体（撑开/收回/行逐个淡入）
        ├── HoverCards.tsx          悬停卡片的正文（工作区那张与会话那张）
        ├── HoverCards.module.css   悬停卡片正文样式
        ├── rows.module.css         行结构共享样式（工作区/分组/会话/菜单条目行共用的一套）
        ├── RowContextMenu.tsx      行右键菜单（指针定位、与 `...` 菜单共用条目与分派）
        ├── IconButton.tsx          16px 行内图标按钮
        ├── rowKeyboard.ts          Enter/Space 行激活（忽略行内按钮冒泡）
        └── dialogs/
            ├── NameDialog.tsx      建组 / 改名 / 重命名工作区共用的单行输入框
            ├── DeleteDialog.tsx    破坏性操作确认框
            ├── ListDialog.tsx      带名单的确认框（关闭嵌套、放进父分组）
            └── dialogs.module.css  三个对话框共用的样式
```

状态的归属只有一处：折叠态（工作区 / 会话分组 / 工作区分组三份）、搜索状态（查询 / 展开 / 聚焦时机 / 揭示标记）、两张面板的开合都收在同文件内的 `useRegionUiState`，由主组件持有并把状态与读写入口向下传。八个互斥浮层（四个草稿框、四个确认框）收在一个 `RegionOverlay` 可辨识联合里，因此「任意时刻至多开一个」由类型保证，而不是靠 `Modal` 挡住第二个入口。菜单开合留在持有行组件内（行内 `...` 菜单与右键菜单各一份，都由 `useRowContextMenu` 与行自己的 `useState` 持有），行的外观组件保持无状态。搜索状态之所以不留在 header 内部：窄栏入口要触发宽栏输入框的聚焦，这一跨形态的联动需要一个共同宿主；选择器的开合同理——面板要读菜单的三个分区，而那些分区由区域组件从快照算出来。

文案不下传：容器把本包翻译函数与投影后的文案表合成一个 `RegionLocale` 交给 `useLocale.ts` 的 `RegionLocaleProvider`，需要文案的组件用 `useLocale()` 自取，因此组件接口里没有 `t` / `labels` 这两格。浏览器内持久化状态收在 `store/`——插槽的 `store` 座位只接受一个 `StoreDecl`，而 `persist` 整份序列化状态，后续新增的本地状态要并进同一个状态对象。

`WorkspaceGroupsRegion.tsx` 按「数据源 / 快照 / 派生布局 / 交互状态 / 命令 / 容器」分段，段间有 `// ── … ──` 分节标记。八个 hook 与容器同处一个文件，因为它们的消费方只有容器一处：`useRegionSources` 读全局数据源，`useSnapshotFeed` 管快照的加载与改动，`useRegionLayout` 把快照切成渲染布局，`useRegionUiState` 持有全部交互状态，命令再按对象分成 `useRegionSearch`、`useRegionGroupActions`、`useRegionNestActions`、`useRegionPickerActions` 四个。渲染按区域拆成 `RegionHeaderArea` / `RegionListArea` / `RegionDialogs` 三个模块，主组件只做装配与宽窄形态分派。Provider 的 value 由容器 `useMemo` 合成一次、宽窄两个渲染分支共用：这个身份不稳定会让行级缓存全部落空（见 [渲染性能与行级缓存](docs/render-performance.md)）。

每个渲染区只声明自己真正消费的那几格形状，而不是逐字段转发：`RegionListArea` 收 `RegionListLayout` / `RegionListUiState` / `RegionListEdits` / `RegionListCommands` 合成的 `WorkspaceNodeScope`，`RegionHeaderArea` 收布局、浮层与命令三格，`RegionDialogs` 收当前那个 `RegionOverlay`、对话框布局、工作区视图与提交入口。列表侧因此不接触任何状态 setter，浮层形状不出容器那一层。只有确实被多个调用点复用的纯逻辑才外提到 `data/` 与 `utils/`，其余留在原地，避免为了「能抽」而抽出一堆只有一个调用点的间接层。

聚焦 / 最近使用 / 置顶三份记录**只有一处变换逻辑**（`pickerState.ts`），宿主半边在变更时用它修剪、浏览器半边在渲染菜单时用它排序，两边因此不可能各写一份「最近使用怎么排」的判断。

数据存储（`$DSH_HOME/storages/workspace_groups.json` 的位置、按 workspaceId 分表的结构、工作区分组的 global 槽位、为什么不升版本号、变更方法为什么统一回整份快照）见 [数据存储](docs/data-storage.md)。

折叠体为什么必须 fail-open、行级 memo 要怎样才能命中（含实测数据），以及「推导放在哪一层」的取舍记在 [折叠动效](docs/collapse-motion.md) 与 [渲染性能与行级缓存](docs/render-performance.md)；层级缩进的每条选择器都真的命中渲染出的 DOM，由 `test/virtualWorkspaceDom.test.tsx` 渲染真实 `react-dom` 后逐条 `querySelectorAll` 守住。

## 构建产物

| 产物 | 内容 |
| --- | --- |
| `lib/index.js` | 宿主半边：存储、服务、typert 绑定 |
| `lib/typert.js` | Host 面 Typert 清单，被 `typert-loader` 自动发现 |
| `lib/client.js` | 浏览器半边，包成 `window.__ModuleLoader__.load({ id, factory })` |

客户端 bundle 由 `scripts/build-client.mjs` 用 esbuild 打出，React 等基线模块从工厂的 `require` 解析而不打进产物。`lib/client.js` 必须存在，否则 Web 客户端启动时会直接报缺产物。

## 组件样式

样式按官方 [Web 样式参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md) 的规定走 CSS Modules：每张 `.module.css` 与它的组件放在一起，构建期编译成「类名映射 + 注入 `<style data-plugin-css=…>`」，样式随组件 import 一起生效，卸载时由客户端模块系统按 `data-plugin` 记账移除。

```tsx
import styles from './components/rows.module.css'

<div className={clsx(styles.row, selected && styles.rowSelected)} />
```

命名：文件只 import 一个样式表时叫 `styles`，import 多个时各按来源加 `Styles` 后缀。类名与官方一致用 camelCase 且不带包前缀（`.rowSelected`）；`--wg-*` 自定义属性与 `data-wg-*` 标记保留前缀，因为它们不受 CSS Modules 哈希保护。**行结构共享样式在 `views/components/rows.module.css`**：工作区行、会话分组行、工作区分组行与菜单条目行共用同一套行语义，因此由那 13 个组件共同 import 同一个 module。

`src/client/css-modules.d.ts`（由 `scripts/gen-css-types.mjs` 生成）逐条列出类名，类名写错会在编译期报出来。

模块划分的依据、哈希带来的硬约束，以及构建与测试的接法见 [组件样式的模块划分](docs/component-styles.md)。

## 开发

```bash
pnpm run typecheck   # src 与 test 两个工程
pnpm run test        # 分组切分逻辑 + 宿主服务 + 搜索 + 工作区分组（含真实 DOM 冒烟）
pnpm run build
```

`pnpm run verify:mount`（仓库根）会用真实 `dsh` 启动器验证本包能被加载。
