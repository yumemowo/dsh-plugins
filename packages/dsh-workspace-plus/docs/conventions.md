# 开发约定

改这个包时要守的硬约束。每条都注明**怎么被发现**——其中多数违反后不会报错，只表现为「界面不对」或「测试全绿但功能没生效」，因此值得先读一遍。

跨包的约束（pnpm、工作区脚本、构建顺序）在[仓库根 README](../../README.md)；**本文件只收本包范围内的约定**。等第二个真包出现、需要共享这些条目时，再考虑提升到仓库根。

## 结论必须有实测支撑

**凡是性能结论（谁更快、开销多大、缓存有没有命中），先有同 harness 的实测，再写进代码或文档；不得以静态阅读源码或读官方 bundle 推断根因。** 这条不是风格偏好：本包曾两次从源码静态读出的根因都被实测否掉（先断言「官方行组件更轻」，实测是官方做得更多；再断言「官方限 5 行」，实测官方有溢出按钮且展开全部行也不卡）。

**探针必须能当场复现，不能只留一句「已实测」。**

| 要求 | 说明 |
| --- | --- |
| 探针入库 | 结论写进文档时，仓库里要有一份能跑的探针；能写成测试就写成测试（如 `test/providerMemo.test.tsx` 量 provider value 身份对行级缓存的影响），不要写成散文 |
| 标明可复现性 | 无探针的历史数字要标注「历史测量记录，不是可复现的断言」，只能说明量级与趋势，不能再拿去支撑新结论 |
| 探针要能失败 | 新写的探针先做一次变异测试（去掉被测机制，断言应反转），确认它真的在量那件事而不是恒真 |

`docs/render-performance.md` 里的毫秒数属于「历史测量记录」那一类；provider value 那条机制则是可复现的。

**jsdom 算不了的东西另用真实浏览器探针**（尚不属 CI，手动跑）：`scripts/probes/` 下每个文件量一组只能在真实浏览器里看的结论，
比如 `pin-hover.mjs` 量置顶区悬停展开的六条路径。它们**不进 `package.json` 的 scripts**：跑一次要自带浏览器、
要读构建产物、结论也不是「通过 / 失败」那种能进 CI 的断言，写成一个命令会让人以为随便跑跑就行。

`pin-hover.mjs` 的用法（它先把探针页面写进 `.preview/`，再驱动浏览器）：

```sh
pnpm run build          # 探针读 lib/ 里那份编译后的样式表
# headless 默认报 (hover: none)，而浮出规则整条包在 (hover: hover) 里
# 用 blink-settings 把它当成一台有指针的设备来启动
/usr/bin/chromium --headless=new --no-sandbox --disable-gpu \
  --remote-debugging-port=9222 --blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4 \
  --user-data-dir=.preview/chrome-profile about:blank &
node scripts/probes/pin-hover.mjs
```

退出码非零即有用例不符。页面内容由脚本自己现造（假会话 `session-a`…`session-g`），
不读宿主配置、不依赖真实工作区数据，因此换台机器也跑得出同一份结论。

## 构建与产物

