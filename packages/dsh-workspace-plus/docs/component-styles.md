# 组件样式的模块划分

本包的样式原先集中在单个 `src/client/styles.ts`（1410 行、一份模板字符串）。现按官方 [Web 样式参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/web-styling.zh.md) 的规定改为 CSS Modules：**组件样式放在组件旁**，全局样式表才归主题包。本文记录拆分依据、编译方式、由此产生的硬约束，以及为什么不能按「一个组件一张表」切。

## 拆分依据

拆分的边界不是「哪个组件用这些样式」，而是「哪些类名在同一条选择器里共现」。类名在编译期被替换成 `[hash]_rowSelected`，**跨 module 引用的类名会指向一个不存在的选择器**，样式静默失效。因此同一条选择器里出现的类名必须落在同一个 module。

按这条规则对 1374 行 CSS 建图后，112 个类名归成 82 个连通分量；再按语义把同属一块界面的分量合并，得到 10 张表：

| 表 | 行数 | 消费方 |
| --- | --- | --- |
| `views/components/rows.module.css` | 494 | 13 个组件 |
| `views/SearchControl.module.css` | 255 | 2 个 |
| `views/header.module.css` | 202 | 4 个 |
| `views/WorkspacePickerMenu.module.css` | 143 | 2 个 |
| `views/ViewOptionsMenu.module.css` | 105 | 1 个 |
| `views/WorkspaceGroupsRegion.module.css` | 80 | 3 个 |
| `menus.module.css` | 51 | 4 个 |
| `views/components/dialogs/dialogs.module.css` | 49 | 3 个 |
| `views/components/HoverCards.module.css` | 40 | 1 个 |
| `views/WorkspaceRail.module.css` | 19 | 1 个 |

`rows.module.css` 是最大的一张，因为它承载的是**共享词汇表**而非某个组件的私产：工作区行、会话分组行、工作区分组行与菜单条目行刻意同形（同一套 `.row` 系列、`.slot`、`.expand` 系列）。官方 `ui-workspace` 的 `Rows.module.css` 同样一张表服务 `projectRow` / `sessionRow` / `searchResultRow` 三种行。

**把共享词汇表拆给任意一个组件都不行**：其余组件就得跨 module 引用类名。官方 136 张组件级样式表里跨模块串类名 0 次，这条边界不能破。

跨 module 的选择器列表只有两处（reduced-motion 里 `.search*` 与 `.wg-header-*` 同行、`.headerCaret` 与 `.pickerCaret` 同行），拆成两条规则、各自复制声明块即可——`.a,.b{x}` 与 `.a{x}.b{x}` 语义相同。

## 编译与注入

`scripts/build-client.mjs` 用 lightningcss 编译 `.module.css`：

- 类名按 `[hash]_[local]` 重写，哈希把类名限定在各自模块内；
- 只有类名被改写，**自定义属性名（`--wg-depth`、`--wg-expand-*`）与 `:global()` 内容保持原样**；
- 每张表编译成一个虚拟模块，产出「注入 `<style data-plugin-css=…>` + 导出类名映射」，样式随组件 import 一起求值。

产物因此只有一个 `lib/client.js`。原先的构建脚本取 `outputFiles[0]`，加了样式表后会静默丢掉第二个 `.css` 产物；现在改为按路径查找入口产物，并断言没有多余产物。

`src/client/css-modules.d.ts` 由 `scripts/gen-css-types.mjs` 从样式表生成，`pnpm run build` 与 `pnpm run typecheck` 都会先重新生成：

- tsc 只认通配形式的 ambient module（写死 `'./x.module.css'` 不生效），因此按**文件名**通配，各样式表文件名必须唯一，生成脚本对此有断言；
- 逐条列出类名而不是用 `Record<string, string>`：本仓库开了 `noUncheckedIndexedAccess`，索引签名会取到 `string | undefined`，逐条列出后取值是 `string`，类名写错也变成编译错误。

## 撑开动画的时长与缓动

原先把 `DEFAULT_EXPAND_MOTION` 的取值插进 CSS 当回退值（`var(--wg-expand-duration, 180ms)`）。拆分后改为样式表**只消费变量**，取值一律由 `ExpandableBody` 内联下发。

