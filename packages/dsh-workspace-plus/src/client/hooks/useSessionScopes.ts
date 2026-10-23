/**
 * 各区段「露出几条」的展开态
 *
 * 与三层折叠态同一套做法：不逐层传 props，由区域根部经 provider 下发，用到的地方自己取
 * 差别在来源：那三层落盘，这一层只活在当前这次页面的内存里（与官方那条溢出按钮同一取舍）
 *
 * 拿在区域根部是因为这一格原先活在 `SessionList` 里
 * 那个组件不知道自己属于哪一段，也就说不出自己露了几行
 */
import { createContext, createElement, useContext, useEffect, useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { sessionScopeKey } from '../data/collapse.ts'
import type { SessionScopeRef } from '../data/collapse.ts'

/**
 * 会话区段展开态的读与写
 *
 * 入口一律收坐标而不是键：键的编码只该有一处（`sessionScopeKey`），调用点不该自己拼
 */
export interface SessionScopes {
  /** 这一段当前是否展开到全部行 */
  isExpanded: (ref: SessionScopeRef) => boolean
  /** 翻转一段 */
  toggle: (ref: SessionScopeRef) => void
  /** 把一段写到展开，已经展开的不重复写 */
  expand: (ref: SessionScopeRef) => void
  /** 清掉一段的记录，回到折叠态 */
  clear: (ref: SessionScopeRef) => void
}

const SessionScopesContext = createContext<SessionScopes | null>(null)

/** 会话区段展开态的提供者 */
export function SessionScopesProvider({
  value,
  children,
}: {
  value: SessionScopes
  children: ReactNode
}): ReactElement {
  return createElement(SessionScopesContext.Provider, { value }, children)
}

/**
 * 读取会话区段的展开态
 * @returns 读与三处写入口
 */
export function useSessionScopes(): SessionScopes {
  const value = useContext(SessionScopesContext)
  if (value === null) {
    throw new Error('workspace-plus: useSessionScopes() requires a SessionScopesProvider above it')
  }
  return value
}

/**
 * 容器收起时把本段一并收回折叠态
 *
 * 展开态不落盘，跨一次收起 / 展开留着没有意义，而且会让列表读起来像自己变长了
 * 收在本段自己那一格而不是容器那一层：一段的展开与另一段无关，容器不该知道它名下建过哪几段
 * @param ref - 本段的坐标
 * @param open - 所在容器当前是否展开
 */
export function useResetScopeOnCollapse(ref: SessionScopeRef, open: boolean): void {
  const { clear } = useSessionScopes()
  // 写入口的身份每写一次都会变（它闭着那一份记录），直接进依赖列会让
  // 「写一次 → 身份变 → 再清一次」自激，展开态刚写就被收回去，因此走 ref
  const clearRef = useRef(clear)
  clearRef.current = clear
  // ref 同理：键由它算出来，只盯键
  const key = sessionScopeKey(ref)
  useEffect(() => {
    if (!open) clearRef.current(ref)
  }, [open, key]) // eslint-disable-line react-hooks/exhaustive-deps
}
