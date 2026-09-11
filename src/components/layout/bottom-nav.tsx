'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, CheckSquare, Ticket, Calendar, Trophy } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/', icon: Home, label: 'Accueil' },
  { href: '/taches', icon: CheckSquare, label: 'Tâches' },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/calendrier', icon: Calendar, label: 'Calendrier' },
  { href: '/classement', icon: Trophy, label: 'Scores' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f0f13]/90 backdrop-blur-lg border-t border-[#2e2e3e] safe-bottom">
      <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all',
                isActive
                  ? 'text-indigo-400'
                  : 'text-[#555570] hover:text-[#8888a0]'
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className={cn('text-[10px] font-medium', isActive && 'text-indigo-400')}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
