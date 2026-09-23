import * as React from 'react'

/**
 * 把一个菜单项 `label` 铺成纯文本
 *
 * 带二级菜单的一级项，其 `label` 是「文案 + 行尾箭头」的行盒（见 menus.tsx 的 `submenuParentLabel`）
 * 不再是裸字符串。文案仍要能被读到：这里递归取元素树里的文本，断言因此不必自己拆那一层包装
 * @param label - 菜单项的 label（字符串、元素或它们组成的数组）
 * @returns 树里所有文本拼接出的文案
 */
export function menuLabelText(label: unknown): string {
  if (typeof label === 'string' || typeof label === 'number') return String(label)
  if (Array.isArray(label)) return label.map(menuLabelText).join('')
  if (!React.isValidElement(label)) return ''
  const el = label as React.ReactElement & { props: { children?: unknown } }
  return menuLabelText(el.props.children)
}

/**
 * 取菜单项 label 里的行尾箭头元素
 *
 * 箭头按类名标记，因此这里找的是带 `wg-menu-arrow` 的那个元素——它同时守两件事：
 * 箭头确实渲染进了 label，以及样式表的挂钩类名没被改名
 * @param label - 菜单项的 label
 * @returns 箭头元素，label 里没有箭头时返回 undefined
 */
export function menuLabelArrow(label: unknown): { props: Record<string, unknown> } | undefined {
  if (Array.isArray(label)) {
    for (const child of label) {
      const found = menuLabelArrow(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!React.isValidElement(label)) return undefined
  const el = label as React.ReactElement & { props: Record<string, unknown> }
  if (el.props['className'] === 'wg-menu-arrow') return el
  return menuLabelArrow(el.props['children'])
}
