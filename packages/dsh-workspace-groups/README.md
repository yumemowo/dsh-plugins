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

这条「官方注册仍在」不是无关紧要的实现细节，而是**添加工作区能复用它目录选择
交互的原因**：官方那条注册声明了子插槽 `sidebar.workspaces.directoryFlow`，
注册既然还在，洞的声明与注册进洞的占用者就都还在（见「目录选择器」一节）。

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

- **添加工作区**：区域 header 右侧的图标入口，借用官方目录选择交互选中一个
  目录后登记为工作区，并在其中开一个新会话（见「添加工作区」）。
- **新建分组**：工作区行右侧 `...` 菜单里的第一项，输入名称即可。
- **重命名 / 删除工作区**：同一个 `...` 菜单里的后两项，与官方工作区菜单
  一致（重命名在前、删除在后）。两者都直接调用官方工作区控制器
  （`ctx.workspaces.rename` / `delete`），不另造 RPC。删除只移除工作区注册，
  文件夹与会话记录由宿主保留。菜单项文案与官方逐键相同（见「语言包」）。
- **重命名 / 删除分组**：分组行右侧 `...` 菜单里的两项；删除只解散分组，
  组内会话移出分组，会话本身不受影响。
- **会话数**：分组行行尾显示组内会话数，与 session 行的相对时间同格同形
  （`--dsw-alias-label-tertiary`、`12px/20px`）。空分组不显示，悬停/菜单展开
  时与会话行的时间一样隐去，把行尾让给浮现的操作按钮。只显示数字本身，
  不带「个会话」这类单位——官方字典里的 `sessions.count.*` 虽然存在，但在
  官方组件里从未被引用，因此不照抄。
- **展开折叠**：工作区行与分组行都可折叠，两者状态互不影响。展开/收起带
  过渡动作（见「展开折叠的过渡」）。
- **新建会话**：工作区行与分组行右侧的 `+`。分组行的 `+` 会把新会话建在
  该分组所属工作区，并自动把它归入这个分组（见下节）。建会话走官方导航
  服务，因此与官方组件一样复用同工作区已有的空白会话（见下节）。
- **会话可见性**：与官方组件一致 —— 已归档、子代理来源的会话不显示；
  空白会话只保留当前选中的那一条。
- **会话命名**：新建中的会话行显示官方的固定名「新会话」（官方
  `session.new`，不复制译文）；会话正式启用后显示标题服务投影出的摘要名。
- **会话状态点**：行首用官方 `StateDot` 原语显示状态，取值与官方
  `ui-workspace` 的 `sessionStatuses` 逐条一致（见下节）。
- **会话重命名 / 分叉 / 归档**：会话行 `...` 菜单里直接复用官方接口与官方
  文案（见「会话操作菜单」）。
- **行尾最近更新时间**：官方风格的紧凑相对时间，格式化完全复用官方原语与
  语言包（见「行尾最近更新时间」）。

### 工作区行与分组行的按钮形态

两类容器行共用同一套行尾操作：`...` 管理菜单 + `+` 新建会话。工作区行与官方
`ui-workspace` 逐项对齐，分组行刻意复用同一布局（同一 `.wg-row-actions`
容器、同一悬停显隐规则），因此两行不会各自漂移。

| 行 | `...` 菜单 | `+` |
| --- | --- | --- |
| 工作区 | 新建分组 / 重命名 / 删除工作区 | 在该工作区新建会话（与官方 `onCreate` 语义一致） |
| 分组 | 重命名 / 删除分组 | 在该分组所属工作区新建会话，并归入该分组 |

图标一律取 primitives：`IconEllipsisOutline16` / `IconPlusOutline16` /
`IconEditOutline16` / `IconTrashOutline16`。

**「新建分组」收进 `...`**：它不像新建会话那样高频，因此不占行内位置。
官方的 `+` 语义是「新建会话」而非「新建分组」，这里与官方保持一致；
本包原有的气泡图标（`IconNewChatOutline16`）随之让位给官方的 `+`。

菜单里的「新建分组」带 `+` 图标，与官方 `menu.addWorkspace` 用 `IconPlusOutline16`
的写法一致；官方菜单项的两个图标（`IconEditOutline16` / `IconTrashOutline16`）
原样复用。

**分组行的 `+` 建完会话后自动归组**：先走官方导航服务开一个新会话，再用本包
既有的 `moveSession` 把它移入该分组，不另造「在分组内建会话」的宿主接口。
与工作区行的 `+` 一样，建之前会展开所在工作区；分组行还会展开分组本身，否则
新会话会落在折叠区里看不见。

