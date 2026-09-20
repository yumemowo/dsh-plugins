# 客户端集成：cordis 语义与热重载

本文记录浏览器半边与宿主 / 插槽系统打交道的几处坑：cordis 服务代理只放行 `inject` 过的
属性、渲染器对注册项 inject 结果的缓存语义、`ctx.remote.$mount` 的卸载配平，以及开发期
对照模式（`COMPARE_MODE`）的由来与形态。

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

**tab 拿到的那个 context 不是本包的 fiber。** better-sidebar 把 tab 的
`ctx` 交给 `component`，而它上面只 inject 了 better-sidebar 自己声明的服务。
cordis 的服务代理对未 inject 的属性**直接抛错**（`cannot get property "remote"
without inject`），因此区域需要的一切都必须由 `registerCompareTab` 在**本包自己的**
context（那里 `inject` 里有 `remote`）上先解析好，再随 props 传进 tab 体：

| 需要的东西 | 来源 |
| --- | --- |
| 全局 hook（`useSessions` / `useWorkspaces` / …） | tab 体自己用 `ctx.get(...)` 取服务再包成选择器——服务查找走 `get`，它不抛 |
| 宿主 home（悬停卡片的路径缩写） | `registerCompareTab` 在本包 context 上起 `hostInfoSource`，随 props 传入 |
| 文案座位 `t` | tab 体自己 `locale.bind(NS)` |

只有 `ctx.get()` 与已 inject 的属性是安全的；`ctx.remote` 这类属性读取在 tab 体里
一律会炸。`test/compareDom.test.tsx` 按 cordis 的代理语义造了一个会抛错的 tab
context 并把组件渲染一遍，专门守这条边界——只调 `registerCompareTab` 的测试看不到
它，因为异常要等 tab 真的挂上才发生。

必须分清「缓存的是函数还是文案表」：渲染器会缓存 inject 结果整个注册周期，
因此**投影后的文案表**不能放进 inject（会冻结在首次渲染那一刻），而
`locale.bind` 返回的**翻译函数**可以——它调用时才读当前语言。因此
`regionLabels(t, tWorkspace, tSidebar)` 在组件渲染期现算：`t` 走插槽座位，
`tWorkspace` 与 `tSidebar` 随 inject 传入。

**改了宿主半边要重启 `dsh`。** `dsh-client-hmr` 只推客户端 bundle；宿主那半
（`lib/index.js`）由 `dsh` 启动时加载，改它必须重启进程才生效。两端因此可能短暂
不同步——浏览器半边已经是新版本，宿主还在回旧形状的快照。客户端的
`normalizeSnapshot` 会补齐缺格，界面退化成「没有工作区分组」而不是抛错崩掉
（缺格不补会在遍历时抛 `groups is not iterable`，对照模式下还会连带把承载它的
右侧栏一起打挂）。

宿主侧 `dsh-client-hmr` 会轮询客户端 bundle 的 mtime，内容变了就推一帧
`rebuilt`，浏览器半边据此把本插件卸载再重载，因此**通常不必手动刷新**。
本包为此必须让挂载期的资源与 fiber 严格成对：`ctx.remote.$mount` 的卸载函数
要自己保管并在卸载时调用（见 `src/client/index.ts` 的挂载 effect）。丢掉它的话
第二次挂载会撞上「方法已挂载」，分组读不出、写操作全抛错——热重载后表现成
「插件整体失效」，只能靠刷新页面恢复。

