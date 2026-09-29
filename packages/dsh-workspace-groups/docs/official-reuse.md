# 与官方实现的复用关系

`dsh-workspace-groups` 接替并复用官方侧边栏：插槽接替的规则、官方已有的洞 / 原语 / 语言包怎么借用，以及为什么不能只做增量扩展。README 只讲插件是什么、怎么用，设计论证与对齐依据在这里。

## 它替换了什么

侧边栏 shell（`dsh-client-ui-sidebar`）把工作区浏览区域声明为插槽 `sidebar.workspaces`，官方由 `dsh-client-ui-workspace` 填充。本包接替这个区域。

`sidebar.workspaces` 是 **single** 类型的插槽，规则是：

- 同一优先级重复注册会抛错；
- **优先级数值更低者渲染**。

官方用默认优先级 `0`，因此本包以 **`priority: -1`** 注册成为渲染者，无需禁用官方那一行。官方组件仍留在注册表中，只是不再渲染。

这条「官方注册仍在」不是无关紧要的实现细节，而是**添加工作区能复用它目录选择交互的原因**：官方那条注册声明了子插槽 `sidebar.workspaces.directoryFlow`，注册既然还在，洞的声明与注册进洞的占用者就都还在（见本文「目录选择器」一节）。

**只影响这一个区域。** logo（`sidebar.brand.*`）、面板列表（`sidebar.panellist`）、设置与底部操作（`sidebar.settings` / `sidebar.footer.action`）都是并列的兄弟插槽，不受影响。`conversation.hero.workspace`（新会话页的工作区选择器）也仍由官方组件负责。

## 为什么不能只做增量扩展

官方组件**没有**暴露会话行级别的插槽，因此无法在它内部追加分组。唯一的做法是接替整个区域。

## 目录选择器：复用官方的洞，而不是重开一个

`ui-workspace` 声明了子插槽 `sidebar.workspaces.directoryFlow`，目录选择器插件（`directory-picker-browse` / `-native`）注册到那里。**一个插槽只能有一个声明者**：本包再声明同名子插槽会直接抛错（已实测验证）。

但「不能重复声明」不等于「用不了」。**本包接替父插槽并不会清掉官方那条注册**：官方组件仍留在 ledger 里，它声明子插槽的那条 `children` 表因此仍然有效，洞的声明、以及注册进洞的目录选择器占用者，都原样还在（已用真实 `SlotCore` 实测：`spec()` 仍为已声明、`entriesOfSlot()` 仍返回占用者）。

于是新增工作区走**借用**而非重建：

| 环节 | 来源 |
| --- | --- |
| 入口按钮 | 本包自绘，几何与图标对齐官方 header（`IconProjectAddOutlineRegular`） |
| picking 交互 | 官方洞的占用者整段渲染（native 的 OS 选择器 / browse 的应用内对话框） |
| 采纳 | 官方工作区控制器 `ctx.workspaces.create({ path })` |
| 采纳成功后 | 官方 `ctx.uiWorkspace.startSession(workspaceId)`，与官方 `onPick` 一致 |

占用者的 inject 面（native 的 `pick`、browse 的 `listDirectory` / `createDirectory` / `t`）由本包按渲染器传播插槽 inject 的同一套做法，随 props 交给它，并按占用者注册项身份缓存——占用者因此不需要知道自己被谁渲染。

**入口只在洞被占用时渲染**：宿主没装目录选择器插件时洞是空的，按钮随之消失，不留点不动的死按钮（与官方 `directoryFlowAvailable` 的守卫同一语义）。这条占用事实是可订阅的（`hooks.directoryFlow` → `useDirectoryFlow`），因此目录选择器插件晚于本包加载时按钮照样会出现。

## 复用官方原子组件

按官方 [Web UI 样式参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md) 「重新设计控件样式之前先复用控件」的要求，本包不再自绘这些控件：

