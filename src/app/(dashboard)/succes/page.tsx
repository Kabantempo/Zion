'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'

interface Achievement {
  id: string
  emoji: string
  label: string
  desc: string
  tier: 'bronze' | 'silver' | 'gold' | 'diamond'
  check: (stats: MemberStats) => boolean
}

interface MemberStats {
  totalTasks: number
  totalPoints: number
  maxStreak: number
  uniqueCategories: number
  totalCategories: number
  ticketsCompleted: number
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_task',  emoji: '🌱', label: 'Premier pas',      desc: '1 tâche complétée',      tier: 'bronze',  check: s => s.totalTasks >= 1 },
  { id: 'tasks_10',    emoji: '⚡', label: 'En route',         desc: '10 tâches complétées',   tier: 'bronze',  check: s => s.totalTasks >= 10 },
  { id: 'tasks_50',    emoji: '🔥', label: 'En feu',           desc: '50 tâches complétées',   tier: 'silver',  check: s => s.totalTasks >= 50 },
  { id: 'tasks_100',   emoji: '💪', label: 'Centurion',        desc: '100 tâches complétées',  tier: 'silver',  check: s => s.totalTasks >= 100 },
  { id: 'tasks_250',   emoji: '🏅', label: 'Bosseur',          desc: '250 tâches complétées',  tier: 'gold',    check: s => s.totalTasks >= 250 },
  { id: 'tasks_500',   emoji: '🏆', label: 'Légende',          desc: '500 tâches complétées',  tier: 'diamond', check: s => s.totalTasks >= 500 },
  { id: 'pts_100',     emoji: '💰', label: 'Premiers euros',   desc: '100 pts gagnés',         tier: 'bronze',  check: s => s.totalPoints >= 100 },
  { id: 'pts_500',     emoji: '💎', label: 'Riche',            desc: '500 pts gagnés',         tier: 'silver',  check: s => s.totalPoints >= 500 },
  { id: 'pts_1000',    emoji: '👑', label: 'Millionnaire',     desc: '1 000 pts gagnés',       tier: 'gold',    check: s => s.totalPoints >= 1000 },
  { id: 'pts_5000',    emoji: '🌟', label: 'Intouchable',      desc: '5 000 pts gagnés',       tier: 'diamond', check: s => s.totalPoints >= 5000 },
  { id: 'streak_3',    emoji: '📅', label: 'Régulier',         desc: '3 jours de suite',       tier: 'bronze',  check: s => s.maxStreak >= 3 },
  { id: 'streak_7',    emoji: '🗓️', label: 'Semaine parfaite', desc: '7 jours de suite',       tier: 'silver',  check: s => s.maxStreak >= 7 },
  { id: 'streak_14',   emoji: '🌙', label: 'Deux semaines',    desc: '14 jours de suite',      tier: 'gold',    check: s => s.maxStreak >= 14 },
  { id: 'streak_30',   emoji: '🔮', label: 'Mois de feu',      desc: '30 jours de suite',      tier: 'diamond', check: s => s.maxStreak >= 30 },
  { id: 'all_cats',    emoji: '🗂️', label: 'Touche-à-tout',   desc: 'Toutes les catégories',  tier: 'silver',  check: s => s.totalCategories > 0 && s.uniqueCategories >= s.totalCategories },
  { id: 'ticket_1',    emoji: '🎫', label: 'Service rendu',    desc: '1 ticket complété',      tier: 'bronze',  check: s => s.ticketsCompleted >= 1 },
  { id: 'ticket_10',   emoji: '🛠️', label: 'Handyman',         desc: '10 tickets complétés',   tier: 'gold',    check: s => s.ticketsCompleted >= 10 },
]

const TIER_STYLE: Record<string, { card: string; label: string }> = {
  bronze:  { card: 'from-orange-900/40 to-orange-800/20 border-orange-700/40', label: 'text-orange-400' },
  silver:  { card: 'from-slate-700/40 to-slate-600/20 border-slate-500/40',   label: 'text-slate-300' },
  gold:    { card: 'from-yellow-900/40 to-yellow-800/20 border-yellow-600/40', label: 'text-yellow-400' },
  diamond: { card: 'from-cyan-900/40 to-blue-900/20 border-cyan-500/40',       label: 'text-cyan-400' },
}

