/**
 * 本包浏览器半边的样式
 *
 * 取值对齐官方侧边栏组件（`dsh-client-ui-sidebar` 与 `dsh-client-ui-workspace`
 * 0.1.5-rc.2）的实际规则：工作区/分组行 34px、会话行 32px、圆角 8px、行内
 * 水平内边距 8px、图标列 16px、悬停用 `--dsw-alias-interactive-bg-hover`、
 * 文字色走 `--dsw-alias-label-primary/secondary/tertiary`
 *
 * 水平留白分左右两半，来源不同：左侧来自 shell（`--dsh-sidebar-inline-padding`
 * 与 regionArea 的 -4/+4），右侧来自官方 WorkspaceBrowser 根节点自带的那块
 * `--dsh-session-list-edge-inset`。官方那份定义随被接替的组件一起消失，因此
 * 本包的 `.wg-root` 自己重新定义这三个量（见该规则处的注释）
 *
 * 文字层级照官方照搬：容器行（`projectRow`）与其中的标题一律
 * `label-primary` 14px/20px，且都**不加字重**——官方工作区标题与会话标题
 * 同色同字号，只靠行高（34px vs 32px）区分层级。字号与行高成对写在叶子上，
 * 根节点不设 line-height（官方 `.empty` 等就这样吃浏览器默认值）
 *
 * 通过带 `data-plugin` / `data-plugin-css` 标记的 `<style>` 标签注入：
 * 客户端模块系统按这两个属性认领样式标签并做 HMR 记账
 */
import { COLLAPSE_VARS, DEFAULT_COLLAPSE_MOTION as MOTION } from './utils/collapseMotion.ts'

/** 样式表内容的唯一标识；重复挂载时用它去重 */
const STYLE_TAG_ID = '@your-scope/dsh-workspace-groups/src/client/region.css'

/**
 * 样式表内容
 *
 * 导出供测试直接读取**求值后**的文本：节奏参数以插值进入 CSS，再按源文本切割只会
 * 拿到 ${...} 字面量
 */