| 位置 | 用的官方原语 |
| --- | --- |
| 建组 / 改名 / 工作区重命名 / 会话重命名 | `Modal` + `Input` + `Button`（`outline` / `primary`） |
| 删除分组 / 删除工作区 | `Modal` + `Button`（`outline`，确认按钮着错误色） |
| 添加工作区失败 | `Modal` + `Button`（同上，文案取官方 `folderError.*`） |
| 文件夹、三角、省略号 | `IconFolderCloseRegular` / `IconFolderOpenRegular` / `IconTriangleRightFillRegular` / `IconEllipsisOutlineRegular` |
| 行内新建会话、新建分组、改名、删除 | `IconNewChatOutlineRegular` / `IconPlusOutlineRegular` / `IconEditOutlineRegular` / `IconTrashOutlineRegular` |
| 会话菜单与行右键菜单的「新建会话」项 | `IconNewChatOutlineRegular`（与行内那枚按钮同字形） |
| 置顶按钮两态 | `IconPinOutlineRegular` / `IconPinFillRegular`（原语在这一版新增了图钉，本包不再自绘） |
| header 的添加工作区 / 搜索 / 视图选项 | `IconProjectAddOutlineRegular` / `IconSearchOutlineRegular` / `IconSlidersTwoOutlineRegular`（与官方 header 同字形）；搜索框的清除按钮用 `IconCloseFillRegular` |
| header 的新建工作区分组、菜单里的工作区分组项 | **本包自绘** `IconVirtualWorkspace16`（见 [自绘图标](custom-icons.md)） |
| 会话菜单的分叉 / 归档项 | `IconBranchOutlineRegular` / `IconArchiveOutlineRegular`（与官方会话菜单同字形） |
| 子菜单父项的行尾箭头 | `IconChevronRightOutlineRegular`（与 composer slash 菜单给「可进入目录」候选画的箭头同字形） |
| 窄栏展开入口 | `IconPanelLeftOutlineRegular`（与官方侧栏折叠按钮同一字形） |
| 会话状态点 | `StateDot`（运行态画追光方阵，其余画圆点；颜色由原语的主题规则给出） |
| 视图选项面板里的嵌套开关 | `IconWorkspaceTreeOutlineRegular`（官方「按工作区树分组」那一项的字形） |
| 视图选项面板里的两条展示方式 | `IconFolderCloseRegular` / `IconFlatListOutlineRegular`（官方「按工作区」与「单列表」同字形）；选中标记用 `IconCheckOutlineRegular` |
| 展示方式 / 指示器 / 三层折叠态的状态与持久化 | `defineStore`（`@deepseek-ai/dsh-client-store`，与官方 `groupBy` 同一引擎；组件读 `useStore`、写 `actions`） |
| 行尾相对时间 | `relativeTime`（官方 `timeLabel` 用的同一个分桶函数，文案走官方语言包） |
| 「添加工作区」入口提示 | `Tooltip`（与官方 header 同一 `delayMs` 与展开方向） |
| 行内 `...` 菜单与行右键菜单 | `Menu`（右键那份走它的 `getAnchorRect`，官方 `WorkspacePickFlow` 用的同一入口） |
| 工作区行与会话行的悬停详情 | `HoverCard`（外框、浮出时机与复制反馈都由原语拥有，本包只组装正文） |

原语的样式属于 ui-theme / ui-primitives：本包不为它们写颜色、阈值或高亮，只在各组件的 `.module.css` 里保留自己的布局约定。唯一的例外是悬停卡片正文那三档文字色（`.hover*`）：卡片底色由原语写死为深色，随主题翻转的色阶在上面读不出来，只能照官方 `ui-workspace` 的取值为卡片单独定色。

一处官方原语的缺陷需要本包兜住：

