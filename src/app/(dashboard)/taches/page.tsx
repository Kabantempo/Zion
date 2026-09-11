'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { formatRelative } from '@/lib/utils'
import type { TaskType } from '@/types'
import { TaskActions } from './task-actions'

export default function TachesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [])

  async function load(profileId: string, householdId: string) {
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

    setData({ taskTypes: taskTypes ?? [], recentLogs: recentLogs ?? [], categories, profileId, householdId })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  const { taskTypes, recentLogs, categories, profileId, householdId } = data

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <TaskActions taskTypes={taskTypes} householdId={householdId} profileId={profileId} />

      <div>
        <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Tâches disponibles</h3>
        {Object.entries(categories).map(([category, tasks]: [string, any]) => (
          <div key={category} className="mb-4">
            <p className="text-xs font-semibold text-[#555570] uppercase tracking-wider mb-2 px-1">{category}</p>
            <div className="flex flex-col gap-2">
              {tasks.map((task: TaskType) => (
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

      {recentLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Historique</h3>
          <div className="flex flex-col gap-2">
            {recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center gap-3 px-1 py-1">
                {log.profile && <Avatar name={log.profile.display_name} color={log.profile.color} avatarUrl={log.profile.avatar_url} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f5] truncate">{log.task_type?.label}</p>
                  <p className="text-xs text-[#8888a0]">{log.profile?.display_name} · {formatRelative(log.done_at)}</p>
                </div>
                <span className="text-xs font-bold text-green-400">+{log.points_awarded}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function frequencyLabel(f: string): string {
  return { daily: 'Quotidien', weekly: 'Hebdo', monthly: 'Mensuel', as_needed: 'Selon besoin' }[f] ?? f
}
