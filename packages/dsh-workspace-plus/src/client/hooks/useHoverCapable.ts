/**
 * 设备是否具备悬停能力的读数
 * 这个判定的是环境事实
 */
import { useSyncExternalStore } from 'react'

const HOVER_QUERY = '(hover: hover)'

let hoverQuery: MediaQueryList | null | undefined

function hoverQueryOf(): MediaQueryList | null {
  if (hoverQuery === undefined) {
    hoverQuery =
      typeof window === 'undefined' || typeof window.matchMedia !== 'function'
        ? null
        : window.matchMedia(HOVER_QUERY)
  }
  return hoverQuery
}

function subscribeHover(onChange: () => void): () => void {
  const query = hoverQueryOf()
  if (query === null) return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function hasHover(): boolean | undefined {
  return hoverQueryOf()?.matches
}

/**
 * 读取当前设备是否具备悬停能力
 */
export function useHoverCapable(): boolean | undefined {
  return useSyncExternalStore(subscribeHover, hasHover)
}