- **官方 `Menu` 的二级面板会透出后面的内容。** `.submenu` 与一级面板 `.list` 共用一条规则，底色是带 alpha 的 `--dsw-specific-menu`，靠自身的 `backdrop-filter` 把内容糊开。但它在 DOM 上是 `.list` 的后代，而 `.list` 自己也有 `backdrop-filter`——按规范那会形成一个 backdrop root，后代只能采样这个 root 内部的内容；二级面板被放在父层盒子之外（`left: calc(100% + 9px)`），那片区域在 root 里是空的，模糊因此退化成无操作，只剩半透明底色。官方没有任何插件用过 `submenu`（只有 primitives 自己定义），所以这条路径从未被验证过。本包是唯一使用者，于是由本包兜住：给二级面板换不透明底色并撤掉那条失效的模糊，作用域挂 `listClassName` 传进来的 `.menuList`，不碰官方与其他插件的菜单（见 [布局与样式对齐](layout-and-styling.md)）。

三处刻意的取舍：

- **工作区分组的图标是自绘的。**「优先复用官方原语」指的是优先复用**接口与控件**，不是说字形只能用现成的那几个。0.1.7-rc.1 的 primitives 导出表里没有任何「分组 / 容器 / 堆叠」类字形，也没有虚线的文件夹，而工作区分组既需要一个「新建」入口、又需要与旁边的实线文件夹（它代表**工作区本身**）区分开。因此按官方规范自绘一个，视觉上与它们同族（见 [自绘图标](custom-icons.md)）。同一版新增了图钉，置顶按钮因此从自绘换成官方字形。
- **删除分组用普通 `Modal`，不用 `RiskConfirmation`。** 后者自带警告图标与「须勾选确认」的复选框，而删除分组只解散分组、不动会话本身，达不到那个破坏级别。危险语义改由确认按钮的错误色承载（`.dangerAction` 设 `--dsw-alias-state-error-primary`）——这与官方 `ui-workspace` 的删除按钮是同一做法：`Button` 没有 `danger` variant，改色就靠传 `className`。
- **行内 16px 图标按钮保留自绘。** 官方 `ui-workspace` 的行内按钮也是它自己的 CSS Module（16px 命中区、4px 圆角、悬停提亮文字色），primitives 没有等价的 16px 行内按钮；换成 primitives 的 `Button`（28px 高、带悬停底色）会让行外观明显偏离官方。因此几何保留同一份 16px 约定，图标取原语。
- **展示方式的三个取值用本包自有文案。** 官方那组是「分组方式 / 按工作区 / 单列表」，语义是官方自己那三种排布；本包只有两种，取值也不同（`workspace` / `flat`），照抄官方键名会让两边对不上号。因此另起 `viewMode.label` / `viewMode.workspace` / `viewMode.flat`，中文取「展示方式 / 按工作区 / 平铺」。字形仍取官方同款（`IconFolderCloseRegular` / `IconFlatListOutlineRegular`），外观上读得出与官方那组是同一族。

primitives 的值导入集中在 `src/client/runtime.ts`，打包脚本把它标成 external 由宿主从基线模块表解析；它是 shell 静态模块表的成员，不会多出第二份实例。

## 浏览器本地状态：复用官方 store 引擎与座位

**展示方式（按工作区 / 平铺）、指示器样式与三层折叠态都是浏览器本地偏好**，不是分组元数据：它们不进宿主的存储域，也不随快照往返。这一层整段照官方 `ui-workspace` 管 `groupBy` 的做法：

| 环节 | 用的东西 |
| --- | --- |
| 状态与持久化 | `@deepseek-ai/dsh-client-store` 的 `defineStore`（`persist` 写 localStorage） |
| 交给组件 | 插槽注册项的 `store` 座位——渲染器绑出 `useStore` 选择器与已绑定的 `actions` |
| 注册 | 生产形态挂在 `sidebar.workspaces`（root 作用域），对照 tab 挂在 `sidebar.right.pane.tab`（session 作用域） |

