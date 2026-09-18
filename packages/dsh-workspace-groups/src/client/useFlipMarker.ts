/**
 * 把区域的实测位置翻成 body 上的浮层翻转标记
 *
 * 官方浮层固定向右展开（详见 utils/flip.ts），区域停在窗口右缘时会把它们顶到
 * 屏幕外。要不要翻只能量出区域的矩形才知道，因此判定单独放在 utils/flip.ts，
 * 这个钩子只负责量测与落标记
 *
 * 标记落在 `document.body` 上而不是区域节点上：浮层是 portal 到 body 的，
 * 与区域没有祖先关系，挂在区域上的属性它读不到。自定义属性可以从 body 继承
 * 下去，卡片就落在 body 下，因此那里能读到翻转后的落点
 */
import { useLayoutEffect, useState } from 'react'
import { FLIP_ATTRIBUTE, FLIP_RIGHT_VAR, flipPlacement } from './utils/flip.ts'

/**
 * 观察区域的位置，必要时挂上翻转标记
 *
 * 收节点的是回调而不是 `RefObject`：窄栏时区域根本不渲染这个根节点（只渲染展开
 * 入口），`ref.current` 会一直是 null，而一次性的 effect 那时已经跑完，用户随后
 * 展开侧栏就再也没人量了。按节点变化重跑 effect 才跟得住窄栏与宽栏之间的切换
 * @returns 挂到区域根节点上的回调引用；引用恒定，不会引起重挂
 */
export function useFlipMarker(): (node: HTMLElement | null) => void {
  const [region, setRegion] = useState<HTMLElement | null>(null)

  useLayoutEffect(() => {
    // node 测试环境没有 DOM；这里提前退出，量测逻辑因此不必到处判空
    if (region === null) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const measure = (): void => {
      // 量的是**布局视口**宽度（documentElement.clientWidth）而不是
      // window.innerWidth：二者差一个经典滚动条宽度，而 fixed 定位与
      // getBoundingClientRect 都以布局视口为参照，混用会让卡片偏出一截
      const viewportWidth = document.documentElement.clientWidth
      const placement = flipPlacement(region.getBoundingClientRect(), viewportWidth)
      const body = document.body
      if (placement.flipped) {
        // 属性与落点必须同时到位：样式只在属性存在时读那个变量，反过来变量在而
        // 属性不在只是不生效，属性在而变量缺会让卡片落到 static 位置
        body.setAttribute(FLIP_ATTRIBUTE, '')
        body.style.setProperty(FLIP_RIGHT_VAR, placement.right)
        return
      }
      body.removeAttribute(FLIP_ATTRIBUTE)
      body.style.removeProperty(FLIP_RIGHT_VAR)
    }

    measure()
    window.addEventListener('resize', measure)
    // jsdom 没有 ResizeObserver；它只影响拖动侧栏时的即时性，缺了不影响正确性
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(region)

    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
      document.body.removeAttribute(FLIP_ATTRIBUTE)
      document.body.style.removeProperty(FLIP_RIGHT_VAR)
    }
  }, [region])

  return setRegion
}
