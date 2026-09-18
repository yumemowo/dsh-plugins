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
}

.wg-header-actions {
  max-width: 100%;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  overflow: hidden;
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
 * 本包没有 .listArea 那一层，因此把它的 -edge-inset 折进这里的 margin-right */
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
   —— 分组头 24px、分组内会话 40px、工作区直接子会话 24px */
.wg-workspace-head { padding: 0 8px; }
.wg-group-head { padding: 0 8px 0 24px; }
.wg-workspace-body > .wg-sessions > .wg-row { padding-left: 24px; }
.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions > .wg-row { padding-left: 40px; }

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

/* 官方二级菜单面板固定向右展开（left: calc(100% + 10px)）。对照模式下
   区域挂在右侧栏、贴近窗口右缘，面板会开出屏幕外：宿主在 body 上挂
   data-wg-menu-flip 标记（由 COMPARE_MODE 决定），样式只在该标记下把
   面板翻到列表左侧，不依赖官方 hash 类名 */
body[data-wg-menu-flip] [role='menu'] [role='menu'] {
  left: auto;
  right: calc(100% + 10px);
}
body[data-wg-menu-flip] [role='menu'] [role='menu']::before {
  left: auto;
  right: -10px;
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