**这两个座位的定义都写在源码树里**（`src/client/store/viewMode.ts` 的 `createViewModeStore`），但 `defineStore` 是值导入，因此打包脚本必须把 `@deepseek-ai/dsh-client-store` 标成 external 由宿主从基线模块表解析。漏标会让产物打进第二份引擎、出现第二个 store 实例。

**对照模式下必须共享同一个实例。** `sidebar.right.pane.tab` 是 session 作用域的座位，渲染器会按会话各调一次 `create`；直接用原句柄会让展示方式变成「每个会话各存一份」，切会话就变回「按工作区」。因此 `apply` 里建一次实例，用 `sharedViewModeStore` 把 `create` 收成恒返回它，两条注册路径读到的才是同一份设置、同一个持久化键。官方的视图状态存储也是这么做的（`{ ...viewHandle, create: () => viewInstance }`）。

存储键取 `dsh.workspace-groups.view.v1`，与官方 `dsh.workspace.view.*` 不共用：两者是两套独立的界面状态，共用键会让两边互相覆盖。也**不跟着官方升版本号**：官方升到 `.v5` 是它自己排布演进的事，本包这一份靠归一化兜缺省，升版本只会顺手丢掉用户已选的偏好。

**这份 store 里的东西一律不逐层传 props，统一经 provider + 具名 hook 取。** 两个 hook 按「装什么」分工，各自带一个 provider：

| hook | 装什么 | 消费方 |
| --- | --- | --- |
| `useLocalViewOptions.ts` | 展示方式、指示器样式 | `ViewOptionsMenu`（两项设置在面板里）、`SessionRowView`（指示器样式影响每行的字形）、`RegionListArea`（展示方式决定三条分支） |
| `useExpansion.ts` | 三层折叠态的读与取反 | `RegionListArea`（虚拟分组段、未分组桶、工作区行）、`WorkspaceSection`（组内会话分组） |

驱动这条规则的是**消费方散布**，不是「store 的东西特殊」：这两类值的消费点都穿过整棵渲染树，逐层传会让每一层都被迫声明一圈与自己无关的签名，而中间层（例如 `WorkspaceSection`）还得为此多收一个它不用的 `workspaceId`（现在它确实要拿这个 id 才能定位组内分组，但那本来就是它作为「一个工作区区块」应有的身份）。

**另一条边界要一并记清**：走 hook 的只有**浏览器本地 store**里的值。其余状态仍按各渲染区实际消费的形状下发：

| 状态 | 存放 | 怎么到达消费方 |
| --- | --- | --- |
| 展示方式、指示器样式 | 浏览器 store | `useLocalViewOptions()` |
| 三层折叠态 | 浏览器 store | `useExpansion()` |
| 子工作区嵌套开关（`nested`） | 宿主存储域（随快照往返） | 区域容器当 props 下发 |
| 搜索状态、浮层开合、揭示标记 | 组件内 `useState` | 区域容器合成 `RegionUiState` / `RegionOverlay` 后下发 |
| 分组快照与派生布局 | 组件内 state + 纯派生 | 各渲染区按 shape 收窄（`WorkspaceNodeScope` 等） |

「写到展开」那三个入口（`expandWorkspace` / `expandVirtualWorkspace` / `expandGroup`）**不进 hook**：它们只在揭示搜索结果与新建会话前由容器调用，是编排而不是共享读数，因此留在容器内部。

## 折叠态的展开规则

官方把工作区层的展开记录也存进同一份 store（`groupExpansion`），并用 **`boolean | undefined` 三态**把「用户没碰过」与「用户显式选过」分流。本包复用这套三态机制（记录形状与分层见[数据存储](data-storage.md)），展开规则如下：

| 情形 | 展开态 |
| --- | --- |
| 键缺席、工作区无父（顶层 / 一级目录） | 展开 |
| 键缺席、工作区有父（子工作区） | 折叠 |
| 键缺席、工作区分组 | 展开 |
| 键缺席、会话分组 | 折叠 |
| 键已存在 | 按记录，覆盖上面的默认 |
| 新建工作区（真的落在某个父下面时） | 写展开，连同它的父链 |
| 揭示搜索结果 | 写展开，除非该层已显式展开 |

