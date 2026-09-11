// Client-side profile session (localStorage)
const KEY = 'zion_profile'

export interface ProfileSession {
  profileId: string
  householdId: string
  displayName: string
  color: string
  avatarUrl: string | null
}

export function getProfileSession(): ProfileSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setProfileSession(session: ProfileSession) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(session))
}

export function clearProfileSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY)
}
