# 置顶会话的实现记录

[实现计划](implementation-plan.md)是动手前的规格，落地时有一批地方按实测与官方约定改了做法。
这份文档只记**与计划正文不一致的地方**以及为什么，规格本身不在这里复述。

## 一、两个可调项写成 `.volatile()` 字段，不是普通字段

计划「宿主侧」一节说照 `dsh-hello/src/config.ts` 的形态声明 `Config`，并留了两条路由（直接读 config，或另起一个 settings namespace）。
两条都不合用，真正的原因是第三条：**dsh 的设置页只暴露 volatile 字段。**

`dsh-settings` 的 `describe()` 里是 `if (form === void 0) return []`，`form` 由 `volatileForm(schema)` 得到——
schema 里一个 volatile 字段都没有时，这个插件整条不出现在设置页；`write()` 开头还会直接抛 `has no volatile fields`，
普通字段写都写不进去。官方可编辑设置的插件都照这个约定写：`dsh-client-ui-settings-general` 的
`welcomeNoticeVersion` 与 `dsh-client-ui-chat` 的三个可选项都带 `.volatile()`。

顺带答了计划要求先确认的那件事：**普通字段改动会重跑 `apply`**（`Fiber.update` 走 `_setEpoch(INACTIVE)` + `_refresh()`），
而 volatile 字段改动走 Loader 的 `_commitVolatile` 短路径，只把新值写进已持有的引用、不重启插件。
两个可调项因此既不重建本包的服务，也不需要第二条路由那一整套。

判据都可以当场核对：`Fiber.update` 在 `@deepseek-ai/cordis` 的 `lib/index.js`，
`_commitVolatile` 在 `@deepseek-ai/cordis-plugin-loader` 的 `lib/index.js`，
上面两条 settings 判据在 `dsh-settings` 的 `lib/index.js`。
量法是在一个最小插件上各改一次字段值、数 `apply` 被调了几次。

`apply` 收到的是引用而不是值，快照每次下发时现场 `.get()`。客户端订阅
`settings/document-updated`（本包命名空间）后重拉一次快照，改了设置当场生效，不必重连或刷新。

## 二、段头按设计采用的那一档，而不是计划正文的措辞

