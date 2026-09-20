# 与官方实现的复用关系

本文记录 `dsh-workspace-groups` 如何接替与复用官方侧边栏：插槽接替的规则、官方已有的
洞 / 原语 / 语言包怎么借用，以及「为什么不能只做增量扩展」。README 只讲插件是什么、
怎么用，设计论证与对齐依据留在本文。

## 它替换了什么

侧边栏 shell（`dsh-client-ui-sidebar`）把工作区浏览区域声明为插槽 `sidebar.workspaces`，
官方由 `dsh-client-ui-workspace` 填充。本包接替这个区域。

`sidebar.workspaces` 是 **single** 类型的插槽，规则是：

- 同一优先级重复注册会抛错；
- **优先级数值更低者渲染**。

官方用默认优先级 `0`，因此本包以 **`priority: -1`** 注册成为渲染者，
无需禁用官方那一行。官方组件仍留在注册表中，只是不再渲染。

这条「官方注册仍在」不是无关紧要的实现细节，而是**添加工作区能复用它目录选择
交互的原因**：官方那条注册声明了子插槽 `sidebar.workspaces.directoryFlow`，
注册既然还在，洞的声明与注册进洞的占用者就都还在（见本文「目录选择器」一节）。

**只影响这一个区域。** logo（`sidebar.brand.*`）、面板列表（`sidebar.panellist`）、
设置与底部操作（`sidebar.settings` / `sidebar.footer.action`）都是并列的兄弟插槽，不受影响。
`conversation.hero.workspace`（新会话页的工作区选择器）也仍由官方组件负责。

## 为什么不能只做增量扩展

官方组件**没有**暴露会话行级别的插槽，因此无法在它内部追加分组。
唯一的做法是接替整个区域。

## 目录选择器：复用官方的洞，而不是重开一个

`ui-workspace` 声明了子插槽 `sidebar.workspaces.directoryFlow`，目录选择器插件
（`directory-picker-browse` / `-native`）注册到那里。**一个插槽只能有一个声明者**：
本包再声明同名子插槽会直接抛错（已实测验证）。

但「不能重复声明」不等于「用不了」。**本包接替父插槽并不会清掉官方那条注册**：
官方组件仍留在 ledger 里，它声明子插槽的那条 `children` 表因此仍然有效，洞的
声明、以及注册进洞的目录选择器占用者，都原样还在（已用真实 `SlotCore` 实测：
`spec()` 仍为已声明、`entriesOfSlot()` 仍返回占用者）。

于是新增工作区走**借用**而非重建：

| 环节 | 来源 |
| --- | --- |
| 入口按钮 | 本包自绘，几何与图标对齐官方 header（`IconProjectAddOutline16`） |
| picking 交互 | 官方洞的占用者整段渲染（native 的 OS 选择器 / browse 的应用内对话框） |
| 采纳 | 官方工作区控制器 `ctx.workspaces.create({ path })` |
| 采纳成功后 | 官方 `ctx.uiWorkspace.startSession(workspaceId)`，与官方 `onPick` 一致 |

占用者的 inject 面（native 的 `pick`、browse 的 `listDirectory` /
`createDirectory` / `t`）由本包按渲染器传播插槽 inject 的同一套做法，随 props
交给它，并按占用者注册项身份缓存——占用者因此不需要知道自己被谁渲染。

**入口只在洞被占用时渲染**：宿主没装目录选择器插件时洞是空的，按钮随之消失，
不留点不动的死按钮（与官方 `directoryFlowAvailable` 的守卫同一语义）。这条
占用事实是可订阅的（`hooks.directoryFlow` → `useDirectoryFlow`），因此目录
选择器插件晚于本包加载时按钮照样会出现。

## 复用官方原子组件

按官方 [Web UI 样式参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md)
「重新设计控件样式之前先复用控件」的要求，本包不再自绘这些控件：

