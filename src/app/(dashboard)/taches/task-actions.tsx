'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { TaskType } from '@/types'

interface Props {
  taskTypes: TaskType[]
  householdId: string
  profileId: string
}

const CATEGORIES = ['Cuisine', 'Sol', 'Salle de bain', 'Poubelles', 'Courses', 'Salon', 'Autre']
const FREQUENCIES = [
  { value: 'daily', label: 'Quotidien' },
  { value: 'weekly', label: 'Hebdo' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'as_needed', label: 'Selon besoin' },
]

export function TaskActions({ taskTypes, householdId, profileId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [showLog, setShowLog] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<{ label: string; points: number } | null>(null)

  // New task form
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState('Cuisine')
  const [points, setPoints] = useState('15')
  const [frequency, setFrequency] = useState('weekly')

  async function logTask(task: TaskType) {
    setLoading(task.id)
    const { error } = await supabase.from('task_logs').insert({
      household_id: householdId,
      task_type_id: task.id,
      done_by: profileId,
      done_at: new Date().toISOString(),
      points_awarded: task.points,
    })
    if (!error) {
      setCelebration({ label: task.label, points: task.points })
      setShowLog(false)
      setTimeout(() => { setCelebration(null); router.refresh() }, 2000)
    }
    setLoading(null)
  }

  async function addTaskType(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setLoading('add')
    const { error } = await supabase.from('task_types').insert({
      household_id: householdId,
      label: label.trim(),
      category,
      points: parseInt(points) || 10,
      frequency,
    })
    if (!error) {
      setLabel(''); setShowAdd(false); router.refresh()
    }
    setLoading(null)
  }

  return (
    <>
      {celebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-[#1a1a24] border border-green-500/30 rounded-2xl p-6 text-center animate-pop-in shadow-2xl">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-lg font-bold text-[#f0f0f5]">{celebration.label}</p>
            <p className="text-3xl font-black text-green-400 mt-2">+{celebration.points} pts !</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => setShowLog(true)}>✅ J'ai fait une tâche</Button>
        <Button variant="secondary" onClick={() => setShowAdd(true)}>+ Tâche</Button>
      </div>

      {/* Log task sheet */}
      {showLog && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setShowLog(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 max-h-[80dvh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold text-[#f0f0f5] mb-4">Quelle tâche as-tu faite ?</h3>
            {Object.entries(
              taskTypes.reduce((acc, t) => { if (!acc[t.category]) acc[t.category] = []; acc[t.category].push(t); return acc }, {} as Record<string, TaskType[]>)
            ).map(([cat, tasks]) => (
              <div key={cat} className="mb-4">
                <p className="text-xs font-semibold text-[#555570] uppercase tracking-wider mb-2">{cat}</p>
                <div className="flex flex-col gap-1">
                  {tasks.map((task) => (
                    <button key={task.id} onClick={() => logTask(task)} disabled={loading === task.id} className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[#22222e] hover:bg-[#2a2a3e] transition-colors">
                      <span className="text-sm text-[#f0f0f5]">{task.label}</span>
                      <span className="text-xs font-bold text-green-400">+{task.points}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add task type sheet */}
      {showAdd && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setShowAdd(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <form className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 flex flex-col gap-4 animate-slide-up max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={addTaskType}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">Nouvelle tâche type</h3>
            <Input label="Libellé" placeholder="Nettoyer le four" value={label} onChange={(e) => setLabel(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Catégorie</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${category === c ? 'bg-red-500 text-white' : 'bg-[#22222e] text-[#8888a0]'}`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Input label="Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} min="1" max="100" className="w-24" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[#8888a0] mb-1.5">Fréquence</p>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#22222e] border border-[#2e2e3e] text-[#f0f0f5] outline-none focus:border-red-500">
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
            </div>
            <Button type="submit" loading={loading === 'add'} className="w-full">Ajouter</Button>
          </form>
        </div>
      )}
    </>
  )
}
