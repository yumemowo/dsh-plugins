# 客户端代码结构

本文件收客户端半边的目录划分与状态归属，属于维护者视角的内容；产品介绍见 [README](../README.md)。

## 分层

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
├── compare.tsx                 对照模式：挂进原生右侧栏 tab
├── remote.ts                   Remote 贡献声明与调用封装
├── runtime.ts                  primitives 值导入的唯一出口（external）
├── icons.tsx                   自绘图标（官方没有的字形；规范见 [自绘图标](custom-icons.md)）
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
│   ├── expandMotion.ts         撑开动画节奏常量（只 import React 类型，运行时无依赖）
│   ├── flip.ts                 浮层翻转的几何判定与标记名（纯函数，无 React 依赖）
│   └── pathUtils.ts            目录路径的 `~` 缩写（与官方同规则）
├── store/                      浏览器内持久化状态
│   └── viewMode.ts             展示方式 / 指示器 / 三层折叠态的存储（官方 defineStore + localStorage，插槽 store 座位的句柄）
├── hooks/                      与具体业务无关的通用 hook
│   ├── useHoverCapable.ts      设备是否具备悬停能力（环境读数，置顶区 expand 档的可用前提）
│   ├── useLocale.ts            区域文案的唯一读取入口（RegionLocaleProvider + useLocale）
│   ├── useLocalViewOptions.ts  浏览器 store 里展示方式 / 指示器样式的读取入口（同上）
│   └── useExpansion.ts         浏览器 store 里三层折叠态的读取入口（同上）
└── views/                      渲染层：区域容器、三块渲染区与行组件
    ├── WorkspaceGroupsRegion.tsx   区域容器：数据源、派生布局、交互状态与命令各一 hook，按区域分派渲染
    ├── RegionHeaderArea.tsx        区域顶部（宽栏两行标题 + 入口组 + 两张浮层面板，窄栏入口）
    ├── RegionListArea.tsx          列表区三条分支，含 WorkspaceNode 递归与会话行元素构造
    ├── RegionDialogs.tsx           全部对话框（RegionOverlay 可辨识联合，任意时刻至多开一个）
    ├── WorkspacePickerMenu.tsx     工作区下拉菜单（自绘面板：三个分区、与工作区行同形的条目行、键盘导航）
    ├── ViewOptionsMenu.tsx         视图选项面板（四组「标题 + 两条可选行」+ 子工作区嵌套开关）
    ├── VirtualWorkspaceCreateControl.tsx  header 的「新建工作区分组」入口
    ├── SearchControl.tsx           搜索状态、入口、输入框与结果列表
    ├── AddWorkspaceControl.tsx     「添加工作区」入口与 picking 流程
    ├── WorkspaceSection.tsx        一个工作区区块（标题 + 撑开体 + 空态）
    ├── WorkspaceRow.tsx            工作区标题行（文件夹/箭头、`...`、`+`、悬停卡片）
    ├── VirtualWorkspaceSection.tsx   一个工作区分组（根节点分组头 + 组内工作区）
    ├── GroupSection.tsx            一个会话分组（分组头 + 组内会话）
    ├── RowActions.tsx              容器行行尾操作位（`...` 菜单 + 可选 `+`），三类行共用
    ├── SessionRowView.tsx          会话行外壳（状态位列、标题、时间、操作位）
    ├── SessionRowItem.tsx          会话行条目（行 + 两个菜单 + 悬停卡片）
    ├── PinnedSection.tsx           区域顶部的置顶区（段头 + 置顶会话行，两种溢出给法共用一个控件）
    ├── WorkspaceRail.tsx           窄栏展开入口
    ├── header.module.css           区域头部样式（宽栏两行标题 / 入口组 / 窄栏）
    ├── SearchControl.module.css    搜索入口、输入框与结果列表样式
    ├── WorkspacePickerMenu.module.css  工作区下拉面板样式
    ├── ViewOptionsMenu.module.css  视图选项面板样式
    ├── PinnedSection.module.css    置顶区样式（段头几何、分隔、预览区与浮出）
    ├── WorkspaceGroupsRegion.module.css  区域根、列表与 tab 外壳样式
    ├── WorkspaceRail.module.css    窄栏入口样式
    └── components/                 无状态、无特定业务状态的 tsx
        ├── ExpandableBody.tsx     撑开体（撑开/收回/行逐个淡入）
        ├── HoverCards.tsx          悬停卡片的正文（工作区那张与会话那张）
        ├── HoverCards.module.css   悬停卡片正文样式
        ├── rows.module.css         行结构共享样式（工作区/分组/会话/菜单条目行共用的一套）
        ├── RowContextMenu.tsx      行右键菜单（指针定位、与 `...` 菜单共用条目与分派）
        ├── useFloatingPanel.ts    两张自绘面板共用的定位与开合（夹进窗口、延迟关闭、键盘导航）
        ├── IconButton.tsx          16px 行内图标按钮
        ├── rowKeyboard.ts          Enter/Space 行激活（忽略行内按钮冒泡）
        └── dialogs/
            ├── NameDialog.tsx      建组 / 改名 / 重命名工作区共用的单行输入框
            ├── ConfirmDialog.tsx   确认框（删除、关闭嵌套、聚焦到新工作区），可带一份名单
            └── dialogs.module.css  两个对话框共用的样式