**每次创建都重摆位置**：`+` 完成后无条件把会话摆到本次创建指定的位置——
分组行归入该分组，工作区行移出分组（归入未归组区）。工作区行那一步不能省：
新建复用的是该工作区已有的空白会话，若它先前是在某个分组里建的，工作区行的
`+` 复用到它时必须把它从分组里摘出来，否则它的位置会停在上一次创建的地方。

**新建会话复用同工作区的空白会话**：`+` 调的是官方导航服务的 `openWorkspace`，
它先在该工作区里找一条已存在的空白会话（同一个工作区路径、未被归档），找到就
复用，否则才调 `create`；然后把它选中并切到会话面板。这条路径与官方
`WorkspaceBrowser` 的 `+` 完全一致，因此连点两次不会攒出两条空会话。本包不
自己拼 `create` + `open`——那会与官方组件产生两套行为（见「会话操作菜单」一节
的复用约定）。

`openWorkspace` 内部还用 `ctx.layout` 起了导航守卫：点完 `+` 立刻切走时这次
新建会被取代，与官方行为一致。它返回 `void`，会话 id 因此从它的 `beforeOpen`
回调里取（官方只在这轮导航仍有效时才回调），被取代时回调不触发，本包也就不再
摆位置。这条守卫是官方服务自带的，本包不需要为此引入 `layout` 依赖。

分组行的 `...` 与工作区行一样是**管理操作菜单**，不承担建造型操作：「新建分组」
属于工作区行，分组行的高频建造操作就是行内 `+`。

**会话行尾的 `...` 打开会话操作菜单**：外观、位置与悬停行为都对齐官方，
菜单里既有官方三项操作，也有本包的归组项（见下节）。

**只有用户创建过分组，才会出现分组结构。** 没有分组时，会话直接平铺在工作区下，
与原生列表一致；未归组的会话也平铺在工作区下，不会被塞进一个凭空造出来的
「未分组」分组。

一个会话至多属于一个分组：移入新分组时会自动从原分组摘除。

### 会话操作菜单

行尾 `...` 打开菜单，内容分两段：官方三项 + 一条分隔线 + 本包的归组项。

| 段 | 项 | 行为 |
| --- | --- | --- |
| 官方 | 重命名 | 打开重命名对话框，提交走官方会话对象 |
| 官方 | 分叉会话 | 官方 `ctx.uiWorkspace.forkSession`，分叉后打开子会话 |
| 官方 | 归档会话 | 官方 `ctx.uiWorkspace.archiveSession` |
| — | *分隔线* | 只在两段都存在时画 |
| 本包 | 分组 ▸ | 二级菜单列出该工作区的其他分组 |
| 本包 | 取消分组 | 仅当会话已归组 |

**官方三项不抄官方实现，而是直接复用官方接口**（本仓库「优先复用官方既有接口」
约定的延伸）：

- 动作调用官方既有面 —— 分叉/归档走 `ctx.uiWorkspace` 服务，重命名走
  `ctx.sessions.binding(id).session.rename()`。这三处正是官方会话菜单内部调的
  同一批接口，因此官方改行为时本包**自动跟随**，不需要重新对齐。
- 文案与图标取官方 —— 绑官方 `workspace` 命名空间（`rename` / `menu.fork` /
  `menu.archiveSession` / `rename.session.title` / `field.sessionName`），图标取
  primitives 的 `IconEditOutline16` / `IconBranchOutline16` / `IconArchiveOutline20`。
  重命名对话框的「取消 / 关闭」是通用词，走官方 `common` 命名空间的回退链。
- **只在类型层依赖官方包**：`package.json` 把 `dsh-client-ui-workspace` 列为
  peer + dev 依赖，但只 import type。因此官方一旦改键名或改服务签名，
  `tsc` 会直接报错，而不是运行期静默显示成原始键名。运行期产物里不含官方
  代码（bundle 的 `require` 仍只有 primitives / react / react/jsx-runtime）。

「未分组」桶里的会话没有工作区归属、没有分组可落，因此那里只留官方三项。
宿主未加载官方 `ui-workspace` 时（本包的区域本来就依赖它供的 `useWorkspaces`
等全局 hook），官方三项与行尾时间**整体不渲染**，不留点不动的死按钮。

### 会话命名

新建出的会话行分两个阶段命名，两段都跟官方走：

