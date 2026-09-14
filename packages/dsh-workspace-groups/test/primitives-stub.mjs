/**
 * `@deepseek-ai/dsh-client-ui-primitives` 的 node 测试替身。
 *
 * 只覆盖本包用到的 `Menu`：node 环境不渲染组件，测试只断言菜单条目
 * 数据与注册行为，`Menu` 返回 null 即可。
 */

export const Menu = () => null

export default { Menu }
