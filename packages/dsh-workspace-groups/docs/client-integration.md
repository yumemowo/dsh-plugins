# 客户端集成

浏览器半边与宿主、插槽系统打交道的几处坑：cordis 服务代理只放行 `inject` 过的属性、渲染器对注册项 inject 结果的缓存语义、`ctx.remote.$mount` 的卸载配平，以及开发期对照模式（`COMPARE_MODE`）的由来与形态。

## 对照模式

官方 `ui-workspace` 只导出 `apply`，`WorkspaceBrowser` 并未导出，因此无法在别处复现官方渲染。想和官方同屏比对，只能反过来：把左侧交还官方，本区域改挂到右侧栏。

`src/client/index.ts` 里的编译期常量 `COMPARE_MODE` 控制两种形态：

| 取值 | 形态 |
| --- | --- |
| `true` | 左侧 `sidebar.workspaces` 归官方 ui-workspace；本区域注册成 DSH 原生右侧栏的一个 tab（`workspace-groups`），左右并排 |
| `false` | 本包以 `priority: -1` 接替左侧区域（产品形态） |

之所以是编译期常量而不是配置项：这是开发期的对照开关，不是要交付给用户的能力，配置化还要多一套 schema 与文档。改完重新 `pnpm run build` 并刷新页面即可。

对照 tab 走**官方原生右侧栏**（`dsh-client-ui-sidebar-right`）的两段式注册，与官方 `ui-sidebar-files` / `ui-sidebar-documentpreview` 同一条路径：

| 阶段 | 座位 | 内容 |
| --- | --- | --- |
| 一 | `ctx.sidebarRightTabs.register` | tab 类型：`id` / `kind` / `priority` / `title` / 引导页条目 |
| 二 | `sidebar.right.pane.tab`（按键控） | tab 体组件，键就是阶段一的 `id` |

0.1.7-rc.1 之前这两级由第三方 `dsh-better-sidebar` 代转；那一版起右侧栏是官方能力，本包因此不再依赖 `better-sidebar`，`sidebarRightTabs` 缺失时静默跳过，宿主半边与存储不受影响。

## 插槽的 context 不是本包的 fiber

无论挂进原生右侧栏还是接替左侧区域，组件读服务的方式都受同一条约束：cordis 的服务代理只放行本 fiber `inject` 过的属性，其余一律抛错（`cannot get property "remote" without inject`）。

因此区域需要的一切都由 `registerCompareTab` 在本包自己的 context（那里 `inject` 里有 `remote`）上先解析好，再随 inject 面交给 tab 体：

| 需要的东西 | 来源 |
| --- | --- |
| 全局 hook（`useSessions` / `useSessionStatus` / `useWorkspaces`） | 渲染器按插槽声明注入的标准座位 |
| 宿主 home（悬停卡片的路径缩写） | `registerCompareTab` 在本包 context 上起 `hostInfoSource`，放进 inject 面的 `hooks` 隔间 |
| directoryFlow 洞的占用情况 | 同上，`directoryFlowSource` |
| 文案座位 `t` | 插槽声明里的 `locale: NS`，渲染器在渲染期绑定 |

只有 `ctx.get()` 与已 inject 的属性是安全的；`ctx.remote` 这类属性读取在 tab 体里一律会炸。`test/compareDom.test.tsx` 按 cordis 的代理语义把 tab 体渲染一遍，专门守这条边界——只调 `registerCompareTab` 的测试看不到它，因为异常要等 tab 真的挂上才发生。

必须分清「缓存的是函数还是文案表」：渲染器会缓存 inject 结果整个注册周期，因此**投影后的文案表**不能放进 inject（会冻结在首次渲染那一刻），而 `locale.bind` 返回的**翻译函数**可以——它调用时才读当前语言。因此 `regionLabels(t, tWorkspace, tSidebar)` 在组件渲染期现算：`t` 走插槽座位，`tWorkspace` 与 `tSidebar` 随 inject 传入。

## 热重载与两端不同步

改了宿主半边要重启 `dsh`。`dsh-client-hmr` 只推客户端 bundle；宿主那半（`lib/index.js`）由 `dsh` 启动时加载，改它必须重启进程才生效。两端因此可能短暂不同步——浏览器半边已经是新版本，宿主还在回旧形状的快照。客户端的 `normalizeSnapshot` 会补齐缺格，界面退化成「没有工作区分组」而不是抛错崩掉（缺格不补会在遍历时抛 `groups is not iterable`，对照模式下还会连带把承载它的右侧栏一起打挂）。

宿主侧 `dsh-client-hmr` 会轮询客户端 bundle 的 mtime，内容变了就推一帧 `rebuilt`，浏览器半边据此把本插件卸载再重载，因此通常不必手动刷新。本包为此必须让挂载期的资源与 fiber 严格成对：`ctx.remote.$mount` 的卸载函数要自己保管并在卸载时调用（见 `src/client/index.ts` 的挂载 effect）。丢掉它的话第二次挂载会撞上「方法已挂载」，分组读不出、写操作全抛错——热重载后表现成「插件整体失效」，只能靠刷新页面恢复。

## 数据面重拉

分组元数据不在插槽快照里，得由本包自己去宿主拉。这条链上有两个失败窗口，缺任何一个都会让界面停在空快照上：

