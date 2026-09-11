'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { getProfileSession } from '@/lib/profile-session'

const TITLES: Record<string, string> = {
  '/': 'Accueil',
  '/taches': 'Tâches',
  '/tickets': 'Tickets',
  '/calendrier': 'Calendrier',
  '/classement': 'Classement',
  '/succes': 'Succès',
  '/profil': 'Profil',
}

export function TopBar() {
  const pathname = usePathname()
  const title = TITLES[pathname] ?? 'Zion'
  const session = getProfileSession()

  return (
    <header className="sticky top-0 z-40 bg-[#0f0f13]/90 backdrop-blur-lg border-b border-[#2e2e3e]">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <h1 className="text-lg font-bold text-[#f0f0f5]">{title}</h1>
        {session && (
          <Link href="/profil">
            <Avatar name={session.displayName} color={session.color} avatarUrl={session.avatarUrl} size="sm" />
          </Link>
        )}
      </div>
    </header>
  )
}