| 约束 | 违反后 | 怎么被发现 |
| --- | --- | --- |
| 只用 pnpm（`packageManager: pnpm@11.24.0`） | 锁文件与 store 布局错乱 | 仓库根 `package.json` 锁定 |
| 改完 `src/` 必须重新构建产物 | GUI 仍加载旧 `lib/client.js`，界面完全没变；而 `vitest` 直接 import 源码，**测试照样全绿** | `pnpm run build`；`lib/` 在 `.gitignore` 内，`git status` 看不出差异 |
| 改宿主半边要重启 `dsh` | `dsh-client-hmr` 只推客户端 bundle，宿主仍是旧版本 | 见[客户端集成](client-integration.md#热重载与两端不同步) |
| `.tsx` 必须写进各 tsconfig 的 `include` | `tsc` **静默不检查** `.tsx` 文件 | 三个工程都已含 `src/**/*.tsx`：`tsconfig.json` / `tsconfig.test.json` / `src/client/tsconfig.json` |
| 查客户端类型要走 `pnpm run typecheck`，不能只看 `build` / `test` | 客户端类型错误在 `build` 与 `test` 下全是假绿，产物照出、用例照过 | 见下面「客户端半边只由 `tsconfig.test.json` 检查」 |
| 新增基线模块要同步两处 | 漏 `EXTERNAL` 会把官方包打进产物（第二份引擎实例）；漏 `BASELINE` 断言失效 | `scripts/build-client.mjs` 的 `EXTERNAL` 与 `test/bundle.test.ts` 的 `BASELINE` 必须同时列出全部基线模块。node 取不到真包的那两个（primitives、client-store）还要在 `vitest.config.ts` 的 `resolve.alias` 配替身 |

**验证产物时挑字符串字面量与对象属性名，不要挑函数名或局部变量名。** 产物 `minify: true` 会重命名它们，按名字 grep 恒为 0；同时 esbuild 把中文转成 `\uXXXX`，直接 grep 中文同样得 0。曾因此误判「构建丢了内容」，实际只是函数被改名。

### 客户端半边只由 `tsconfig.test.json` 检查

本包分宿主与浏览器两个半边，**只有 `tsconfig.test.json` 覆盖全部源码**：

| 配置 / 命令 | 覆盖 `src/client/**` | 说明 |
| --- | --- | --- |
| `tsconfig.json` | 否 | `exclude: ["src/client/**"]`——宿主半边不 import 客户端，排除它不会带走被引用的文件 |
| `src/client/tsconfig.json` | **是** | 只为编辑器存在，见下面「为什么客户端要有一份自己的 tsconfig.json」。不参与构建与类型检查 |
| `tsconfig.test.json` | **是** | 第二个工程，`include` 里含 `src/**/*` 与 `test/**/*`，客户端类型只在这里被检查 |
| `pnpm run build` | 否 | 客户端走 `scripts/build-client.mjs` 的 esbuild，只剥类型不检查 |
| `vitest run` | 否 | vitest 同样只转译 |
| `pnpm run typecheck` | **是** | 先跑 `tsconfig.json`，再跑 `tsconfig.test.json` |
| `pnpm run check` | **是** | typecheck 是其中一步 |

后果是**客户端类型错误在 `build` 与 `test` 下全都不报**：产物照常生成、655 条用例照常全绿，只有 `pnpm run typecheck` 会拒绝。仓库目前没有 CI，`pnpm run check` 是唯一闸门。

### 为什么客户端要有一份自己的 `tsconfig.json`

**tsserver 只把文件名恰为 `tsconfig.json` / `jsconfig.json` 的文件当工程配置**（`getBaseConfigFileName`），`tsconfig.test.json` 在编辑器眼里不存在。而包根的 `tsconfig.json` 又 `exclude` 了 `src/client/**`。两条一夹，客户端文件就没有归属工程，被丢进一个**默认选项的 inferred project**：读不到同目录的两份 ambient 声明（`css-modules.d.ts`、`primitives-env.d.ts`），于是每个 `.module.css` 导入都报 `TS2307 Cannot find module './x.module.css'`，并伴随 `TS5097`、primitives 找不到等一连串假报错。

| 检查项 | 结论 |
| --- | --- |
| 加 `src/client/tsconfig.json` 前 | 文件归属 `/dev/null/inferredProject1*`，`menus.tsx` 报 1 条 `TS2307` |
| 加之后 | 归属 `./src/client/tsconfig.json`，客户端文件诊断 0 条 |
| `moduleResolution` 是不是原因 | **不是**。改 `bundler` / `node10` / `classic` 都无效：推断工程根本没加载那份声明，换解析方式无从谈起 |

`tsc -p tsconfig.json` 仍只产出宿主半边：实测加这份配置后 `lib/` 里没有 `client/` 目录，`lib/client.js` 仍是 581250 字节。改 `include` / `exclude` 边界时照此复核一遍。

曾有一次实测：往 `src/client/data/picker.ts` 注入 `const x: string = 42`，`tsc -p tsconfig.json --noEmit`、`pnpm run build`、`vitest run` 三者全部通过，只有 `tsc -p tsconfig.test.json` 报出 `TS2322`。**因此只跑 `build` 或 `test` 就宣称「类型检查通过」是无效结论。**

## 测试

| 约束 | 说明 |
| --- | --- |
| 用例名用小写、以第三人称动词开头的行为描述串 | `it('nests a child workspace inside its parent')`。全仓 663 条一律这个形态：小写起首、`keeps` / `reports` / `leaves` 这类动词打头、不用 `should`。写新用例时照同一形态，不要换成 `Should_...` 之类 |
| 断言 DOM 结构、样式选择器、交互路径的用例用真 `react-dom` | 文件头加 `// @vitest-environment jsdom`，照 `test/nestingDom.test.tsx` 的驱动方式 |
| 单测 import 的是基线替身，有盲区 | 替身看不到真包导出表；那条链由 `test/bundle.test.ts` 补（按宿主的方式装载产物） |
| 测试里 CSS 类名不哈希 | `vitest.config.ts` 的 `classNameStrategy: 'non-scoped'`，断言的是「哪个元素带哪条规则」 |

## 代码组织

| 约束 | 说明 |
| --- | --- |
| 单消费方的 hook 与它独占的 interface 放回**唯一消费它的组件文件** | 不为了「能抽」而抽出一堆只有一个调用点的间接层 |
| 类型在生产侧可拆、在消费处收窄 | 判断「类型过大」看消费方实际用到的字段占比，不是「只多出一两个字段」就算合理 |
| 文件行数不是问题，阅读成本才是 | 用 `// ── … ──` 分节标记把它压下去 |
| 注释只写这段代码做了什么 | 不写设计决策的来龙去脉，不引用文档章节号或原文；命名已能表达语义的不写 |
| 不用「父」「子」这类单字简写 | 写全「父工作区」「子工作区」。单字在无前置声明时让人卡壳，且 `父` 在本包还要区分「父工作区 / 父级元素 / 父插槽 / 父会话」，光看单字不知指哪个。沟通时省字造成的，不该留在注释里 |
| 术语按**所属层面**选词，不混用 | 推导层说「容器 / 那一段 / 落在」，显示层才说「渲染 / 列表」。「渲染」只用于描述界面产出，不用来修饰纯数据推导 |
| 一个词有多个所指时先声明层面 | `root` 在本包同时指整棵树的根布局、聚焦后那一片、以及推导层的容器节点；注释引用它必须点明是哪一层 |

## 性能优化

**只对真有 `memo` 消费方的 provider 引入 value 稳定化，且引入前先确认消费方。** 判断方式：列出该 context 的消费方，逐个看有没有被 `memo` 包住——没有就是纯粹的复杂性。别把「进 context 就得 `useMemo`」当无条件规则。依据与探针见[渲染性能与行级缓存](render-performance.md#provider-的-value-与行级缓存的真实关系)。
