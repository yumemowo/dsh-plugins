/**
 * 破坏性操作的确认框
 *
 * 用普通 `Modal` 而不是 `RiskConfirmation`：后者带警告图标与勾选框
 * 而删除分组只解散分组、删除工作区只移除注册，都达不到需要勾选确认的破坏级别
 * 危险语义由确认按钮的 `dangerAction` 承载（错误色 token，同官方删除按钮做法）
 */
import type { ReactElement } from 'react'
import { Button, Modal } from '../../../runtime.ts'
import { useLocale } from '../../../useLocale.ts'
import styles from './dialogs.module.css'

export interface DeleteDialogProps {
  title: string
  /** 说明这次删除到底影响什么，原语只接受纯文本 */
  description?: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}

export function DeleteDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
}: DeleteDialogProps): ReactElement {
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
          <Button variant="outline" className={styles.dangerAction} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