| 位置 | 用的官方原语 |
| --- | --- |
| 建组 / 改名 / 工作区重命名 / 会话重命名 | `Modal` + `Input` + `Button`（`outline` / `primary`） |
| 删除分组 / 删除工作区 | `Modal` + `Button`（`outline`，确认按钮着错误色） |
| 添加工作区失败 | `Modal` + `Button`（同上，文案取官方 `folderError.*`） |
| 文件夹、三角、省略号 | `IconFolderClose16` / `IconFolderOpen16` / `IconTriangleRightFill14` / `IconEllipsisOutline16` |
| 新建会话、新建分组、改名、删除 | `IconPlusOutline16` / `IconEditOutline16` / `IconTrashOutline16` |
| 行右键菜单的「新建会话」项 | `IconNewChatOutline16`（与官方 sidebar 新建按钮同字形） |
| header 的添加工作区 / 搜索 / 视图选项 | `IconProjectAddOutline16` / `IconSearchOutline16` / `IconPersonalizationOutline16`（与官方 header 同字形）；搜索框的清除按钮用 `IconCloseFill14` |
| header 的新建工作区分组、菜单里的工作区分组项 | **本包自绘** `IconVirtualWorkspace16`（见 [自绘图标](custom-icons.md)） |
| 会话菜单的分叉 / 归档项 | `IconBranchOutline16` / `IconArchiveOutline20`（与官方会话菜单同字形） |
| 窄栏展开入口 | `IconPanelLeftOutline16`（与官方侧栏折叠按钮同一字形） |
| 会话状态点 | `StateDot`（运行态画追光方阵，其余画圆点；颜色由原语的主题规则给出） |
| 行尾相对时间 | `relativeTime`（官方 `timeLabel` 用的同一个分桶函数，文案走官方语言包） |
| 「添加工作区」入口提示 | `Tooltip`（与官方 header 同一 `delayMs` 与展开方向） |
| 行内 `...` 菜单与行右键菜单 | `Menu`（右键那份走它的 `getAnchorRect`，官方 `WorkspacePickFlow` 用的同一入口） |
| 工作区行与会话行的悬停详情 | `HoverCard`（外框、浮出时机与复制反馈都由原语拥有，本包只组装正文） |

原语的样式属于 ui-theme / ui-primitives：本包不为它们写颜色、阈值或高亮，
只在 `styles.ts` 里保留自己的布局约定。唯一的例外是悬停卡片正文那三档文字色
（`.wg-hover-*`）：卡片底色由原语写死为深色，随主题翻转的色阶在上面读不出来，
只能照官方 `ui-workspace` 的取值为卡片单独定色。

三处刻意的取舍：

- **工作区分组的图标是自绘的。**「优先复用官方原语」指的是优先复用**接口与控件**，
  不是说字形只能用现成的那几个。primitives 实际导出的 76 个图标里没有任何
  「分组 / 容器 / 堆叠」类字形，也没有虚线的文件夹，而工作区分组既需要一个
  「新建」入口、又需要与旁边的实线文件夹（它代表**工作区本身**）区分开。因此按
  官方规范自绘一个，视觉上与它们同族（见 [自绘图标](custom-icons.md)）。
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

## 语言包

文案分两层，都是官方包的结构：

| 模块 | 内容 |
| --- | --- |
| `locales.ts` | 命名空间名 `NS`、`zh` / `en` 字典、键域类型，以及 `LocaleNamespaceMap` 声明 |
| `labels.ts` | 只有投影：`regionLabels(t, tWorkspace, tSidebar)` 把翻译函数绑成 `RegionLabels` 契约 |

命名空间取短名 `workspaceGroups`（官方插件的命名空间都是短名：`workspace` /
`sidebar` / `goal` / `reference` …），不是包名。

**官方已有的文案不复制，直接读官方命名空间**：区域标题、工作区改名/删除、
会话行标签、状态点、空态这些 `workspace` 命名空间已有的词，`regionLabels`
逐键取官方（`section.workspaces` / `actions.workspace.aria` /
`actions.session.aria` / `rename.workspace.title` / `delete.desc` /
`status.*` 等），本包字典里不存副本。这样官方改措辞时本包自动跟随，两处同屏
也不会出现两套说法。这也是官方的既有做法：`ui-attachment` 就注册自己的
命名空间，却用 `locale: "conversation"` 读 `ui-conversation` 的文案。

悬停卡片的文案同样一个键都不用加：创建时刻取官方 `hover.created` + `date.ymd`，
复制提示取 `common` 的通用词 `copy`、成功反馈取 `hover.copied`，卡片那份相对
时间取 `time.ago`；会话卡片里「空闲」那一条取官方的 `status.idle`——行首不画点
但卡片要把它列出来，那个词官方本来就有，不另造。

