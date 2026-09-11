'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { getProfileSession, type ProfileSession } from '@/lib/profile-session'

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
  const [session, setSession] = useState<ProfileSession | null>(null)
  useEffect(() => { setSession(getProfileSession()) }, [])

  return (
    <header className="sticky top-0 z-40 bg-[#09090d]/80 backdrop-blur-xl border-b border-[#252535]/60">
      <div className="flex items-center justify-between px-4 h-14 max-w-lg mx-auto">
        <h1 className="text-lg font-bold tracking-tight text-[#f0f0f8]">{title}</h1>
        {session && (
          <Link href="/profil" className="transition-opacity hover:opacity-80 active:opacity-60">
            <Avatar name={session.displayName} color={session.color} avatarUrl={session.avatarUrl} size="sm" />
          </Link>
        )}
      </div>
    </header>
  )
}
