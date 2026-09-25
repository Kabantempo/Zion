import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET() {
  const { data: households } = await adminSupabase
    .from('households')
    .select('id, name, created_at, invite_code')
    .order('created_at')

  const result = []
  for (const h of households ?? []) {
    const { data: members } = await adminSupabase
      .from('household_members')
      .select('profile_id, profile:profiles(id, display_name, claimed_by)')
      .eq('household_id', h.id)
    result.push({ ...h, members: members ?? [] })
  }

  return NextResponse.json(result)
}