export const CSS = `
/* 区域根：官方 WorkspaceBrowser 的根节点自己带整块右留白，本区域必须有同一份，
   否则 header 的入口按钮与列表行都会贴到侧栏右缘
 *
 * 官方那份留白不走 shell 的 12px——shell 的 regionArea 用 margin-right:-12px
 * 把它抵掉了，再由 WorkspaceBrowser 的根节点重新加回来。因此这里由 .wg-root
 * 自己拥有：侧栏下 shell 只负责左侧 12px（regionArea 的 -4/+4），右侧由本节点
 * 给；对照模式下 .wg-tab 给左侧、本节点给右侧，两种挂载点的右留白因此同源
 *
 * 官方把这三个量定义在自己的根节点上（--dsh-session-list-edge-inset 等），
 * 而那些定义随官方组件一起被接替掉了，本包必须自己重新定义一遍 */
.wg-root {
  --dsh-session-list-edge-inset: var(--dsh-sidebar-inline-padding, 12px);
  --dsh-session-list-scrollbar-width: 8px;
  --dsh-session-list-scrollbar-offset: 2px;
  box-sizing: border-box;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  padding-right: var(--dsh-session-list-edge-inset);
}

/* 右侧栏对照 tab 的外壳：只给左侧水平内边距与顶部间距——侧栏下左侧来自 shell，
   对照模式下没有 shell，因此由这里补上；右侧一律由 .wg-root 给，避免两层叠加 */
.wg-tab {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 0 0 12px;
}

/* 区域 section header：几何照官方 WorkspaceBrowser 的 .sectionHeader
   （36px 高、圆角 12px、左内边距 4px、控件间距 4px、下间距 4px）

   margin-right 同样照官方取 -4px：官方那条负值是相对「自带整块右留白」的
   根节点写的，本包 .wg-root 有同一份留白（见上），因此两者相抵后
   header 的右缘与官方一样落在离栏缘 8px 处 */
.wg-header {
  box-sizing: border-box;
  height: 36px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-bottom: 4px;
  padding-left: 4px;
  margin-top: 2px;
  margin-right: -4px;
  color: var(--dsw-alias-label-tertiary);
  border-radius: 12px;
  overflow: hidden;
}

/* 标题最多占 45%，给右侧入口留出空间（官方 .sectionLabel 同此约束） */
.wg-header-label {
  min-width: 0;
  max-width: 45%;
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  line-height: 20px;
  transition:
    max-width .18s var(--ds-ease-in-out, ease-in-out),
    margin-right .18s var(--ds-ease-in-out, ease-in-out),
    opacity .12s var(--ds-ease-in-out, ease-in-out),
    transform .18s var(--ds-ease-in-out, ease-in-out),
    visibility 0s linear;
}

/* 搜索展开时标题让位：宽度收成 0、向左移一点并淡出，整行只剩搜索框。
   四条属性与官方 .sectionLabelHidden 一致，时长取官方那套 .18s/.12s */
.wg-header-label-hidden {
  opacity: 0;
  visibility: hidden;
  max-width: 0;
  margin-right: -4px;
  /* visibility 要等淡出走完再切，否则标题会当场消失、没有过渡 */
  transition-delay: 0s, 0s, 0s, 0s, .18s;
  transform: translate(-4px);
}

.wg-header-actions {
  /* 两个 28px 入口加一格 4px 间距；官方 .headerActions 同此上限 */
  max-width: 60px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  /* 不设 margin-left: auto：把整组推向右缘的是前面搜索槽位那一个 auto，
     多一个 auto 会与它平分剩余空间，把搜索框挤到行中间 */
  overflow: hidden;
  transition:
    max-width .18s var(--ds-ease-in-out, ease-in-out),
    opacity .12s var(--ds-ease-in-out, ease-in-out),
    transform .18s var(--ds-ease-in-out, ease-in-out),
    visibility 0s linear;
}

/* 视图选项与「添加工作区」在搜索展开时整体让位：向右收拢并淡出，与标题对称 */
.wg-header-actions-hidden {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  max-width: 0;
  transition-delay: 0s, 0s, 0s, .18s;
  transform: translate(4px);
}

/* 搜索槽位：收起时只有图标按钮那么宽（28px），展开后拉满整行剩余宽度。
   宽度走 max-width 而不是 flex-basis，因为整行是「标题 + 搜索 + 入口组」的
   定宽组合，搜索要吃掉前两者让出的那部分

   把右侧这一组推向左的是这里自己的 margin-left: auto（官方 .searchSlot 就是
   这么写的）。后面那组入口不能再写 auto——两个 auto 会平分剩余空间，搜索框
   会被推到中间，而不是紧挨着入口组 */
.wg-search-slot {
  box-sizing: border-box;
  min-width: 0;
  max-width: 28px;
  flex: 1;
  display: flex;
  align-items: center;
  margin-left: auto;
  transition: max-width .18s var(--ds-ease-in-out, ease-in-out);
}
.wg-search-slot-expanded { max-width: 100%; }

/* 搜索框本体：收起时是 28px 正圆（与相邻的 header 图标按钮同形），展开后
   变成 30px 高的圆角输入框。border 从「无」切到 .5px，因此收起态不能写
   border: none——那会让展开瞬间抖 1px */
.wg-search {
  box-sizing: border-box;
  cursor: text;
  width: 100%;
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 0;
  margin: 0;
  padding: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  background: 0 0;
  border: none;
  border-radius: 50%;
  corner-shape: round;
  transition:
    width .18s var(--ds-ease-in-out, ease-in-out),
    padding .18s var(--ds-ease-in-out, ease-in-out),
    border-color .18s var(--ds-ease-in-out, ease-in-out),
    background-color .18s var(--ds-ease-in-out, ease-in-out);
}
.wg-search-expanded {
  width: calc(100% + 4px);
  height: 30px;
  margin-inline: -2px;
  padding: 0 4px 0 0;
  color: var(--dsw-alias-label-caption);
  background: 0 0;
  border: .5px solid var(--dsw-alias-border-l4);
  border-radius: 10px;
}

.wg-search-button {
  cursor: pointer;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  color: inherit;
  background: 0 0;
  border: none;
  border-radius: 50%;
  corner-shape: round;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wg-search-expanded .wg-search-button { width: 28px; height: 30px; }
.wg-search-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* 展开后按钮与输入框是同一个整体，按钮不再单独出悬停底色 */
.wg-search-expanded .wg-search-button:hover { background: 0 0; }

/* 输入框：收起时不可见、不占宽、也拿不到焦点（tabIndex 同步为 -1） */
.wg-search-input {
  flex: 1;
  min-width: 0;
  width: 0;
  opacity: 0;
  pointer-events: none;
  padding: 0;
  color: var(--dsw-alias-label-primary);
  background: 0 0;
  border: none;
  outline: none;
  font-size: 13px;
  line-height: 18px;
  transition: opacity .12s var(--ds-ease-in-out, ease-in-out);
}
.wg-search-expanded .wg-search-input {
  opacity: 1;
  pointer-events: auto;
  margin-left: -2px;
}
.wg-search-input::placeholder { color: var(--dsw-alias-label-tertiary); }

.wg-search-clear {
  cursor: pointer;
  width: 24px;
  height: 24px;
  flex: none;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  background: 0 0;
  border: none;
  border-radius: 50%;
  corner-shape: round;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wg-search-clear:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* 搜索结果行：官方 .searchResultRow 的几何。它比常规会话行高——两行内容
   （标题 + 路径），因此 min-height 而不是固定高度 */
.wg-search-results > * + * { margin-top: 2px; }
.wg-search-result {
  box-sizing: border-box;
  cursor: pointer;
  text-align: left;
  width: 100%;
  min-height: 48px;
  padding: 4px 8px;
  color: var(--dsw-alias-label-primary);
  background: 0 0;
  border: none;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}
.wg-search-result:hover,
.wg-search-result-selected { background: var(--dsw-alias-interactive-bg-hover); }

.wg-search-result-heading {
  min-width: 0;
  display: flex;
  align-items: center;
}
/* 标题与状态位之间那 4px：状态位槽自己是 16px，官方用 margin 而不是 gap */
.wg-search-result-title {
  min-width: 0;
  flex: 0 auto;
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}

/* 第二行整体缩进一个状态位槽宽（16 + 4），与标题左缘对齐 */
/* 第二行整行：官方这里放的是「工作区名 +（内容搜索的）摘录」两格，因此带 6px
   gap。本包没有摘录，这一行只剩路径一项，gap 用不上。

   gap 本身保留（与官方同构，日后真加摘录就位），但路径必须整体作为一个 flex
   项：路径内部是两段着色，若让它们直接做这一行的子项，那个 6px 会落到
   「工作区」与「分组」之间，把一条连续的路径读成两截 */
.wg-search-result-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 20px;
}

/* 路径：两段着色在内部紧邻。自身是 gap 为 0 的 flex 行——外面的 6px 属于
   「路径 / 摘录」之间，不能渗进这两段；同时两段仍要参与伸缩与截断，
   因此不能退回行内布局（行内元素上 max-width 与省略号都不生效）

   宽度上限挂在这一层而不是段上：官方给工作区名 40%，本包那格后面还要接分组，
   整条路径放宽到 60%。写成段级百分比会按本条路径的宽度算，越窄越缩，长名字
   一开始就被截断 */
.wg-search-result-path {
  min-width: 0;
  max-width: 60%;
  flex: 0 1 auto;
  display: flex;
  align-items: center;
  gap: 0;
}

/* 工作区那一格：两级都可见时才与分组争宽度，因此给它更大的收缩权重，
   空间不够时先截它、把分组留住——分组是本包相对官方多出来的那一段信息 */
.wg-search-result-workspace {
  min-width: 0;
  flex: 0 2 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* 工作区用二级色阶：官方那格只到 tertiary，这里要靠色阶与分组拉开对比 */
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 17px;
}

/* 分组是路径的第二段，比工作区明显弱一档：两段同色的话，分隔符两侧只是一条
   长名字，看不出哪段是容器、哪段是组。这里取比官方那格（tertiary）更弱的
   caption，与工作区的 secondary 拉开一整档 */
.wg-search-result-group {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  font-size: 12px;
  line-height: 17px;
}
/* 分隔符没有自己的样式：它在分组那一段里，继承同一个色阶，两段之间因此
   只有「工作区 / 分组」这两档，不会多出第三个视觉层级 */

.wg-search-status {
  color: var(--dsw-alias-label-tertiary);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 18px;
}

/* header 里的图标按钮：官方 .iconButton 的几何（28px 正圆、label-secondary、
   悬停出底色）。与行内 16px 按钮分开，因为尺寸与命中区都不是一套 */
.wg-header-action {
  cursor: pointer;
  width: 28px;
  height: 28px;
  flex: none;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  background: 0 0;
  border: none;
  border-radius: 50%;
  /* 正圆必须配对 round，否则会被主题的全局超级椭圆磨成方圆角 */
  corner-shape: round;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wg-header-action:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
/* 尚未实现的入口渲染成 disabled 占位：明确表达不可用，而不是敲下去没反应 */
.wg-header-action:disabled {
  cursor: default;
  color: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary));
}

/* 窄栏：官方 rail 下 header 只留一个 36px 的入口，标题与搜索都不渲染 */
.wg-header-rail {
  justify-content: flex-start;
  gap: 0;
  margin-bottom: 12px;
  margin-top: 0;
  margin-right: 0;
  padding-left: 0;
}
.wg-header-rail .wg-header-action {
  width: 36px;
  height: 36px;
  color: var(--dsw-alias-label-primary);
}
/* 窄栏的搜索入口：header 下方独立的一个 36px 正圆块，与官方 rail 下那条
   .search 规则同形（自带下边距 12px）。它不做展开动画——那个输入框在宽栏里，
   点下去整列会滑开 */
.wg-search-rail {
  width: 36px;
  height: 36px;
  margin: 0 0 12px;
  color: var(--dsw-alias-label-primary);
  border-color: transparent;
}
.wg-search-rail .wg-search-button {
  width: 36px;
  height: 36px;
  color: var(--dsw-alias-label-primary);
}

.wg-rail { box-sizing: border-box; display: flex; flex-direction: column; }
.wg-rail-button {
  cursor: pointer;
  width: 36px;
  height: 36px;
  color: var(--dsw-alias-label-primary);
  background: 0 0;
  border: none;
  border-radius: 50%;
  /* 正圆必须配对 round，否则会被主题的全局超级椭圆磨成方圆角 */
  corner-shape: round;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.wg-rail-button:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* 列表：右侧折进官方 .listArea 与 .list 的两层偏移
 *
 * 官方把「留白」拆成两步：.listArea 用 -edge-inset 抵掉根节点的右留白，让列表
 * 靠到栏缘；再由 .list 自己的 scrollbar-offset 与 padding-right 把内容推回到离
 * 栏缘 edge-inset 处（scrollbar 沟槽 width + offset + padding-right）。
 * 本包没有 .listArea 那一层，因此把它的 -edge-inset 折进这里的 margin-right
 *
 * 面板整体淡入：官方给三种内容体（会话树 / 单列表 / 搜索结果）共用的 .treeBody
 * 挂了 .2s 的 wide-in 动画，那三者在它的三元分支里是不同的元素，因此每次切换
 * 内容体都会重新挂载、动画重放——搜索态进出时整块面板因此各有一次淡入。
 * 本包的常规列表与搜索结果也各有自己的根节点（同一条三元分支），因此同样套
 * 这条规则；两处都挂 .wg-list 之外的面板类，见 .wg-panel */
.wg-list {
  box-sizing: border-box;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-gutter: stable;
  margin-right: calc(
    var(--dsh-session-list-scrollbar-offset) - var(--dsh-session-list-edge-inset)
  );
  padding-right: calc(
    var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) -
      var(--dsh-session-list-scrollbar-offset)
  );
  padding-bottom: 16px;
}

/* 面板级淡入：与官方 .treeBody 的 wide-in 同一条动画（时长与缓动都取官方值）。
   它是「换了一块内容」的提示，与折叠体的逐行淡入是两回事——后者管的是展开
   折叠体时行逐个露面 */
.wg-panel {
  animation: wg-panel-in .2s var(--ds-ease-in-out, ease-in-out);
}
@keyframes wg-panel-in {
  0% { opacity: 0; }
}

.wg-workspace { position: relative; display: flex; flex-direction: column; }
.wg-workspace + .wg-workspace { margin-top: 4px; }

/* 折叠体：轨道高度走 0fr ↔ 1fr，高度因此完全由内容决定，与子元素数量和
   各自高度都无关，样式里不需要任何写死的尺寸
 *
 * 时长与缓动走自定义属性，由 CollapsibleBody 按 props 下发。回退值直接取共享常量，
 * 因此两边不可能漂移（常量见 utils/collapseMotion.ts）
 *
 * clip 那一层负责裁剪：展开过程中轨道比内容矮，内容被自上而下「撑」出来。
   min-height 必须归零，否则轨道会被内容的自动最小尺寸顶开，0fr 收不到底 */
.wg-collapse {
  display: grid;
  grid-template-rows: 0fr;
  /* 它同时是 .wg-workspace / .wg-group 的 flex 子项，自动最小尺寸同样会让
     轨道收不到底，因此这里也要归零 */
  min-height: 0;
  transition: grid-template-rows var(${COLLAPSE_VARS.duration}, ${MOTION.duration}ms)
    var(${COLLAPSE_VARS.easing}, ${MOTION.easing});
}
.wg-collapse-open { grid-template-rows: 1fr; }
.wg-collapse-clip {
  overflow: hidden;
  min-height: 0;
  /* 收起后内容仍在文档里（收缩动画要靠它），因此显式移出焦点顺序与命中
     测试；等收起动作跑完再隐藏，展开时立即可见。
     延时取容器同一份时长：两者不可能失配 */
  visibility: hidden;
  transition: visibility 0s linear var(${COLLAPSE_VARS.duration}, ${MOTION.duration}ms);
}
.wg-collapse-open > .wg-collapse-clip { visibility: visible; transition-delay: 0s; }

/* 折叠体里的元素逐个淡入
 *
 * 不透明是元素的自然状态：展开态没有任何规则写 opacity。透明只挂在「所在折叠体还没
 * 展开」这一条结构条件上，因此过渡没跑、被降频或主线程被长任务占住时，元素只会「晚
 * 一点淡入」，不会留在透明上
 *
 * 嵌套由选择器自己兜住：外层收着时，收着的折叠体这条选择器作为祖先命中它裁剪区里的
 * 所有元素，含内层折叠体的，因此不需要往元素上挂显隐类
 *
 * 延迟是绝对值（撑开那段等待 + 该元素的先后），由组件量出来逐个下发；样式只消费。
 * 收起那条更具体且把延迟归零，所有元素因此一起淡出 */
.wg-collapse-clip [data-wg-stagger] {
  transition: opacity var(${COLLAPSE_VARS.fade}, ${MOTION.fade}ms)
    var(${COLLAPSE_VARS.easing}, ${MOTION.easing});
  transition-delay: var(${COLLAPSE_VARS.delay}, 0ms);
}
.wg-collapse:not(.wg-collapse-open) > .wg-collapse-clip [data-wg-stagger] {
  opacity: 0;
  transition-delay: 0ms;
}

/* 折叠体自己承担「上一行与它之间」的那 2px：这段间距要连同内容一起收掉，
   否则收起后行下会留一条 2px 空档。间距取内层容器的上内边距——它落在
   clip 的裁剪区内，轨道合拢时随之被裁掉 */
.wg-collapse-clip > .wg-workspace-body,
.wg-collapse-clip > .wg-sessions { padding-top: 2px; }

/* 图标列：工作区的文件夹/箭头、分组的箭头、会话的状态位共用同一列宽 */
.wg-slot {
  width: 16px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  justify-content: center;
  align-items: center;
  display: inline-flex;
}

/* 容器行底色取官方 projectRow 的 label-primary；图标槽自己显式设 tertiary，
   所以这里的颜色只影响直接继承的行内文字 */
.wg-workspace-head,
.wg-group-head {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  /* 行自身参与定位：引导线要落在行的悬停底色之下 */
  position: relative;
  height: 34px;
}
.wg-workspace-head:hover,
.wg-group-head:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* 层级缩进：工作区行（第 0 层）保持官方的 8px，以下每层再让出 16px，因此
   子级内容落在 8 + 16 × 深度上。深度只有三层且固定，直接按结构写死选择器，
   比在 JSX 里逐行下发内联 style 更好读，也不给行组件添 props。
   —— 分组头 24px、分组内会话 40px、工作区直接子会话 24px

   会话行多出「> *」那一档：挂了悬停卡片的行被官方 HoverCard 的根节点包了一层
   （那是个 display:block 的 span），行就不再是 .wg-sessions 的直接子项。两条都写，
   有没有卡片缩进都一致 */
.wg-workspace-head { padding: 0 8px; }
.wg-group-head { padding: 0 8px 0 24px; }
.wg-workspace-body > .wg-sessions > .wg-row,
.wg-workspace-body > .wg-sessions > * > .wg-row { padding-left: 24px; }
.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions > .wg-row,
.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions > * > .wg-row {
  padding-left: 40px;
}

/* 竖向引导线：落在父级图标列的中心（工作区 8 + 16/2 = 16，分组 24 + 16/2 = 32），
   把「这组行属于上一行」画出来。行本身是 position: relative 的定位元素，按树序
   排在容器伪元素之后绘制，因此悬停/选中的行底色会盖住它，不会出现线穿过高亮
   底色的割裂感 */
.wg-workspace-body,
.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions { position: relative; }
.wg-workspace-body::before,
.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions::before {
  content: '';
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: var(--dsw-alias-border-l1);
  pointer-events: none;
}
.wg-workspace-body::before { left: 16px; }
.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions::before { left: 32px; }

/* 字号与行高成对写在叶子上（官方 .title 即如此），根节点不设 line-height */
.wg-workspace-title,
.wg-group-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
/* 官方工作区标题即 label-primary 14px/20px，不加字重：与会话标题同色同字号，
   层级只由行高（34px vs 32px）承担 */
.wg-workspace-title { color: var(--dsw-alias-label-primary); }
/* 分组是工作区之下的一层，靠更暗的色阶表示「低一级」 */
.wg-group-label { color: var(--dsw-alias-label-tertiary); }

/* 分组的会话数：与 session 行的 .wg-row-time 同格同形（tertiary、12px/20px），
   内容为纯数字。它排在可收放的操作槽之前，正对 time 相对操作槽的位置：槽位
   静止时不占宽，会话数因此贴在行右；悬停时槽位展开、会话数隐去，两者互换 */
.wg-group-count {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
  /* 分组头是 gap:6px 的 flex 行，而 session 行是 gap:0。会话数要落在与 time
     同一条右缘线上，就得把自己与操作槽之间那份 gap 还回去 */
  margin-right: -6px;
}

/* 工作区行静止时是文件夹，悬停时换成箭头：两个槽都在文档流里，
   各自 16px，因此切换不会让标题横向跳动。悬停箭头的色阶同官方 .chevron */
.wg-folder-active { color: var(--dsw-alias-state-business-primary); }
.wg-workspace-head .wg-chevron { display: none; color: var(--dsw-alias-label-caption); }
.wg-workspace-head:hover .wg-chevron { display: inline-flex; }
.wg-workspace-head:hover .wg-folder { display: none; }

.wg-arrow { transition: transform .15s var(--ds-ease-in-out, ease-in-out); }
.wg-arrow-open { transform: rotate(90deg); }

/* 相邻行的 2px 间距。官方一条 .groupSection > * + * 就同时覆盖了
   「容器行 → 首个会话行」与「会话 → 会话」，因为那里的会话行是容器行的
   直接兄弟。本包把分组结构多包了 .wg-workspace-body / .wg-group / .wg-sessions
   三层，同一规则要在每层各写一次，分组头与首个会话行之间才会有间距。
   各层都建成 flex 列容器：flex 容器的子项边距不合并，间距值所见即所得 */
.wg-workspace-body,
.wg-group,
.wg-sessions { display: flex; flex-direction: column; }

.wg-workspace > * + *,
.wg-workspace-body > * + *,
.wg-group > * + *,
.wg-sessions > * + * { margin-top: 2px; }

/* 折叠体要抵消上一条规则给它写上的 margin-top：那段间距由 clip 内部的上内边距
   承担（见折叠体规则处），这样它会落在裁剪区内，能随内容一起收掉 */
.wg-workspace > .wg-collapse,
.wg-group > .wg-collapse { margin-top: 0; }

.wg-row {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 0;
  padding: 0 8px;
  /* 与容器行同理：行要盖住所在层级的引导线 */
  position: relative;
}
.wg-row:hover,
.wg-row-selected { background: var(--dsw-alias-interactive-bg-hover); }

.wg-row-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0 6px 0 4px;
  font-size: 14px;
  line-height: 20px;
}

/* 行尾相对时间：官方 .time 的几何与色阶（12px/20px、label-tertiary）。
   悬停、菜单展开、键盘聚焦时让位给操作位——官方是同一处 CSS 互换
   （time → ellipsis），本包把「键盘聚焦」也列为一条显隐路径 */
.wg-row-time {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
}

/* 操作位容器：静止时宽度收成 0，行尾时间因此贴住行的右内边距；随之显隐
   展开成图标列宽。时间与操作按钮的右缘因此始终落在同一条竖线——官方靠
   .time/.rowActions 的 display 互换达到同一效果。
   这里不整格 display:none，是为了保留本包的键盘可达性：格子收成 0 宽时
   按钮仍可 Tab 聚焦，:has 命中后连格子一起展开，焦点框才画得出来

   overflow 不可省略，它担两件事：裁掉收起时溢出的 16px 按钮；以及把 flex
   项 min-width: auto 的自动最小尺寸归零——否则子项 16px 会把 width: 0
   顶回去，本行修复失效（auto 最小尺寸仅在 overflow 非 visible 时才为 0） */
.wg-row-action-slot {
  flex: none;
  width: 0;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 时间与操作位共用同一组触发条件，保证任一时刻只有一方占据行尾 */
.wg-row:hover .wg-row-time,
.wg-row-menu-open .wg-row-time,
.wg-row:has(.wg-row-action:focus-visible) .wg-row-time { display: none; }

/* 分组的会话数与 time 一样让位：三条触发条件与上面那组一一对应，行类换成分组行 */
.wg-group-head:hover .wg-group-count,
.wg-group-head.wg-row-menu-open .wg-group-count,
.wg-group-head:has(.wg-row-action:focus-visible) .wg-group-count { display: none; }

/* 分组行的操作位也收进同一套可收放槽位，展开宽度取自然宽：里面是省略号与加号
   两个按钮（16 + 12 + 16），不是会话行的单个 16px。槽位收着时操作位不占宽，
   会话数因此与 time 一样贴在行右；展开后由它接替行尾 */
.wg-group-head:hover .wg-row-action-slot,
.wg-group-head.wg-row-menu-open .wg-row-action-slot,
.wg-group-head:has(.wg-row-action:focus-visible) .wg-row-action-slot { width: auto; }

.wg-row:hover .wg-row-action-slot,
.wg-row-menu-open .wg-row-action-slot,
.wg-row:has(.wg-row-action:focus-visible) .wg-row-action-slot { width: 16px; }

/* 行内操作按钮：默认隐藏，仅在该行悬停、菜单展开、或键盘聚焦时出现。
   不用 :focus / :focus-within / 选中态——鼠标点过之后焦点仍留在按钮或行上，
   会让按钮一直可见；:focus-visible 只在键盘导航时命中，既去掉鼠标残留，
   又保留清晰可见的键盘焦点。
   隐藏时一并禁用指针事件：否则会留下一个看不见却能点中的 16px 热区 */
.wg-row-action {
  flex: none;
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  width: 16px;
  height: 16px;
  padding: 0;
  background: 0 0;
  border: none;
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wg-row-action:hover { color: var(--dsw-alias-label-primary); }

/* 容器行尾的操作位容器：官方 .rowActions 的 gap:12px 与 20px 行高。
   里面两个按钮始终参与布局、只切换不透明度，因此悬停时容器内的排布不变。
   它是「贴右」还是「先让位」由外层决定：工作区行直接放进行里（常驻占位），
   分组行则套一层可收放的 .wg-row-action-slot 给会话数腾出位置 */
.wg-row-actions {
  flex: none;
  height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

/* 显示路径只有三条：所在行悬停、菜单展开期间（否则锚点按钮会在菜单还开着时
   消失）、以及键盘聚焦。工作区行与分组行各有自己的行类，因此悬停选择器
   要分别列出 */
.wg-row:hover .wg-row-action,
.wg-workspace-head:hover .wg-row-action,
.wg-group-head:hover .wg-row-action,
.wg-row-menu-open .wg-row-action,
.wg-row-action:focus-visible { opacity: 1; pointer-events: auto; }

/* 右键菜单随行渲染时，原语根节点（position: relative 的行内盒）必须整盒去掉。
   它没有 DOM 子节点——面板是 portal 到 body 的——留在流里却会成为一个空 flex
   项：行的 gap 照样算，多个 6px 就会把标题推开；分组行的会话数也同理偏移。
   display: contents 让它不生成盒子，面板不受影响（它不在这个盒子里）

   类名写两遍是为了抬一次优先级：原语自己的根类是一条单类规则，谁后注入谁赢，
   而插件的样式标签与基线样式表的先后不由本包决定 */
.wg-context-menu.wg-context-menu { display: contents; }

/* 对话框内的错误提示（如工作区重名）：只上错误色，几何走官方 Modal */
.wg-dialog-error {
  color: var(--dsw-alias-state-error-primary);
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
}

/* 悬停详情卡片的正文。卡片外框（宽度、内边距、圆角、投影、底色）全属官方
   HoverCard 原语，这里只排它内部这几行

   三档文字色与官方 ui-workspace 的 hover 卡片同值：卡片底色在两种主题下都是原语
   写死的深色（--dsw-hovercard-bg 为 #2C2C2E），因此**不能**用随主题翻转的
   --dsw-alias-label-*——浅色主题下那些是近黑色，落在深色卡片上会看不见 */
.wg-hover-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wg-hover-title {
  color: #fff;
  overflow-wrap: break-word;
  font-size: 14px;
  line-height: 20px;
}
.wg-hover-path {
  color: #cfd3d6;
  word-break: break-all;
  font-size: 12px;
  line-height: 16px;
}
.wg-hover-time {
  color: #cfd3d6;
  font-size: 12px;
  line-height: 16px;
}
.wg-hover-status {
  color: #adb2b8;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 20px;
}

/* 官方浮层都固定向右展开，对照模式下区域挂在右侧栏、贴近窗口右缘，它们会开到
   屏幕外。区域量出自己的矩形后、在放不下时才于 body 上挂 data-wg-flip 标记，
   样式只在该标记下把这些浮层翻到列表左侧，不依赖官方 hash 类名 */
body[data-wg-flip] [role='menu'] [role='menu'] {
  left: auto;
  right: calc(100% + 10px);
}
body[data-wg-flip] [role='menu'] [role='menu']::before {
  left: auto;
  right: -10px;
}

/* 悬停卡片的位置由官方原语算成内联的 left，只有 !important 压得过它；原语在滚动
   与改变尺寸时重算的也是同一条内联声明，因此这里不会被它重写覆盖。

   落点取 body 上的 --wg-flip-right（卡片右缘距窗口右缘的距离），由区域量得。
   选择器只用本包给卡片打的标记：卡片 portal 到 document.body，与官方左侧栏的
   卡片同处一个父节点，不加这层限定会连官方卡片一起翻出屏幕 */
body[data-wg-flip] [data-wg-hover-card] {
  left: auto !important;
  right: var(--wg-flip-right) !important;
}

.wg-empty {
  color: var(--dsw-alias-label-tertiary);
  padding: 16px 12px;
  font-size: 13px;
}

/* 危险操作的确认按钮：只换文字色，按钮几何仍由官方 Button 拥有。
   与官方删除按钮同一做法（错误色 token --dsw-alias-state-error-primary） */
.wg-danger-action:not(:disabled) { color: var(--dsw-alias-state-error-primary); }

.wg-note {
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  padding: 10px 12px 0;
  font-size: 12px;
  line-height: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .wg-arrow { transition: none; }
  /* 面板淡入整条撤掉。它的初态是 opacity: 0，撤掉动画即落回自然的不透明——
     若只撤 transition 而留着动画，reduced-motion 下面板反而会一直不可见 */
  .wg-panel { animation: none; }
  /* 搜索的展开、标题与入口组的让位都直接落位 */
  .wg-search,
  .wg-search-slot,
  .wg-search-input,
  .wg-header-label,
  .wg-header-actions { transition: none; }
  /* 折叠体直接落位，不做撑开/收回动作；visibility 的延时也要一并去掉，
     否则收起后仍会多挡一个容器时长才交出焦点 */
  .wg-collapse { transition: none; }
  .wg-collapse-clip { transition: visibility 0s linear; }
  /* 子元素随容器一起落位。逐个淡入的延迟由组件逐个下发，这里把过渡整条撤掉，
     否则 reduced-motion 下行仍是逐个出现。撤掉后元素落回自然的不透明 */
  .wg-collapse-clip [data-wg-stagger] {
    transition: none;
    transition-delay: 0s;
  }
}
`

/**
 * 注入样式表；已注入过则跳过
 *
 * 客户端模块系统会给未标记的 style 标签打上当前插件的 `data-plugin`，
 * 这里显式标记以配合它的认领与去重
 */
export function insertStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@your-scope/dsh-workspace-groups'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}
