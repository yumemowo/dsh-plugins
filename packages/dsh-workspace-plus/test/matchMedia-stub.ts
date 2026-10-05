/**
 * `matchMedia` 替身
 *
 * jsdom 没有 `matchMedia`（`typeof window.matchMedia === 'undefined'`），而置顶区要按
 * `(hover: hover)` 决定按哪一档渲染，因此这个全局必须在 jsdom 用例里替出来
 *
 * 交回的查询对象按**当前档位现读**（`matches` 是取值器），因此替身建好之后再切档也跟得上，
 * 与真浏览器的「媒体特性变化时同一个对象自己翻值」一致
 *
 * 档位只有两格，够本包用：悬停能力默认「有」，reduced-motion 恒「无」
 * 返回的对象只满足本包用到的部分（`matches` / `addEventListener` / `removeEventListener`）
 */

/** 当前是否具备悬停能力，`(hover: hover)` 与 `(hover: none)` 是它的两面 */
let hoverCapable = true

type Listener = () => void

/** 各查询串上挂着的监听，键是查询串本身，同一查询建出的多个对象共用一份 */
const listeners = new Map<string, Set<Listener>>()

/** 某条查询当前是否命中 */
function matchesOf(query: string): boolean {
  if (query.includes('hover')) return query.includes('none') ? !hoverCapable : hoverCapable
  if (query.includes('prefers-reduced-motion')) return false
  return false
}

/** 给查询串挂监听，返回那些监听的可变集合 */
function listenersFor(query: string): Set<Listener> {
  let set = listeners.get(query)
  if (set === undefined) {
    set = new Set()
    listeners.set(query, set)
  }
  return set
}

/** 造一个与 `MediaQueryList` 同形的查询对象 */
function createQuery(query: string): MediaQueryList {
  const set = listenersFor(query)
  return {
    media: query,
    get matches() {
      return matchesOf(query)
    },
    onchange: null,
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'change') set.add(listener)
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === 'change') set.delete(listener)
    },
    // 老式接口，本包不用；留着是为了替身与真对象同形
    addListener: (listener: Listener) => set.add(listener),
    removeListener: (listener: Listener) => set.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList
}

/** 装上 `matchMedia` 替身；已有就不覆盖，node 环境（没有 `window`）直接跳过 */
export function installMatchMedia(): void {
  if (typeof window === 'undefined') return
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = (query: string): MediaQueryList => createQuery(query)
}

/**
 * 切到「有悬停」或「无悬停」，并通知该档上的订阅读者
 *
 * 通知是必要的：只翻值不派事件时，订阅了变化的那一方不会重渲染，用例会误判为「切了没反应」
 * @param capable - 切到有悬停为 true，无悬停为 false
 */
export function setHoverCapable(capable: boolean): void {
  hoverCapable = capable
  for (const [query, set] of listeners) {
    if (!query.includes('hover')) continue
    for (const listener of [...set]) listener()
  }
}

/** 恢复默认档（有悬停），由 setup 的 `afterEach` 调用，避免用例之间互相带档 */
export function resetHoverCapable(): void {
  setHoverCapable(true)
}
