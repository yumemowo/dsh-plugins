/**
 * 行级键盘激活：Enter 与 Space 触发整行动作
 *
 * 只认行自身获得焦点的那一次按键。行内按钮上的按键会先触发按钮动作、再冒泡到
 * 行，若不拦住，在按钮上按 Enter 会连带折叠工作区或打开会话
 * @param event - 行的 keydown 事件
 * @param activate - 行被激活时执行的动作（折叠切换或打开会话）
 */
export function handleRowKeyDown(
  event: { target: unknown; currentTarget: unknown; key: string; preventDefault: () => void },
  activate: () => void,
): void {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  activate()
}
