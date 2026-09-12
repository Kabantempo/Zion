'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'

const ACHIEVEMENTS = [
  { key: 'first_task', icon: '🌱', label: 'Premier pas', description: 'Réaliser ta 1ère tâche' },
  { key: 'ten_tasks', icon: '💪', label: 'Bras musclé', description: '10 tâches réalisées' },
  { key: 'fifty_tasks', icon: '🧹', label: 'Machine à laver', description: '50 tâches réalisées' },
  { key: 'hundred_tasks', icon: '🏆', label: 'Centurion', description: '100 tâches réalisées' },
  { key: 'streak_3', icon: '🔥', label: 'En feu', description: 'Streak de 3 jours' },
  { key: 'streak_7', icon: '🌋', label: 'Série de feu', description: 'Streak de 7 jours' },
  { key: 'streak_30', icon: '⚡', label: 'Indestructible', description: 'Streak de 30 jours' },
  { key: 'savior', icon: '🦸', label: 'Sauveur', description: 'Prendre un ticket non assigné' },
  { key: 'cyberpsycho', icon: '🤖', label: 'Cyberpsycho', description: 'Terminer 10 tickets' },
  { key: 'points_500', icon: '💰', label: 'Riche en mérites', description: 'Cumuler 500 points' },
  { key: 'points_2000', icon: '💎', label: 'Diamant', description: 'Cumuler 2000 points' },
  { key: 'all_categories', icon: '🎨', label: 'Polyvalent', description: 'Tâches dans 5 catégories' },
  { key: 'dead_god', icon: '💀', label: 'Dead God', description: 'Faire toutes les tâches au moins une fois' },
]

interface MemberProfile {
  profileId: string
  displayName: string
  color: string
  avatarUrl: string | null
}

interface Stats {
  taskCount: number
  totalPoints: number
  saviorCount: number
  streak: number
  categoriesDone: Set<string>
  uniqueTasksDone: number
  totalTaskTypes: number
}

function computeUnlocked(stats: Stats) {
  const { taskCount, totalPoints, saviorCount, streak, categoriesDone, uniqueTasksDone, totalTaskTypes } = stats
  const checks: Record<string, boolean> = {
    first_task: taskCount >= 1,
    ten_tasks: taskCount >= 10,
    fifty_tasks: taskCount >= 50,
    hundred_tasks: taskCount >= 100,
    streak_3: streak >= 3,
    streak_7: streak >= 7,
    streak_30: streak >= 30,
    savior: saviorCount >= 1,
    cyberpsycho: saviorCount >= 10,
    points_500: totalPoints >= 500,
    points_2000: totalPoints >= 2000,
    all_categories: categoriesDone.size >= 5,
    dead_god: totalTaskTypes > 0 && uniqueTasksDone >= totalTaskTypes,
  }
  return checks
}

function getProgress(key: string, stats: Stats): number {
  const { taskCount, totalPoints, streak, categoriesDone, saviorCount, uniqueTasksDone, totalTaskTypes } = stats
  switch (key) {
    case 'first_task': return Math.min(100, taskCount * 100)
    case 'ten_tasks': return Math.min(100, (taskCount / 10) * 100)
    case 'fifty_tasks': return Math.min(100, (taskCount / 50) * 100)
    case 'hundred_tasks': return Math.min(100, (taskCount / 100) * 100)
    case 'streak_3': return Math.min(100, (streak / 3) * 100)
    case 'streak_7': return Math.min(100, (streak / 7) * 100)
    case 'streak_30': return Math.min(100, (streak / 30) * 100)
    case 'points_500': return Math.min(100, (totalPoints / 500) * 100)
    case 'points_2000': return Math.min(100, (totalPoints / 2000) * 100)
    case 'all_categories': return Math.min(100, (categoriesDone.size / 5) * 100)
    case 'cyberpsycho': return Math.min(100, (saviorCount / 10) * 100)
    case 'dead_god': return totalTaskTypes > 0 ? Math.min(100, (uniqueTasksDone / totalTaskTypes) * 100) : 0
    default: return 0
  }
}

