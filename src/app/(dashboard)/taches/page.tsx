import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { formatRelative } from '@/lib/utils'
import type { TaskLog, Profile, TaskType } from '@/types'
import { TaskActions } from './task-actions'

export default async function TachesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/onboarding')

  const householdId = membership.household_id

  const [{ data: taskTypes }, { data: recentLogs }] = await Promise.all([
    supabase.from('task_types').select('*').eq('household_id', householdId).order('category').order('label'),
    supabase.from('task_logs')
      .select('*, task_type:task_types(label, category, points), profile:profiles(display_name, color, avatar_url)')
      .eq('household_id', householdId)
      .order('done_at', { ascending: false })
      .limit(20),
  ])

  const categories: Record<string, TaskType[]> = {}
  for (const t of (taskTypes ?? []) as TaskType[]) {
    if (!categories[t.category]) categories[t.category] = []
    categories[t.category].push(t)
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <TaskActions taskTypes={taskTypes ?? []} householdId={householdId} userId={user.id} />

      {/* Task types list */}
      <div>
        <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Tâches disponibles</h3>
        {Object.entries(categories).map(([category, tasks]) => (
          <div key={category} className="mb-4">
            <p className="text-xs font-semibold text-[#555570] uppercase tracking-wider mb-2 px-1">{category}</p>
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <Card key={task.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[#f0f0f5]">{task.label}</p>
                      <p className="text-xs text-[#8888a0] mt-0.5">{frequencyLabel(task.frequency)}</p>
                    </div>
                    <span className="text-sm font-bold text-green-400">+{task.points} pts</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* History */}
      {recentLogs && recentLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Historique</h3>
          <div className="flex flex-col gap-2">
            {recentLogs.map((log) => {
              const l = log as unknown as TaskLog
              return (
                <div key={log.id} className="flex items-center gap-3 px-1 py-1">
                  {l.profile && (
                    <Avatar
                      name={(l.profile as Profile).display_name}
                      color={(l.profile as Profile).color}
                      avatarUrl={(l.profile as Profile).avatar_url}
                      size="sm"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f0f0f5] truncate">{(l.task_type as TaskType)?.label}</p>
                    <p className="text-xs text-[#8888a0]">
                      {(l.profile as Profile)?.display_name} · {formatRelative(log.done_at)}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-green-400">+{log.points_awarded}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function frequencyLabel(f: string): string {
  return { daily: 'Quotidien', weekly: 'Hebdo', monthly: 'Mensuel', as_needed: 'Selon besoin' }[f] ?? f
}