| 阶段 | 标题来源 |
| --- | --- |
| 空白（刚新建、还没发消息） | 官方 `workspace` 命名空间的 `session.new`（「新会话」/ New Session），渲染期套上 |
| 正式启用（首个回合落地） | 宿主标题服务投影的显示标题（摘要名），随会话列表快照自动更新 |

空白会话的**存储**标题取空串，而不是拿宿主给的后备标题顶上 —— 后备标题是
工作区目录名（`displayTitleOf` 的 `title → cwd basename → id` 链），把它当成
新建会话的名字会显示成 `dsh_plugins` 这种目录名。这正与官方
`ui-workspace` 的 `sessionTitle` 相同：`session.blank ? "" : session.displayTitle`，
显示名留给渲染期本地化。因此 `labels.newSession` 是官方键，本包字典里没有
副本；空白行也不进搜索。

空白行同时**不挂行尾菜单**：还没发消息的会话没有可重命名、分叉或归档的对象，
官方 `SessionNodeItem` 对空白行同样整条省略号都不渲染。行尾时间也照官方
隐去。首个回合落地后，标题服务投影出摘要名，行上恢复常规的时间与菜单。

**空白行固定排在所属区段最前**，其余会话按最近更新倒序（`compareSessionRows`）。
它是刚点出来的那条占位行，还没有自己的内容时间，排在分组内 index 0 或未归组
区最上面才符合「刚新建的就是这条」的预期；一旦启用就回到与其他会话同一套排序。
这也是它唯一享有的一处排序特权，不额外存储任何顺序。

### 行尾最近更新时间

会话行尾显示官方风格的紧凑相对时间（`刚刚` / `5分钟` / `2天`），悬停或菜单
展开时让位给 `...` 按钮 —— 与官方同一处 CSS 互换（`time` → `ellipsis`）。

格式化完全复用官方：分桶交给 primitives 的 `relativeTime`（官方
`ui-workspace` 的 `timeLabel` 用的同一个函数），文案交给官方 `workspace`
命名空间的 `time.now` / `time.minutes` / … 键。基准时刻与官方一样在渲染时取
`Date.now()`，官方没有 ticker，本包也不自造一个：分钟级的精度跟着其他重渲染
刷新足够。空白（新建中）会话行不显示时间，与官方一致。

### 会话状态点

行首那一列放官方 `@deepseek-ai/dsh-client-ui-primitives` 的 `StateDot`，
判定规则与官方 `ui-workspace` 的 `sessionStatuses` 逐条对齐：

| 优先级 | 条件 | 状态 | 外观 |
| --- | --- | --- | --- |
| 1 | 等待审批 / 计划待审 / 等待回答 | `warning` | 琥珀点 |
| 2 | 本会话正在运行 | `ongoing` | 蓝色追光方阵 |
| 3 | 有运行中的子代理 | `ongoing` | 同上 |
| 4 | 本轮已完成、尚未打开 | `done` | 绿色点 |
| — | 空闲 | 不画点 | 槽位留空 |

两条数据来源与官方一致：待交互取自 ui-session 的**会话级待交互快照**
（`useSessionPendingInteraction`，等待审批时会话可能并不在 `running`，
所以不能从会话摘要里推）；运行中子代理数由 `byId` 里 `origin === 'subagent'`
的行沿 `parentId` 上溯统计，只有「整条脉络都是子代理」才继续上溯。

空闲态**不画点但保留槽位**，因此标题的横向位置与工作区标题始终对齐。
不认识的待交互种类（其他插件发布的）会被忽略，而不是画一个没有文案的点。

### 展开折叠的过渡

折叠由 `CollapsibleBody` 套一层可收放的**轨道**：展开时轨道向下撑开，收起时收回，
三处折叠体（工作区、分组、隐式的「未分组」区段）共用同一组件。

高度走 `grid-template-rows: 0fr ↔ 1fr`，轨道高度因此**由内容自身决定**——
子元素有多少个、各自多高都不需要预先知道，样式里也没有任何写死的尺寸或
序号（不用 `max-height`，也不用 `nth-child`）。可动画的前提是两条：内层
`overflow: hidden` 负责裁剪，内外两层的自动最小尺寸都要归零（`min-height: 0`），
否则内容会把 `0fr` 的轨道顶开、收不到底。

内容**常驻文档**，因为卸载掉就没有可收回的东西。收起后它仍在布局里，因此由
`visibility` 把内容移出焦点顺序与命中测试，并延后到收起动作结束才生效；展开
时则立即可见。

