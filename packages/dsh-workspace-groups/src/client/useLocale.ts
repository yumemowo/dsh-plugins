/**
 * 区域文案的唯一读取入口
 *
 * 区域根部把两个翻译函数投影成一张文案表，连同本包命名空间的翻译函数一起放进这里，组件只依赖 `useLocale()` 这一个具名入口
 * 缺少提供者时抛出，而不是让叶子拿到 `null` 后在各处崩掉
 *
 * 提供者交出的 value 身份必须稳定（容器侧用 `useMemo` 合成）：行级缓存按引用比对 props
 * value 每次新建会让 `React.memo` 包住的行组件在最坏情况下每次父渲染都重渲染（见 `docs/render-performance.md`）
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { RegionLabels } from './labels.ts'
import type { RegionTranslate } from './locales.ts'

/** 区域组件消费的文案：翻译函数与投影后的语义化文案表 */
export interface RegionLocale {
  /** 本包命名空间的翻译函数，读自有键，未命中时回退官方 `common` 的通用词 */
  t: RegionTranslate
  /** 投影后的文案表，组件按字段名取用 */
  labels: RegionLabels
}

const RegionLocaleContext = createContext<RegionLocale | null>(null)

/** 区域根部的文案提供者 */
export function RegionLocaleProvider({
  value,
  children,
}: {
  value: RegionLocale
  children: ReactNode
}): ReactElement {
  return createElement(RegionLocaleContext.Provider, { value }, children)
}

/**
 * 读取当前文案
 * @returns 区域文案
 */
export function useLocale(): RegionLocale {
  const value = useContext(RegionLocaleContext)
  if (value === null) {
    throw new Error('workspace-groups: useLocale() requires a RegionLocaleProvider above it')
  }
  return value
}
