import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  isDestructive?: boolean
  isLoading?: boolean
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = true,
  isLoading = false
}: ConfirmDialogProps) {
  
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-pointer"
        onClick={!isLoading ? onCancel : undefined}
      />
      
      {/* Dialog Card */}
      <div className="relative w-full max-w-sm bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-2xl shadow-xl overflow-hidden animate-fade-up">
        
        {/* Header Ribbon (Optional Visual Indicator) */}
        {isDestructive && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />
        )}
        
        <div className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              {isDestructive && (
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
              )}
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {title}
              </h3>
            </div>
            {!isLoading && (
              <button 
                onClick={onCancel}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-1"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <p className="text-sm text-[var(--text-secondary)] mb-8 leading-relaxed ml-1">
            {message}
          </p>
          
          <div className="flex gap-3 justify-end">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-all disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-sm disabled:opacity-50 ${
                isDestructive 
                  ? 'bg-red-500 hover:bg-red-600 border border-red-500' 
                  : 'gradient-primary'
              }`}
            >
              {isLoading ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