「上一行 → 折叠体」那一份 2px 间距也一并交给折叠体：它是内层容器的上内边距，
落在裁剪区内，收起时随轨道一起被裁掉，行下不会残留空档。

**展开分两段：先把容器撑开，撑开跑完再让元素自上而下逐个淡入。**

分两段是为了不让两种代价叠在同一时间段：撑开每帧都要重排整棵子树，而一批元素同时
做 opacity 过渡又要逐帧重新合成。撑开期间元素保持全透明、不跑任何过渡，两段各自只
承担一件事。

淡入放在撑开之后还顺带解决了首帧问题：首次展开要付样式与布局的初始化代价，而过渡按
挂钟时间推进，等第一帧真的画出来，淡入往往已经过去大半。

撑开完成的判据是容器的 `transitionend`：过渡真正结束的时刻才算数，标签页被降频或
主线程被占住时也停在正确的时刻。定时器只作兜底；`prefers-reduced-motion` 下过渡被
关掉、事件不会来，没有兜底元素会永远停在透明。

事件要核对 `event.target` 与 `propertyName`：内层 clip 的 `visibility` 过渡也会冒泡
到容器，认错就会提前淡入。

淡入的先后只由文档序决定——撑开跑完时所有元素都已完全可见，元素在文档里的位置就是它
在视觉上的位置，延迟因此是「序号 × `step`，再受 `cap` 封顶」。

显隐不能写成「展开祖先的后代」这种纯 CSS 写法：嵌套折叠体里**仍收着**的元素会被
外层的展开态一起点亮，等它自己那层展开时就已经是不透明的，淡入不会发生。

**`.wg-reveal` 必须由元素自己在渲染时产出，不能命令式地往元素身上挂。** `className`
归 React 所有：行内状态一变（例如点开 row action 菜单）React 会整体重写它，命令式挂
上去的类当场被抹掉；而补挂的逻辑在折叠体的 effect 里，父组件并不会因子组件重渲染，
于是补不回来——该行会**卡在透明**，反复补挂则是**闪烁**。折叠体只通过 `RevealContext`
声明「本子树此刻能不能亮」，元素用 `useStaggerReveal()` 取回一段后缀、拼进自己的
`className`。

淡入也不能挂在元素挂载上：内容常驻（见上），挂载只发生一次，而每次展开都要重放。

参与淡入的元素由元素组件自己打 `data-wg-stagger` 标记（会话行、分组头、空态），
延迟逐元素不同、由折叠体排期后逐个下发（延迟是元素自己没渲染过的内联属性，可以
命令式写），因此**元素有多少、分组嵌套多少层都不必预先知道**，样式里也没有任何
写死的尺寸或序号。

### 嵌套：内层要让外层先走完

内层折叠体**必须等外层撑开结束**才能点亮自己的元素。抢在外层撑开期间点亮，那些元素
还在逐渐揭开的裁剪区里，整段淡入都会落在暗处——表现就是「外层的分组头有明显淡入，
组内的会话行却像是一下子出现的」。

难点在于 React 的 layout effect 是**子组件先跑**：外层刚开始撑开的那一次提交里，本来
展开着的内层会先被通知，此时外层还没来得及记下任何状态。因此「本层是否还在撑开」不能
靠 effect 里的 DOM 标记传递，得用 **context**——它在渲染期由父传给子，顺序天然正确：
折叠体在渲染期就把「还没落定」按 props 下调到状态里传给子树，而不是留到 effect（那时
子组件已经跑过一轮）。

内层读到祖先还没落定就先不动手；等外层撑开跑完、它自己点亮时**连整棵子树一起点亮**，
内层那批元素本来就在这一次点亮里，因此只需要一处判定。

判定「元素此刻可不可见」还要沿祖先链**一路走到文档根**，不能止于某个折叠体：只查到
一半的话，内层调用时「外层正在撑开」就落在检查范围之外，内层照样抢跑。两类祖先会
挡住——**仍收着的**与**仍在撑开的**。

收起时 `.wg-reveal` 被摘掉即落回基准规则——**基准里没有 `transition-delay`，延迟随之
归零**，所有元素同时淡出（包括嵌套体里展开着的元素，外层合拢时它们一并隐去）。收起还
会取消仍在等待的那次淡入，否则收起的折叠体会在半路亮回来；内层单独收起时它自己的元素
也要回到透明，不然再展开那个分组时不会有淡入。

### 节奏参数

