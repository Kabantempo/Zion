import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { householdId, memberId, points } = await req.json()

  if (!householdId || !memberId || points == null) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const pts = Number(points)
  if (!Number.isFinite(pts) || pts === 0) {
    return NextResponse.json({ error: 'Points invalides' }, { status: 400 })
  }

  // Find or create the Équilibrage task type
  const { data: existing } = await adminSupabase
    .from('task_types')
    .select('id')
    .eq('household_id', householdId)
    .eq('label', '⚖️ Équilibrage')
    .limit(1)

  let taskTypeId: string | null = existing?.[0]?.id ?? null

  if (!taskTypeId) {
    const { data: created, error: createErr } = await adminSupabase
      .from('task_types')
      .insert({ household_id: householdId, label: '⚖️ Équilibrage', category: 'Autre', points: 0, frequency: 'as_needed' })
      .select('id')
      .single()
    if (createErr) {
      console.error('equil: create task_type error', createErr)
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
    taskTypeId = created?.id ?? null
  }

  if (!taskTypeId) {
    return NextResponse.json({ error: 'Impossible de créer le type de tâche' }, { status: 500 })
  }

  const { error } = await adminSupabase.from('task_logs').insert({
    household_id: householdId,
    task_type_id: taskTypeId,
    done_by: memberId,
    done_at: new Date().toISOString(),
    points_awarded: pts,
  })

  if (error) {
    console.error('equil: insert task_log error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
