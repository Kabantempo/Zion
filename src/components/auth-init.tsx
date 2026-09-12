'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'

export function AuthInit() {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        const { data } = await supabase.auth.signInAnonymously()
        const newUser = data?.user
        if (!newUser) return
        // Re-claim the profile with the new anon user ID
        const session = getProfileSession()
        if (session?.profileId) {
          await supabase
            .from('profiles')
            .update({ claimed_by: newUser.id })
            .eq('id', session.profileId)
        }
      }
    })
  }, [])
  return null
}
