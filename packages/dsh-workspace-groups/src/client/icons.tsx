/**
 * 本包自绘的图标
 *
 * 优先复用官方原语不等于只能用它现成的那几个
 * 官方 primitives 里没有这两类字形，因此在这里自绘：
 * - 「带加号的文件夹」：官方只有 `IconProjectAddOutlineRegular`（方正的开框 + 加号），没有文件夹形态的那一份
 * - 「虚线的文件夹」：官方文件夹族没有虚线版，见 {@link IconVirtualFolder16}
 *
 * 这里按官方 primitives 的绘制规范自绘，视觉上与它们同族：
 *
 * - `viewBox="0 0 16 16"`、`fill="none"`、无 `xmlns`（与官方内联 SVG 同形）
 * - 颜色一律 `currentColor`，因此继承行的文字色，不写死
 * - 只用描边，不填充：官方那几个 outline 图标同样是描边族
 * - 文件夹轮廓与官方 `IconFolderCloseRegular` 同一尺寸域（左右顶到 1.5 / 14.5），两者因此同族
 *
 * 两个造型在 16px 下轮廓清晰、互不粘连或断开（量法见 `docs/custom-icons.md`）
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
 * 取 `1.6/1.1` 是量出来的：再密（`1.2` 级）在 16px 下糊成一条灰毛边，虚线读不出来只像画质差
 * 再疏（`2.8` 级）则轮廓出现几乎断开的缺口，像没画完。两个虚线图标共用同一个值，断口的密度与相位因此一致
 */
const DASH = '1.6 1.1'

/**
 * 文件夹轮廓的中心路径
 *
 * 官方 `IconFolderCloseRegular` 是 `fill="none"` 加 1px 描边，`d` 即中心路径
 * 本包描 1.3，两者在 16px 下墨迹都落在 `x1..14 y1..14`
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
 * 自右壁断口 `(14.5, 10.2)` 起笔绕到页签右肩 `(8.0231, 4.295)` 收笔，右上这一整段缺口留给加号
 * 断口高度取 `10.2`：再往上会把右壁削短、文件夹读起来缺一个角
 */
const FOLDER_NOTCHED =
  'M14.5 10.2V11.9127' +
  FOLDER_MIDLINE +
  'A1.6736 1.6736 0 0 1 3.1736 2.429H5.6132L8.0231 4.295'

/**
 * 加号：位置与长度照官方 `IconProjectAddOutlineRegular` 的加号
 *
 * 中心 `(12.52, 5.52)`、全长 `6`（官方那份的加号中心与长度都取自它）
 * 线端不用 `round`：官方加号是平头的，圆头会让四臂长出半格、与文件夹缺口粘连
 */
const PLUS = 'M9.52 5.52H15.52M12.52 2.52V8.52'

/**
 * 工作区分组：虚线的文件夹，右上角开口里一个加号
 *
 * 用于「新建工作区分组」入口与「移动到工作区分组」菜单项
 * 文件夹部分与 {@link IconVirtualFolder16} 用同一份轮廓
 * 只是右上角不闭合，缺口留给加号——「文件夹 + 加号 + 开口方位」这一构图与官方 `IconProjectAddOutlineRegular` 同源
 * 虚线让它与相邻的实线文件夹（代表真实工作区）一眼可分
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
 * 用于工作区分组行——它把一组工作区打包在一起，形状上「像一个工作区」，但本身不是一个真实工作区（没有目录、没有会话）
 * 虚线正是 DSH 表达「尚未真实存在 / 占位」的既有语言
 * 待办清单里未开始的圆圈用 `strokeDasharray="2.4 2.4"`
 * composer 的工作区占位框用 `stroke-dasharray='4 4'`
 *
 * 官方 `IconFolderCloseRegular` 是描边字形，没有虚线版
 * 因此照它的轮廓（x `1.5~14.5`、y `2.429~13.5863`）自绘一份描边版
 * 并保留它的圆角与 1.3 壁厚，两者并排时同族且同域
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
