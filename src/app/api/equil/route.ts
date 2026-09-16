import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { householdId, memberId, points } = await req.json()

  if (!householdId || !memberId || points === undefined || points === 0) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  let taskTypeId: string | null = null
  const { data: existing } = await adminSupabase
    .from('task_types')
    .select('id')
    .eq('household_id', householdId)
    .eq('label', '⚖️ Équilibrage')
    .maybeSingle()

  if (existing) {
    taskTypeId = existing.id
  } else {
    const { data: created } = await adminSupabase
      .from('task_types')
      .insert({ household_id: householdId, label: '⚖️ Équilibrage', category: 'Autre', points: 0, frequency: 'as_needed' })
      .select('id')
      .single()
    taskTypeId = created?.id ?? null
  }

  if (!taskTypeId) {
    return NextResponse.json({ error: 'Could not find task type' }, { status: 500 })
  }

  const { error } = await adminSupabase.from('task_logs').insert({
    household_id: householdId,
    task_type_id: taskTypeId,
    done_by: memberId,
    done_at: new Date().toISOString(),
    points_awarded: points,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
