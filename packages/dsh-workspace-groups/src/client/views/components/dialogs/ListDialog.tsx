/**
 * 带一份名单的确认框
 *
 * 两处用它：关闭嵌套时列出会被解除嵌套的工作区，以及新增工作区时让用户决定要不要放进父所在的分组
 * 名单是这次操作会影响到的东西，放在说明与按钮之间，用户据此判断要不要继续
 *
 * 「取消」与「关闭」是通用词，取插槽注入的 `t` 座位回退到官方 `common` 命名空间
 */
import type { ReactElement } from 'react'
import { Button, Modal } from '../../../runtime.ts'
import type { RegionTranslate } from '../../../locales.ts'

export interface ListDialogProps {
  title: string
  /** 说明这次操作到底影响什么，原语只接受纯文本 */
  description?: string
  /** 名单，空表时整段不渲染 */
  items: readonly string[]
  confirmLabel: string
  /** 破坏性语义的确认按钮，缺省按普通主按钮渲染 */
  danger?: boolean | undefined
  /** 第二个可选动作，缺省时页脚只有「取消 + 确认」 */
  alt?: { label: string; onSelect: () => void } | undefined
  t: RegionTranslate
  onConfirm: () => void
  onClose: () => void
}

export function ListDialog({
  title,
  description,
  items,
  confirmLabel,
  danger,
  alt,
  t,
  onConfirm,
  onClose,
}: ListDialogProps): ReactElement {
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t('close')}
      title={title}
      {...(description === undefined ? {} : { description })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          {alt === undefined ? null : (
            <Button variant="outline" onClick={alt.onSelect}>
              {alt.label}
            </Button>
          )}
          <Button
            variant={danger === true ? 'outline' : 'primary'}
            {...(danger === true ? { className: 'wg-danger-action' } : {})}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {items.length === 0 ? null : (
        // 名单可能很长，限高滚动，对话框因此不会被一个巨大的分组撑出屏幕
        <ul className="wg-dialog-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
