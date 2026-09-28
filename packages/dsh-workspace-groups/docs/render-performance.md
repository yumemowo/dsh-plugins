# 渲染性能与行级缓存

会话列表跟随高频更新重渲染。长列表下这会让每次流式活动都卡顿上百毫秒，而主线程被长任务占住又会挤占展开动效所依赖的时机。行级 `memo` 要怎样才能真正命中，以及实测的成本分布如下。

结论不针对本包：任何「长列表跟随高频更新重渲染」的场景都会遇到同样的问题。

## 症状与根因

| 症状 | 根因 |
| --- | --- |
| 每次流式活动都卡顿上百毫秒 | 行级 `memo` 从未命中：每个 prop 每次渲染都是新身份 |
| 流式输出时插件区域一片白，点不动 | 显隐是 fail-closed 的，依赖一次可能被挤掉就不会再来的唤醒 |

两者有关联但不是同一个问题：卡顿的直接原因是渲染层逐行重算，变白的直接原因是显隐设计（见[撑开动效](expand-motion.md#显隐必须-fail-open)）。卡顿制造的长任务恰好会去挤占显隐所依赖的那次唤醒，因此改掉卡顿能降低变白的概率，但真正修掉变白的是显隐的反转——只做性能优化不够，两处都得改。

## 为什么加 `memo` 等于没加

`React.memo` 默认按引用比对每个 prop。只要任何一格每次渲染都换新身份，比对就落空，`memo` 一次也不会命中。未做身份稳定化时每一格都在换：

| prop | 为什么会变 |
| --- | --- |
| `row` | `toRow()` 每次渲染都为所有会话造新对象 |
| `onOpen` | 父组件写的是 `() => openSession(row.id)`，每次渲染新建闭包 |
| `grouping` | 每次渲染新建，内含刚 `buildLayout` 出来的新 `sections` 数组 |
| `status` | `sessionStatus()` 每次返回新对象 |
| `official` | `officialActions()` 每次渲染返回新对象 |
| `t` / `labels` | 行作用域里的文案每次渲染都是新对象（`regionLabels(t, tWorkspace, tSidebar)` 重建整张文案表） |

因此第一步不是加 `memo`，而是把身份稳定下来。

## 按摘要对象缓存行

关键在于数据源本身的特性：流式期间每次活动只会替换发生变化的那条摘要，其余 `SessionSummary` 对象保持同一引用（结构化共享）。因此可以按摘要对象缓存投影结果：

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

用 `WeakMap` 而不是 `Map`：摘要被替换后旧条目自动回收，不会随会话数增长而堆积。

缓存有效性要连**外部派生值**一起判断。`runningSubagentCount` 由别的会话（运行中的子代理）决定，同一个摘要对象可能对应不同的计数；只比摘要引用就会漏掉这种变化，祖先行的运行点不亮。这是缓存最容易出错的地方：缓存键必须覆盖所有影响结果的输入。

## 内容比对器

有些值没法保持引用稳定，但内容稳定，就给比较器：

```ts
// 状态位每次渲染都是新对象，但决定显示结果的只有 state 与 label
export function sameSessionStatus(a, b): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  return a.state === b.state && a.label === b.label
}
```

`sameGroupSections` 同理：分组段每次渲染都是新数组新对象，而归组菜单只消费分组的 id 与名字，因此判定这两个字段就够。

这两个函数刻意只比**决定显示结果的字段**，不是深度相等。多比无关字段会让 `memo` 无谓失效，少比相关字段会让 UI 不更新。

## 其余身份稳定化

| 值 | 做法 | 理由 |
| --- | --- | --- |
| 官方动作对象 | 在 `index.ts` 里按服务缓存，`labels` 写成取值器 | 服务是单例，同一服务期间复用即可；`labels` 用 getter 才能既复用对象、又让切换语言后的下一次读取拿到新译文 |
| 文案表 `labels` | `useMemo(() => regionLabels(t, tWorkspace, tSidebar), […])` | 缓存的是投影结果而不是译文；几个 `t` 都在调用时才读当前语言 |
| 区域文案 `{ t, labels }` | 容器用一层 `useMemo` 合成 `RegionLocale` 交给 `RegionLocaleProvider` | 文案不再逐层传参，组件改从 `useLocale()` 取，Provider 的 value 因此成了唯一那格 prop |
| 归组动作 | `useCallback(..., [apply, moveSession])` | 它会随归组上下文传到每一行 |
| 行打开动作 | 传**未绑定**的 `openSession`，由行自己绑 id | 绑好的闭包每次渲染都是新引用 |
| 归组上下文 | 动作传未绑定的版本，行自己在组件内绑 id | 同上；`onSelectGroup` 因此对所有行是同一个引用 |

一个通用手法：把「传动作」换成「传动作 + 参数」。行级 `memo` 比对的是动作本身（稳定），参数在组件内部拼接，于是 `memo` 能命中。

**Provider 的 value 必须 `useMemo`，不能写成行内对象字面量。** 文案改走 `useLocale()` 之后，组件接口里的 `t` / `labels` 两格消失，剩下 `RegionLocale` 的 value 一格，它的身份是否稳定直接决定行级比对成不成立。已用 real-React + jsdom 实测：value 身份稳定时，`React.memo` 包住的行组件在父组件重渲染时命中 0 次重渲染；value 每次新建时同样条件下是 2 次（两次父渲染各一次）。容器的两个渲染分支（宽栏与窄栏）都包同一层 Provider，因此窄栏那条分支也共用同一个 value。

## 推导放在哪一层

一条曾试过但结论相反的做法：把 `status` 与 `time` 的推导挪进行内，理由是父组件为全部行算完再被 `memo` 丢掉看着是纯浪费（实测这部分 3.3ms / 800 行）。

这是错的。被 `memo` 挡下的行再也不会重渲染，而 `time` 依赖渲染当刻的时间：别的会话在流式输出时，这一行的时间会一直停住。对照模式下与官方并排就是肉眼可见的不一致。

结论：推导放在哪一层，取决于这个值是否会独立于本行数据变化。3.3ms 买「时间始终正确」是划算的。现在 `status` / `time` 由父组件算好传入（内容稳定，可参与比对），这个权衡在 `SessionRowView` 的模块注释里写明了原因。

## 什么时候 `memo` 才值得

行级 `memo` 不是免费的：父组件仍然要为每一行创建 element、跑一遍比对。因此收益取决于「被挡下的工作量」远大于「比对本身的开销」——行数越多越划算，几十行的列表可能得不偿失。改后的稳态是 800 行里只有 2 行命中，这正是它划算的前提。

## 实测数据

以下数字来自 jsdom + `react-dom` 的渲染基准，不是在真实浏览器里量的。它能回答「成本随行数怎么增长、`memo` 有没有命中」，但绝对毫秒数不能直接外推到真机。

测量方法是造 N 行会话、每轮只替换其中一条摘要对象（其余保持同一引用），用 `React.Profiler` 或计数插桩观察实际渲染次数。探针是一次性的，没有随提交保留；要复现重新写一个同等规模的即可。

| 800 行时单次流式更新的耗时 | 数值 |
| --- | --- |
| 关闭行级缓存（区域内全部行重渲染） | 中位 138ms |
| 行级缓存生效（区域重渲染，仅变化行进入） | 中位 63–78ms |
| 纯 DOM 对照（无 React 组件层） | 33ms |
| React 自身比对 800 个未变子元素的下限 | 17ms |
| 数据层（投影 + 分组 + 归组查找） | 0.81ms |

数据层只占 0.81ms，说明瓶颈完全在渲染层。剩余的时间落在 React 遍历元素树本身，这也是为什么行级缓存生效后仍有 60ms 量级——这部分不是本包能消掉的，除非改走虚拟化。

缓存未命中时，一次活动会让 800/800 行的函数体执行一遍；命中后稳态下只有内容真正变化的那一行会重渲染——单个会话持续流式时实测 1/800。相对时间也会让它多一次重渲染：文案跨过分钟边界时内容确实变了，就该重画。这不是浪费，而是上面「推导必须留在父层」那条取舍所保住的正确性。

## 遗留与边界

- **jsdom 不是真实浏览器**。上面的数字能说明成本随行数如何增长、`memo` 是否命中，但不能代表真机。真机验证需要在 DevTools Console 里挂一个一次性探针，按空闲/流式两个阶段分别采集 Event Timing 的输入延迟、长任务与掉帧。
- **剩余的长任务不在本包**。改后 800 行仍有 60ms 量级，其中数据层只占 0.81ms，其余是 React 遍历元素树的下限（800 个未变子元素本身就要 17ms）。要再往下压只能改走虚拟化，那是另一个量级的改动。
- **`cap` 仍然存在**。元素很多时逐个累加会让末尾等太久，封顶后靠后的若干元素同时露面。这是撑开动效的既有观感取舍。

## 钉住不变量

| 不变量 | 测试 |
| --- | --- |
| 未变的摘要在重新投影后保持同一行对象 | `reuses the row object when its summary is unchanged` |
| 只有变化的那条摘要换新对象，其余不动 | `gives a changed summary a new row object and leaves the rest alone` |
| 子代理运行数变化时行对象必须重建 | `rebuilds a row when the subagent count changes under it` |
| 重建的分组段按内容判定为相等 | `sameGroupSections` 一组 |
| 状态位按内容判定 | `sameSessionStatus` 一组 |
| 层级缩进读的是行组件下发的 `--wg-depth`（子工作区可任意层，不能再按固定层数写死选择器） | `indents each hierarchy level by one icon-column step` |

最后一条与缓存无关，但同属「只表现为界面不对、不会报错」的一类：缩进由行组件下发的 `--wg-depth` 驱动，选择器写错或变量没传到时界面只是没有缩进。`virtualWorkspaceDom.test.tsx` 因此用真 `react-dom` 渲染一遍，把样式表里所有带 `wg-virtual-workspace-body` 的规则逐条拿去 `querySelectorAll`，任一规则一个选择器都不命中就失败；`nestingDom.test.tsx` 再把递归嵌出来的每一层深度逐一断言。
