interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeMap = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div
      className={`animate-spin border-2 border-[#e94560] border-t-transparent rounded-full ${sizeMap[size]} ${className}`}
    />
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <LoadingSpinner size="lg" />
    </div>
  )
}
