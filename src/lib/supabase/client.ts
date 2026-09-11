import { createClient as _createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

let instance: SupabaseClient | null = null

export function createClient() {
  if (typeof window === 'undefined') {
    return _createClient(URL, KEY)
  }
  if (!instance) {
    instance = _createClient(URL, KEY)
  }
  return instance
}