节奏参数集中在 `src/client/utils/collapseMotion.ts` 的 `DEFAULT_COLLAPSE_MOTION` 一处，
**样式表的 CSS 回退值也直接取这里的值**，不另行硬编码，因此两边不可能漂移。自定义属性
**名**同样来自一处（`COLLAPSE_VARS`）：名字写两遍一样会静默失配。

单独抽成一个模块而不是放进组件，是为了不让样式表依赖 React，也避免与组件互相 import
成环。

`lead` 是**比例**而非毫秒，表示淡入起点在撑开过程中的位置：`1` 等完全撑开，`0` 一
开始就淡入。取值越小收尾越紧凑，代价是这个比例之后才露出的元素有一段淡入落在裁剪区
内、看不见；`1` 是唯一能保证每个元素的淡入都完整可见的值。比例 = 1 时认
`transitionend`，比例 < 1 时以定时器为准（事件只在结束那一刻才来）。

**本次只有一个元素会露面时，总是等完全撑开，`lead` 被忽略**（见 `resolveLead`）。那时
它独占整段淡入，提前起步没有任何好处，只会把唯一那段缓动藏进裁剪区；多于一个时才轮
到 `lead` 决定，因为那时收尾紧凑与否才有可感知的差别。

判据是**本次会露面的元素个数**，不是 `children` 的节点数：`children` 可能是几个容器、
里面才装着参与淡入的元素，而收着的嵌套体里的元素本次也不露面。

`cap` 是防呆：元素很多时逐个累加会让末尾等太久，封顶后仍是自上而下的次序，只是靠后的
若干元素同时露面。

**「收起后交出焦点顺序」的延时也读同一个 `duration`**，因此不可能与容器时长失配：
各写一份的话，改一处忘另一处会让内容在视觉上没合拢时就能被 Tab 聚焦。

`prefers-reduced-motion` 下容器直接落位并在同一帧完成淡入（没有可等的过渡）；样式侧
那条规则还要连 `.wg-reveal` 上更具体的延迟一起清掉，否则元素仍是逐个出现。

### 层级缩进

工作区 → 分组 → 组内会话是三级结构，靠左边距与一条竖向引导线表达：

| 层级 | 左边距 | 说明 |
| --- | --- | --- |
| 工作区行 | `8px` | 保持官方几何不动 |
| 分组头 / 工作区直接子会话 | `24px` | 每层让出一个 `16px` 图标列 |
| 分组内会话 | `40px` | 同上 |

