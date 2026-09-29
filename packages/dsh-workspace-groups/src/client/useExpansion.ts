/**
 * 浏览器本地 store 里三层折叠态的唯一读取入口
 *
 * 展开记录存在浏览器本地 store 里（见 `store/viewMode.ts`），而消费它的组件散在列表区与工作区块两处
 * 逐层当 props 传要穿过递归的工作区块，且每层都要自己拼一次键，调整一处就要动一串签名
 * 因此改成 context + 具名 hook，与 `useLocalViewOptions.ts` 同一套做法
 * 区域根部把每层的生效判据与取反写入口合成一次放进这里，用到的地方自己 `useExpansion()` 取
 *
 * 提供者交出的 value 由容器用 `useMemo` 合成；当前没有 `memo` 行消费它，稳定身份换不来缓存收益，那样写是为了让依赖只列输入而不是一串函数名
 * 缺少提供者时抛出，而不是让叶子拿到 `null` 后在各处崩掉
 *
 * 只装三层折叠态的读与取反；「写到展开」那三个入口是区域容器揭示 / 新建会话前的编排，只有容器用得到，因此不进这里
 */
import { createContext, createElement, useContext } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { SessionGroupRef } from './store/viewMode.ts'

/**
 * 三层折叠态的生效判据与取反入口
 *
 * 每层的默认值由结构现推（无父工作区展开、会话分组折叠…），判据把「用户显式选择」与那个默认合成为生效值
 */
export interface Expansion {
  /** 工作区层当前生效的展开态，键是裸 workspaceId 与「未分组」桶的哨兵 */
  isWorkspaceExpanded: (key: string) => boolean
  /** 工作区分组层当前生效的展开态，默认展开 */
  isVirtualWorkspaceExpanded: (key: string) => boolean
  /** 会话分组层当前生效的展开态，默认折叠 */
  isGroupExpanded: (ref: SessionGroupRef) => boolean
  /** 取反并写盘：默认值参与取反，因此默认展开的那一层第一次点击是「折叠」 */
  toggleWorkspace: (key: string) => void
  toggleVirtualWorkspace: (key: string) => void
  toggleGroup: (ref: SessionGroupRef) => void
}

const ExpansionContext = createContext<Expansion | null>(null)

/** 区域根部的折叠态提供者 */
export function ExpansionProvider({
  value,
  children,
}: {
  value: Expansion
  children: ReactNode
}): ReactElement {
  return createElement(ExpansionContext.Provider, { value }, children)
}

/**
 * 读取三层折叠态的生效判据与取反入口
 * @returns 三层的读数与取反
 */
export function useExpansion(): Expansion {
  const value = useContext(ExpansionContext)
  if (value === null) {
    throw new Error('workspace-groups: useExpansion() requires an ExpansionProvider above it')
  }
  return value
}