本包字典只剩官方没有对应词的键：会话分组那一套（`actions.group.aria` /
`newGroup` / `renameGroup` / `deleteGroup` / `groupNamePrompt` /
`delete.desc.group` / `moveToGroup` / `ungroup`）、工作区分组那一套
（`actions.virtualWorkspace.aria` / `newVirtualWorkspace` / `menu.newVirtualWorkspace` /
`renameVirtualWorkspace` /
`deleteVirtualWorkspace` / `virtualWorkspaceNamePrompt` / `delete.desc.virtualWorkspace` /
`moveToVirtualWorkspace` / `ungroupWorkspace` / `virtualWorkspaceEmpty`），加
`compareTabDescription` 与 `unimplemented`。
「添加工作区」与「搜索」的文案因此一个键都不用加：添加入口取官方
`workspace.add`、错误框取 `folderError.title` 与 `folderError.retry`；搜索的
入口 tooltip、输入框与结果区取官方 `search` / `search.sessions.aria` /
`search.placeholder` / `search.clear` / `search.results.aria` /
`search.noMatches` / `search.hasMore`。注意添加入口是 `workspace.add`
（「添加工作区」），不是 `menu.addWorkspace`（「添加工作区…」）——后者是工作区
列表菜单里那一项，带省略号表示还要再选一次。
`actions.group.aria` 是分组自己的无障碍标签（官方只有工作区与会话两个），
分组 `+` 的标签则直接复用官方的 `actions.newSession.aria`——语义完全相同，
不另造一个同义键。`labels.test.ts` 会断言字典里没有任何与官方重合的键，
避免以后又抄回来。

**「重命名」这个动作有两个键，不是同一个文案。** 菜单项用官方的通用动词
`rename`（`重命名` / `Rename`），对话框标题才用点明对象的键。这不是本包的
取舍，而是照官方 `ui-workspace` 抄的：

| 位置 | 官方用的键 | 中文 |
| --- | --- | --- |
| 工作区行菜单项 | `rename` | 重命名 |
| 会话行菜单项 | `rename` | 重命名 |
| 重命名工作区对话框标题 | `rename.workspace.title` | 重命名工作区 |
| 重命名会话对话框标题 | `rename.session.title` | 重命名会话 |

两个菜单项都用通用动词，只有对话框标题点明对象。本包照此分工，三个容器行都
归入同一条规则：

| 位置 | 本包用的键 | 来源 | 中文 |
| --- | --- | --- | --- |
| 工作区 / 会话分组行 / 工作区分组行菜单项 | `rename` | 官方 `workspace` | 重命名 |
| 重命名工作区对话框标题 | `rename.workspace.title` | 官方 `workspace` | 重命名工作区 |
| 重命名分组对话框标题 | `renameGroup` | 本包自有 | 重命名分组 |
| 重命名工作区分组对话框标题 | `renameVirtualWorkspace` | 本包自有 | 重命名工作区分组 |

`RegionLabels` 因此暴露 `rename`（菜单项，三个容器行共用）、`renameWorkspace`、
`renameGroup` 与 `renameVirtualWorkspace`（各自的对话框标题）四个字段。
`groupActionLabels.rename`、工作区分组行的 `labels.rename` 与工作区行的
`labels.rename` 都取第一个；三处 `NameDialog` 的 `title` 取各自那个。

顺带一个容易走错的点：`rename` 只在官方 `workspace` 命名空间里，**不在**
`common` 里——`common` 收的是「确定 / 取消 / 复制 / 删除 / 编辑」这类跨功能
标准词，其中并没有 `rename`。所以这一项必须走 `tw('rename')`；写成
`t('rename')` 会被 tsc 直接拒绝（本包自己的键域里没有它，`common` 也没兜住）。

三个命名空间的取用方式：

- 本包自己的 `workspaceGroups` 由插件入口 `ctx.locale.register(NS, { zh, en })`
  注册，字典键域由 `LocaleNamespaceMap` 声明，因此 tsc 会拒绝漏键或错键；
  组件侧走插槽的 `locale: NS` 座位。
- 官方 `workspace` 由官方包自己注册，本包只**读**：`locale.bind('workspace')`
  取翻译函数后随 inject 结果传下去。`bind` 返回稳定引用且**调用时才读当前
  语言**，因此既不必占用插槽座位，也不会冻结在注册那一刻。
- 官方 `sidebar` 同样只读：行右键菜单的「新建会话」项取它新建按钮的动词
  短语 `session.new.label`（见 [交互细节与官方对齐依据](ui-details.md) 的「行右键菜单」）。这个键在 `sidebar` 而不在
  `workspace` 里——后者只有名词形态的 `session.new`（「新会话」）。

通用词（`ok` / `cancel` / `close`）不在本包字典里：它们走官方 `common`
命名空间，由拿到 `t` 座位的对话框组件直接解析，查找链在命名空间未命中后
回退到 `common`。

