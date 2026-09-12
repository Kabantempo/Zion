'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'

interface Member { profileId: string; displayName: string; color: string; avatarUrl: string | null }
interface TaskStat { label: string; category: string; total: number; byProfile: Record<string, number> }
interface ProfileStat { member: Member; total: number; top: string | null; least: string | null }

export default function HistoriquePage() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [pathname])

  async function load(profileId: string, householdId: string) {
    setLoading(true)
    const [{ data: logs }, { data: membersData }, { data: taskTypes }] = await Promise.all([
      supabase.from('task_logs')
        .select('done_by, task_type_id, task_type:task_types(label, category)')
        .eq('household_id', householdId),
      supabase.from('household_members')
        .select('profile_id, profile:profiles(id, display_name, color, avatar_url)')
        .eq('household_id', householdId),
      supabase.from('task_types').select('id, label, category').eq('household_id', householdId),
    ])

    const members: Member[] = (membersData ?? []).map((m: any) => {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      return { profileId: m.profile_id, displayName: p?.display_name ?? '?', color: p?.color ?? '#555', avatarUrl: p?.avatar_url ?? null }
    }).filter((m: any) => m.displayName !== '?')

    // Task stats
    const taskMap: Record<string, TaskStat> = {}
    for (const tt of (taskTypes ?? [])) {
      taskMap[tt.id] = { label: tt.label, category: tt.category, total: 0, byProfile: {} }
    }
    for (const log of (logs ?? [])) {
      const tt = Array.isArray(log.task_type) ? log.task_type[0] : log.task_type
      const tid = log.task_type_id
      if (!taskMap[tid]) taskMap[tid] = { label: tt?.label ?? '?', category: tt?.category ?? '?', total: 0, byProfile: {} }
      taskMap[tid].total++
      taskMap[tid].byProfile[log.done_by] = (taskMap[tid].byProfile[log.done_by] ?? 0) + 1
    }

    const taskStats: TaskStat[] = Object.values(taskMap).filter((t) => t.total > 0).sort((a, b) => b.total - a.total)
    const neverDone: TaskStat[] = Object.values(taskMap).filter((t) => t.total === 0)

    // Per profile stats
    const profileStats: ProfileStat[] = members.map((m) => {
      const myTasks = Object.entries(taskMap)
        .map(([, ts]) => ({ label: ts.label, count: ts.byProfile[m.profileId] ?? 0 }))
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count)

      const done = new Set(Object.entries(taskMap).filter(([, ts]) => (ts.byProfile[m.profileId] ?? 0) > 0).map(([, ts]) => ts.label))
      const notDone = Object.values(taskMap).filter((ts) => !(ts.byProfile[m.profileId] ?? 0)).map((ts) => ts.label)

      return {
        member: m,
        total: myTasks.reduce((s, t) => s + t.count, 0),
        top: myTasks[0]?.label ?? null,
        least: notDone[0] ?? null,
      }
    }).sort((a, b) => b.total - a.total)

    setData({ taskStats, neverDone, profileStats, members, profileId })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  const { taskStats, neverDone, profileStats, members, profileId } = data
  const maxTotal = taskStats[0]?.total ?? 1

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <h2 className="text-lg font-black text-[#f0f0f5]">Historique</h2>

      {/* Top tasks */}
      {taskStats.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Tâches les plus faites</p>
          <div className="flex flex-col gap-3">
            {taskStats.slice(0, 8).map((ts: TaskStat, i: number) => (
              <div key={ts.label}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-[#555570] w-4">{i + 1}</span>
                  <span className="flex-1 text-sm text-[#f0f0f5] truncate">{ts.label}</span>
                  <span className="text-xs font-bold text-[#8888a0]">{ts.total}×</span>
                  {/* avatars who did it */}
                  <div className="flex gap-0.5">
                    {members.filter((m: Member) => ts.byProfile[m.profileId]).sort((a: Member, b: Member) => (ts.byProfile[b.profileId] ?? 0) - (ts.byProfile[a.profileId] ?? 0)).slice(0, 3).map((m: Member) => (
                      <div key={m.profileId} title={`${m.displayName}: ${ts.byProfile[m.profileId]}×`}>
                        <Avatar name={m.displayName} color={m.color} avatarUrl={m.avatarUrl} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden ml-6">
                  <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${(ts.total / maxTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Per person */}
      <Card>
        <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Par personne</p>
        <div className="flex flex-col gap-4">
          {profileStats.map((ps: ProfileStat) => (
            <div key={ps.member.profileId}>
              <div className="flex items-center gap-3 mb-2">
                <Avatar name={ps.member.displayName} color={ps.member.color} avatarUrl={ps.member.avatarUrl} size="sm" />
                <span className="text-sm font-semibold text-[#f0f0f5] flex-1">{ps.member.profileId === profileId ? `${ps.member.displayName} (moi)` : ps.member.displayName}</span>
                <span className="text-xs text-[#8888a0]">{ps.total} tâches</span>
              </div>
              <div className="ml-10 flex flex-col gap-1">
                {ps.top && (
                  <div className="flex items-center gap-2">
                    <span className="text-green-400 text-xs">↑</span>
                    <span className="text-xs text-[#8888a0]">Le plus :</span>
                    <span className="text-xs text-[#f0f0f5] font-medium">{ps.top}</span>
                  </div>
                )}
                {ps.least && (
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-xs">↓</span>
                    <span className="text-xs text-[#8888a0]">Jamais fait :</span>
                    <span className="text-xs text-[#f0f0f5] font-medium">{ps.least}</span>
                  </div>
                )}
                {!ps.top && <p className="text-xs text-[#555570] italic">Aucune tâche encore</p>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Who does what per task */}
      {taskStats.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Qui fait quoi</p>
          <div className="flex flex-col gap-3">
            {taskStats.slice(0, 10).map((ts: TaskStat) => (
              <div key={ts.label}>
                <p className="text-xs font-medium text-[#f0f0f5] mb-1.5">{ts.label}</p>
                <div className="flex gap-2">
                  {members.map((m: Member) => {
                    const count = ts.byProfile[m.profileId] ?? 0
                    const pct = ts.total > 0 ? Math.round((count / ts.total) * 100) : 0
                    if (count === 0) return null
                    return (
                      <div key={m.profileId} className="flex items-center gap-1.5">
                        <Avatar name={m.displayName} color={m.color} avatarUrl={m.avatarUrl} size="sm" />
                        <div>
                          <p className="text-xs font-bold text-[#f0f0f5]">{count}×</p>
                          <p className="text-[10px] text-[#555570]">{pct}%</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Never done */}
      {neverDone.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Jamais faites 💤</p>
          <div className="flex flex-col gap-1">
            {neverDone.map((ts: TaskStat) => (
              <p key={ts.label} className="text-sm text-[#555570]">{ts.label}</p>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
