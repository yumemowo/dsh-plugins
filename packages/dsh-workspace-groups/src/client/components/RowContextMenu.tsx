/**
 * 行级右键菜单
 *
 * 条目与分派函数都直接取自该行的行内 `...` 菜单，差别只在入口与落点：右键
 * 打开、面板落在指针处。因此同一个动作在两个入口下走的是同一段代码，不会
 * 各自漂移
 *
 * 定位借用官方 Menu 原语的 `getAnchorRect`（官方 WorkspacePickFlow 用的同一个
 * 入口），面板本身仍是官方原语，本包不另造浮层
 */
import { useCallback, useState } from 'react'
import type { ReactElement } from 'react'
import { Menu } from '../runtime.ts'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 右键事件里本钩子要用的部分
 *
 * 声明成结构类型而不是取 React 的 `MouseEvent`：调用方把处理函数直接挂到行上
 * 时由 React 传入真实事件（真实事件满足这个形状），测试也能传替身事件
 */
export interface RowContextMenuEvent {
  clientX: number
  clientY: number
  /** 收到事件的行元素；只有键盘触发的右键需要它 */
  currentTarget: unknown
  preventDefault: () => void
  stopPropagation: () => void
}

/** 面板定位矩形；官方原语只读四条边 */
interface AnchorRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * 右键落点
 *
 * 指针坐标就是菜单该出现的位置。键盘（菜单键）触发的 contextmenu 没有指针
 * 坐标，浏览器给的是 (0,0)：那时退回量行自身，菜单落在行旁而不是被丢到窗口
 * 左上角
 * @param event - 行的右键事件
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
  /** 菜单条目；缺省或为空表示该行没有右键菜单 */
  items?: readonly MenuItem[] | undefined
  /** 选中项 id 的分派；与行内 `...` 菜单共用同一个函数 */
  onSelect: (id: string) => void
}

export interface RowContextMenu {
  /** 挂到行元素上的右键处理；没有菜单时为 undefined，那时右键保持浏览器默认行为 */
  onContextMenu: ((event: RowContextMenuEvent) => void) | undefined
  /** 随行渲染的菜单元素；没有菜单时为 null */
  menu: ReactElement | null
  /**
   * 右键面板是否开着
   *
   * 面板是第二处会浮在行上的东西（行内 `...` 菜单是另一处），悬停卡片据此在
   * 两种面板开着时都让位，否则同一个位置会叠上两层浮层
   */
  open: boolean
}

export function useRowContextMenu({ items, onSelect }: RowContextMenuOptions): RowContextMenu {
  // 落点即开合状态：非空就是开着。菜单开着时再右键会换一个新的矩形对象，
  // 定位回调随之换引用，原语重新量一次，面板跟到新落点——把落点单独放进
  // ref 的话这次重渲染会被 React 判定为状态未变而丢掉
  const [anchor, setAnchor] = useState<AnchorRect | null>(null)
  const getAnchorRect = useCallback(() => anchor, [anchor])

  const onContextMenu = useCallback((event: RowContextMenuEvent) => {
    // 没有这一层就没有自绘面板可言：浏览器会先弹出它自己的菜单
    event.preventDefault()
    // 行嵌在 shell 的区域里，不让它继续冒泡，否则外层若也认右键会同时开两个菜单
    event.stopPropagation()
    setAnchor(rectAt(event))
  }, [])

  if (items === undefined || items.length === 0) {
    return { onContextMenu: undefined, menu: null, open: false }
  }

  return {
    onContextMenu,
    open: anchor !== null,
    menu: (
      <Menu
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        onSelect={(id: string) => {
          setAnchor(null)
          onSelect(id)
        }}
        items={items}
        // 落点是指针而不是某个锚点元素：原语因此要求 anchor 为空、定位交给
        // getAnchorRect。portal 之后行的裁剪容器不再裁到面板
        anchor={null}
        getAnchorRect={getAnchorRect}
        portal
        // 与锚在按钮旁的 `...` 菜单不同，这里不随指针离开关闭：指针只在菜单
        // 打开那一刻停在落点，之后移向条目正是正常操作
        //
        // 类名只为一件事：原语根节点默认是 position: relative 的行内盒，留在行里
        // 会让行的 flex 排布多出一个子项（分组行还会多算一份 gap）。该类的规则把
        // 它整盒去掉，面板本身是 portal 出去的，不受影响
        className="wg-context-menu"
      />
    ),
  }
}
