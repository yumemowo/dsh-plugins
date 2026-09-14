/**
 * 破坏性操作的确认框。
 *
 * 用普通 `Modal` 而不是 `RiskConfirmation`：后者带警告图标与勾选框，而
 * 删除分组只解散分组、删除工作区只移除注册，都达不到需要勾选确认的破坏
 * 级别。危险语义由确认按钮的 `wg-danger-action` 承载（错误色 token，
 * 同官方删除按钮做法）。
 */
import type { ReactElement, ReactNode } from 'react'
import { Button, Modal } from '../../runtime.ts'

export interface DeleteDialogProps {
  title: string
  /** 说明这次删除到底影响什么。 */
  description?: ReactNode
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  onConfirm: () => void
  onClose: () => void
}

export function DeleteDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  onClose,
}: DeleteDialogProps): ReactElement {
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={closeLabel}
      title={title}
      {...(description === undefined ? {} : { description })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant="outline" className="wg-danger-action" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
