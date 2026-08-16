import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import Button from './Button'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** 附加样式类，可覆盖弹窗宽度（如 max-w-2xl），默认 max-w-md */
  className?: string
}

export default function Modal({ isOpen, onClose, title, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-charcoal/40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal：小屏为底部弹层，桌面为居中卡片 */}
      <div className={`relative bg-white border border-sand-200 w-full mx-0 sm:mx-4 rounded-t-2xl sm:rounded-lg animate-modal-sheet shadow-lg flex flex-col max-h-[90dvh] pb-[env(safe-area-inset-bottom)] sm:pb-0 ${className || 'max-w-md'}`}>
        {/* 拖动把手（仅小屏显示） */}
        <div className="sm:hidden flex justify-center pt-2.5 shrink-0">
          <div className="w-10 h-1 rounded-full bg-sand-200" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 sm:py-4 border-b border-sand-100 shrink-0">
          <h3 className="text-lg font-semibold text-charcoal">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto">
          {children}
        </div>
        
        {/* Footer：小屏纵向堆叠、按钮通宽、主操作置底；桌面横向排列 */}
        {footer && (
          <div className="flex flex-col gap-3 px-5 py-4 border-t border-sand-100 shrink-0 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