function computeStats(logs: any[], ticketLogs: any[], totalCategories: number): MemberStats {
  const totalTasks = logs.length
  const totalPoints = logs.reduce((s: number, l: any) => s + (l.points_awarded || 0), 0)
  const days = new Set(logs.map((l: any) => new Date(l.done_at).toDateString()))
  let maxStreak = 0, cur = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * 86400000).toDateString()
    if (days.has(d)) { cur++; maxStreak = Math.max(maxStreak, cur) } else cur = 0
  }
  const uniqueCategories = new Set(logs.map((l: any) => l.task_type?.category).filter(Boolean)).size
  return { totalTasks, totalPoints, maxStreak, uniqueCategories, totalCategories, ticketsCompleted: ticketLogs.length }
}

export default function SuccesPage() {
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
    const [{ data: members }, { data: allLogs }, { data: taskTypes }, { data: tickets }] = await Promise.all([
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_logs').select('done_by, done_at, points_awarded, task_type:task_types(category)').eq('household_id', householdId),
      supabase.from('task_types').select('category').eq('household_id', householdId),
      supabase.from('tickets').select('completed_by').eq('household_id', householdId).eq('status', 'done').not('completed_by', 'is', null),
    ])

    const cats = new Set((taskTypes ?? []).map((t: any) => t.category)).size
    const memberStats: Record<string, { profile: any; achieved: Set<string> }> = {}

    for (const m of members ?? []) {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      if (!p) continue
      const myLogs = (allLogs ?? []).filter((l: any) => l.done_by === m.profile_id)
      const myTickets = (tickets ?? []).filter((t: any) => t.completed_by === m.profile_id)
      const stats = computeStats(myLogs, myTickets, cats)
      const achieved = new Set(ACHIEVEMENTS.filter(a => a.check(stats)).map(a => a.id))
      memberStats[m.profile_id] = { profile: p, achieved }
    }

    setData({ memberStats, profileId })
    setLoading(false)
  }

  if (loading || !data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const myEntry = data.memberStats[data.profileId]
  const myAchieved: Set<string> = myEntry?.achieved ?? new Set()
  const others = Object.entries(data.memberStats as Record<string, any>).filter(([id]) => id !== data.profileId)
  const earned = ACHIEVEMENTS.filter(a => myAchieved.has(a.id))
  const locked = ACHIEVEMENTS.filter(a => !myAchieved.has(a.id))

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Succès</h2>
        <p className="text-xs text-[#7070a0]">{myAchieved.size} / {ACHIEVEMENTS.length}</p>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-700"
          style={{ width: `${(myAchieved.size / ACHIEVEMENTS.length) * 100}%` }}
        />
      </div>

      {/* Earned */}
      {earned.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mt-1">Obtenus</p>
          <div className="flex flex-col gap-2">
            {earned.map(a => {
              const s = TIER_STYLE[a.tier]
              const alsoHave = others.filter(([, v]: any) => v.achieved.has(a.id)).map(([, v]: any) => v.profile)
              return (
                <div key={a.id} className={`bg-gradient-to-br ${s.card} border rounded-xl px-4 py-3 flex items-center gap-4`}>
                  <p className="text-2xl flex-shrink-0">{a.emoji}</p>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold ${s.label}`}>{a.label}</p>
                    <p className="text-[11px] text-[#7070a0] mt-0.5">{a.desc}</p>
                  </div>
                  {alsoHave.length > 0 && (
                    <div className="flex -space-x-1.5 flex-shrink-0">
                      {alsoHave.map((p: any) => (
                        <Avatar key={p.id} name={p.display_name} color={p.color} avatarUrl={p.avatar_url} size="xs" className="ring-1 ring-[#13131a]" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Locked */}
      {locked.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mt-1">À débloquer</p>
          <div className="flex flex-col gap-2">
            {locked.map(a => {
              const alsoHave = others.filter(([, v]: any) => v.achieved.has(a.id)).map(([, v]: any) => v.profile)
              return (
                <div key={a.id} className="bg-[#1c1c26] border border-[#2e2e3e] rounded-xl px-4 py-3 flex items-center gap-4 opacity-50">
                  <p className="text-2xl flex-shrink-0 grayscale">{a.emoji}</p>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#555570]">{a.label}</p>
                    <p className="text-[11px] text-[#444458] mt-0.5">{a.desc}</p>
                  </div>
                  {alsoHave.length > 0 && (
                    <div className="flex -space-x-1.5 flex-shrink-0">
                      {alsoHave.map((p: any) => (
                        <Avatar key={p.id} name={p.display_name} color={p.color} avatarUrl={p.avatar_url} size="xs" className="ring-1 ring-[#13131a]" />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
