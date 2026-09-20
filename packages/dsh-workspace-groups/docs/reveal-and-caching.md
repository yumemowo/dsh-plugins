# 折叠体显隐与渲染缓存

这份文档记录两处改动的设计理由：**折叠体元素的显隐为什么必须 fail-open**，以及**行级
memo 要怎样才能真正命中**。前者修的是流式输出时界面变白且点不动，后者修的是同一场景下
主线程被长任务整段占住。

两处都改在 `packages/dsh-workspace-groups`，但结论不针对本包：任何「展开后逐元素淡入」
与「长列表跟随高频更新重渲染」的组合都会遇到同样的问题。

## 一、两个症状与各自的根因

| 症状 | 根因 | 结论 |
| --- | --- | --- |
| 流式输出时插件区域一片白，点不动 | 显隐是 fail-closed 的：`opacity: 0` 是静止态，要靠 JS 在正确时刻把类补回去 | 不透明必须是元素的自然状态，透明只挂在结构条件上 |
| 每次流式活动都卡顿上百毫秒 | 行级 memo 从未命中：每个 prop 每次渲染都是新身份 | memo 的前提是身份稳定，否则加 `memo` 等于没加 |

两者有关联但不是同一个问题：变白的直接原因是显隐设计（见第二节），卡顿的直接原因是
渲染层逐行重算（见第三节）。只是卡顿制造的长任务恰好会去挤占显隐所依赖的那次唤醒，
因此改掉卡顿能降低变白的概率——但**真正修掉变白的是显隐的反转**，只做性能优化是不够的。
两处都得改。

### 实测依据

先说清楚测量口径：以下数字来自 jsdom + `react-dom` 的渲染基准，不是在真实浏览器里量的。
它能回答「成本随行数怎么增长、memo 有没有命中」，但绝对毫秒数不能直接外推到真机。

这些基准脚本是本轮排查时随手写的一次性探针，放在仓库根下被 gitignore 的 `.tmp/` 里，
**没有随提交保留**。要复现的话，重新写一个同等规模的探针即可：造 N 行会话、每轮只替换
其中一条摘要对象（其余保持同一引用），用 `React.Profiler` 或计数插桩观察实际渲染次数。
真机验证则需要在 DevTools Console 里采集 Event Timing 的输入延迟与长任务（同样是一次性
探针）。

| 800 行时单次流式更新的耗时 | 数值 |
| --- | --- |
| 改之前（区域重渲染） | 中位 **138 ms** |
| 改之后（区域重渲染） | 中位 **63–78 ms** |
| 纯 DOM 对照（无 React 组件层） | 33 ms |
| React 自身比对 800 个未变子元素的下限 | 17 ms |
| 数据层（投影 + 分组 + 归组查找） | 0.81 ms |

数据层只占 0.81 ms，说明瓶颈完全在渲染层。剩余的时间落在 React 遍历元素树本身，这也是
为什么改后仍有 60 ms 量级——**这部分不是本包能消掉的**，除非改走虚拟化。

改之前，一次活动会让 **800/800** 行的函数体执行一遍；改之后稳态下只有**内容真正变化的
那一行**会重渲染——单个会话持续流式时实测 **1/800**。

相对时间也会让它多一次重渲染：文案跨过分钟边界时内容确实变了，就该重画。这不是浪费，
而是第三节末尾「推导必须留在父层」那条回退所保住的正确性。

## 二、样式编写的逻辑：显隐必须 fail-open

### 反例：把「静止即透明」写进基准规则

改之前的机制是：

```css
/* 基准规则——这就是问题所在：静止态就是透明 */
.wg-collapse-clip [data-wg-stagger] {
  opacity: 0;
  transition: opacity var(--wg-collapse-fade, 200ms) var(--wg-collapse-easing, ease-in-out);
}
/* 必须由 JS 在正确时刻挂上 .wg-reveal，元素才会亮 */
.wg-collapse-clip [data-wg-stagger].wg-reveal {
  opacity: 1;
  transition-delay: var(--wg-collapse-delay, 0ms);
}
```

