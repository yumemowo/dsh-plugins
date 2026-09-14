/**
 * 单行输入对话框：建组、改名与工作区重命名共用。
 *
 * 输入法组合期间的 Enter 属于候选词确认，不能当提交用。
 */
import { useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Button, Input, Modal } from '../../runtime.ts'

export interface NameDialogProps {
  title: string
  value: string
  /** 输入框的占位与无障碍标签。 */
  placeholder: string
  confirmLabel: string
  cancelLabel: string
  closeLabel: string
  confirmDisabled: boolean
  /** 校验失败时的提示，如工作区重名。 */
  error?: ReactNode
  onValueChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function NameDialog({
  title,
  value,
  placeholder,
  confirmLabel,
  cancelLabel,
  closeLabel,
  confirmDisabled,
  error,
  onValueChange,
  onConfirm,
  onClose,
}: NameDialogProps): ReactElement {
  const composing = useRef(false)
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={closeLabel}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant="primary" disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Input
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || composing.current) return
          event.preventDefault()
          onConfirm()
        }}
      />
      {error === undefined || error === null ? null : (
        <div className="wg-dialog-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  )
}
