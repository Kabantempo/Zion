import { cn } from '@/lib/utils'

interface AvatarProps {
  name: string
  color: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ name, color, avatarUrl, size = 'md', className }: AvatarProps) {
  const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
  }

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn('rounded-full object-cover', sizeClasses[size], className)}
      />
    )
  }

  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-bold text-white flex-shrink-0', sizeClasses[size], className)}
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}
