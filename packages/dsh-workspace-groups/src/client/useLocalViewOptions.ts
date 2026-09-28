/**
 * 存储在浏览器内的视图选项偏好的唯一读取入口
 *
 * 展示方式与指示器样式都是浏览器本地 store 里的值（见 `store/viewMode.ts`）
 * 但消费它们的组件散在头部、列表与菜单三处
 * 逐层当 props 传会把这条偏好穿进与它无关的组件，调整一处就要动一串签名
 * 因此改成 context + 具名 hook
 * 区域根部把读数与写入口合成一次放进这里，用到的地方自己 `useLocalViewOptions()` 取
 *
 * 提供者交出的 value 身份必须稳定（容器侧用 `useMemo` 合成），行级缓存按引用比对 props
 * 缺少提供者时抛出，而不是让叶子拿到 `null` 后在各处崩掉
 *
 * 只装浏览器本地 store 里那两个选择（展示方式、指示器样式）
 * 视图选项面板里那第三个设置（子工作区嵌套）是分组元数据、随快照往返，因此仍由区域容器当 props 下发
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { IndicatorStyle, ViewMode } from './data/types.ts'

/** 视图选项偏好：当前值与两个写入口 */
export interface LocalViewOptions {
  mode: ViewMode
  indicator: IndicatorStyle
  setMode: (mode: ViewMode) => void
  setIndicator: (style: IndicatorStyle) => void
}

const LocalViewOptionsContext = createContext<LocalViewOptions | null>(null)

/** 区域根部的视图选项提供者 */
export function LocalViewOptionsProvider({
  value,
  children,
}: {
  value: LocalViewOptions
  children: ReactNode
}): ReactElement {
  return createElement(LocalViewOptionsContext.Provider, { value }, children)
}

/**
 * 读取当前视图选项偏好
 * @returns 当前值与两个写入口
 */
export function useLocalViewOptions(): LocalViewOptions {
  const value = useContext(LocalViewOptionsContext)
  if (value === null) {
    throw new Error('workspace-groups: useLocalViewOptions() requires a ViewOptionsProvider above it')
  }
  return value
}