点亮条件不止「展开了」一条，还要等容器撑开跑完（旧代码里的 `settled`）。而这个 `settled`
只能来自一个 `transitionend` 事件或一个兜底定时器——前者挂在**非合成属性**
`grid-template-rows` 上，后者按 `lead < 1 ? duration × lead : duration + FALLBACK_SLACK_MS`
算出来（默认参数下是 90 ms；只有一个元素会露面时 `lead` 认作 1，于是 180 + 60 = 240 ms），
无论哪一支都依赖主线程按时醒来。流式输出制造长任务时，两者都很容易被挤掉，而且**补不回来**：
那次唤醒是唯一的机会。

于是元素停在 `opacity: 0`，界面一片白。

这里的关键不是「事件不可靠」，而是**失败方向错了**：显隐依赖一次性的回调，回调丢失就永久
停在不可见状态。这类设计无论把兜底做得多厚，都只是在降低概率。

### 现在的写法：不透明是自然状态

```css
/* 只声明过渡，不声明 opacity——元素的自然状态就是不透明 */
.wg-collapse-clip [data-wg-stagger] {
  transition: opacity var(--wg-collapse-fade, 200ms) var(--wg-collapse-easing, ease-in-out);
  transition-delay: var(--wg-collapse-delay, 0ms);
}

/* 透明只挂在这一个结构条件上 */
.wg-collapse:not(.wg-collapse-open) > .wg-collapse-clip [data-wg-stagger] {
  opacity: 0;
  transition-delay: 0ms;
}
```

三条性质值得点出来：

1. **展开态没有任何规则写 `opacity`**。过渡没跑、标签页被降频、主线程被长任务占住，
   最坏结果都只是「没淡入」——元素直接可见，绝不会留在透明上。失败方向反过来了。
2. **不依赖任何一次回调醒来**。显隐由选择器在每次样式计算时重新求值，没有「过期状态」
   这个概念。
3. **仍然是纯 CSS 判定的**。JS 只写延迟，不写显隐。

### 为什么用结构选择器，而不是 context + 类名

改之前用 `RevealContext` 把「本子树此刻能不能亮」传到元素，元素用 `useStaggerReveal()` 取
一段类名后缀拼进自己的 `className`。这么做是被 `className` 的归属问题逼出来的：`className`
归 React 所有，行内状态一变（例如点开 row action 菜单）React 会整体重写它，命令式挂上去
的类当场被抹掉；而补挂的逻辑在折叠体的 effect 里，父组件并不会因子组件重渲染，于是补不
回来。

改成结构选择器之后这个问题自然消失——不需要往元素上挂任何显隐类，也就没有「被 React
抹掉」的可能。

### 嵌套折叠体：由选择器兜住，不靠外层状态推导

难点在于内层折叠体的元素**不能**被外层的展开态提前点亮：那样等它自己那层展开时已经是
不透明的，淡入不会发生。

`CLOSED_BODY` 选择器（`.wg-collapse:not(.wg-collapse-open)`）作为祖先，会命中它裁剪区里的
**所有**元素，含内层折叠体的。所以内层不需要知道外层的存在，也不必沿祖先链追问「外层落定
了没有」——外层收着时，那条规则对内层元素同样成立。

排期时仍要跳过仍收着的嵌套体里的元素（`isVisible`），但理由变了：不是为了正确性（显隐已经
由选择器保证），而是**不浪费**——它们本次不露面，给延迟等于把淡入提前用掉。

### 两段式动作保持不变

展开仍然是「容器先撑开，元素再自上而下逐个淡入」，这是既有观感，不能动。衔接两段的方式
变了：以前等一个 `transitionend` 回调，现在把等待**折进延迟**。

```ts
const waitMs = current.duration * resolveLead(root, current.lead)
planStaggerUnits(root, { step: current.step, cap: current.cap }, waitMs)
```

写进元素的 `--wg-collapse-delay` 是**绝对值**（撑开那段等待 + 该元素自己的先后）：

```ts
unit.style.setProperty(COLLAPSE_VARS.delay, `${waitMs + staggerDelayMs(order, timing)}ms`)
```

好处是样式只消费一个值，不必把两段时长拼一次，也就不存在两处各写一份而失配的可能。等待
走挂钟时间，被长任务占住时只是**晚一点淡入**。

