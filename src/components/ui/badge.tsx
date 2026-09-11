import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-[#2e2e3e] text-[#8888a0]': variant === 'default',
          'bg-green-500/10 text-green-400': variant === 'success',
          'bg-yellow-500/10 text-yellow-400': variant === 'warning',
          'bg-red-500/10 text-red-400': variant === 'danger',
          'bg-blue-500/10 text-blue-400': variant === 'info',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
