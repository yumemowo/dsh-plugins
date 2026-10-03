# 置顶会话的实现计划

面向执行这个特性的人。设计说明见[最终设计](design.md)，取舍依据见[设计过程](design-options.md)。

**动手前先读 [`docs/conventions.md`](../conventions.md)**——本包有几条「违反后不报错、只表现为界面不对」的硬约束（改完 `src/` 必须重跑 `pnpm run build`、客户端类型只由 `pnpm run typecheck` 覆盖、验证产物只挑字符串字面量）。

## 目标与边界

在 `sidebar.workspaces` 区域的顶部加一块置顶区，列出全部已置顶会话。**只动本包**：不改官方包、不新造 RPC、置顶读写全部走官方既有接口。

已完成的前置事实（无需再验证）：

- 官方已有置顶能力，属于 `0.2.x` 全系（`0.2.0-rc.1` 与 `rc.2` 都有）：宿主侧 `ctx.workspaceRegistry.pinSession / unpinSession / pinnedSessionIds`，浏览器侧 `ctx.workspaces.pinSession / unpinSession`，快照里 `useWorkspaces(state => state.pinnedSessionIds)`。
- 本包**已经**在用 `useWorkspaces` 读 `items` 与 `archivedSessionIds`，因此 pin 集合在同一次快照里，不需要新增数据面。
- 官方 pin 集合**没有上限参数**，因此「数量上限」只能由本包在 UI 侧实施（见下）。

## 一、宿主侧：两个可调项进 settings

新增 `src/config.ts`，照 `packages/dsh-hello/src/config.ts` 的形态声明 `Config`（schemastery），并在 `src/index.ts` 导出。

| 字段 | 类型 | 默认 | 约束 |
| --- | --- | --- | --- |
| `pinnedVisibleCount` | number | `5` | 至少 `1` |
| `pinnedLimit` | number | `20` | 至少 `1` |

要点：

- 可调项做成 Config 字段，不是自建键值存储。**当前只能改 profile patch，没有设置页表单**（见下）。
- **不要写进 `dsh-storage-domain`**。那个域已经装了分组元数据（`workspace_plus.json`），把可调项混进去会让「改一个数字」触发整份结构记录的版本语义。
- 两个值要经既有的 remote 快照下发到浏览器半边，与 `nested` 同一条路径（`snapshot()` 里带上，`snapshotSchema` 里加格）。

**上限为什么是本包实施**：官方 `pinSession` 没有上限参数，本包无法让宿主拒绝写入。因此上限表现为——达到上限时把置顶按钮置为禁用态并给提示。官方 `ui-workspace` 的置顶入口只渲染在 `sidebar.workspaces` 里，而那个区域由本包接替，因此本包是当前唯一的置顶入口。

**调低上限不取消已有置顶**：上限只拦新增，已置顶的照常显示。

**已确认：改 volatile 字段不重跑 `apply`。** volatile 字段走 Loader 的短路径，新值直接写进
`apply` 已持有的那个引用，因此服务按引用 `.get()` 现读即可，不需要另起 settings namespace。
两个字段因此都标 `.volatile()`。

