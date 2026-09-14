/**
 * 基线模块的运行时引用面。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 只存在于客户端模块系统的基线
 * 静态模块表，没有独立安装形态；值导入集中在这一处，打包脚本把它标成
 * external 由宿主解析，类型由 ambient 声明（primitives-env.d.ts）提供。
 */

export { Menu } from '@deepseek-ai/dsh-client-ui-primitives'