export default function SuccesPage() {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [members, setMembers] = useState<MemberProfile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [statsMap, setStatsMap] = useState<Record<string, Stats>>({})
  const [loading, setLoading] = useState(true)
  const [myProfileId, setMyProfileId] = useState<string | null>(null)
  const [newAchievement, setNewAchievement] = useState<{ icon: string; label: string } | null>(null)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    setMyProfileId(session.profileId)
    setSelectedId(session.profileId)
    loadAll(session.profileId, session.householdId)
  }, [pathname])

  async function loadAll(profileId: string, householdId: string) {
    const { data: membersData } = await supabase
      .from('household_members')
      .select('profile_id, profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId)

    const profiles: MemberProfile[] = (membersData ?? []).map((m: any) => {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      return { profileId: m.profile_id, displayName: p?.display_name ?? '?', color: p?.color ?? '#555', avatarUrl: p?.avatar_url ?? null }
    }).filter((m: any) => m.displayName !== '?')

    setMembers(profiles)

    const map: Record<string, Stats> = {}
    await Promise.all(profiles.map(async (m) => {
      const [{ data: allTimeLogs }, { data: pointsData }, { data: ticketsDone }, { data: allTaskTypes }] = await Promise.all([
        supabase.from('task_logs').select('done_at, task_type_id, task_type:task_types(category)').eq('done_by', m.profileId).eq('household_id', householdId).order('done_at'),
        supabase.from('task_logs').select('points_awarded').eq('done_by', m.profileId).eq('household_id', householdId),
        supabase.from('tickets').select('id').eq('household_id', householdId).eq('completed_by', m.profileId),
        supabase.from('task_types').select('id').eq('household_id', householdId),
      ])

      const taskCount = allTimeLogs?.length ?? 0
      const totalPoints = (pointsData ?? []).reduce((s: number, l: any) => s + l.points_awarded, 0)
      const saviorCount = ticketsDone?.length ?? 0
      const totalTaskTypes = allTaskTypes?.length ?? 0
      const uniqueTasksDone = new Set((allTimeLogs ?? []).map((l: any) => l.task_type_id).filter(Boolean)).size

      const days = new Set((allTimeLogs ?? []).map((l: any) => new Date(l.done_at).toDateString()))
      let streak = days.has(new Date().toDateString()) ? 1 : 0
      let d = new Date(Date.now() - 86400000)
      while (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 86400000) }

      const categoriesDone = new Set((allTimeLogs ?? []).map((l: any) => {
        const tt = Array.isArray(l.task_type) ? l.task_type[0] : l.task_type
        return tt?.category
      }).filter(Boolean))

      map[m.profileId] = { taskCount, totalPoints, saviorCount, streak, categoriesDone, uniqueTasksDone, totalTaskTypes }
    }))

    setStatsMap(map)
    setLoading(false)

    // Detect newly unlocked achievements for current user
    const myStats = map[profileId]
    if (myStats) {
      const unlocked = computeUnlocked(myStats)
      const storageKey = `zion_achievements_${profileId}`
      let seen: string[] = []
      try { seen = JSON.parse(localStorage.getItem(storageKey) ?? '[]') } catch {}
      const newOnes = ACHIEVEMENTS.filter((a) => unlocked[a.key] && !seen.includes(a.key))
      if (newOnes.length > 0) {
        const first = newOnes[0]
        setNewAchievement({ icon: first.icon, label: first.label })
        const allUnlocked = ACHIEVEMENTS.filter((a) => unlocked[a.key]).map((a) => a.key)
        try { localStorage.setItem(storageKey, JSON.stringify(allUnlocked)) } catch {}
        setTimeout(() => setNewAchievement(null), 4000)
      } else {
        const allUnlocked = ACHIEVEMENTS.filter((a) => unlocked[a.key]).map((a) => a.key)
        try { localStorage.setItem(storageKey, JSON.stringify(allUnlocked)) } catch {}
      }
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  const stats = selectedId ? statsMap[selectedId] : null
  const unlocked = stats ? ACHIEVEMENTS.filter((a) => computeUnlocked(stats)[a.key]) : []
  const locked = stats ? ACHIEVEMENTS.filter((a) => !computeUnlocked(stats)[a.key]) : []

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {newAchievement && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center pointer-events-none">
          <div className="bg-[#1a1a24] border border-yellow-500/40 rounded-3xl p-8 text-center shadow-2xl animate-pop-in mx-6">
            <div className="text-6xl mb-3 animate-bounce">{newAchievement.icon}</div>
            <p className="text-xs font-semibold text-yellow-400 uppercase tracking-widest mb-1">Succès débloqué !</p>
            <p className="text-2xl font-black text-[#f0f0f5]">{newAchievement.label}</p>
            <div className="mt-4 flex justify-center gap-1">
              {['✨','🎉','✨'].map((e, i) => <span key={i} className="text-xl animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}>{e}</span>)}
            </div>
          </div>
        </div>,
        document.body
      )}
      <div className="flex justify-end">
        <Link href="/classement" className="text-xs text-[#7070a0] hover:text-red-400 transition-colors flex items-center gap-1">
          🏆 Classement →
        </Link>
      </div>

      {/* Member picker */}
      {members.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {members.map((m) => (
            <button
              key={m.profileId}
              onClick={() => setSelectedId(m.profileId)}
              className={`flex flex-col items-center gap-1.5 flex-shrink-0 transition-all ${selectedId === m.profileId ? 'opacity-100' : 'opacity-40'}`}
            >
              <div className={`rounded-full transition-all ${selectedId === m.profileId ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-[#0f0f13]' : ''}`}>
                <Avatar name={m.displayName} color={m.color} avatarUrl={m.avatarUrl} size="md" />
              </div>
              <span className="text-xs text-[#8888a0]">{m.profileId === myProfileId ? 'Moi' : m.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {stats && (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <div className="text-4xl">🏅</div>
              <div>
                <p className="text-2xl font-black text-[#f0f0f5]">{unlocked.length}<span className="text-[#8888a0] text-lg font-normal">/{ACHIEVEMENTS.length}</span></p>
                <p className="text-sm text-[#8888a0]">succès débloqués</p>
              </div>
            </div>
            <div className="mt-3 h-2 bg-[#2e2e3e] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 rounded-full transition-all" style={{ width: `${(unlocked.length / ACHIEVEMENTS.length) * 100}%` }} />
            </div>
          </Card>

          {unlocked.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Débloqués ✨</h3>
              <div className="grid grid-cols-2 gap-2">
                {unlocked.map((a) => (
                  <Card key={a.key} className="text-center">
                    <div className="text-4xl mb-2">{a.icon}</div>
                    <p className="text-sm font-bold text-[#f0f0f5]">{a.label}</p>
                    <p className="text-xs text-[#8888a0] mt-0.5">{a.description}</p>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {locked.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">À débloquer</h3>
              <div className="flex flex-col gap-2">
                {locked.map((a) => {
                  const progress = getProgress(a.key, stats)
                  return (
                    <Card key={a.key} className="opacity-60">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl grayscale">{a.icon}</div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-[#f0f0f5]">{a.label}</p>
                          <p className="text-xs text-[#8888a0]">{a.description}</p>
                          {progress > 0 && (
                            <div className="mt-1.5 h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden">
                              <div className="h-full bg-red-500 rounded-full" style={{ width: `${progress}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
