'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { CalendarEvent, Profile } from '@/types'

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DAY_NAMES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const EVENT_TYPES = [
  { value: 'party', label: '🎉 Soirée' },
  { value: 'absence', label: '🏕️ Absence' },
  { value: 'shopping', label: '🛒 Courses' },
  { value: 'other', label: '📌 Autre' },
]

interface Props {
  events: CalendarEvent[]
  profiles: Profile[]
  householdId: string
  profileId: string
}

export function CalendarClient({ events: initialEvents, profiles, householdId, profileId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState(initialEvents)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(false)

  // Form
  const [title, setTitle] = useState('')
  const [type, setType] = useState('party')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Profile color
  const myProfile = profiles.find((p) => p.id === profileId)

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7 // Monday = 0

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  function eventsForDay(day: number): CalendarEvent[] {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter((e) => e.start.startsWith(d) || (e.start <= d + 'T23:59:59' && e.end >= d))
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startDate) return
    setLoading(true)
    const { data, error } = await supabase.from('events').insert({
      household_id: householdId,
      title: title.trim(),
      type,
      start: startDate,
      end: endDate || startDate,
      created_by: profileId,
      color: myProfile?.color ?? '#6366f1',
    }).select('*, creator:profiles!created_by(display_name, color)').single()

    if (!error && data) {
      setEvents((prev) => [...prev, data as CalendarEvent].sort((a, b) => a.start.localeCompare(b.start)))
      setTitle(''); setStartDate(''); setEndDate(''); setShowCreate(false)
    }
    setLoading(false)
  }

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : []

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] active:scale-95">←</button>
        <h2 className="text-lg font-bold text-[#f0f0f5]">{MONTH_NAMES[month]} {year}</h2>
        <button onClick={nextMonth} className="p-2 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] active:scale-95">→</button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d, i) => (
          <div key={i} className="text-center text-xs text-[#555570] font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startDow }).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dayEvents = eventsForDay(day)
          const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
          const isSelected = selectedDay === day
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : day)}
              className={`relative aspect-square flex flex-col items-center justify-start pt-1 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                isSelected ? 'bg-red-500 text-white' :
                isToday ? 'bg-red-500/20 text-red-400' :
                'bg-[#1a1a24] text-[#f0f0f5] hover:bg-[#22222e]'
              }`}
            >
              {day}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {dayEvents.slice(0, 3).map((ev, idx) => (
                    <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day events */}
      {selectedDay && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[#8888a0]">{selectedDay} {MONTH_NAMES[month]}</h3>
            <Button size="sm" onClick={() => { setStartDate(`${year}-${String(month+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`); setShowCreate(true) }}>+ Événement</Button>
          </div>
          {selectedDayEvents.length === 0 ? (
            <p className="text-xs text-[#555570] text-center py-4">Rien prévu ce jour</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedDayEvents.map((ev) => (
                <Card key={ev.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#f0f0f5]">{ev.title}</p>
                      <p className="text-xs text-[#8888a0]">
                        {EVENT_TYPES.find((t) => t.value === ev.type)?.label ?? ev.type}
                        {ev.creator && ` · par ${(ev.creator as Profile).display_name}`}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Button variant="secondary" onClick={() => setShowCreate(true)}>+ Ajouter un événement</Button>

      {/* Create event sheet */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <form className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 flex flex-col gap-4 animate-slide-up" onClick={(e) => e.stopPropagation()} onSubmit={createEvent}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">Nouvel événement</h3>
            <Input label="Titre" placeholder="Soirée raclette 🧀" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Type</p>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => (
                  <button key={t.value} type="button" onClick={() => setType(t.value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${type === t.value ? 'bg-red-500 text-white' : 'bg-[#22222e] text-[#8888a0]'}`}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Input label="Début" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="flex-1" />
              <Input label="Fin (optionnel)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1" />
            </div>
            <Button type="submit" loading={loading} className="w-full">Ajouter</Button>
          </form>
        </div>
      )}
    </div>
  )
}
