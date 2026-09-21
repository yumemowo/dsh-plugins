/**
 * 本包自绘的图标
 *
 * 优先复用官方原语不等于只能用它现成的那几个：官方 primitives 里没有本包需要的
 * 两类字形——「带加号的文件夹」（文件夹族只有三个，全是实线，且没有一个带加号）
 * 以及「虚线的文件夹」（同样只有实线版，见 {@link IconVirtualFolder16}）
 * 因此这里按官方 primitives 的**绘制规范**自绘，视觉上与它们同族：
 *
 * - `viewBox="0 0 16 16"`、`fill="none"`、无 `xmlns`（与官方内联 SVG 同形）
 * - 颜色一律 `currentColor`，因此继承行的文字色，不写死
 * - 只用描边，不填充：官方那几个 outline 图标同样是描边族
 * - 轮廓取官方 `IconFolderClose16` 的文件夹比例（左右顶到 1.5 / 14.5、页签圆角
 *   2.1 / 0.9、容器圆角 1.9、壁厚 1.3），两者因此同族
 *
 * 两个造型都在小尺寸下验证过：16px 时轮廓清晰、互不粘连或断开（验证方式见
 * `docs/custom-icons.md`）
 */
import type { ReactElement } from 'react'

/** 图标的 props：与官方 primitives 的图标组件同形 */
export interface IconProps {
  size?: number
  className?: string
}

/**
 * 文件夹族共用的虚线断口
 *
 * 取 `1.6/1.1` 是量出来的：再密（`1.2` 级）在 16px 下糊成一条灰毛边，虚线读不出来
 * 只像画质差；再疏（`2.8` 级）则轮廓出现几乎断开的缺口，像没画完。两个虚线图标
 * 共用同一个值，断口的密度与相位因此一致
 */
const DASH = '1.6 1.1'

/**
 * 文件夹轮廓：官方 `IconFolderClose16` 的中线
 *
 * 官方那几个文件夹是**填充**字形（壁半宽 0.65），本包画的是描边版，因此不能照抄
 * 它的 `d`——那份数据描述的是外/内边界，直接拿来描边会小一圈。这里取它的中线：
 * x `1.5~14.5`、y `2.429~13.5863`、圆角 `1.6736`，按 1.3 壁厚描出来与官方填充版
 * 逐像素同域（都是 16px 网格上的 `x1..14 y1..14`）
 */
const FOLDER_MIDLINE =
  'A1.6736 1.6736 0 0 1 12.8264 13.5863H3.1736A1.6736 1.6736 0 0 1 1.5 11.9127V4.1026'

/** 完整闭合的文件夹（分组行用） */
const FOLDER_CLOSED =
  'M3.1736 2.429H5.6132L8.0231 4.295H12.8264A1.6736 1.6736 0 0 1 14.5 5.9686V11.9127' +
  FOLDER_MIDLINE +
  'A1.6736 1.6736 0 0 1 3.1736 2.429Z'

/**
 * 右上角开口的文件夹（新建入口用）
 *
 * 自右壁断口 `(14.5, 10.2)` 起笔绕到页签右肩 `(8.0231, 4.295)` 收笔，右上这一整段
 * 缺口留给加号。断口高度取 `10.2`：再往上会把右壁削短、文件夹读起来缺一个角
 */
const FOLDER_NOTCHED =
  'M14.5 10.2V11.9127' +
  FOLDER_MIDLINE +
  'A1.6736 1.6736 0 0 1 3.1736 2.429H5.6132L8.0231 4.295'

/**
 * 加号：位置与长度照官方 `IconProjectAddOutline16` 的实心加号
 *
 * 中心 `(12.52, 5.52)`、全长 `6`（官方那份是 6×6 的实心字形，中心与长度都取自它）
 * 线端不用 `round`：官方加号是平头的，圆头会让四臂长出半格、与文件夹缺口粘连
 */
const PLUS = 'M9.52 5.52H15.52M12.52 2.52V8.52'

/**
 * 工作区分组：虚线的文件夹，右上角开口里一个加号
 *
 * 用于「新建工作区分组」入口与「移动工作区分组」菜单项。文件夹部分与
 * {@link IconVirtualFolder16} 是同一份轮廓（官方 `IconFolderClose16` 的中线）
 * 只是右上角不闭合，缺口留给加号——「文件夹 + 加号 + 开口方位」这一构图与官方
 * `IconProjectAddOutline16` 同源。虚线让它与相邻的实线文件夹（代表真实工作区）
 * 一眼可分
 * @param props - 尺寸与类名，与官方图标组件一致
 * @returns 内联 SVG 图标
 */
