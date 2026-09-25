/**
 * 基线模块的运行时引用面
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 只存在于客户端模块系统的基线静态模块表，没有独立安装形态
 * 值导入集中在这一处，打包脚本把它标成 external 由宿主解析，类型由 ambient 声明（primitives-env.d.ts）提供
 *
 * 字形名不带尺寸后缀，线宽由 `Regular` / `Medium` 变体承担
 * 本包一律取 `Regular`，与官方侧边栏行内图标的取值一致
 */

export {
  Button,
  HoverCard,
  IconArchiveOutlineRegular,
  IconBranchOutlineRegular,
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseFillRegular,
  IconEditOutlineRegular,
  IconEllipsisOutlineRegular,
  IconFolderCloseRegular,
  IconFolderOpenRegular,
  IconNewChatOutlineRegular,
  IconPanelLeftOutlineRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconPlusOutlineRegular,
  IconProjectAddOutlineRegular,
  IconSearchOutlineRegular,
  IconSlidersTwoOutlineRegular,
  IconTrashOutlineRegular,
  IconTriangleRightFillRegular,
  IconUnarchiveOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
  Input,
  Menu,
  Modal,
  StateDot,
  Switch,
  Tooltip,
  relativeTime,
} from '@deepseek-ai/dsh-client-ui-primitives'
