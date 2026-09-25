'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, CheckSquare, Ticket, Calendar, Medal, Trophy } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/taches', icon: CheckSquare, label: 'Tâches' },
  { href: '/tickets', icon: Ticket, label: 'Tickets' },
  { href: '/accueil', icon: Home, label: 'Accueil', isHome: true },
  { href: '/calendrier', icon: Calendar, label: 'Agenda' },
  { href: '/succes', icon: Medal, label: 'Succès' },
  { href: '/classement', icon: Trophy, label: 'Score' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      <div className="mx-auto max-w-lg px-4 pb-3 pt-0">
        <div className="flex items-center justify-around bg-[#13131a]/95 backdrop-blur-xl border border-[#252535] rounded-2xl px-2 py-2 shadow-lg shadow-black/40">
          {NAV_ITEMS.map(({ href, icon: Icon, label, isHome }) => {
            const isActive = href === '/' ? pathname === '/' || pathname === '/taches' && false : pathname.startsWith(href)
            const active = pathname === href || (href !== '/' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-xl transition-all duration-200 relative',
                  active ? 'text-red-400' : 'text-[#44445a] hover:text-[#7070a0]'
                )}
              >
                {active && (
                  <span className="absolute inset-0 bg-red-500/8 rounded-xl" />
                )}
                <Icon size={19} strokeWidth={active ? 2.5 : 1.8} className="relative" />
                <span className={cn('text-[9px] font-semibold tracking-wide relative', active ? 'text-red-400' : '')}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
