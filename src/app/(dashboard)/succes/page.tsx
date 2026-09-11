import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const ACHIEVEMENTS = [
  { key: 'first_task', icon: '🌱', label: 'Premier pas', description: 'Réaliser ta 1ère tâche', condition: { type: 'task_count', value: 1 } },
  { key: 'ten_tasks', icon: '💪', label: 'Bras musclé', description: '10 tâches réalisées', condition: { type: 'task_count', value: 10 } },
  { key: 'fifty_tasks', icon: '🧹', label: 'Machine à laver', description: '50 tâches réalisées', condition: { type: 'task_count', value: 50 } },
  { key: 'hundred_tasks', icon: '🏆', label: 'Centurion', description: '100 tâches réalisées', condition: { type: 'task_count', value: 100 } },
  { key: 'streak_3', icon: '🔥', label: 'En feu', description: 'Streak de 3 jours', condition: { type: 'streak', value: 3 } },
  { key: 'streak_7', icon: '🌋', label: 'Série de feu', description: 'Streak de 7 jours', condition: { type: 'streak', value: 7 } },
  { key: 'streak_30', icon: '⚡', label: 'Indestructible', description: 'Streak de 30 jours', condition: { type: 'streak', value: 30 } },
  { key: 'savior', icon: '🦸', label: 'Sauveur', description: 'Prendre un ticket non assigné', condition: { type: 'savior', value: 1 } },
  { key: 'king_month', icon: '👑', label: 'Roi du mois', description: 'Finir 1er au classement mensuel', condition: { type: 'king_month', value: 1 } },
  { key: 'points_500', icon: '💰', label: 'Riche en mérites', description: 'Cumuler 500 points', condition: { type: 'points', value: 500 } },
  { key: 'points_2000', icon: '💎', label: 'Diamant', description: 'Cumuler 2000 points', condition: { type: 'points', value: 2000 } },
  { key: 'all_categories', icon: '🎨', label: 'Polyvalent', description: 'Faire une tâche dans chaque catégorie', condition: { type: 'all_categories', value: 1 } },
]

export default async function SuccesPage() {
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

  const [{ data: allTimeLogs }, { data: ticketsTaken }] = await Promise.all([
    supabase.from('task_logs').select('done_at, task_type:task_types(category)').eq('done_by', user.id).eq('household_id', householdId).order('done_at'),
    supabase.from('tickets').select('id').eq('household_id', householdId).eq('completed_by', user.id),
  ])

  const taskCount = allTimeLogs?.length ?? 0
  const totalPoints = (await supabase.from('task_logs').select('points_awarded').eq('done_by', user.id).eq('household_id', householdId)).data?.reduce((s, l) => s + l.points_awarded, 0) ?? 0

  // Streak
  const days = new Set((allTimeLogs ?? []).map((l) => new Date(l.done_at).toDateString()))
  let streak = days.has(new Date().toDateString()) ? 1 : 0
  let d = new Date(Date.now() - 86400000)
  while (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 86400000) }

  // Savior: tickets taken (assigned to self, not created by self)
  const saviorCount = ticketsTaken?.length ?? 0

  // Categories done
  const categoriesDone = new Set((allTimeLogs ?? []).map((l) => {
    const tt = Array.isArray(l.task_type) ? l.task_type[0] : l.task_type
    return (tt as { category: string } | null)?.category
  }).filter(Boolean))

  function isUnlocked(key: string): boolean {
    switch (key) {
      case 'first_task': return taskCount >= 1
      case 'ten_tasks': return taskCount >= 10
      case 'fifty_tasks': return taskCount >= 50
      case 'hundred_tasks': return taskCount >= 100
      case 'streak_3': return streak >= 3
      case 'streak_7': return streak >= 7
      case 'streak_30': return streak >= 30
      case 'savior': return saviorCount >= 1
      case 'points_500': return totalPoints >= 500
      case 'points_2000': return totalPoints >= 2000
      case 'all_categories': return categoriesDone.size >= 5
      default: return false
    }
  }

  function getProgress(key: string): number {
    switch (key) {
      case 'first_task': return Math.min(100, (taskCount / 1) * 100)
      case 'ten_tasks': return Math.min(100, (taskCount / 10) * 100)
      case 'fifty_tasks': return Math.min(100, (taskCount / 50) * 100)
      case 'hundred_tasks': return Math.min(100, (taskCount / 100) * 100)
      case 'streak_3': return Math.min(100, (streak / 3) * 100)
      case 'streak_7': return Math.min(100, (streak / 7) * 100)
      case 'streak_30': return Math.min(100, (streak / 30) * 100)
      case 'points_500': return Math.min(100, (totalPoints / 500) * 100)
      case 'points_2000': return Math.min(100, (totalPoints / 2000) * 100)
      case 'all_categories': return Math.min(100, (categoriesDone.size / 5) * 100)
      default: return 0
    }
  }

  const unlocked = ACHIEVEMENTS.filter((a) => isUnlocked(a.key))
  const locked = ACHIEVEMENTS.filter((a) => !isUnlocked(a.key))

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Summary */}
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

      {/* Unlocked */}
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

      {/* Locked */}
      {locked.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">À débloquer</h3>
          <div className="flex flex-col gap-2">
            {locked.map((a) => {
              const progress = getProgress(a.key)
              return (
                <Card key={a.key} className="opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl grayscale">{a.icon}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#f0f0f5]">{a.label}</p>
                      <p className="text-xs text-[#8888a0]">{a.description}</p>
                      {progress > 0 && (
                        <div className="mt-1.5 h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${progress}%` }} />
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
    </div>
  )
}