| 窗口 | 现象 | 兜法 |
| --- | --- | --- |
| 区域挂载早于本包 remote 命名空间挂载完成 | `requireApi` 当场抛错 | 挂载完成时广播一次重拉 |
| 连接尚未建立（页面刚打开、或 `dsh web` 重启后的重连） | 调用到传输层才失败 | 订阅官方 `connection/reset` |

`connection/reset` 是官方给这件事的信号（`dsh-client-connection` 的文档原话是 wire-derived caches must repull），网关在每次连接建立时发出，重连也算。

**订阅必须留在册上，不能回调一次就注销。** 失败可能连续发生若干个连接周期，而每一次失败之后没有别的东西会重试；一次性的回调只兜住第一个窗口，第二个窗口会一直停在空快照上，直到某次写操作回带整份快照才恢复——表现成「新建一个分组之后，之前的分组才显示出来」。用户看到的正是这个形状。

区域那侧的 `catch` 也刻意保持静默降级（会话仍按未归组平铺，界面可用），因此这条链出问题时**控制台没有报错**，只能从「分组不见了、但列表还在」这个现象反推。

`test/clientLifecycle.test.ts` 守住重试入口本身：订阅后必须还能被再次通知、反注册后不再通知、挂载晚于订阅时补发一次。这三条在旧实现（订阅时已就绪就直接回调并返回空反注册函数）上会失败。

## Remote codec 的契约

分组元数据经 typert 网关传输：宿主 `./typert` 清单声明方法，浏览器半边用 `ctx.remote.$mount` 挂载自己需要的命名空间。两侧的 codec 必须是同一形状：

```ts
{ mode: 'strict', typeSymbol: '<包名>#<类型名>', create: () => ZodType }
```

**`create` 是惰性工厂，不是裸 schema。** 0.1.7-rc.1 起注册表只认 `create()`，并且会缓存首次物化结果（见 `dsh-typert-registry` 的 `materializeSchema`），因此同一个 codec 重复调用必须返回同一实例。

这条契约写错的代价不对称，值得单独记一笔：清单校验失败发生在宿主半边，症状却是浏览器那边**全静默**——

| 环节 | 表现 |
| --- | --- |
| `typert-loader` 校验清单 | 抛错，但只记进启动诊断日志 |
| 网关注册 endpoint | 跳过，`/api/workspaceGroups/list` 返回 404 |
| 浏览器 `loadGroups()` | 抛错 |
| 区域 | 被 `reload` 的 `catch` 接住，退化成「全部分组消失」，会话仍按未归组平铺，界面看起来完全可用 |

因此存储里有数据、区域也渲染出来了，就是不见分组，且**控制台一条报错都没有**。排查要从宿主侧入手：`dsh --dump-config` 看行是否组合、直接打 `/api/<namespace>/list` 看 endpoint 是否注册（对比一个官方 endpoint），而不是盯着浏览器。

`test/bundle.test.ts` 固化这条契约：断言清单里每个 codec 都有 `create()`、没有残留的 `schema` 字段、且 `create()` 幂等返回同一个可用的 zod 实例。

## 图标名与运行期解析

客户端 bundle 把 `@deepseek-ai/dsh-client-ui-primitives` 标成 external，运行期由宿主从基线模块表解析。因此**图标名必须与宿主那一版的导出表逐字对上**：拼错一个，解析结果是 `undefined`，React 渲染到它时整棵挂载失败，而 tsc 因为 ambient 声明（`src/client/primitives-env.d.ts`）是自己写的，照样放行。

dsh 0.1.7-rc.1 把图标名从「字形 + 尺寸」改成了「字形 + 线宽变体」（`IconPlusOutline16` → `IconPlusOutlineRegular`），本包的全部图标引用随之更新。`test/bundle.test.ts` 直接读构建产物断言这一批老名字一个都不剩——单测 import 源码看不见这一层，只有产物才是宿主真正加载的东西。

## 基线模块与 node 测试替身

产物里能出现的 `require` 只有基线模块。本包用的是这几个：

| external | 用途 |
| --- | --- |
| `react` / `react-dom` / `react/jsx-runtime` / `react-dom/client` | 组件与 portal |
| `@deepseek-ai/dsh-client-ui-primitives` | 图标与官方控件原语 |
| `@deepseek-ai/dsh-client-store` | 展示方式、指示器与三层折叠态的状态与持久化（`defineStore`） |

**后两个在 node 测试环境里取不到真包**：primitives 只存在于客户端的基线静态模块表，client-store 的引擎则依赖未随本仓库安装的 `zustand` / `immer`（顶层 `import 'zustand/vanilla'` 会直接 `ERR_MODULE_NOT_FOUND`）。因此 `vitest.config.ts` 给这两个各配了一个 `resolve.alias` 替身（`test/primitives-stub.mjs` / `test/store-stub.mjs`），替身只实现测试用到的那部分契约。

这条替身链有两个盲区，都由 `test/bundle.test.ts` 补上：单测 import 的是替身，看不到真包的导出表（图标名拼错、`defineStore` 的 `create()` 契约不符都测不出）；而它按宿主的方式装载产物、并为每个 external 单独交出模块，因此能断言产物只 require 基线模块、且图标名与新版导出表逐字对得上。
