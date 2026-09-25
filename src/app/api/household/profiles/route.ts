import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const householdId = req.nextUrl.searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'Missing householdId' }, { status: 400 })

  const { data: members } = await adminSupabase
    .from('household_members')
    .select('profile:profiles(id, display_name, color, avatar_url, claimed_by)')
    .eq('household_id', householdId)

  return NextResponse.json({ members: members ?? [] })
}