前两行与官方**不同**：官方是「有孩子就展开、叶子折叠」。反例是 `repo/src`——有父、自己还有子节点，官方展开而本包折叠。

「写展开」的判据与官方那条 effect 也不同：官方是「只在显式为 `false` 时才写 `true`」，本包是「除非显式为 `true`，否则写展开」。这不是独立的一条设计，而是上面默认值的直接结果——本包对子工作区与会话分组默认折叠，只补显式 `false` 的键会漏掉绝大多数需要展开的情形。

**没有移植**官方那条「当前会话所在工作区若缺席就补 `true`」的自动展开 effect，也没有它那套「折叠时每工作区只渲染 5 条会话」的上限（后者在官方是组件内 state，本包根本没有对应功能）。

记录分三层存（`expansion.workspace` / `.virtualWorkspace` / `.group`），而不是官方那一张 `groupExpansion`：三层的键形态本就不同（会话分组是 `workspaceId:groupId` 的二元组），分开存省掉自造前缀，也因为三层的清理策略不同（见[数据存储](data-storage.md)）。动作命名刻意避开 `groupExpansion`——官方那个名字在官方语境里指**工作区**，而本包的 `group` 专指会话分组，照抄会把读者引向错误的一层。

## 语言包

文案分两层，都是官方包的结构：

| 模块 | 内容 |
| --- | --- |
| `locales.ts` | 命名空间名 `NS`、`zh` / `en` 字典、键域类型，以及 `LocaleNamespaceMap` 声明 |
| `labels.ts` | 只有投影：`regionLabels(t, tWorkspace, tSidebar)` 把翻译函数绑成 `RegionLabels` 契约 |

命名空间取短名 `workspaceGroups`（官方插件的命名空间都是短名：`workspace` / `sidebar` / `goal` / `reference` …），不是包名。

**官方已有的文案不复制，直接读官方命名空间**：区域标题、工作区改名/删除、会话行标签、状态点、空态这些 `workspace` 命名空间已有的词，`regionLabels` 逐键取官方（`section.workspaces` / `actions.workspace.aria` / `actions.session.aria` / `rename.workspace.title` / `delete.desc` / `status.*` 等），本包字典里不存副本。这样官方改措辞时本包自动跟随，两处同屏也不会出现两套说法。这也是官方的既有做法：`ui-attachment` 就注册自己的命名空间，却用 `locale: "conversation"` 读 `ui-conversation` 的文案。

悬停卡片的文案同样一个键都不用加：创建时刻取官方 `hover.created` + `date.ymd`，复制提示取 `common` 的通用词 `copy`、成功反馈取 `hover.copied`，卡片那份相对时间取 `time.ago`；会话卡片里「空闲」那一条取官方的 `status.idle`——行首不画点但卡片要把它列出来，那个词官方本来就有，不另造。

本包字典只剩官方没有对应词的键：会话分组那一套（`actions.group.aria` / `newGroup` / `renameGroup` / `deleteGroup` / `groupNamePrompt` / `delete.desc.group` / `moveToGroup` / `ungroup`）、工作区分组那一套（`actions.virtualWorkspace.aria` / `newVirtualWorkspace` / `menu.newVirtualWorkspace` / `renameVirtualWorkspace` / `deleteVirtualWorkspace` / `virtualWorkspaceNamePrompt` / `delete.desc.virtualWorkspace` / `moveToVirtualWorkspace` / `ungroupWorkspace` / `virtualWorkspaceEmpty`）、展示方式那一套（`viewMode.label` / `viewMode.workspace` / `viewMode.flat`），加 `compareTabDescription` 与 `unimplemented`。「添加工作区」与「搜索」的文案因此一个键都不用加：添加入口取官方 `workspace.add`、错误框取 `folderError.title` 与 `folderError.retry`；搜索的入口 tooltip、输入框与结果区取官方 `search` / `search.sessions.aria` / `search.placeholder` / `search.clear` / `search.results.aria` / `search.noMatches` / `search.hasMore`。注意添加入口是 `workspace.add`（「添加工作区」），不是 `menu.addWorkspace`（「添加工作区…」）——后者是工作区列表菜单里那一项，带省略号表示还要再选一次。`actions.group.aria` 是分组自己的无障碍标签（官方只有工作区与会话两个），分组 `+` 的标签则直接复用官方的 `actions.newSession.aria`——语义完全相同，不另造一个同义键。`labels.test.ts` 会断言字典里没有任何与官方重合的键，避免以后又抄回来。