这是本次唯一超出纯搬迁的语义改动。理由是回退值是同一份节奏的第二个来源：`ExpandableBody` 恒设这三个自定义属性（`expandMotionVars` 的产物直接挂在根节点上），样式表里的那份数字永远读取不到，却会在改常量时被漏改。`--wg-expand-delay` 是例外并保留 `0ms` 兜底：没有被排期的元素（收起态）没有任何内联值。`test/motion.test.ts` 守住这条不变量。

## 静默失效与对应的守护

CSS Modules 最危险的一点是**大多数接错法都不会报错**：类型对、编译过、DOM 结构测试也可能过，只有界面上少了那点样式。本次实际踩到两处：

- `SessionRowView` 的 `className` 是跨行字符串拼接，我最初的 codemod 只认单行，漏改后每一行的类名都没走映射；
- `listClassName="menuList"` 是原语的属性值（不是 `className`），漏改后二级菜单底色修复失效。它同时是字符串、类型又是 `string`，tsc 完全无从发现。

因此加了两道守护：

- `test/cssUsage.test.ts` 扫源码，**类名出现在 `className` / `listClassName` / `querySelector` 的位置且是裸字面量时失败**。类名去前缀后与普通单词同形（`row`、`group`、`list`、`panel`），靠「看起来像类名」判断会大量误判，因此改按**出现位置 + 是否在本包类名集合里**双重判定。该测试自带正例与反例，并单独断言类名集合非空（集合取空会让整条检查静默失效）。
- `test/bundle.test.ts` 扫产物，用与构建脚本相同的参数把 10 张表重编译一遍，逐条确认每个类名在产物里**既有映射、又有选择器**，并断言 10 个 `data-plugin-css` 标记都在。

## 类名不带包前缀

样式原先是单文件一次性注入，类名带 `wg-` 前缀是为了不与官方及其他插件的样式相撞。改为 CSS Modules 后这层前缀对**类名**已无意义：类名被编译成 `[hash]_x`，哈希把每个类限定在自己的 module 内。官方 37 张组件级 `.module.css` 的类名同样是裸名（`.block`、`.tabs`、`.thumb`）。因此类名去前缀并改为 camelCase（`wg-row-selected` → `rowSelected`），与官方 `.bannerWrap`、`.expandedTopLevel` 一致；类名都是合法标识符后，组件里可直接写 `styles.rowSelected`，由编译器校验属性名。

**`--wg-*` 自定义属性与 `data-wg-*` 属性保留前缀**，它们不受哈希保护：

- 自定义属性沿 DOM 继承，是全局命名空间。`--depth` 这类通用短名一旦被官方或另一个插件定义在祖先上，`var(--depth, 0)` 会静默读到它，缩进整段错位。
- 属性选择器全局生效，同理。

官方自己也守这条线：组件级自定义属性一律带 owner 前缀（`--trajectory-*`、`--shiki-*`、`--diff-*`），而类名不带。前缀在这里是**归属标记**，不是防撞保险。

## 测试接法

`vitest.config.ts` 配 `css.include` 与 `classNameStrategy: 'non-scoped'`，类名在测试里保持源文件原名，因此测试里 201 处 `querySelector('.row')` 这类选择器可以直接写源文件的类名，不必去读编译产物。不配 `css.include` 时 vitest 只给一个惰性代理（`Object.keys` 为空但 `styles.foo` 有值），断言与快照都不稳。

要读整份样式表文本的测试用 `test/readCss.ts`：`readAllCss()` 按稳定顺序合并全部 `.module.css`，`readReducedMotionCss()` 收集全部 reduced-motion 块（拆分后每张表各带一份，只看第一条会漏）。

## 验收

拆分前后用同一份 DOM 各渲染一次（拆分前是 `styles.ts` 的原文，拆分后是 10 张表编译产物），无头 Chromium 截图**逐字节相同**；规则集合逐条比对 214/214 完全相同，112 个类名无缺失。

类名去前缀与转 camelCase 之后又验了一遍：用与构建脚本相同的参数重编译 10 张表，113 个类名（112 个类 + 1 个 keyframes）在产物里都能同时找到「映射」与「选择器」，`--wg-*` 与 `data-wg-*` 共 10 个标记原样保留。
