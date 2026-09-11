import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-[#1a1a24] border border-[#2e2e3e] rounded-2xl p-4',
        onClick && 'cursor-pointer hover:border-red-500/40 transition-colors active:scale-[0.99]',
        className
      )}
    >
      {children}
    </div>
  )
}