**「重命名」这个动作有两个键，不是同一个文案。** 菜单项用官方的通用动词 `rename`（`重命名` / `Rename`），对话框标题才用点明对象的键。这不是本包的取舍，而是照官方 `ui-workspace` 抄的：

| 位置 | 官方用的键 | 中文 |
| --- | --- | --- |
| 工作区行菜单项 | `rename` | 重命名 |
| 会话行菜单项 | `rename` | 重命名 |
| 重命名工作区对话框标题 | `rename.workspace.title` | 重命名工作区 |
| 重命名会话对话框标题 | `rename.session.title` | 重命名会话 |

两个菜单项都用通用动词，只有对话框标题点明对象。本包照此分工，三个容器行都归入同一条规则：

| 位置 | 本包用的键 | 来源 | 中文 |
| --- | --- | --- | --- |
| 工作区 / 会话分组行 / 工作区分组行菜单项 | `rename` | 官方 `workspace` | 重命名 |
| 重命名工作区对话框标题 | `rename.workspace.title` | 官方 `workspace` | 重命名工作区 |
| 重命名分组对话框标题 | `renameGroup` | 本包自有 | 重命名分组 |
| 重命名工作区分组对话框标题 | `renameVirtualWorkspace` | 本包自有 | 重命名工作区分组 |

`RegionLabels` 因此暴露 `rename`（菜单项，三个容器行共用）、`renameWorkspace`、`renameGroup` 与 `renameVirtualWorkspace`（各自的对话框标题）四个字段。三类容器行都取 `labels.rename`——它们各自用 `useLocale()` 取，不再经由派生的文案包；三处 `NameDialog` 的 `title` 取各自那个。

顺带一个容易走错的点：`rename` 只在官方 `workspace` 命名空间里，**不在** `common` 里——`common` 收的是「确定 / 取消 / 复制 / 删除 / 编辑」这类跨功能标准词，其中并没有 `rename`。所以这一项必须走 `tw('rename')`；写成 `t('rename')` 会被 tsc 直接拒绝（本包自己的键域里没有它，`common` 也没兜住）。

三个命名空间的取用方式：

- 本包自己的 `workspaceGroups` 由插件入口 `ctx.locale.register(NS, { zh, en })` 注册，字典键域由 `LocaleNamespaceMap` 声明，因此 tsc 会拒绝漏键或错键；组件侧走插槽的 `locale: NS` 座位。
- 官方 `workspace` 由官方包自己注册，本包只**读**：`locale.bind('workspace')` 取翻译函数后随 inject 结果传下去。`bind` 返回稳定引用且**调用时才读当前语言**，因此既不必占用插槽座位，也不会冻结在注册那一刻。
- 官方 `sidebar` 同样只读：行右键菜单的「新建会话」项取它新建按钮的动词短语 `session.new.label`（见 [交互细节与官方对齐依据](ui-details.md) 的「行右键菜单」）。这个键在 `sidebar` 而不在 `workspace` 里——后者只有名词形态的 `session.new`（「新会话」）。

通用词（`ok` / `cancel` / `close`）不在本包字典里：它们走官方 `common` 命名空间，由拿到 `t` 座位的对话框组件直接解析，查找链在命名空间未命中后回退到 `common`。

