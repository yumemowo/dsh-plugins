/**
 * 会话列表展示方式的存储
 *
 * 这个选择是浏览器本地偏好而不是分组元数据，因此不进宿主的存储域，也不随快照往返
 * 引擎用官方 `@deepseek-ai/dsh-client-store` 的 `defineStore`，与官方 ui-workspace 的 `groupBy` 同一套
 *
 * 存储键与官方 `dsh.workspace.view.*` 分开：两者是两套独立的界面状态，共用键会互相覆盖
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ViewMode } from './data/types.ts'

/** 展示方式的状态形状，同时是选择器读数的输入 */
export interface ViewModeState {
  mode: ViewMode
}

/** 引擎按这个键持久化，改名等于丢掉用户已经选过的展示方式 */
export const VIEW_MODE_PERSIST_KEY = 'dsh.workspace-groups.view.v1'

/**
 * 造一个展示方式的存储句柄
 *
 * 只导出工厂、不导出模块级句柄：句柄的模块级身份会跨插件重载把实例钉住
 */
export function createViewModeStore() {
  return defineStore({
    init: (): ViewModeState => ({ mode: 'workspace' }),
    persist: VIEW_MODE_PERSIST_KEY,
    actions: {
      setMode: (draft, mode: ViewMode) => {
        draft.mode = mode
      },
    },
  })
}

export type ViewModeStoreHandle = ReturnType<typeof createViewModeStore>

/** 该句柄的写入口，与组件从 store 座位拿到的 `actions` 是同一批 */
export type ViewModeActions = ReturnType<ViewModeStoreHandle['create']>['actions']

/**
 * 把一个句柄改成「无论何时都交回同一个实例」
 *
 * 对照模式下本区域挂在会话作用域的右侧栏 tab 里，而展示方式不该按会话各存一份
 * 因此把这个实例在挂载期就建好，`create` 恒交回它
 * @param handle - 原句柄
 */
export function sharedViewModeStore(handle: ViewModeStoreHandle): ViewModeStoreHandle {
  const instance = handle.create()
  return { ...handle, create: () => instance }
}