这段计算写在 `useLayoutEffect` 里而不是普通 effect：延迟必须和展开态的样式变更落在同一次
样式计算里，否则元素会先以「没有延迟」的状态亮一帧。

`resolveLead` 的语义没变：只有一个元素会露面时忽略 `lead`，总是等完全撑开（那时它独占整段
淡入，提前起步只会把唯一那段缓动藏进裁剪区）。

### 节奏参数仍然单一来源

`utils/collapseMotion.ts` 同时被样式表与组件引用：样式表把值插进 CSS 回退值，组件把它下发
成内联自定义属性，两边不可能漂移。自定义属性**名**也来自同一处（`COLLAPSE_VARS`）——名字
写两遍同样会静默失配。

`prefers-reduced-motion` 下把过渡整条撤掉，元素落回自然的不透明：

```css
@media (prefers-reduced-motion: reduce) {
  .wg-collapse-clip [data-wg-stagger] { transition: none; transition-delay: 0s; }
}
```

这里也体现 fail-open 的好处：撤掉过渡的结果是「立刻可见」，而不是「永远不可见」。

## 三、缓存利用：让行级 memo 真正命中

### 为什么之前加 `memo` 等于没加

`React.memo` 默认按引用比对每个 prop。只要**任何一格**每次渲染都换新身份，比对就落空，
memo 一次也不会命中。改之前每一格都在换：

| prop | 为什么会变 |
| --- | --- |
| `row` | `toRow()` 每次渲染都为所有会话造新对象 |
| `onOpen` | 父组件写的是 `() => openSession(row.id)`，每次渲染新建闭包 |
| `grouping` | 每次渲染新建，内含刚 `buildLayout` 出来的新 `sections` 数组 |
| `status` | `sessionStatus()` 每次返回新对象 |
| `official` | `officialActions()` 每次渲染返回新对象 |
| `t` / `labels` | `regionLabels(t, tWorkspace)` 每次重建整张文案表 |

所以第一步不是加 `memo`，而是**把身份稳定下来**。

### 行对象：按摘要对象缓存

关键在于数据源本身的特性：流式期间每次活动只会替换**发生变化的那条摘要**，其余 `SessionSummary`
对象保持同一引用（结构化共享）。因此可以按摘要对象缓存投影结果：

```ts
const rowCache = new WeakMap<SessionSummary, SessionRow>()

function toRow(summary: SessionSummary, runningSubagents: Map<string, number>): SessionRow {
  const id = String(summary.id)
  const runningSubagentCount = runningSubagents.get(id) ?? 0
  const cached = rowCache.get(summary)
  // 子代理运行数由别的会话决定，可能与摘要本身不同步地变化，因此一并比对
  if (cached !== undefined && cached.runningSubagentCount === runningSubagentCount) return cached
  // …造新行并写回缓存
}
```

两个设计点：

- **用 `WeakMap` 而不是 `Map`**：摘要被替换后旧条目自动回收，不会随会话数增长而堆积。
- **缓存有效性要连「外部派生值」一起判断**。`runningSubagentCount` 由别的会话（运行中的
  子代理）决定，同一个摘要对象可能对应不同的计数。只比摘要引用就会漏掉这种变化，祖先行
  的运行点不亮。这是缓存最容易出错的地方：**缓存键必须覆盖所有影响结果的输入**。

### 内容比对器：为「每次都新建但内容稳定」的值

有些值没法保持引用稳定，但内容稳定，就给比较器：

```ts
// 状态位每次渲染都是新对象，但决定显示结果的只有 state 与 label
export function sameSessionStatus(a, b): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.state === b.state && a.label === b.label
}
```

`sameGroupSections` 同理：分组段每次渲染都是新数组新对象，而归组菜单只消费分组的 id 与
名字，因此判定这两个字段就够。

这两个函数刻意只比**决定显示结果的字段**，不是深度相等。多比无关字段会让 memo 无谓失效，
少比相关字段会让 UI 不更新。

### 剩下的身份稳定化

