/**
 * 带一份名单的确认框
 *
 * 两处用它：关闭嵌套时列出会被解除嵌套的工作区，以及新增工作区时让用户决定要不要放进父工作区所在的分组
 * 名单是这次操作会影响到的东西，放在说明与按钮之间，用户据此判断要不要继续
 */
import type { ReactElement } from 'react'
import { Button, Modal } from '../../../runtime.ts'
import { useLocale } from '../../../useLocale.ts'
import styles from './dialogs.module.css'

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
  onConfirm,
  onClose,
}: ListDialogProps): ReactElement {
  const { t } = useLocale()
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
            {...(danger === true ? { className: styles.dangerAction } : {})}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {items.length === 0 ? null : (
        // 名单可能很长，限高滚动，对话框因此不会被一个巨大的分组撑出屏幕
        <ul className={styles.dialogList}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