```

## 状态归属

状态的归属只有一处：搜索状态（查询 / 展开 / 聚焦时机 / 揭示标记）与两张面板的开合都收在同文件内的 `useRegionUiState`，由主组件持有并把状态与读写入口向下传。折叠态（工作区 / 会话分组 / 工作区分组三份）不逐层传：它是浏览器本地 store 里的值，由容器合成一次后放进 `useExpansion.ts` 的 provider，用到的地方自己 `useExpansion()` 取——与 `useLocalViewOptions.ts` 同一套做法。八个互斥浮层（三个草稿框、五个确认框）收在一个 `RegionOverlay` 可辨识联合里，因此「任意时刻至多开一个」由类型保证，而不是靠 `Modal` 挡住第二个入口。菜单开合留在持有行组件内（行内 `...` 菜单与右键菜单各一份，都由 `useRowContextMenu` 与行自己的 `useState` 持有）：行外壳不认识菜单，菜单展开期间那一档由锚点按钮自己的 `aria-expanded` 驱动样式，不必再往行上挂开合标记。搜索状态之所以不留在 header 内部：窄栏入口要触发宽栏输入框的聚焦，这一跨形态的联动需要一个共同宿主；选择器的开合同理——面板要读菜单的三个分区，而那些分区由区域组件从快照算出来。

文案不下传：容器把本包翻译函数与投影后的文案表合成一个 `RegionLocale` 交给 `useLocale.ts` 的 `RegionLocaleProvider`，需要文案的组件用 `useLocale()` 自取，因此组件接口里没有 `t` / `labels` 这两格。浏览器内持久化状态收在 `store/`——插槽的 `store` 座位只接受一个 `StoreDecl`，而 `persist` 整份序列化状态，后续新增的本地状态要并进同一个状态对象（展示方式、指示器样式与三层折叠态现在共用它）。**这类状态一律不逐层传 props，统一经 provider + 具名 hook 取**：`useLocalViewOptions.ts` 装展示方式与指示器样式，`useExpansion.ts` 装三层折叠态。store 之外的状态仍按各渲染区实际消费的形状下发。

`WorkspaceGroupsRegion.tsx` 按「数据源 / 快照 / 派生布局 / 交互状态 / 命令 / 容器」分段，段间有 `// ── … ──` 分节标记。这些 hook 与容器同处一个文件，因为它们的消费方只有容器一处：`useRegionSources` 读全局数据源，`useSnapshotFeed` 管快照的加载与改动，`useRegionLayout` 把快照切成渲染布局，`useRegionUiState` 持有除折叠态外的全部交互状态，`useExpansionValue` 把 store 座位的三份折叠记录与层级推导演成读 / 取反 / 写入口（并摘掉失效键），与 `useLocalViewOptionsValue` 同构，命令再按对象分成 `useSearchResults`、`useWorkspaceAdoption`、`useRegionGroupActions`、`useRegionNestActions`、`useRegionPickerActions` 五个——搜索结果页与新增工作区的输入几乎不重叠，因此各成一个。渲染按区域拆成 `RegionHeaderArea` / `RegionListArea` / `RegionDialogs` 三个模块，主组件只做装配与宽窄形态分派。Provider 的 value 由容器 `useMemo` 合成一次、宽窄两个渲染分支共用；不过只有真的被 `memo` 行组件消费的那几份才从中获益，哪些承重、哪些只是留余地见 [渲染性能与行级缓存](render-performance.md)。

每个渲染区只声明自己真正消费的那几格形状，而不是逐字段转发：`RegionListArea` 收 `RegionListLayout` / `RegionListEdits` / `RegionListCommands` 合成的 `WorkspaceNodeScope`，`RegionHeaderArea` 收布局、浮层与命令三格，`RegionDialogs` 收当前那个 `RegionOverlay`、对话框布局、工作区视图与提交入口。列表侧因此不接触任何状态 setter，浮层形状不出容器那一层。只有确实被多个调用点复用的纯逻辑才外提到 `data/` 与 `utils/`，其余留在原地，避免为了「能抽」而抽出一堆只有一个调用点的间接层。

聚焦 / 最近使用 / 置顶三份记录**只有一处变换逻辑**（`pickerState.ts`），宿主半边在变更时用它修剪、浏览器半边在渲染菜单时用它排序，两边因此不可能各写一份「最近使用怎么排」的判断。

层级缩进的每条选择器都真的命中渲染出的 DOM，由 `test/virtualWorkspaceDom.test.tsx` 渲染真实 `react-dom` 后逐条 `querySelectorAll` 守住。

## 构建产物

| 产物 | 内容 |
| --- | --- |
| `lib/index.js` | 宿主半边：存储、服务、typert 绑定 |
| `lib/typert.js` | Host 面 Typert 清单，被 `typert-loader` 自动发现 |
| `lib/client.js` | 浏览器半边，包成 `window.__ModuleLoader__.load({ id, factory })` |

客户端 bundle 由 `scripts/build-client.mjs` 用 esbuild 打出，React 等基线模块从工厂的 `require` 解析而不打进产物。`lib/client.js` 必须存在，否则 Web 客户端启动时会直接报缺产物。