**为什么没有设置页表单。** 宿主侧是齐的——`describe()` 会把带 volatile 字段的插件列成可配置条目，
`Config` 导出与 `volatile` 元数据都在产物里。但 dsh 不给插件自动生成表单：客户端还得注册一个渲染页
（`plugins.row.config` / `plugins.bundle.config` / `settings.general.item` 之一）。本包目前只注册
`sidebar.workspaces`，因此设置页里看不到这两项。改法见 [design.md 的「宿主侧」一节](design.md#宿主侧插件的-config-字段)。

**若将来补渲染页**，按官方 `dsh-client-ui-settings-web-search` 的形态：`ctx.configForms.get(namespace)`
取表单、经 `ctx.slots.inject('plugins.row.config', …)` 注册，key 为 `<包名>#<行 id>`。

## 二、客户端侧：四项进 client store

全部并入既有的 `src/client/store/viewMode.ts`（插槽的 `store` 座位只接受一个 `StoreDecl`，`persist` 整份序列化，各起一个键会互相覆盖）。键沿用 `dsh.workspace-plus.view.v1`。

新增状态格与对应的归一化函数（照 `modeOf` / `indicatorOf` 的写法：字段可选、缺席回落默认，不升版本号）：

| 状态格 | 取值 | 默认 | 归一化函数 |
| --- | --- | --- | --- |
| `pinOverflow` | `'expand' \| 'scroll'` | `'expand'` | `pinOverflowOf` |
| `pinScope` | `'section' \| 'inline'` | `'section'` | `pinScopeOf` |
| `pinSectionCollapsed` | `boolean` | `false` | 直接读，缺省即 `false` |

命名说明：`pinScope` 的两个取值里，`section` = 仅置顶区域，`inline` = 置顶区域 + 分组内置顶（后者融入方案 ② 的就地置顶）。

对应 actions：`setPinOverflow` / `setPinScope` / `setPinSectionCollapsed`。

**置顶区的收起态是全局的**（不按工作区分别记），因此是裸布尔而不是展开记录。

## 三、数据层：一个纯函数模块

新增 `src/client/data/pinned.ts`，无 React 依赖：

```ts
/** 置顶区里的一行 */
export interface PinnedEntry {
  /** 会话 id */
  id: string
  /** 显示标题；空白会话为空串，由渲染期套语言包 */
  title: string
  blank: boolean
  /** 所属工作区 id，用于悬停卡片与来源提示 */
  workspaceId: string | undefined
  /** 该会话当前是否就是被打开的那一条 */
  current: boolean
}

/**
 * 把 pin 集合投影成置顶区的行
 * @param pinnedSessionIds 官方快照里的置顶集合，最近置顶在最前
 * @param rows 会话快照，用于取标题与可见性
 * @param visible 可见性判据（归档 / 子代理来源要滤掉）
 */
export function pinnedEntries(...): PinnedEntry[]
```

要点：

- **顺序直接用 `pinnedSessionIds` 的顺序**（最近置顶在最前），不要自己再排。
- **必须过滤掉不可见会话**：归档的、子代理来源的。官方 `pinnedSessionIds` 是注册表全局集合，不保证每一个都还在当前可见列表里。判据复用 `data/sessions.ts` 里既有的可见性规则，不要另写一套。
- 全部置顶行都投影出来，**不在这里切片**：`scroll` 档靠超出的行撑出滚动，`expand` 档靠超出的行制造可收回的高度（收回方向的动画要有东西可收）。超出可见条数的那些由渲染层标记，怎么收起来交给样式表。

## 四、渲染层：一个控件，两个模式

新增 `src/client/views/PinnedSection.tsx`，**一个组件**，溢出给法作为 prop。依据：⑤⑥⑦ 三种做法去掉模式标记后 DOM 结构完全相同（实测长度 `5730 / 5735 / 5731`，「去掉模式类与提示后：⑤=⑥ 是，⑥=⑦ 是」），因此是一个控件加一个枚举开关。

组件形状（只列它真正消费的，按本包既有的「按 shape 收窄」做法）：

```ts
interface PinnedSectionProps {
  entries: readonly PinnedEntry[]
  visibleCount: number          // 来自宿主 settings
  overflow: 'expand' | 'scroll' // 来自 client store
  collapsed: boolean            // 来自 client store
  onToggleCollapsed: () => void
  onTogglePin: (sessionId: string) => void
  onOpenSession: (sessionId: string) => void
  canPin: boolean               // 未达上限
}
```

必须守住的九条（每条都有实测，写错任一条表现为「界面看起来只是不对」，不报错）：

1. **常驻在滚动区之外**：挂进 `WorkspaceGroupsRegion` 的 `.pane` 里、与 header 平级，**不要**放进 `.list`。放进去就与方案 ④ 一样会随列表滚走。
2. **无置顶项时整块不渲染**（返回 `null`）：段头、分隔线都不出现，那一段空间完整交还给列表。
3. **触发区是预览行本身，不含段头**。段头只管收起 / 展开。
4. **浮出用绝对定位，不推挤下方**；浮出态**不加内边距、不加描边环**——前 5 行必须逐格不变（纵向、横向、标题位置）。
5. **没有行被裁掉时不接悬停**：全部置顶项都已在静止高度里显示时，浮出只是白闪一下，不是展开。
6. **浮出时那一段的常驻高度不塌**：预览区脱离流之后，段本身必须自己占住「段头 + 预览区 + 分隔」那份高度。否则指针一进入整段就塌成段头一行，下方列表整体上移（实测 `top` 由 `211` 跳到 `43`）。
7. **展开与收回都有过渡，且过渡的是高度本身**：预览区两态都绝对定位，只让 `max-height` 过渡；目标取「全部行叠起来的实高」，不取视口上限——取上限时可见高度在过渡前段就走完（实测 `180ms` 里前 `60ms` 到顶），读起来就是没有动画。为此全部行都留在文档里，静止时超出的那些用 `visibility` 收起。
8. **静止态在 `expand` 模式下不可滚**（`overflow: hidden`）；`scroll` 模式才可滚。
9. **收起后只剩段头一行**，行尾提示改为只报总数。

### 段头

复用容器行的词汇：`16px` 图标列里的箭头 + 「置顶」 + 行尾计数。**不画图钉图标**。
采用的是「区域级标题 + 空白区分」：段头左缘 `8px`（脱离内容缩进链）、字号 `14px`、字重 `600`；
分隔用一段空白，其高度与一条 `1px` 细线加同样的 margin 相同。

行尾提示文案：溢出时 `N 条 · 还有 M 条`（不写「N 条中的 X 条」），色阶用 `label-secondary`。

### 触屏回退

`(hover: none)` 的设备没有悬停，`expand` 模式在那里不可用。用媒体查询把它按 `scroll` 渲染：

```css
@media (hover: none) {
  .pinnedScroll { overflow-y: auto; }
  /* 浮出规则整段不生效 */
}
```

## 五、会话行：图钉位置

改 `src/client/views/SessionRowView.tsx` 与 `rows.module.css`。行尾统一是「时间 → 操作位 → 图钉」：

| 状态 | 排布 |
| --- | --- |
| 已置顶 | 时间（悬停隐去）→ 操作位 → 图钉（常驻可见、占 16px） |
| 未置顶 | 时间（悬停隐去）→ 操作位 → 图钉（与操作位同时出现） |

要点：

- 两种状态的**先后顺序一致**，因此 JSX 里不需要按 `pinned` 分支，`{actionSlot}{pin}` 一条直路写下来。
- 已置顶的图钉常驻可见；未置顶的静止时连宽度一起收成 0（不只是 `opacity: 0`）——不为看不见的状态图标留空位。
- 收宽度要配容器的 `overflow: hidden`：否则 flex 项的自动最小尺寸会被子项 16px 顶回去，`width: 0` 失效。
- 未置顶的图钉排在操作位之后，仍读行自身的 `:hover` / `:focus-within`，三条触发条件与时间 / 操作位两组一一对应。
- 图钉按钮的点击要 `stopPropagation`，否则会连带打开会话。
- 已置顶行在静止 / 悬停两态下图钉位置必须逐格不变。

## 六、交互：打开与取消置顶

两条规则，都写在 `WorkspaceGroupsRegion` 的命令层（那里已持有 `openSession` 与当前聚焦对象）：

**从置顶区打开会话，不切换聚焦工作区。** 置顶区是跨工作区的入口；替用户改聚焦范围会把他正在看的列表换掉。

**取消置顶当前打开的那个会话时**：

1. 还有其它置顶会话 → 打开下一条（按 `pinnedSessionIds` 的顺序取下一条）；
2. 一条不剩 → 把聚焦切回「全部」（`focusEntry(ALL_ENTRIES)`），并**保持当前会话的打开状态**（不导航、不关闭）。

两处都要处理边界：`pinnedSessionIds` 的变化是异步的（走 remote），因此「下一条是谁」要按**取消后**的集合算，不能用取消前的快照去取相邻项。

## 七、显示方式：分组内置顶

`pinScope === 'inline'` 时，除了置顶区，还要让置顶会话在**它自己所在的那一段**里排到最前（方案 ② 的就地置顶）。

- **排序不在 `buildLayout` 里，而在消费点各调一次**：
  - `WorkspaceSection.tsx` 的 `section.sessions` —— 会话分组内的行
  - `WorkspaceSection.tsx` 的 `layout.loose` —— 工作区未归组段的行
  - `WorkspaceGroupsRegion.tsx` 的 `flatRows` —— 平铺列表
  - `RegionListArea.tsx` 的 `props.stray` —— 末尾「未分组」桶（**没有排序，是本计划的漏项**）

  前三处都是 `[...rows].sort(compareSessionRows)`。**因此置顶不能只改一处**——那会让几种视图里只有一种生效，
  且不报错、只表现为「有的地方置顶了、有的没有」。
- 建议的收口方式：把 `compareSessionRows` 的调用换成一个新的比较器（例如 `compareSessionRowsWithPins`），
  在 `src/client/data/sessions.ts` 里定义一次，三处都调它。置顶顺序由调用方传进来，不要在比较器里读全局状态。
- 官方排序是「空白会话最前、其余按最近更新倒序」。置顶要排在**它前面**，即 `置顶 → 空白 → 其余`。
- 第四处与前三处不同：那个桶既有的行为是「保持会话列表原序」（已有用例守着），整段套比较器会连未置顶的行一起重排。
  它只做一次稳定分区（`frontPinnedRows`），把已置顶的按名次提到最前，其余逐格不动。
- 两种 scope 下置顶区的行为完全一致。

## 八、顺序与验收

建议顺序：**一 → 三 → 四 → 五 → 六 → 七**（先有可调项与数据，再出控件，最后接交互与就地置顶）。

每步的验收方式：

| 步骤 | 怎么验 |
| --- | --- |
| 一 宿主 Config 字段 | `dsh --dump-config` 看两个字段；改 profile patch 后快照带上新值（设置页表单未做，见上） |
| 三 数据层 | 纯函数，写单测（见下） |
| 四 控件 | 渲染 + DOM 断言，见下 |
| 五 会话行 | DOM 断言图钉两态位置 |
| 六 交互 | DOM 断言「不切聚焦」与「取消后切下一条」 |
| 七 就地置顶 | DOM 断言段内顺序 |

### 测试

按本包既有形态：用例名小写、以第三人称动词开头的行为描述串（如 `it('keeps the pinned section out of the scrolling list')`），断言 DOM 的用例加 `// @vitest-environment jsdom`。

至少覆盖：

- 无置顶项时整块不渲染（`container.querySelector('.pinnedSection') === null`）；
- 置顶区在滚动区之外（`.pinnedSection.closest('.list') === null`）；
- 溢出时全部行都在文档里、超出可见条数的带裁掉标记；`expand` 模式静止态不可滚；
- 展开与收回两个方向都有 `max-height` 过渡；过渡上限取内容实高，且静止高度与段常驻高度在整个过渡里不变；
- 没有行被裁掉时悬停不展开；有被裁掉的行时才展开；
- 浮出态下段自己仍占着常驻高度（下方内容的位置不变，样式表层面断言 `min-height` 的三项相加）；
- 行尾两态都是「操作位在左、图钉在右」；未置顶的图钉宽度收成 0，不占位；
- 从置顶区打开会话不调用 `focusEntry`；
- 取消置顶当前会话时：有下一条则打开它、没有则 `focusEntry(ALL) ` 且不导航；
- 就地置顶在四种段落里都生效，含末尾「未分组」桶；该桶里未置顶的行仍保持会话列表原序；
- 数据层：归档 / 子代理来源的置顶项被滤掉；顺序跟随 `pinnedSessionIds`。

### 全绿之前的两道闸门

```sh
pnpm run typecheck   # 客户端类型只在这里被检查
pnpm run test
pnpm run build       # 必须重跑，否则 GUI 仍加载旧 lib/client.js
```

`pnpm run build` 之后的产物验证：只挑**字符串字面量**与**对象属性名**，不要 grep 函数名或中文（minify 会改前者、esbuild 会把后者转成 `\uXXXX`）。

## 九、明确不做

- **不做点击展开**（方案 ⑦）：实测交互体验明显更差，见[设计过程](design-options.md#⑦-点击展开被否理由是实际交互体验很差)。
- **不做折叠透出（方案 ⑧）与折叠计数（方案 ⑨）**：前者视觉噪音高于收益，后者没解决「埋得深」。
- **不做置顶区跟随聚焦**：这是一条没讨论过的设计，当前默认显示全部置顶项。理由与后续条件见[最终设计](design.md#未决)。**不要在这个特性里顺手加上它。**
- **不提供置顶排序的手动拖拽**：顺序即官方 `pinnedSessionIds` 的顺序（最近置顶在最前）。
