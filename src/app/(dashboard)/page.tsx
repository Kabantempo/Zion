'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { getLevel, getLevelName, formatRelative } from '@/lib/utils'
import type { Profile, TaskLog, Ticket, TaskType } from '@/types'
import { QuickTaskButton } from './quick-task-button'

export default function HomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    loadData(session.profileId, session.householdId, session)
  }, [])

  async function loadData(profileId: string, householdId: string, session: any) {
    const [{ data: profile }, { data: recentLogs }, { data: myTickets }, { data: taskTypes }, { data: allLogs }, { data: myRecentLogs }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', profileId).single(),
      supabase.from('task_logs').select('*, task_type:task_types(label, category), profile:profiles(display_name, color)').eq('household_id', householdId).order('done_at', { ascending: false }).limit(5),
      supabase.from('tickets').select('*, assignee:profiles!assigned_to(display_name, color)').eq('household_id', householdId).in('status', ['todo', 'in_progress']).eq('assigned_to', profileId).limit(5),
      supabase.from('task_types').select('*').eq('household_id', householdId).order('category'),
      supabase.from('task_logs').select('done_by, points_awarded').eq('household_id', householdId).gte('done_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('task_logs').select('done_at').eq('done_by', profileId).eq('household_id', householdId).order('done_at', { ascending: false }).limit(30),
    ])

    const myPoints = allLogs?.filter((l: any) => l.done_by === profileId).reduce((s: number, l: any) => s + l.points_awarded, 0) ?? 0
    const level = getLevel(myPoints)

    const days = new Set((myRecentLogs ?? []).map((l: any) => new Date(l.done_at).toDateString()))
    let streak = days.has(new Date().toDateString()) ? 1 : 0
    let d = new Date(Date.now() - 86400000)
    if (streak === 1) { while (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 86400000) } }

    setData({ profile, recentLogs, myTickets, taskTypes, myPoints, level, streak, profileId, householdId })
    setLoading(false)
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { profile, recentLogs, myTickets, taskTypes, myPoints, level, streak, profileId, householdId } = data

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <Card>
        <div className="flex items-center gap-3 mb-4">
          {profile && <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="lg" />}
          <div>
            <p className="text-[#8888a0] text-sm">Bonjour,</p>
            <h2 className="text-xl font-bold text-[#f0f0f5]">{profile?.display_name ?? '...'} 👋</h2>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#22222e] rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-red-400">{myPoints}</p>
            <p className="text-xs text-[#8888a0]">points</p>
          </div>
          <div className="bg-[#22222e] rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-yellow-400">Nv.{level}</p>
            <p className="text-xs text-[#8888a0]">{getLevelName(level)}</p>
          </div>
          <div className="bg-[#22222e] rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-orange-400">{streak} 🔥</p>
            <p className="text-xs text-[#8888a0]">streak</p>
          </div>
        </div>
      </Card>

      {taskTypes && taskTypes.length > 0 && (
        <QuickTaskButton taskTypes={taskTypes as TaskType[]} householdId={householdId} profileId={profileId} />
      )}

      {myTickets && myTickets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Mes tickets assignés</h3>
          <div className="flex flex-col gap-2">
            {myTickets.map((ticket: any) => (
              <Card key={ticket.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[#f0f0f5]">{ticket.title}</p>
                  <Badge variant={ticket.status === 'in_progress' ? 'warning' : 'default'}>
                    {ticket.status === 'in_progress' ? 'En cours' : 'À faire'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {recentLogs && recentLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Activité récente</h3>
          <div className="flex flex-col gap-2">
            {recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center gap-3 px-1">
                {log.profile && <Avatar name={log.profile.display_name} color={log.profile.color} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f5] truncate">{log.task_type?.label ?? 'Tâche'}</p>
                  <p className="text-xs text-[#8888a0]">{log.profile?.display_name} · {formatRelative(log.done_at)}</p>
                </div>
                <span className="text-xs font-bold text-green-400">+{log.points_awarded} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
