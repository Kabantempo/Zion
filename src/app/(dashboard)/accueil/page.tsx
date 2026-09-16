'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { getLevel, getLevelName, getPointsForNextLevel } from '@/lib/utils'
import { QuickTaskButton } from '../quick-task-button'
import type { TaskType } from '@/types'

function StatBlock({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex-1 bg-[#1c1c26] rounded-2xl p-3 text-center">
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] font-semibold text-[#7070a0] uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

interface Challenge {
  label: string
  emoji: string
  current: number
  target: number
  done: boolean
  reward: string
}

function ChallengesCard({ challenges }: { challenges: Challenge[] }) {
  if (!challenges?.length) return null
  const allDone = challenges.every(c => c.done)
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest">Défis de la semaine</p>
        {allDone && <span className="text-xs font-bold text-yellow-400 animate-pulse">🏆 All done!</span>}
      </div>
      <div className="flex flex-col gap-3">
        {challenges.map((c, i) => (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{c.emoji}</span>
              <span className={`text-sm flex-1 font-medium ${c.done ? 'text-[#7070a0] line-through' : 'text-[#f0f0f8]'}`}>{c.label}</span>
              {c.done
                ? <span className="text-xs font-bold text-green-400">✓</span>
                : <span className="text-xs text-[#8888a0]">{c.current}/{c.target}</span>
              }
            </div>
            <div className="h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${c.done ? 'bg-green-500' : 'bg-gradient-to-r from-red-500 to-red-400'}`}
                style={{ width: `${Math.min(100, (c.current / c.target) * 100)}%` }}
              />
            </div>
            {c.done && <p className="text-[10px] text-green-400 mt-0.5">{c.reward}</p>}
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function AccueilPage() {
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
    const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString()

    // Week start = last Monday 00:00
    const now2 = new Date()
    const weekStart = new Date(now2)
    weekStart.setDate(now2.getDate() - ((now2.getDay() + 6) % 7))
    weekStart.setHours(0, 0, 0, 0)
    const weekStartIso = weekStart.toISOString()

    const [
      { data: profile },
      { data: allLogs },
      { data: weekLogs },
      { data: recentActivity },
      { data: members },
      { data: taskTypes },
      { data: openTickets },
      { data: weekTaskLogs },
      { data: weekTickets },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', profileId).single(),
      supabase.from('task_logs').select('done_by, points_awarded, done_at').eq('household_id', householdId).gte('done_at', since30),
      supabase.from('task_logs').select('done_by, points_awarded').eq('household_id', householdId).gte('done_at', since7),
      supabase.from('task_logs').select('done_at, points_awarded, done_by, task_type:task_types(label, category), profile:profiles(display_name, color, avatar_url)').eq('household_id', householdId).gte('done_at', new Date(new Date().setHours(0,0,0,0)).toISOString()).order('done_at', { ascending: false }),
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_types').select('*').eq('household_id', householdId).order('category'),
      supabase.from('tickets').select('id').eq('household_id', householdId).in('status', ['todo', 'in_progress']).eq('assigned_to', profileId),
      supabase.from('task_logs').select('done_by, done_at, points_awarded').eq('household_id', householdId).gte('done_at', weekStartIso),
      supabase.from('tickets').select('completed_by, points, completed_at').eq('household_id', householdId).eq('status', 'done').gte('completed_at', weekStartIso).not('completed_at', 'is', null),
    ])

    // Points
    const myMonthPoints = (allLogs ?? []).filter((l: any) => l.done_by === profileId).reduce((s: number, l: any) => s + l.points_awarded, 0)
    const myWeekPoints = (weekLogs ?? []).filter((l: any) => l.done_by === profileId).reduce((s: number, l: any) => s + l.points_awarded, 0)
    const level = getLevel(myMonthPoints)
    const { current: lvlCurrent, next: lvlNext } = getPointsForNextLevel(myMonthPoints)
    const lvlProgress = lvlNext > lvlCurrent ? Math.min(100, ((myMonthPoints - lvlCurrent) / (lvlNext - lvlCurrent)) * 100) : 100

    // Streak
    const myLogs = (allLogs ?? []).filter((l: any) => l.done_by === profileId)
    const days = new Set(myLogs.map((l: any) => new Date(l.done_at).toDateString()))
    let streak = days.has(new Date().toDateString()) ? 1 : 0
    if (streak) { let d = new Date(Date.now() - 86400000); while (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 86400000) } }

    // Rank this week
    const weekByProfile: Record<string, number> = {}
    for (const l of weekLogs ?? []) weekByProfile[l.done_by] = (weekByProfile[l.done_by] ?? 0) + l.points_awarded
    const sorted = Object.entries(weekByProfile).sort(([, a], [, b]) => b - a)
    const rank = sorted.findIndex(([id]) => id === profileId) + 1

    // Tasks done today
    const todayStr = new Date().toDateString()
    const todayCount = myLogs.filter((l: any) => new Date(l.done_at).toDateString() === todayStr).length

    // Weekly challenges — include ticket points
    const weekLogsArr = weekTaskLogs ?? []
    const weekTicketsArr = (weekTickets ?? []).filter((t: any) => t.completed_by && (t.points ?? 0) > 0)
    const totalWeekTasks = weekLogsArr.length + weekTicketsArr.length
    const totalWeekPts = weekLogsArr.reduce((s: number, l: any) => s + l.points_awarded, 0)
      + weekTicketsArr.reduce((s: number, t: any) => s + (t.points ?? 0), 0)
    const activeProfiles = new Set([
      ...weekLogsArr.map((l: any) => l.done_by),
      ...weekTicketsArr.map((t: any) => t.completed_by),
    ]).size
    const totalMembers = (members ?? []).length

    // Max tasks in one day
    const dayTaskCount: Record<string, number> = {}
    for (const l of weekLogsArr) {
      const d = new Date(l.done_at).toDateString()
      dayTaskCount[d] = (dayTaskCount[d] ?? 0) + 1
    }
    const maxDayTasks = Math.max(0, ...Object.values(dayTaskCount))

    const challenges: { label: string; emoji: string; current: number; target: number; done: boolean; reward: string }[] = [
      { label: '50 tâches ensemble', emoji: '⚡', current: totalWeekTasks, target: 50, done: totalWeekTasks >= 50, reward: 'La coloc est en feu cette semaine !' },
      { label: 'Tous les membres actifs', emoji: '👥', current: activeProfiles, target: totalMembers, done: activeProfiles >= totalMembers && totalMembers > 0, reward: 'Tout le monde a participé !' },
      { label: '10 tâches en un jour', emoji: '🔥', current: maxDayTasks, target: 10, done: maxDayTasks >= 10, reward: 'Journée de feu !' },
      { label: '300 pts collectifs', emoji: '🏅', current: totalWeekPts, target: 300, done: totalWeekPts >= 300, reward: 'Record de la semaine !' },
    ]

    setData({ profile, myMonthPoints, myWeekPoints, level, lvlProgress, lvlNext, streak, rank, todayCount, recentActivity, members, taskTypes, openTickets: openTickets?.length ?? 0, profileId, householdId, weekByProfile, challenges })
    setLoading(false)
  }

  if (loading || !data) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  const { profile, myMonthPoints, myWeekPoints, level, lvlProgress, lvlNext, streak, rank, todayCount, recentActivity, members, taskTypes, openTickets, profileId, householdId, challenges } = data

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return 'Bonne nuit'
    if (h < 12) return 'Bonjour'
    if (h < 18) return 'Bon après-midi'
    return 'Bonsoir'
  })()

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">

      {/* Hero card */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={profile?.display_name ?? '?'} color={profile?.color ?? '#555'} avatarUrl={profile?.avatar_url} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#7070a0] font-medium">{greeting},</p>
            <h2 className="text-xl font-black text-[#f0f0f8] truncate">{profile?.display_name} 👋</h2>
          </div>
          {openTickets > 0 && (
            <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-2.5 py-1.5 text-center flex-shrink-0">
              <p className="text-lg font-black text-red-400">{openTickets}</p>
              <p className="text-[9px] text-red-400/80 font-semibold uppercase tracking-wide">ticket{openTickets > 1 ? 's' : ''}</p>
            </div>
          )}
        </div>

        {/* Level bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-bold text-[#f0f0f8]">Nv.{level} · {getLevelName(level)}</span>
            <span className="text-xs text-[#7070a0]">{myMonthPoints} / {lvlNext} pts</span>
          </div>
          <div className="h-2 bg-[#1c1c26] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full transition-all duration-700"
              style={{ width: `${lvlProgress}%` }}
            />
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-2">
          <StatBlock value={`${myWeekPoints}`} label="Pts semaine" color="text-red-400" />
          <StatBlock value={streak > 0 ? `${streak}🔥` : '—'} label="Streak" color="text-orange-400" />
          <StatBlock value={rank > 0 ? `#${rank}` : '—'} label="Rang" color="text-yellow-400" />
          <StatBlock value={`${todayCount}`} label="Auj." color="text-green-400" />
        </div>
      </Card>

      {/* Défis hebdomadaires */}
      <ChallengesCard challenges={challenges} />

      {/* Quick task */}
      {taskTypes && taskTypes.length > 0 && (
        <QuickTaskButton taskTypes={taskTypes as TaskType[]} householdId={householdId} profileId={profileId} />
      )}

      {/* Colocs activity mini-leaderboard */}
      {members && members.length > 1 && (
        <Card>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Cette semaine</p>
          <div className="flex flex-col gap-2">
            {(members as any[])
              .map((m) => {
                const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
                const pts = (data as any).weekByProfile?.[m.profile_id] ?? 0
                return { ...p, pts, profile_id: m.profile_id }
              })
              .sort((a: any, b: any) => b.pts - a.pts)
              .map((m: any, i: number) => (
                <div key={m.id ?? m.profile_id} className="flex items-center gap-3">
                  <span className="text-sm w-5 text-center text-[#7070a0]">{i + 1}</span>
                  <Avatar name={m.display_name ?? '?'} color={m.color ?? '#555'} avatarUrl={m.avatar_url} size="sm" />
                  <span className="flex-1 text-sm font-medium text-[#f0f0f8]">
                    {m.display_name} {m.profile_id === profileId && <span className="text-[#7070a0] text-xs">(moi)</span>}
                  </span>
                  <span className="text-sm font-bold text-[#f0f0f8]">{m.pts} <span className="text-[#7070a0] font-normal text-xs">pts</span></span>
                </div>
              ))
            }
          </div>
        </Card>
      )}

      {/* Recent activity feed */}
      {recentActivity && recentActivity.length > 0 && (
        <Card>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Aujourd'hui</p>
          <div className="flex flex-col gap-3">
            {recentActivity.map((log: any) => {
              const p = Array.isArray(log.profile) ? log.profile[0] : log.profile
              const tt = Array.isArray(log.task_type) ? log.task_type[0] : log.task_type
              const isMe = log.done_by === profileId
              return (
                <div key={log.id} className="flex items-center gap-3">
                  <Avatar name={p?.display_name ?? '?'} color={p?.color ?? '#555'} avatarUrl={p?.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#f0f0f8] truncate">{tt?.label ?? 'Tâche'}</p>
                    <p className="text-xs text-[#7070a0]">{isMe ? 'Toi' : p?.display_name} · {formatRelative(log.done_at)}</p>
                  </div>
                  <span className="text-xs font-bold text-green-400 flex-shrink-0">+{log.points_awarded}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Link href="/historique" className="text-xs text-[#7070a0] hover:text-red-400 transition-colors">📊 Historique →</Link>
      </div>

      {recentActivity?.length === 0 && (
        <div className="text-center py-10 text-[#7070a0]">
          <p className="text-4xl mb-3">☀️</p>
          <p className="font-medium text-[#f0f0f8]">Rien encore aujourd'hui</p>
          <p className="text-sm mt-1">Soyez le premier à compléter une tâche !</p>
        </div>
      )}
    </div>
  )
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}
