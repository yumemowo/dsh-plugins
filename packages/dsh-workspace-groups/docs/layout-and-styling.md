# 布局与样式对齐

本文记录尺寸、留白、色阶与缩进几何的取值来源，以及哪些数值是官方既有规则的复刻、
哪些是本包多出的层级自己的取舍。

## 层级缩进

工作区分组 → 工作区 → 分组 → 组内会话最多四级，靠左边距与一条竖向引导线表达：

| 层级 | 左边距 | 说明 |
| --- | --- | --- |
| 工作区分组头 / 未归组的工作区行 | `8px` | 根节点 |
| 分组内的工作区行 / 工作区直接子会话 / 分组头 | `24px` | 每层让出一个 `16px` 图标列 |
| 分组内的工作区里的会话 / 分组内工作区的分组头 | `40px` | 同上 |
| 分组内工作区里的分组内会话 | `56px` | 同上 |

引导线落在父级图标列的中心，因此每层一处：工作区分组 `16px`、组内工作区
`32px`、组内工作区的会话分组 `48px`。工作区分组是这条链上的第 0 层，它自己
不缩进，组内的东西整体右移一格。

缩进步进与层级结构效果参考取自 [`liceses/dsh-workspace-tree`](https://github.com/liceses/dsh-workspace-tree)

挂上悬停卡片的会话行外面会多一层包装（官方 `HoverCard` 的根节点），行因此不再是
`.wg-sessions` 的直接子项；缩进选择器为此把 `> .wg-row` 与 `> * > .wg-row` 两档
都写着，有没有卡片缩进都一致。

**层级缩进是一组按真实 DOM 结构写的选择器，写错时界面只是「没有缩进」，不会报错。**
`test/virtualWorkspaceDom.test.tsx` 因此用真 `react-dom` 渲染一遍，把样式表里
所有带 `wg-virtual-workspace-body` 的规则逐条拿去 `querySelectorAll`，任一规则
一个选择器都不命中就失败。这条测试已经抓到过一次真实缺陷：工作区行挂上悬停
卡片后会被官方 `HoverCard` 的根节点包一层，`> .wg-workspace-head` 那一档因此
不再命中，缩进整段失效——与既有会话行那条同理，必须把 `> * >` 一档也写上。

上面那条缩进选择器的不变量也记在 [折叠体显隐与渲染缓存](reveal-and-caching.md)
的「用测试钉住这些不变量」一节，与折叠体为什么必须 fail-open、行级 memo 要怎样
才能命中（含实测数据）并列。

## 样式对齐

样式取值取自官方侧边栏组件（`dsh-client-ui-sidebar` 与
`dsh-client-ui-workspace` 0.1.5-rc.2）的实际规则，而不是自定数值：

| 项 | 取值 |
| --- | --- |
| 区域右侧整块留白 | `var(--dsh-session-list-edge-inset)`（侧栏里 = 12px，同官方根节点） |
| 区域 section header 高 / 圆角 / 控件间距 | 窄栏 `36px`；宽栏 `auto` / `12px` / `4px`（同官方 `.sectionHeader`，高度因两行标题放开，见「区域头部」） |
| 两行标题（上行「工作区」+ 下行聚焦对象） | 上行 `14px` / `20px` + `label-tertiary`，下行 `12px` / `17px` + `label-secondary`（两个层级的信息）；宽度上限 `45%` 挂在整个标题块上 |
| 标题块（一个按钮） | 命中余量 `padding: 2px 4px`、圆角 `8px`、悬停 `--dsw-alias-interactive-bg-hover` |
| 标题旁的菜单箭头 | `16px`，`--dsw-alias-label-tertiary`；开合时旋转 `180°` |
| 工作区选择器面板 | 底色 `--dsw-specific-menu`、投影 `--dsw-elevation-prominent`、圆角 `20px`、内边距 `4px`、`min-width: 218px` / `max-width: 360px`、高度上限 `calc(100vh - 24px)`、边距 `12px`、缝隙 `4px`、`z-index: 1100`（全部同官方 `.list` / `.submenu` / `.portal` 面板） |
| 选择器条目行 / 分区头 | 条目 `min-height: 34px`、`5px 10px`、圆角 `10px`、14px/22px；分区头 `32px`、`8px 10px`、12px/16px（同官方 `.item` / `.label`） |
| 条目行尾的置顶按钮 | `20px` 方块、`--dsw-alias-label-tertiary`；未置顶时 `opacity: 0` 且关掉指针事件，已置顶常驻可见 |
| header 图标按钮 | `28px` 正圆、`--dsw-alias-label-secondary`、悬停 `-hover`（同官方 `.iconButton`） |
| 窄栏 header 图标按钮 | `36px` 正圆、`--dsw-alias-label-primary`（同官方 `.rail .iconButton`） |
| 搜索框（收起 / 展开） | `28px` 正圆 → `30px` 高、圆角 `10px`、`.5px` 边框 `--dsw-alias-border-l4`（同官方 `.search` / `.searchExpanded`） |
| 搜索槽位宽度 | 收起 `28px`、展开 `100%`（同官方 `.searchSlot` / `.searchSlotExpanded`） |
| 搜索结果行 | `min-height: 48px`、圆角 `8px`、两行（标题 14px/20px + 路径 12px/17px，同官方 `.searchResultRow`） |
| 结果路径的两段色阶 | 工作区 `--dsw-alias-label-secondary`、分组 `--dsw-alias-label-caption`（官方那格只有 tertiary 一档，本包拆成两档做对比） |
| 工作区行、会话分组行与工作区分组行行高 | `34px` |
| 会话行高 | `32px` |
| 行内水平内边距 / 圆角 | `8px` / `8px` |
| 图标列宽 | `16px`（`height: 20px`） |
| 行尾相对时间 | `12px` / `20px`，`--dsw-alias-label-tertiary`（同官方 `.time`） |
| 分组行尾会话数与工作区分组行尾工作区数 | 同上的 `12px` / `20px` 与 `--dsw-alias-label-tertiary`，与行尾时间同格同形 |
| 工作区分组头缩进 | `8px`（根节点；会话分组头是 `24px`，因为它落在工作区内部） |
| 悬停与选中底色 | `--dsw-alias-interactive-bg-hover` |
| 展开且含当前会话的文件夹 | `--dsw-alias-state-business-primary` |
| 文本色阶 | `--dsw-alias-label-primary` / `-secondary` / `-tertiary` |
| 滚动条留白 | `--dsh-session-list-scrollbar-width` / `-offset` |
| 过渡 | `--ds-ease-in-out`，并遵守 `prefers-reduced-motion` |
| 面板级淡入 | `.2s`、同 `--ds-ease-in-out`（同官方 `.treeBody` 的 `wide-in`）；常规列表与搜索结果各挂一份 |

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
取生态内的既有做法（见本文「层级缩进」）。

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

