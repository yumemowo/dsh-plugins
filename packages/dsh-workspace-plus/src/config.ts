/**
 * 置顶区的两个可调项
 *
 * 字段都标 `.volatile()`
 * 设置页只暴露 volatile 字段：非 volatile 字段整条不出现在设置页，写入时还会被宿主拒绝
 * 而 volatile 字段改动走 Loader 的短路径，把新值直接写进已持有的引用、不重启插件
 * 本包的服务与 remote 挂载因此不会为改一个数字重建一次
 *
 * 因此 apply 收下的是引用而不是值：快照每次下发时现场 `.get()`，改完设置当场读到新数
 */
import type { Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

/** 置顶区静止时显示几条，超出部分按浏览器本地的溢出给法处理 */
export const DEFAULT_PINNED_VISIBLE_COUNT = 5

/**
 * 置顶数量的上限
 *
 * 官方 pin 集合没有上限参数，本包无法让宿主拒绝写入，因此上限只表现为达到后把置顶入口置为禁用态
 * 调低上限不会取消已有的置顶
 */
export const DEFAULT_PINNED_LIMIT = 20

/**
 * 本包的行配置 schema
 *
 * 加载器在插件启动前用它校验行配置，因此 apply 不会收到非法值
 * 两个字段都带默认值，`cordis.patch.yml` 里可以整段省略
 */
export const Config = z.object({
  pinnedVisibleCount: z.number().min(1).default(DEFAULT_PINNED_VISIBLE_COUNT).volatile(),
  pinnedLimit: z.number().min(1).default(DEFAULT_PINNED_LIMIT).volatile(),
})

/** 校验后的行配置，与 {@link Config} 的输出一致 */
export interface WorkspacePlusConfig {
  readonly pinnedVisibleCount: Volatile<number>
  readonly pinnedLimit: Volatile<number>
}
