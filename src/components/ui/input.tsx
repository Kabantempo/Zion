import { cn } from '@/lib/utils'
import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && <label className="text-sm font-medium text-[#8888a0]">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'w-full px-4 py-3 rounded-xl bg-[#22222e] border border-[#2e2e3e] text-[#f0f0f5] placeholder:text-[#555570] outline-none transition-all',
            'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
