'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getProfileSession, type ProfileSession } from './profile-session'

export function useProfile(): ProfileSession | null {
  const router = useRouter()
  const [session, setSession] = useState<ProfileSession | null>(null)

  useEffect(() => {
    const s = getProfileSession()
    if (!s) {
      router.replace('/profiles')
      return
    }
    setSession(s)
  }, [])

  return session
}
