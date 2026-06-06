import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#e94560]/10 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-[#e94560]" />
      </div>
      <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-5 py-2.5 rounded-xl bg-[#e94560] text-white font-medium text-sm hover:bg-[#e94560]/90 transition-all hover:shadow-lg hover:shadow-[#e94560]/25"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