| 值 | 做法 | 理由 |
| --- | --- | --- |
| 官方动作对象 | 在 `index.ts` 里按服务缓存，`labels` 写成取值器 | 服务是单例，同一服务期间复用即可；`labels` 用 getter 才能既复用对象、又让切换语言后的下一次读取拿到新译文 |
| 文案表 `labels` | `useMemo(() => regionLabels(t, tWorkspace), [t, tWorkspace])` | 缓存的是投影结果而不是译文；两个 `t` 都在调用时才读当前语言 |
| 归组动作 | `useCallback(..., [apply, moveSession])` | 它会随归组上下文传到每一行 |
| 行打开动作 | 传**未绑定**的 `openSession`，由行自己绑 id | 绑好的闭包每次渲染都是新引用 |
| 归组上下文 | 动作传未绑定的版本，行自己在组件内绑 id | 同上；`onSelectGroup` 因此对所有行是同一个引用 |

一个通用手法：**把「传动作」换成「传动作 + 参数」**。行级 memo 比对的是动作本身（稳定），
参数在组件内部拼接，于是 memo 能命中。

### 一个试过但回退的做法

我一度把 `status` 与 `time` 的推导**挪进行内**，理由是父组件为全部 800 行算完再被 memo
丢掉，看着是纯浪费（实测这部分 3.3 ms / 800 行）。

这是错的，已回退。被 memo 挡下的行再也不会重渲染，而 `time` 依赖渲染当刻的时间：别的会话
在流式输出时，这一行的时间会**一直停住**。对照模式下与官方并排就是肉眼可见的不一致。

结论：**推导放在哪一层，取决于这个值是否会独立于本行数据变化**。3.3 ms 买「时间始终正确」
是划算的。现在 `status` / `time` 由父组件算好传入（内容稳定，可参与比对），这个权衡在
`SessionRowView` 的模块注释里写明了原因。

### 什么时候 memo 才值得

行级 memo 不是免费的：父组件仍然要为每一行创建 element、跑一遍比对。所以收益取决于
「被挡下的工作量」远大于「比对本身的开销」——行数越多越划算，几十行的列表可能得不偿失。
改后的稳态是 2/800 命中，这正是它划算的前提。

## 四、用测试钉住这些不变量

这两类问题都不是靠读代码能看出来的，因此都补了会失败的回归测试：

| 不变量 | 测试 |
| --- | --- |
| 未变的摘要在重新投影后保持同一行对象 | `reuses the row object when its summary is unchanged` |
| 只有变化的那条摘要换新对象，其余不动 | `gives a changed summary a new row object and leaves the rest alone` |
| 子代理运行数变化时行对象必须重建 | `rebuilds a row when the subagent count changes under it` |
| 重建的分组段按内容判定为相等 | `sameGroupSections` 一组 |
| 状态位按内容判定 | `sameSessionStatus` 一组 |
| 行上不得出现任何可能丢失的显隐类 | `never gates row visibility on a class the renderer could lose` |
| 组件里不得再出现 `useState` / `transitionend` / `setTimeout` / `classList` 写显隐 | `collapsible.test.ts` 的 `fail-open reveal` 一组 |
| 基准规则里不得声明 `opacity` | `styles.test.ts` |
| 层级缩进的每条选择器都真的命中渲染出的 DOM | `virtualWorkspaceDom.test.tsx` 的 `matches the nested indentation selectors against the rendered tree` |

最后一类值得单独说：`fail-open reveal` 那组测试**检查组件源码文本**，断言它不再包含任何
会过期的显隐机制。这种测试通常不该写（绑实现），但这里被断言的恰恰是「不要引入某种模式」，
而模式本身是文本可见的——它防的是半年后有人「顺手」把 `useState` + `transitionend` 加回来。

## 五、遗留与边界

- **jsdom 不是真实浏览器**。上面的数字能说明成本随行数如何增长、memo 是否命中，但不能
  代表真机。真机验证需要在 DevTools Console 里挂一个一次性探针，按空闲/流式两个阶段分别
  采集 Event Timing 的输入延迟、长任务与掉帧。
- **剩余的长任务不在本包**。改后 800 行仍有 60 ms 量级，其中数据层只占 0.81 ms，其余是
  React 遍历元素树的下限（800 个未变子元素本身就要 17 ms）。要再往下压只能改走虚拟化，
  那是另一个量级的改动。
- **`cap` 仍然存在**。元素很多时逐个累加会让末尾等太久，封顶后靠后的若干元素同时露面。
  这是既有的观感取舍，本次没动。