缩进步进与层级结构效果参考取自 [`liceses/dsh-workspace-tree`](https://github.com/liceses/dsh-workspace-tree)

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

## 区域头部与添加工作区

区域顶部有官方同形的 section header（36px）：左侧标题（官方 `section.workspaces`），
右侧一组 28px 圆形图标按钮。

| 入口 | 状态 |
| --- | --- |
| **添加工作区** | 已实现，见下节 |
| 搜索 | 尚未实现，渲染成 **disabled 占位** |
| 视图选项 | 尚未实现，渲染成 **disabled 占位** |

两个未实现的入口保留官方的位置与字形，但带 `disabled` 语义、悬停无高亮：
它们在界面上明说自己不可用，而不是渲染成一个点下去没反应的死按钮（后者正是
本包在别处明确拒绝的形态）。无障碍标签取官方 `search.sessions.aria` /
`viewOptions.label`，因此占位按钮不是无名按钮。

窄栏（rail）下与官方一致：标题与搜索都不渲染，只留一个 36px 的「添加工作区」
入口（`label-primary`）。

### 添加工作区

流程与官方 WorkspaceBrowser 逐段一致：

1. 点入口 → 直接打开 picking 交互（官方在侧边栏用 `addOnly: true`，同样不先
   弹工作区列表菜单）；
2. 用户在交互里选中一个目录（或取消）；
3. 选中后调官方 `ctx.workspaces.create({ path })` 采纳；
4. 采纳成功 → 官方 `ctx.uiWorkspace.startSession(workspaceId)`，在新工作区里
   开一个新会话并打开；
5. 采纳失败 → 官方 `folderError.title` 错误框，`folderError.retry`（「重新选择」）
   重开交互。

picking 交互本身不重写：它整段来自官方 `sidebar.workspaces.directoryFlow` 洞的
占用者（native / browse 两种组合都覆盖，见下节）。文案零新增——入口、错误框标题
与「重新选择」都取官方 `workspace` 命名空间的既有键。

## 未提供的功能

以下原属于官方组件的功能**暂未实现**：

- 搜索（含 Host 内容检索，只留 disabled 占位入口）
- 视图选项（分组 / 排序，只留 disabled 占位入口）
- 拖拽排序（工作区与会话两级）
- 每工作区 5 条折叠与 Show more
- manual / updated 两种排序
- Schedule 告警标记（会话状态点已提供，见上节）

会话的**重命名 / 分叉 / 归档**、**添加工作区**都已通过复用官方接口提供
（见「会话操作菜单」与「添加工作区」），不再是本包自己实现的功能。

当前界面会在区域底部显示一行说明，提示这是实验版本。
建组与改名的输入框、删除确认、以及全部图标都走官方
`@deepseek-ai/dsh-client-ui-primitives`（见下节）。

### 样式对齐

样式取值取自官方侧边栏组件（`dsh-client-ui-sidebar` 与
`dsh-client-ui-workspace` 0.1.5-rc.2）的实际规则，而不是自定数值：

| 项 | 取值 |
| --- | --- |
| 区域右侧整块留白 | `var(--dsh-session-list-edge-inset)`（侧栏里 = 12px，同官方根节点） |
| 区域 section header 高 / 圆角 / 控件间距 | `36px` / `12px` / `4px`（同官方 `.sectionHeader`） |
| header 图标按钮 | `28px` 正圆、`--dsw-alias-label-secondary`、悬停 `-hover`（同官方 `.iconButton`） |
| 窄栏 header 图标按钮 | `36px` 正圆、`--dsw-alias-label-primary`（同官方 `.rail .iconButton`） |
| 工作区与分组行高 | `34px` |
| 会话行高 | `32px` |
| 行内水平内边距 / 圆角 | `8px` / `8px` |
| 图标列宽 | `16px`（`height: 20px`） |
| 行尾相对时间 | `12px` / `20px`，`--dsw-alias-label-tertiary`（同官方 `.time`） |
| 分组行尾会话数 | 同上的 `12px` / `20px` 与 `--dsw-alias-label-tertiary`，与行尾时间同格同形 |
| 悬停与选中底色 | `--dsw-alias-interactive-bg-hover` |
| 展开且含当前会话的文件夹 | `--dsw-alias-state-business-primary` |
| 文本色阶 | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` |
| 滚动条留白 | `--dsh-session-list-scrollbar-width` / `-offset` |
| 过渡 | `--ds-ease-in-out`，并遵守 `prefers-reduced-motion` |

右侧那 12px 值得单说，它是最容易抄错的一处：**官方的右留白不由 shell 提供，
而由 `WorkspaceBrowser` 的根节点自己拥有**——shell 的 `regionArea` 先把
`margin-right` 设为 `-12px` 抵消掉，根节点再 `padding-right: 12px` 加回来。
本包接替了这个根节点，就必须把那份留白连同三个自定义属性
（`--dsh-session-list-edge-inset` / `-scrollbar-width` / `-scrollbar-offset`，
官方定义在同一个根节点上、随它一起消失）一起重建，否则 header 的入口按钮与列表
行都会一路贴到侧栏右缘。

列表还要再折一层：官方 `.listArea` 用 `-edge-inset` 让列表靠到栏缘，再由 `.list`
把内容推回到离栏缘 12px。本包没有 `.listArea`，因此这两个偏移折进 `.wg-list`
自己的 `margin-right` / `padding-right`。窄栏下本包不渲染 `.wg-root`（只渲染两个
入口），右缘因此落在 shell 折叠态的 10px 上，与官方 `.root.rail{padding-right:0}`
一致。

唯一不取自官方的数值仍是**层级缩进的步进量**（`16px`）与引导线：官方只有
「工作区 → 会话」两级且两级都不缩进，本包多出的分组层没有可抄的先例，
取生态内的既有做法（见上文「层级缩进」）。

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
- **会话行**：行首是官方 `StateDot` 状态点（空闲时留空占位），行尾是操作位，
  标题因此落在工作区标题的同一横向线上，与官方几何一致。

**分组行没有文件夹槽**（分组不是工作区），因此图标列只有箭头一个，也不参与
「悬停换成箭头」那套互换；它的行尾操作位与工作区行共用同一个 `.wg-row-actions`
容器与同一份悬停显隐规则。

不过分组行多一处差异：它外面还套了 session 行那套**可收放槽位**
（`.wg-row-action-slot`）。分组行有会话数要展示，而会话数要与 session 行的
相对时间落在同一条右缘线上——那就必须让操作位静止时不占宽，否则会话数会被
常驻的操作区顶着、退到行中间。因此分组行的结构是
「标题 → 会话数 → 可收放槽位（内含操作位）」：静止时槽位收成 0 宽，会话数
贴住行右；悬停/菜单展开/键盘聚焦时槽位展开，会话数同时隐去，两者严格互换。

槽位虽然收成 0 宽，**仍是 flex 子项**，与它相邻的那份 `gap` 照算——分组头是
`gap: 6px`，而 session 行是 `gap: 0`，所以会话数还要用 `margin-right: -6px`
把这份多出来的间距还回去，右缘才与 `time` 落在同一条竖线上。展开宽度取
`auto` 而非会话行的 `16px`：槽里是两个按钮（16 + 12 + 16）。

工作区行没有行尾文本，因此保持操作位常驻在流内（只切换不透明度），
悬停时标题不位移。

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
| 建组 / 改名 / 工作区重命名 / 会话重命名 | `Modal` + `Input` + `Button`（`outline` / `primary`） |
| 删除分组 / 删除工作区 | `Modal` + `Button`（`outline`，确认按钮着错误色） |
| 添加工作区失败 | `Modal` + `Button`（同上，文案取官方 `folderError.*`） |
| 文件夹、三角、省略号 | `IconFolderClose16` / `IconFolderOpen16` / `IconTriangleRightFill14` / `IconEllipsisOutline16` |
| 新建会话、新建分组、改名、删除 | `IconPlusOutline16` / `IconEditOutline16` / `IconTrashOutline16` |
| header 的添加工作区 / 搜索 / 视图选项 | `IconProjectAddOutline16` / `IconSearchOutline16` / `IconPersonalizationOutline16`（与官方 header 同字形） |
| 会话菜单的分叉 / 归档项 | `IconBranchOutline16` / `IconArchiveOutline20`（与官方会话菜单同字形） |
| 窄栏展开入口 | `IconPanelLeftOutline16`（与官方侧栏折叠按钮同一字形） |
| 会话状态点 | `StateDot`（运行态画追光方阵，其余画圆点；颜色由原语的主题规则给出） |
| 行尾相对时间 | `relativeTime`（官方 `timeLabel` 用的同一个分桶函数，文案走官方语言包） |
| 「添加工作区」入口提示 | `Tooltip`（与官方 header 同一 `delayMs` 与展开方向） |

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

### 语言包

文案分两层，都是官方包的结构：

| 模块 | 内容 |
| --- | --- |
| `locales.ts` | 命名空间名 `NS`、`zh` / `en` 字典、键域类型，以及 `LocaleNamespaceMap` 声明 |
| `labels.ts` | 只有投影：`regionLabels(t)` 把翻译函数绑成 `RegionLabels` 契约 |

命名空间取短名 `workspaceGroups`（官方插件的命名空间都是短名：`workspace` /
`sidebar` / `goal` / `reference` …），不是包名。

**官方已有的文案不复制，直接读官方命名空间**：区域标题、工作区改名/删除、
会话行标签、状态点、空态这些 `workspace` 命名空间已有的词，`regionLabels`
逐键取官方（`section.workspaces` / `actions.workspace.aria` /
`actions.session.aria` / `rename.workspace.title` / `delete.desc` /
`status.*` 等），本包字典里不存副本。这样官方改措辞时本包自动跟随，两处同屏
也不会出现两套说法。这也是官方的既有做法：`ui-attachment` 就注册自己的
命名空间，却用 `locale: "conversation"` 读 `ui-conversation` 的文案。

本包字典只剩官方没有对应词的 10 个键：`actions.group.aria` / `newGroup` /
`renameGroup` / `deleteGroup` / `groupNamePrompt` / `delete.desc.group` /
`moveToGroup` / `ungroup` / `compareTabDescription` / `unimplemented`。
「添加工作区」的文案因此一个键都不用加：入口取官方 `workspace.add`、错误框
取 `folderError.title` 与 `folderError.retry`、两个占位入口取
`search.sessions.aria` 与 `viewOptions.label`。注意入口是 `workspace.add`
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

两个菜单项都用通用动词，只有对话框标题点明对象。本包照此分工，分组行也
归入同一条规则：

| 位置 | 本包用的键 | 来源 | 中文 |
| --- | --- | --- | --- |
| 工作区 / 分组行菜单项 | `rename` | 官方 `workspace` | 重命名 |
| 重命名工作区对话框标题 | `rename.workspace.title` | 官方 `workspace` | 重命名工作区 |
| 重命名分组对话框标题 | `renameGroup` | 本包自有 | 重命名分组 |

`RegionLabels` 因此暴露 `rename`（菜单项，两个容器行共用）、`renameWorkspace`
与 `renameGroup`（各自的对话框标题）三个字段。`groupActionLabels.rename` 与
工作区行的 `labels.rename` 都取第一个；两处 `NameDialog` 的 `title` 取各自
那个。

顺带一个容易走错的点：`rename` 只在官方 `workspace` 命名空间里，**不在**
`common` 里——`common` 收的是「确定 / 取消 / 复制 / 删除 / 编辑」这类跨功能
标准词，其中并没有 `rename`。所以这一项必须走 `tw('rename')`；写成
`t('rename')` 会被 tsc 直接拒绝（本包自己的键域里没有它，`common` 也没兜住）。

两个命名空间的取用方式不同：

- 本包自己的 `workspaceGroups` 由插件入口 `ctx.locale.register(NS, { zh, en })`
  注册，字典键域由 `LocaleNamespaceMap` 声明，因此 tsc 会拒绝漏键或错键；
  组件侧走插槽的 `locale: NS` 座位。
- 官方 `workspace` 由官方包自己注册，本包只**读**：`locale.bind('workspace')`
  取翻译函数后随 inject 结果传下去。`bind` 返回稳定引用且**调用时才读当前
  语言**，因此既不必占用插槽座位，也不会冻结在注册那一刻。

通用词（`ok` / `cancel` / `close`）不在本包字典里：它们走官方 `common`
命名空间，由拿到 `t` 座位的对话框组件直接解析，查找链在命名空间未命中后
回退到 `common`。

必须分清「缓存的是函数还是文案表」：渲染器会缓存 inject 结果整个注册周期，
因此**投影后的文案表**不能放进 inject（会冻结在首次渲染那一刻），而
`locale.bind` 返回的**翻译函数**可以——它调用时才读当前语言。因此
`regionLabels(t, tWorkspace)` 在组件渲染期现算，`t` 走插槽座位、`tWorkspace`
随 inject 传入。


### 为什么不能只做增量扩展

官方组件**没有**暴露会话行级别的插槽，因此无法在它内部追加分组。
唯一的做法是接替整个区域。

### 目录选择器：复用官方的洞，而不是重开一个

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
├── locales.ts                  命名空间声明与中英字典（键名取官方叫法）
├── labels.ts                   文案契约与投影（TranslateNS → RegionLabels）
├── official.ts                 官方 workspace 语言包与相对时间的复用面
├── directoryFlow.ts            官方 directoryFlow 洞的占用者读数（添加工作区的交互来源）
├── actions.ts                  RegionActions / RegionDataHooks（组件与宿主的接口）
├── compare.tsx                 对照模式：挂进 better-sidebar 右侧栏 tab
├── remote.ts                   Remote 贡献声明与调用封装
├── runtime.ts                  primitives 值导入的唯一出口（external）
├── menus.tsx                   容器行「更多操作」菜单的条目构造（工作区 / 分组）
├── styles.ts                   本包样式表
├── data/                       无 React 依赖的纯逻辑
│   ├── types.ts                SessionRow / GroupSection / WorkspaceLayout / 草稿类型
│   ├── layout.ts               分组元数据 → 渲染布局
│   ├── status.ts               会话状态位推导（待交互 / 运行 / 完成）
│   └── sessions.ts             会话快照 → 渲染行（含可见性过滤、空白行命名、未分组收集）
├── utils/                      组件与样式表共用的零散常量
│   └── collapseMotion.ts       折叠动画节奏常量（只 import React 类型，运行时无依赖）
└── components/
    ├── WorkspaceGroupsRegion.tsx   区域容器：状态与编排
    ├── RegionHeader.tsx            区域 section header（标题 + 三个入口）
    ├── AddWorkspaceControl.tsx     「添加工作区」入口与 picking 流程
    ├── WorkspaceSection.tsx        一个工作区区块（标题 + 折叠体 + 空态）
    ├── WorkspaceRow.tsx            工作区标题行（文件夹/箭头、`...`、`+`）
    ├── GroupSection.tsx            一个分组（分组头 + 组内会话）
    ├── CollapsibleBody.tsx         折叠体（撑开/收回/行逐个淡入）
    ├── RowActions.tsx              容器行行尾操作位（`...` 菜单 + `+`），两行共用
    ├── SessionRowView.tsx          会话行外壳（状态位列、标题、时间、操作位）
    ├── SessionRowMenu.tsx          带会话操作菜单的会话行
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