计划「渲染层」一节把段头写成「复用容器行的词汇：16px 图标列里的箭头 + 「置顶」 + 行尾计数」，
而[设计过程](design-options.md#置顶区与工作区的层级区分)明确**采用 ⑤（区域级标题 + 空白区分）**，
理由是段头与容器行同形时读起来像「又一个分组」。

实测对照稿 ⑤：段头 `30px`、左缘 `8px`（脱离内容缩进链）、字号 `14px` / 字重 `600`，
分隔是**透明**的 `1px` 线 + `6px` 上下 margin。按实测实现。
箭头仍在名字之前（⑤ 那一档把它移到名字之后，本包按计划正文保留在前）。

计划「元素」与「溢出与展开」两节的高度对不上：一处写「段头 `26px` + 5 条 `168px` = `194px`」，
另一处写「整块常驻 `211px`」（`26 + 168 + 13 = 207`）。实测是 `30 + 168 + 13 = 211`，
`26px` 是未采用的那一档的段头高。

量法：[对照稿](pinning-mockups.html)的 `#measure` 块就是实测结果，用
`chromium --headless --dump-dom` 取出即可核对（命令见[对照稿怎么用](README.md#对照稿怎么用)）；
置顶区那几档的区分方式由页面顶部的「置顶区区分」下拉切到 ⑤。

## 三、`scroll` 档要把全部行放进 DOM

计划「溢出与展开」一节说溢出时只渲染 `visibleCount` 条。这条只对 `expand` 档成立：它靠绝对定位把被裁掉的部分露出来。

`scroll` 档相反——区内滚动靠的正是超出裁剪高度的那些行，只渲染前 N 条的话内容永远撑不满，滚动条无从出现。
实测对照稿 `capped` 列：`clientHeight=168`、`scrollHeight=224`，DOM 里是全部 7 行。
因此 `scroll` 档渲染全部，`expand` 档静止时只渲染前 N 条；两个档位的常驻高度仍然完全相同，切换不改变布局。

## 四、就地置顶有四个消费点，不是三个

计划「显示方式」一节列出三个排序消费点，并提醒「置顶不能只改一处」。实际上渲染出来的段有四段，
末尾那个「未分组」桶（不属于任何工作区的会话）是第四个，而它**从来没有排过序**——
它在 `RegionListArea` 里是 `props.stray.map(...)`，直接按 `straySessions` 的收集顺序渲染。

只改计划点名的三处，`inline` 档下这个桶里的置顶会话不会前置。实测（一次渲染，两段各含一条已置顶会话）：

| 段 | 结果 |
| --- | --- |
| 工作区的未归组段 | 置顶那条排最前 |
| 末尾「未分组」桶 | 置顶那条仍在原位 |

这个桶**不套用**工作区那三段用的比较器：它既有的行为是「保持会话列表原序」，而那一条是已测的不变量。
整段重排会连未置顶的行一起改动。它走 `frontPinnedRows`，只把已置顶的按名次提到最前，其余逐格不动。

两者的差别是可区分的：列表序 `u1,u2,u3`、时间倒序 `u3,u2,u1`，置顶 `u2` 时
`frontPinnedRows` 给出 `u2,u1,u3`，而整段套比较器会给出 `u2,u3,u1`。

## 五、悬停展开：闸门用属性下发，浮出交给 `:hover` 与行上的面板标记

计划把「指针移到预览行上时整块浮出」写成无条件行为。全部置顶项都已在静止高度里显示时，
浮出只是把一个等高的盒子重新定位一遍：指针进入的瞬间换掉定位与底色，读起来是一次没有反馈的闪动。
因此加一道闸门（`canExpand = overflow === 'expand' && overflowing`），两种溢出给法的布局仍然完全相同。

闸门最初写成组件里的一个布尔（`hoverOpen`），由 `onPointerEnter` / `onPointerLeave` 维护。
那条路有一个静默失效的模式：两个回调按「能不能浮出」条件挂载，于是不能浮出的那一段里
`onPointerLeave` 也被摘掉，指针离开不会有回报，布尔会一直留在 `true`。
此后只要行再被裁掉（多置顶一条）或整块再展开，挂着的旧值就把整块直接顶开——
看起来是「什么都没做它自己展开了」。补一个「不能浮出时清掉」的 effect 能压住，
但那只是枚举失效点，漏一个入口就复发。

现在改成两条来源都由样式表判定，组件里不留悬停状态：

```css
@media (hover: hover) {
  .pinExpand[data-wg-expandable] .pinScroll:hover,
  .pinExpand[data-wg-expandable]:has(.pinScroll [data-wg-panel-open]) .pinScroll { … }
}
```

- 指针那条交给 `:hover`：浏览器按命中测试现算，元素被摘掉、被撑大、指针移开都会如实重算，陈旧值在结构上不存在。
  闸门因此不再用「挂不挂回调」表达，而是 `data-wg-expandable` 一个属性。
- 面板那条从行上反向读：行内 `...` 菜单与右键菜单都 portal 到 body，指针移上去时预览区已不在命中链里，
  `:hover` 当场为假。行按自己的开合状态下发 `data-wg-panel-open`，段用 `:has()` 读它——
  真值只有行上那一处，不会与面板实际开合漂移。这与 `rows.module.css` 里
  `.row:has(.rowAction[aria-expanded='true'])` 是同一套手法。
- 整条规则包在 `(hover: hover)` 里：没有悬停能力时它一条都不该生效。
  不包的话，触屏回退那一档就得把这批选择器再抄一份去压它（`.pinExpand .pinScroll` 的特异度只有 2，
  压不过带 `[data-wg-expandable]` 与 `:hover` 的那两条），而抄出来的那一份会把闸门属性写进
  `(hover: none)` 块里——读起来像「这个属性在触屏档也有意义」，实际它只属于 expand 溢出这一档。

闸门属性只由 `overflow === 'expand' && overflowing` 下发，因此 scroll 模式与「没有行被裁掉」两档都不带它，
样式里那几条规则对它们自然不生效，每条规则不必自己再重复一遍那两个条件。

实测（真实 Chromium，注入产物里那份编译后的样式表；复现脚本见下）：

| 状态 | `max-height` | 被裁行可见性 | 段高 |
| --- | --- | --- | --- |
| 静止 | 168px | hidden | 211 |
| 指针在预览行上 | **236px** | visible | 211 |
| 指针离开 | 168px | hidden | 211 |
| 面板开着、指针在段外 | **236px** | visible | 211 |
| 面板关闭 | 168px | hidden | 211 |
| 闸门关闭 + 指针在预览行上 | 168px | visible | 211 |

（`236px` 是 7 条叠起来的实高，`168px` 是静止 5 条的高度，两者都由组件按可见条数下发。）

这张表由 `scripts/probes/pin-hover.mjs` 复现：它读产物、现造一个只含 7 条假会话的最小页面、
用 CDP 移动指针并读 `getComputedStyle`，页面内容与宿主数据无关。
headless 默认报 `(hover: none)`，而浮出规则整条包在 `(hover: hover)` 里，
因此启动浏览器要带 `--blink-settings=primaryHoverType=2,availableHoverTypes=2,…` 把它当成有指针的设备
（完整命令见 `docs/conventions.md`）。

jsdom 不算版式、也不算 `:hover`，因此几何只能在真实浏览器里量。
仓库里守它的是 `test/styles.test.ts` 的 `reserves the resting height on the section itself`：
它断言浮出那几个属性只在带闸门的那条 `:hover` / `:has` 规则上声明一次，
以及被裁行同时有 hidden 与 visible 两条可见性规则。

## 六、浮出时那一段的常驻高度由段自己撑住

预览区浮出时是绝对定位、脱离了流。原先只有静止态那条规则给高度（当时的 `.pinScroll:not(.pinScrollOpen)`，
现在同一条判据写在 `.pinScroll:not(:hover)` 上），
于是指针一进入，整段从 `211px` 塌成段头那 `43px`，下方工作区列表整体上移 `168px`——
那不是展开，是抽走一块。

改成在段本身（`.pinExpand`）上常驻住 `段头 + 预览区 + 分隔` 三项之和，三项都是 CSS 变量、由组件按可见条数下发。
实测（真实 Chromium，注入真实样式表）：

| 状态 | 修复前下方内容 `top` | 修复后 |
| --- | --- | --- |
| 静止 | 211 | 211 |
| 浮出 | **43** | **211** |

这条不变量由样式表用例守着（`test/styles.test.ts` 里那条 `reserves the resting height on the section itself`）：
它断言段上的 `min-height` 是三项变量相加、浮出层是 `position: absolute` 且落点取段头正下方。
jsdom 不算版式，因此几何本身只能在真实浏览器里量；用例守住的是「那几条声明没有被人删掉或改写」。

## 七、行尾图钉：顺序统一，未置顶不占位

计划把行尾写成「已置顶：时间 → 操作位 → 图钉；未置顶：时间 → 图钉 → 操作位」，按 `pinned` 分两种排布。
这与「不为看不见的状态图标留空位」冲突：未置顶的图钉要排在操作位之前，就只能靠固定的 16px 宽度占着位，
否则操作位会在悬停瞬间左移。

改成两态**顺序一致**（时间 → 操作位 → 图钉），JSX 因此不需要按 `pinned` 分支。未置顶的图钉静止时连宽度一起收成 `0`
（不只是 `opacity: 0`），悬停 / 键盘聚焦时与操作位同时展开。

宽度收起要配容器的 `overflow: hidden`：flex 项的自动最小尺寸只在 `overflow` 非 `visible` 时才为 `0`，
否则子项那 16px 会把 `width: 0` 顶回去——这条与操作位槽 `.rowActionSlot` 是同一个坑。
顺序两态一致与宽度两态收放，分别由 `test/pinnedDom.test.tsx` 的 `keeps the action slot left of the pin on every row`
与 `test/styles.test.ts` 的 `collapses the unpinned pin instead of reserving a slot for it` 守着。

## 八、浮出要有动画：过渡目标、定位、以及行的留存

计划没规定浮出的动效，第一版实现因此是硬切换，读起来是「展开缺少动画」。三个原因，逐个量过：

**一、过渡目标取错了。** 上限写的是 `min(60vh, 640px)`，那是**视口**上限；内容只有 236px 时可见高度在前 1/3 就走完，剩下 120ms 只是看不见的 `max-height` 在涨。改成取「全部行叠起来的实高」（`--wg-pin-full`），视口上限退为第三项防呆：

| 时刻 | 目标=视口上限 | 目标=内容实高 |
| --- | --- | --- |
| 0ms | 168 | 168 |
| 30ms | 216 | 179 |
| 60ms | 224（已到顶） | 191 |
| 180ms | 224 | 224 |

**二、定位在静止↔浮出之间硬切换。** 原先是静止 `static` / 浮出 `absolute`，而 `position` 不可过渡，整块是瞬移的。改成 `expand` 档**两态都绝对定位**。

这里踩到一个反向的坑：只把定位写进浮出态那一条规则时，**展开方向**好了，**收回方向**却坏了——摘掉那条规则，面板就回到流里，段当场从 `211px` 涨到 `279px`、下方列表跟着下移。两态同一定位才两个方向都对。

顺带一条：`overflow-y: auto` 必须写在带 `.pinExpand` 前缀的选择器上（当时是 `.pinExpand .pinScrollOpen`）。
常驻那条 `overflow: hidden` 是 (0,2,0)，单个类规则是 (0,1,0)，不加前缀抬优先级的话浮出态永远滚不动。

**三、收回方向要有东西可收。** 计划原先写「溢出时只渲染 `visibleCount` 条」，那样指针移开时第 6 条直接消失、没有可过渡的内容。改成全部行都留在文档里，静止时超出的那些打 `data-wg-clipped`，由样式表用 `visibility` 收起、并延后到收回结束才生效（否则收回途中就已经 Tab 不到）。

这与本包既有的 fail-open 约定一致：展开态**不写**任何可见性规则，可见性是自然状态，过渡没跑或被降频时行只是「没淡入」，不会永远不可见。

节奏参数取撑开体同一份（`expandMotionVars(DEFAULT_EXPAND_MOTION)`）：置顶区不在任何撑开体之内，变量缺了样式表会落到自己的回退值上，两边从此可以悄悄分叉；样式表按本包约定只消费 `var(--wg-expand-*)`、不写回退值。

顺带修掉一个既有缺陷：浮出态出现滚动条时，前 5 行会被**横向挤左 8px**（`pinR` 472→464），违反「横向逐格不变」。做法沿用 `.list` 已有的 `scrollbar-gutter: stable`。

## 九、对照稿向实现对齐

对照稿是文档里数字的来源，但它一直停在**设计阶段**的取值上，与落地实现有九处不一致。
这些不一致会让「照对照稿核对实现」这件事失效，因此逐项改成实现的值：

| 项 | 对照稿原先 | 实现 |
| --- | --- | --- |
| 段头箭头 | 名字**之后**（靠 flex `order` 重排） | 名字**之前** |
| 段头箭头尺寸 | `12px` | 槽 `16px`、字形 `14px`（官方默认） |
| 行尾提示 | `11px` | `12px` / `400` |
| 行距 | 无（行步进 `32px`） | `2px`（行步进 `34px`） |
| 图钉按钮 | `18 × 18` | `16 × 16` |
| 图钉字形 | 自绘 `PIN` | 官方 `IconPinOutlineRegular` / `IconPinFillRegular` |
| 图钉配色 | `--st-ongoing`（蓝） | `label-caption` |
| 未置顶图钉 | 恒占 `18px`（`opacity: 0`） | 连宽度收成 `0` |
| 行尾顺序 | 未置顶时图钉在操作位**之前** | 两态一律「操作位 → 图钉」 |

另外修掉三处对照稿自身的毛病：

一是**段高与浮出落点写死了 `26px`**。段头高有两档（基础档 `26px`、区域级标题档 `30px`），
而那两条规则只按基础档写死，切到实现采纳的区域级标题档时，段高少 `4px`、浮出面板还会压住段头 `4px`。
改成读 `--wg-pin-head` 变量后两档都对。

二是**默认档停在 `plain`**（属于「同容器行词汇」那一档，早被否掉），打开页面看到的不是采纳的方案。
默认改到「区域级标题 + 空白区分」。

三是**页面正文还写着「六个方案 / 六列」**，而列数早已扩到九个（⑦⑧⑨ 是只作对照的三档），
正文的表格也还是旧编号。一并改成九个。

行距那条不只是数值差：对照稿漏了 `2px` 行距，5 条只占 `160px`，
于是量出「第 6 条露出 `8px`」这个不存在的现象，而设计文档里有一节三选一（A/B/C）正是照它做的判断。
补上行距后第 5 条底缘正好压在裁剪线上、第 6 条露出 `0`，与实现一致（实现里超出的行是 `visibility: hidden`）。
`design-options.md` 那一节因此标为「前提已不成立」，而不是删掉——它记录的是当时的判断依据。

## 与计划一致的取舍

- 置顶的读写全部走官方既有接口（`ctx.workspaces.pinSession` / `unpinSession`、`useWorkspaces` 的 `pinnedSessionIds`），不新造 RPC、不改官方包。
- 图钉图标与配色取官方：`IconPinFillRegular` / `IconPinOutlineRegular`，颜色用官方那次置顶标记的同一档色阶（`--dsw-alias-label-caption`）。不自绘图钉，也不用状态色。
- 上限只拦新增：达到上限时未置顶行的图钉转禁用态，已置顶的照常可以取消。
- 不做点击展开、折叠透出、折叠计数、跟随聚焦，也不提供手动拖拽排序。
