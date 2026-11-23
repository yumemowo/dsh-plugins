/**
 * 官方 `contextMenu.icon` 那个 keyed 插槽里的字形
 *
 * 注册表条目只给图标键（`workspace.rename` 这类），字形由那个插槽的占用者提供
 * 本包的面板自己渲染，因此按 key 从占用者表里取出组件再渲染
 * 取不到时返回 null：该条目只剩文字，菜单本身不受影响（第三方插件可能注册了本包不认识的键）
 */
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

/**
 * 造一个「图标键 -> 字形」的解析器
 * @param slots - 客户端的插槽注册表
 * @returns 解析器，键没有占用者时返回 null
 */
export function menuIconOf(slots: SlotRegistry): (key: string) => ReactNode {
  return (key: string): ReactNode => {
    const entry = slots
      .entries('contextMenu.icon' as never)
      .find((candidate) => (candidate.options as { key?: string }).key === key)
    if (entry === undefined || typeof entry.component !== 'function') return null
    return createElement(entry.component as (props: Record<string, unknown>) => ReactNode, { icon: { key } })
  }
}