export function IconVirtualWorkspace16({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none">
      {/* 文件夹：自右壁断口起笔绕到页签右肩收笔，右上角整段留给加号 */}
      <path
        d={FOLDER_NOTCHED}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeDasharray={DASH}
      />
      {/* 加号：实线，与官方那份同长同位 */}
      <path d={PLUS} stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/**
 * 虚拟文件夹：与官方文件夹同轮廓，但整圈走虚线
 *
 * 用于工作区分组行——它把一组工作区打包在一起，形状上「像一个工作区」
 * 但本身不是一个真实工作区（没有目录、没有会话）。虚线正是 DSH 表达「尚未真实
 * 存在 / 占位」的既有语言：待办清单里未开始的圆圈用 `strokeDasharray="2.4 2.4"`
 * composer 的工作区占位框用 `stroke-dasharray='4 4'`
 *
 * 官方文件夹族（`IconFolderClose16` / `IconFolderOpen16` /
 * `IconFolderOpenOutline16`）全是实线，没有可复用的虚线版，因此照
 * `IconFolderClose16` 的中线（x `1.5~14.5`、y `2.429~13.5863`）自绘一份描边版
 * 并保留实线那份的圆角与 1.3 壁厚，两者并排时同族且同域
 * @param props - 尺寸与类名，与官方图标组件一致
 * @returns 内联 SVG 图标
 */
export function IconVirtualFolder16({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none">
      <path
        d={FOLDER_CLOSED}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeDasharray={DASH}
      />
    </svg>
  )
}

/**
 * 斜向图钉的几何
 *
 * 官方 primitives 的导出表里没有任何图钉字形，因此按它的绘制规范自绘。图钉取
 * **斜向**：正交的图钉（钉帽水平、钉子竖直）在 16px 下读成一支漏斗或一个过滤器
 * ——钉帽那条横线加收拢的钉身正是漏斗的形状，加上钉子更像「筛选」。斜 45° 之后
 * 钉帽与钉子错开，图钉的轮廓才立得住
 *
 * 三段都按 45° 轴直接算出来，而不是把竖直版本整体 `rotate()`：旋转会把每段
 * 描边推离像素栅格，拐角处糊成一团（试过，钉身与钉子粘连）。按轴算出的坐标让
 * 三条线段各自落在格点上
 *
 * 墨迹落在 x `3~13`、y `2~12`：与官方文件夹（y `2.429~13.5863`）同一尺寸域
 * 与放大镜等 16px 图标并排时不会一个大一个小
 */
const PIN_CAP = 'M6.80 3.12L12.88 9.20'
const PIN_BODY = 'M6.80 3.12L7.15 8.85L12.88 9.20'
const PIN_BODY_SOLID = 'M6.80 3.12L7.15 8.85L12.88 9.20Z'
const PIN_NEEDLE = 'M7.15 8.85L4.18 11.82'

/** 钉帽与钉子：两态共用的两端 */
function pinCapAndNeedle(): ReactElement {
  return (
    <>
      <path d={PIN_CAP} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d={PIN_NEEDLE} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </>
  )
}

/**
 * 未置顶的图钉：整枚走描边
 *
 * 用于菜单项行尾的置顶按钮。它与 {@link IconPinFill16} 是同一枚图钉的两态，几何
 * 逐点对齐，只有「描边 / 填充」这一个变量——菜单里同一个位置在两种状态下不能
 * 看起来是两枚不同的图标
 * @param props - 尺寸与类名，与官方图标组件一致
 * @returns 内联 SVG 图标
 */
export function IconPinOutline16({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none">
      {pinCapAndNeedle()}
      <path d={PIN_BODY} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 已置顶的图钉：钉身填实
 *
 * 置顶态因此不只靠颜色——色阶在浅色主题下对比有限，实心与描边才是两种状态下
 * 一眼可分的差别
 * @param props - 尺寸与类名，与官方图标组件一致
 * @returns 内联 SVG 图标
 */
export function IconPinFill16({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg width={size} height={size} className={className} viewBox="0 0 16 16" fill="none">
      {pinCapAndNeedle()}
      <path d={PIN_BODY_SOLID} fill="currentColor" />
    </svg>
  )
}
