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
        'bg-[#13131a] border border-[#252535] rounded-2xl p-4 shadow-sm',
        onClick && 'cursor-pointer hover:border-red-500/30 hover:bg-[#16161f] transition-all duration-200 active:scale-[0.985]',
        className
      )}
    >
      {children}
    </div>
  )
}
