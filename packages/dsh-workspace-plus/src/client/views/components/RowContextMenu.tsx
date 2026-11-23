/**
 * 行级右键菜单
 *
 * 条目与分派函数都直接取自该行的行内 `...` 菜单，差别只在入口与落点：右键打开、面板落在指针处
 * 因此同一个动作在两个入口下走的是同一段代码，不会各自漂移
 *
 * 定位交给官方 Menu 原语，面板本身不另造浮层
 * 该原语在 dsh 0.2.2 换了定位入口，两份 prop 因此同时给出，见 `useRowContextMenu` 里那段说明
 */
import { useCallback, useState } from 'react'
import type { ReactElement } from 'react'
import { Menu } from '../../runtime.ts'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import styles from '../../menus.module.css'

/**
 * 右键事件里本钩子要用的部分
 *
 * 声明成结构类型而不是取 React 的 `MouseEvent`：调用方把处理函数直接挂到行上时由 React 传入真实事件（真实事件满足这个形状）
 * 测试也能传替身事件
 */
export interface RowContextMenuEvent {
  clientX: number
  clientY: number
  /** 收到事件的行元素，只有键盘触发的右键需要它 */
  currentTarget: unknown
  preventDefault: () => void
  stopPropagation: () => void
}

/** 面板定位矩形，旧版原语的 `getAnchorRect` 只读四条边 */
interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** 面板定位点，新版原语的 `anchorPoint` 取客户端视口坐标 */
interface AnchorPoint {
  x: number
  y: number
}

/**
 * 右键落点
 *
 * 指针坐标就是菜单该出现的位置。键盘（菜单键）触发的 contextmenu 没有指针坐标，浏览器给的是 (0,0)
 * 那时退回量行自身，菜单落在行旁而不是被丢到窗口左上角
 * @returns 面板定位矩形
 */
function rectAt(event: RowContextMenuEvent): AnchorRect {
  if (event.clientX !== 0 || event.clientY !== 0) {
    const { clientX, clientY } = event
    return { left: clientX, top: clientY, right: clientX, bottom: clientY }
  }
  const target = event.currentTarget as { getBoundingClientRect?: () => DOMRect } | null
  const rect = target?.getBoundingClientRect?.()
  if (rect === undefined) return { left: 0, top: 0, right: 0, bottom: 0 }
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

export interface RowContextMenuOptions {
  /** 菜单条目，缺省或为空表示该行眼下没有条目 */
  items?: readonly MenuItem[] | undefined
  /** 选中项 id 的分派，与行内 `...` 菜单共用同一个函数 */
  onSelect: (id: string) => void
  /**
   * 这一行有没有右键入口
   *
   * 条目可能来自按需解析的注册表，解析之前它是空的
   * 因此不能拿「眼下有没有条目」当判据：那样第一次右键会落空，浏览器弹出自己的菜单
   * 由调用方说明「这一行能不能有菜单」，条目为空时由 {@link RowContextMenuOptions.onPrepare} 补齐
   */
  enabled: boolean
  /**
   * 打开前补齐条目
   *
   * 与行内 `...` 菜单同一个入口：两个面板共用同一批条目，因此准备动作也共用
   */
  onPrepare?: (() => void) | undefined
  /** 面板关掉时调用，用来释放 `onPrepare` 那一次准备 */
  onClose?: (() => void) | undefined
}

export interface RowContextMenu {
  /** 挂到行元素上的右键处理，没有菜单时为 undefined，那时右键保持浏览器默认行为 */
  onContextMenu: ((event: RowContextMenuEvent) => void) | undefined
  /** 随行渲染的菜单元素，没有菜单时为 null */
  menu: ReactElement | null
  /**
   * 右键面板是否开着
   *
   * 面板是第二处会浮在行上的东西（行内 `...` 菜单是另一处），悬停卡片据此在两种面板开着时都让位，否则同一个位置会叠上两层浮层
   */
  open: boolean
}

export function useRowContextMenu({
  items,
  onSelect,
  enabled,
  onPrepare,
  onClose,
}: RowContextMenuOptions): RowContextMenu {
  // 落点即开合状态：非空就是开着。菜单开着时再右键会换一个新的矩形对象，定位回调随之换引用，原语重新量一次，面板跟到新落点
  // 把落点单独放进 ref 的话这次重渲染会被 React 判定为状态未变而丢掉
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const getAnchorRect = useCallback(() => anchor, [anchor])
  // 新版原语按坐标打开菜单，同一份落点换个形状给它
  // 落点为 null（菜单关着）时不传，原语据此不渲染面板
  const anchorPoint: AnchorPoint | undefined =
    anchor === null ? undefined : { x: anchor.left, y: anchor.top }

  // 条目为空时仍是有效的一次打开：落点先记下，条目补齐后同一次渲染就把面板画出来
  const onContextMenu = useCallback((event: RowContextMenuEvent) => {
    // 没有这一层就没有自绘面板可言：浏览器会先弹出它自己的菜单
    event.preventDefault()
    // 行嵌在 shell 的区域里，不让它继续冒泡，否则外层若也认右键会同时开两个菜单
    event.stopPropagation()
    onPrepare?.()
    setAnchor(rectAt(event))
  }, [onPrepare])

  if (!enabled) {
    return { onContextMenu: undefined, menu: null, open: false }
  }

  // 条目一条都没有时面板不画：右键仍被接住，只是没有可点的东西，留一个空框比不弹更糟
  const entries = items ?? []
  const open = anchor !== null && entries.length > 0

  return {
    onContextMenu,
    open,
    menu: (
      <Menu
        open={open}
        onClose={() => {
          setAnchor(null)
          onClose?.()
        }}
        onSelect={(id: string) => {
          setAnchor(null)
          onSelect(id)
        }}
        items={entries}
        // 落点是指针而不是某个锚点元素，原语因此要求 anchor 为空
        // portal 之后行的裁剪容器不再裁到面板
        anchor={null}
        // 定位入口按宿主版本二选一：dsh 0.2.2 起原语改用 anchorPoint，之前用 getAnchorRect
        // 两份都给没有冲突——各自那一版原语只认自己的那份，另一份落在 props 上无人读取
        // 去掉任一份都会让那一侧的宿主把面板开在视口原点（右上角那个角）
        getAnchorRect={getAnchorRect}
        anchorPoint={anchorPoint}
        portal
        // 与锚在按钮旁的 `...` 菜单不同，这里不随指针离开关闭：指针只在菜单打开那一刻停在落点，之后移向条目正是正常操作
        //
        // 类名只为一件事：原语根节点默认是 position: relative 的行内盒
        // 留在行里会让行的 flex 排布多出一个子项（分组行还会多算一份 gap）
        // 该类的规则把它收成零尺寸盒并摘出行内流，面板本身是 portal 出去的，不受影响
        className={styles.contextMenu}
        // 二级面板的底色与 `...` 菜单同一处处理（见 `menus.module.css` 的 `.menuList`）
        listClassName={styles.menuList}
      />
    ),
  }
}
