import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getLevel, getLevelName, formatRelative } from '@/lib/utils'
import type { Profile, TaskLog, Ticket, TaskType } from '@/types'
import { QuickTaskButton } from './quick-task-button'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/onboarding')

  const householdId = membership.household_id

  const [{ data: profile }, { data: recentLogs }, { data: myTickets }, { data: taskTypes }, { data: allLogs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('task_logs').select('*, task_type:task_types(label, category), profile:profiles(display_name, color)').eq('household_id', householdId).order('done_at', { ascending: false }).limit(5),
    supabase.from('tickets').select('*, assignee:profiles!assigned_to(display_name, color)').eq('household_id', householdId).in('status', ['todo', 'in_progress']).eq('assigned_to', user.id).limit(5),
    supabase.from('task_types').select('*').eq('household_id', householdId).order('category'),
    supabase.from('task_logs').select('done_by, points_awarded').eq('household_id', householdId).gte('done_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  const myPoints = allLogs?.filter((l) => l.done_by === user.id).reduce((s, l) => s + l.points_awarded, 0) ?? 0
  const level = getLevel(myPoints)

  // Streak calculation
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  const myRecentLogs = (await supabase.from('task_logs').select('done_at').eq('done_by', user.id).eq('household_id', householdId).order('done_at', { ascending: false }).limit(30)).data ?? []
  const daysWithTask = new Set(myRecentLogs.map((l) => new Date(l.done_at).toDateString()))
  let streak = daysWithTask.has(today) ? 1 : 0
  if (streak === 0 && !daysWithTask.has(yesterday)) streak = 0
  else if (streak === 1) {
    let d = new Date(Date.now() - 86400000)
    while (daysWithTask.has(d.toDateString())) {
      streak++
      d = new Date(d.getTime() - 86400000)
    }
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Welcome + stats */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          {profile && (
            <Avatar name={(profile as Profile).display_name} color={(profile as Profile).color} avatarUrl={(profile as Profile).avatar_url} size="lg" />
          )}
          <div>
            <p className="text-[#8888a0] text-sm">Bonjour,</p>
            <h2 className="text-xl font-bold text-[#f0f0f5]">{(profile as Profile)?.display_name ?? '...'} 👋</h2>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#22222e] rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-indigo-400">{myPoints}</p>
            <p className="text-xs text-[#8888a0]">points</p>
          </div>
          <div className="bg-[#22222e] rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-yellow-400">Nv.{level}</p>
            <p className="text-xs text-[#8888a0]">{getLevelName(level)}</p>
          </div>
          <div className="bg-[#22222e] rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-orange-400">{streak} 🔥</p>
            <p className="text-xs text-[#8888a0]">jours streak</p>
          </div>
        </div>
      </Card>

      {/* Quick task button */}
      {taskTypes && taskTypes.length > 0 && (
        <QuickTaskButton taskTypes={taskTypes as TaskType[]} householdId={householdId} userId={user.id} />
      )}

      {/* My tickets */}
      {myTickets && myTickets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Mes tickets assignés</h3>
          <div className="flex flex-col gap-2">
            {myTickets.map((ticket) => (
              <Card key={ticket.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[#f0f0f5]">{ticket.title}</p>
                  <Badge variant={ticket.status === 'in_progress' ? 'warning' : 'default'}>
                    {ticket.status === 'in_progress' ? 'En cours' : 'À faire'}
                  </Badge>
                </div>
                {ticket.due_date && (
                  <p className="text-xs text-[#8888a0] mt-1">⏰ {new Date(ticket.due_date).toLocaleDateString('fr-FR')}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentLogs && recentLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Activité récente</h3>
          <div className="flex flex-col gap-2">
            {recentLogs.map((log) => {
              const taskLog = log as unknown as TaskLog
              return (
                <div key={log.id} className="flex items-center gap-3 px-1">
                  {taskLog.profile && (
                    <Avatar name={(taskLog.profile as Profile).display_name} color={(taskLog.profile as Profile).color} size="sm" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f0f0f5] truncate">
                      {(taskLog.task_type as TaskType)?.label ?? 'Tâche'}
                    </p>
                    <p className="text-xs text-[#8888a0]">{formatRelative(log.done_at)}</p>
                  </div>
                  <span className="text-xs font-bold text-green-400">+{log.points_awarded} pts</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
