import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { householdId, profileId, points, label } = await req.json()

  if (!householdId || !profileId || !points) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { error } = await adminSupabase.from('task_logs').insert({
    household_id: householdId,
    task_type_id: null,
    done_by: profileId,
    done_at: new Date().toISOString(),
    points_awarded: points,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
