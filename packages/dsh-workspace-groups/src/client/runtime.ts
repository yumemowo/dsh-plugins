/**
 * 基线模块的运行时引用面
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 只存在于客户端模块系统的基线
 * 静态模块表，没有独立安装形态；值导入集中在这一处，打包脚本把它标成
 * external 由宿主解析，类型由 ambient 声明（primitives-env.d.ts）提供
 */

export {
  Button,
  IconArchiveOutline20,
  IconBranchOutline16,
  IconCloseFill14,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconFolderClose16,
  IconFolderOpen16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
  IconPersonalizationOutline16,
  IconPlusOutline16,
  IconProjectAddOutline16,
  IconSearchOutline16,
  IconTrashOutline16,
  IconTriangleRightFill14,
  Input,
  Menu,
  Modal,
  StateDot,
  Tooltip,
  relativeTime,
} from '@deepseek-ai/dsh-client-ui-primitives'
