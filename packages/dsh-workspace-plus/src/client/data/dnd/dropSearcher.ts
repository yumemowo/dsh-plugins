/**
 * 拖拽落点的唯一检测入口
 *
 * 输入是 DOM 已经给出的两样东西：指针落在哪几格上、压着哪一行
 * 输出是「哪一片、哪一处单位、线的哪一侧」。它不碰元素，也不认识索引
 * 因此判定就是「沿这一格往上，找第一个接受这种读法的片区」：片区自己声明占哪几格
 *
 * 唯一的例外是线的上下半：那要量一量有多高、顶边在哪。量的是落点自己那一块
 * 因此量法由调用方给（见 {@link BlockMeasure}），检测器仍然不碰元素
 */
import type { DropArea, DropUnit } from './protocol.ts'
import { isBodyZone } from './zones.ts'

/** 一块落点单位的几何读数：只有分上下半要用的那两格 */
export interface BlockRect {
  top: number
  height: number
}

/**
 * 量一块落点单位的口子
 *
 * 交给检测器的是这个函数而不是读数本身：线的上下半只在真的对上单位时才要量
 * 而指针每移动一次都会走一遍检测。传读数会让调用方每帧量一次，传这个口子只在需要时量
 */
export type BlockMeasure = () => BlockRect

/** 线画在落点的哪一侧 */
export type DropSide = 'before' | 'after'

/** 一次检测的交回：至多一个框、一条线 */
export interface DropHit {
  /** 整块落进这一片，画一圈 */
  inside?: DropTarget
  /** 与这一片谈先后，画一条线 */
  order?: OrderHit
}

/** 一次投放落在哪一片的哪一处 */
export interface DropTarget {
  /** 接住这次投放的那一片 */
  area: DropArea
  /** 命中的那一处读数单位 */
  unit: DropUnit
}

/** 谈先后的那一支：多一个方向，以及那处缝归谁 */
export interface OrderHit extends DropTarget {
  /** 线画在单位的哪一侧 */
  side: DropSide
  /**
   * 「排到这一条之后」那处缝由谁代言
   *
   * 屏幕上只有一处空白，从哪一侧靠近都该是同一个像素位置、同一个标记
   * 因此「之后」在这里就换成下一条的「之前」——检测层握着全部片区，只有它找得到那一条
   */
  seam?: DropTarget
}

/** 检测器 */
export interface DropSearcher {
  /**
   * 指针此刻落在哪一片上
   * @param zones - 指针那一点所在的全部区域键，最近的在前
   * @param rowId - 指针压着的那一行，没有时为 undefined
   * @param point - 指针坐标
   * @param measureOf - 量一处单位的口子，那一处还没渲染出来时返回 undefined
   * @returns 命中的那一片与那一处单位，这一格谁也接不住时为 null
   */
  checkDrop(
    zones: readonly string[],
    rowId: string | undefined,
    point: { x: number; y: number },
    measureOf: (area: DropArea, unit: DropUnit) => BlockMeasure | undefined,
  ): DropHit | null
}

/**
 * 把一份片区名单收成一个检测器
 *
 * 名单只回答「这次拖拽允许落到哪几片」。指针这一点属于谁由它自己在哪几格决定
 * 那几格是渲染层写下的事实，检测层因此不必沿任何东西往上走
 * @param areas - 这次拖拽允许落到哪几片
 */
export function maybeDropSearcher(areas: readonly DropArea[]): DropSearcher {
  /** 区域键 -> 那一片：一片占好几格，每一格都指向同一片 */
  const byZone = new Map<string, DropArea>()
  for (const area of areas) {
    for (const zone of area.zones) {
      // 一格只归一片：这次拖拽里同一个人不会既承接放入又承接位次
      if (!byZone.has(zone)) byZone.set(zone, area)
    }
  }

  return {
    checkDrop(zones, rowId, point, measureOf) {
      const hit: DropHit = {}
      // 框与线各自沿这一串格子往上找：两者是两件事，可以同时成立
      // 框不从线上取——那一行有自己的上下文，拿它的片区当框会把一块不相干的区域高亮起来
      for (const [index, zone] of zones.entries()) {
        const area = byZone.get(zone)
        if (area === undefined) continue
        // 声明了只在同一层接的那一片：中间隔了别的容器就不算它
        // 「隔了别的容器」在这一串格子上表现为——前面出现过某个容器的体内那一格
        if (area.hitArea === 'ownLevel' && zones.slice(0, index).some(isBodyZone)) continue
        const unit = unitOf(area, rowId)
        // 这一片接，但指针没落进它任何一处单位里（一格装多行的那种）：继续往上找
        if (unit === undefined) continue
        if (area.accepts === 'inside') {
          if (hit.inside === undefined) hit.inside = { area, unit }
          continue
        }
        if (hit.order !== undefined) continue
        const measure = measureOf(area, unit)
        if (measure === undefined) continue
        // 线一定有方向：量不出高度时读作「之前」，那处缝落在这一块自己身上
        const side = sideOf(measure(), point)
        // 「之后」那处缝归下一条的上缘。那一条可能是同一片里的另一处单位（一格装多行），也可能是另一片
        // 两种情形都从这张名单里找
        const seam = side === 'before' ? undefined : seamTargetOf(areas, area, unit)
        hit.order = { area, unit, side, ...(seam === undefined ? {} : { seam }) }
      }
      return hit.inside === undefined && hit.order === undefined ? null : hit
    },
  }
}

/**
 * 一片里命中哪一处单位
 *
 * 一条片只有一个单位时就是它（一个工作区块、一个分组），一格装多行时按指针压着的那一行选
 * 选不出就是这一片这次不接
 * @param area - 命中的那一片
 * @param rowId - 指针压着的那一行
 */
function unitOf(area: DropArea, rowId: string | undefined): DropUnit | undefined {
  if (area.units.length === 1) return area.units[0]
  return area.units.find((unit) => unit.row === rowId)
}

/**
 * 「排到这一条之后」那处缝由谁代言
 *
 * 下一条可能是同一片里的另一处单位（一格装多行：置顶段），也可能是另一片里的成员（分组、工作区那几族）
 * 两处都按 {@link DropUnit.seam} 找到它
 * @param areas - 这次拖拽的全部片区
 * @param area - 当前这一片
 * @param unit - 当前这一处单位
 */
function seamTargetOf(
  areas: readonly DropArea[],
  area: DropArea,
  unit: DropUnit,
): DropTarget | undefined {
  if (unit.seam === undefined) return undefined
  const inSame = area.units.find((each) => each.row === unit.seam)
  if (inSame !== undefined) return { area, unit: inSame }
  for (const other of areas) {
    const found = other.units.find((each) => each.row === unit.seam)
    if (found !== undefined) return { area: other, unit: found }
  }
  return undefined
}

/**
 * 指针落在这一块的上半还是下半
 *
 * 量的那一块由片区给出：落点本身是节点，没有矩形可言
 * 量不出高度时读作「之前」：尚未布局的元素与 jsdom 都是这种情形，那时分不出上下
 * 而「之前」那处缝落在这一块自己身上，读出来仍是指着它的一条线
 * @param rect - 落点那一块的矩形
 * @param point - 指针坐标
 */
function sideOf(rect: BlockRect, point: { x: number; y: number }): DropSide {
  if (rect.height <= 0) return 'before'
  return point.y - rect.top < rect.height / 2 ? 'before' : 'after'
}
