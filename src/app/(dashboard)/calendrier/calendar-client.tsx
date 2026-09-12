'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import type { CalendarEvent, Profile } from '@/types'

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DAY_NAMES = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const BASE_EVENT_TYPES = [
  { value: 'birthday', label: 'Anniversaire', color: '#FF6B9D' },
  { value: 'party', label: 'Soirée', color: '#A855F7' },
  { value: 'absence', label: 'Absence', color: '#F59E0B' },
  { value: 'other', label: 'Autre', color: '#6366f1' },
]

const CUSTOM_COLORS = ['#10B981', '#EF4444', '#3B82F6', '#F97316', '#14B8A6', '#EC4899', '#8B5CF6', '#84CC16']

function loadCustomTypes(): { value: string; label: string; color: string }[] {
  try { return JSON.parse(localStorage.getItem('zion_event_types') ?? '[]') } catch { return [] }
}
function saveCustomTypes(types: { value: string; label: string; color: string }[]) {
  localStorage.setItem('zion_event_types', JSON.stringify(types))
}

function typeColor(type: string, allTypes: { value: string; color: string }[]): string {
  return allTypes.find(t => t.value === type)?.color ?? '#6366f1'
}

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

  // Realtime sync
  useEffect(() => {
    const channel = supabase
      .channel(`events-${householdId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `household_id=eq.${householdId}` }, (payload) => {
        const newId = (payload.new as { id: string }).id
        supabase.from('events').select('*, creator:profiles!created_by(display_name, color)').eq('id', newId).single()
          .then(({ data }) => {
            if (data) setEvents(prev => [...prev, data as CalendarEvent].sort((a, b) => a.start.localeCompare(b.start)))
          })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'events', filter: `household_id=eq.${householdId}` }, (payload) => {
        const oldId = (payload.old as { id: string }).id
        setEvents(prev => prev.filter(e => e.id !== oldId))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId])
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate())
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null)
  const swipeTouchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeDx = useRef(0)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Filter
  const [filterType, setFilterType] = useState<string | null>(null)

  // Create form
  const [title, setTitle] = useState('')
  const [type, setType] = useState('party')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Edit form
  const [editTitle, setEditTitle] = useState('')
  const [editType, setEditType] = useState('party')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  // Custom types
  const [customTypes, setCustomTypes] = useState<{ value: string; label: string; color: string }[]>([])
  const [showAddType, setShowAddType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [showEditAddType, setShowEditAddType] = useState(false)
  const [newEditTypeName, setNewEditTypeName] = useState('')

  useEffect(() => { setCustomTypes(loadCustomTypes()) }, [])

  const EVENT_TYPES = [...BASE_EVENT_TYPES, ...customTypes]
  const filteredEvents = filterType ? events.filter(e => e.type === filterType) : events

  function addCustomType(label: string, forEdit = false) {
    const trimmed = label.trim()
    if (!trimmed) return
    const value = 'custom_' + trimmed.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now()
    const color = CUSTOM_COLORS[customTypes.length % CUSTOM_COLORS.length]
    const newType = { value, label: trimmed, color }
    const updated = [...customTypes, newType]
    setCustomTypes(updated)
    saveCustomTypes(updated)
    if (forEdit) { setEditType(value); setShowEditAddType(false); setNewEditTypeName('') }
    else { setType(value); setShowAddType(false); setNewTypeName('') }
  }

  function removeCustomType(value: string) {
    const updated = customTypes.filter(t => t.value !== value)
    setCustomTypes(updated)
    saveCustomTypes(updated)
  }

  // Profile color
  const myProfile = profiles.find((p) => p.id === profileId)

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7 // Monday = 0

  const weeks: (number | null)[][] = []
  let currentWeek: (number | null)[] = Array(startDow).fill(null)
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day)
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null)
    weeks.push(currentWeek)
  }

  function toDateStr(d: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  function getMultiDayBarsForWeek(weekDays: (number | null)[]) {
    const validDays = weekDays.map((d, i) => ({ d, i })).filter(({ d }) => d !== null) as { d: number; i: number }[]
    if (!validDays.length) return []
    const weekFirstDate = toDateStr(validDays[0].d)
    const weekLastDate = toDateStr(validDays[validDays.length - 1].d)
    const bars: { event: CalendarEvent; colStart: number; colEnd: number; isStart: boolean; isEnd: boolean }[] = []
    filteredEvents.forEach(e => {
      if ((e.type as string) === 'birthday') return
      const eStart = e.start.slice(0, 10)
      const eEnd = (e.end || e.start).slice(0, 10)
      if (eStart >= eEnd) return
      if (eStart > weekLastDate || eEnd < weekFirstDate) return
      let colStart = validDays[0].i
      for (let i = 0; i < weekDays.length; i++) {
        const d = weekDays[i]
        if (d === null) continue
        if (toDateStr(d) >= eStart) { colStart = i; break }
      }
      let colEnd = validDays[validDays.length - 1].i
      for (let i = weekDays.length - 1; i >= 0; i--) {
        const d = weekDays[i]
        if (d === null) continue
        if (toDateStr(d) <= eEnd) { colEnd = i; break }
      }
      bars.push({ event: e, colStart, colEnd, isStart: eStart >= weekFirstDate, isEnd: eEnd <= weekLastDate })
    })
    return bars
  }

  function assignLanes(bars: { colStart: number; colEnd: number }[]) {
    const lanes: number[] = []
    const laneMaxEnd: number[] = []
    for (const bar of bars) {
      let lane = laneMaxEnd.findIndex(end => bar.colStart > end)
      if (lane === -1) lane = laneMaxEnd.length
      lanes.push(lane)
      laneMaxEnd[lane] = bar.colEnd
    }
    return lanes
  }

  function prevMonth() {
    setSlideDir('right')
    setTimeout(() => { setSlideDir(null) }, 300)
    setSelectedDay(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function nextMonth() {
    setSlideDir('left')
    setTimeout(() => { setSlideDir(null) }, 300)
    setSelectedDay(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }

  function onSwipeTouchStart(e: React.TouchEvent) {
    swipeTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    swipeDx.current = 0
  }
  function onSwipeTouchMove(e: React.TouchEvent) {
    if (!swipeTouchStart.current) return
    const dx = e.touches[0].clientX - swipeTouchStart.current.x
    const dy = e.touches[0].clientY - swipeTouchStart.current.y
    if (Math.abs(dx) > Math.abs(dy)) swipeDx.current = dx
  }
  function onSwipeTouchEnd() {
    if (Math.abs(swipeDx.current) > 50) {
      if (swipeDx.current < 0) nextMonth(); else prevMonth()
    }
    swipeTouchStart.current = null
    swipeDx.current = 0
  }

  function eventsForDay(day: number): CalendarEvent[] {
    const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const md = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return filteredEvents.filter((e) => {
      if ((e.type as string) === 'birthday') {
        return e.start.slice(5, 10) === md
      }
      const eStart = e.start.slice(0, 10)
      const eEnd = (e.end || e.start).slice(0, 10)
      return eStart <= d && eEnd >= d
    })
  }

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev)
    setEditTitle(ev.title)
    setEditType(ev.type)
    setEditStart(ev.start.slice(0, 10))
    setEditEnd(ev.end ? ev.end.slice(0, 10) : '')
    setFormError(null)
    setShowEdit(true)
  }

  async function updateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEvent || !editTitle.trim() || !editStart) return
    setLoading(true)
    setFormError(null)
    const { data, error } = await supabase.from('events').update({
      title: editTitle.trim(),
      type: editType,
      start: editStart,
      end: editEnd || editStart,
      color: typeColor(editType, EVENT_TYPES),
    }).eq('id', editingEvent.id).select('*, creator:profiles!created_by(display_name, color)').single()
    if (error) {
      setFormError(error.message)
    } else if (data) {
      setEvents(prev => prev.map(ev => ev.id === editingEvent.id ? data as CalendarEvent : ev))
      setShowEdit(false)
      setEditingEvent(null)
    }
    setLoading(false)
  }

  async function deleteEvent() {
    if (!editingEvent) return
    setDeleteLoading(true)
    const { error } = await supabase.from('events').delete().eq('id', editingEvent.id)
    if (!error) {
      setEvents(prev => prev.filter(ev => ev.id !== editingEvent.id))
      setShowEdit(false)
      setEditingEvent(null)
    }
    setDeleteLoading(false)
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !startDate) return
    setLoading(true)
    setFormError(null)
    const { data, error } = await supabase.from('events').insert({
      household_id: householdId,
      title: title.trim(),
      type,
      start: startDate,
      end: endDate || startDate,
      created_by: profileId,
      color: typeColor(type, EVENT_TYPES),
    }).select('*, creator:profiles!created_by(display_name, color)').single()

    if (error) {
      setFormError(error.message)
    } else if (data) {
      setEvents((prev) => [...prev, data as CalendarEvent].sort((a, b) => a.start.localeCompare(b.start)))
      setTitle(''); setStartDate(''); setEndDate(''); setShowCreate(false)
    }
    setLoading(false)
  }

  const selectedDayEvents = selectedDay ? eventsForDay(selectedDay) : []

  function miniMonthDays(y: number, m: number) {
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7
    const daysInM = new Date(y, m + 1, 0).getDate()
    const cells: (number | null)[] = Array(firstDow).fill(null)
    for (let d = 1; d <= daysInM; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function miniEventsForDay(y: number, m: number, day: number): string[] {
    const d = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const md = `${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => {
      if ((e.type as string) === 'birthday') return e.start.slice(5, 10) === md
      return e.start.slice(0, 10) <= d && (e.end || e.start).slice(0, 10) >= d
    }).map(e => e.color)
  }

  const miniMonths = [1, 2].map(offset => {
    let m2 = month + offset, y2 = year
    if (m2 > 11) { m2 -= 12; y2++ }
    return { y: y2, m: m2 }
  })

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] active:scale-95">←</button>
        <h2 className="text-lg font-bold text-[#f0f0f5]">{MONTH_NAMES[month]} {year}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowCreate(true)}>+ Événement</Button>
          <button onClick={nextMonth} className="p-2 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] active:scale-95">→</button>
        </div>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 no-scrollbar">
        <button
          onClick={() => setFilterType(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${filterType === null ? 'bg-white text-[#13131a] border-white' : 'bg-transparent text-[#6060a0] border-[#2e2e3e]'}`}
        >
          Tous
        </button>
        {EVENT_TYPES.filter(t => events.some(e => e.type === t.value)).map(t => (
          <button
            key={t.value}
            onClick={() => setFilterType(filterType === t.value ? null : t.value)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
            style={filterType === t.value
              ? { backgroundColor: t.color, color: '#fff', borderColor: t.color }
              : { backgroundColor: 'transparent', color: '#6060a0', borderColor: '#2e2e3e' }}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: filterType === t.value ? 'rgba(255,255,255,0.8)' : t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Swipeable calendar area */}
      <div
        onTouchStart={onSwipeTouchStart}
        onTouchMove={onSwipeTouchMove}
        onTouchEnd={onSwipeTouchEnd}
        className="overflow-hidden"
      >
        <div
          className="transition-transform duration-300 ease-out"
          style={{ transform: slideDir === 'left' ? 'translateX(-8px)' : slideDir === 'right' ? 'translateX(8px)' : 'translateX(0)', opacity: slideDir ? 0.7 : 1, transition: 'transform 0.25s ease-out, opacity 0.25s' }}
        >

      {/* Day names */}
      <div className="grid grid-cols-7">
        {DAY_NAMES.map((d, i) => (
          <div key={`dn-${i}`} className="text-center text-[11px] text-[#505070] font-semibold py-1 tracking-widest uppercase">{d}</div>
        ))}
      </div>

      {/* Calendar weeks */}
      <div className="flex flex-col">
        {weeks.map((weekDays, wi) => {
          const bars = getMultiDayBarsForWeek(weekDays)
          const lanes = assignLanes(bars)
          const barsWithLanes = bars.map((bar, i) => ({ ...bar, lane: lanes[i] }))
          return (
            <div key={`week-${wi}`} className="grid grid-cols-7">
              {weekDays.map((day, di) => {
                if (!day) return <div key={`empty-${wi}-${di}`} />
                const dayEvents = eventsForDay(day)
                const singleDayEvs = dayEvents.filter(e => (e.type as string) === 'birthday' || e.start.slice(0, 10) === (e.end || e.start).slice(0, 10))
                const cellBars = barsWithLanes.filter(b => di >= b.colStart && di <= b.colEnd).sort((a, b) => a.lane - b.lane)
                const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear()
                const isSelected = selectedDay === day
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(isSelected ? null : day)}
                    className="relative flex flex-col items-center py-1 active:scale-95 transition-all overflow-hidden"
                    style={{ height: 52 + cellBars.length * 5 }}
                  >
                    <span className={`w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-semibold transition-all ${
                      isSelected ? 'bg-red-500 text-white' :
                      isToday ? 'bg-red-500/90 text-white' :
                      'text-[#d0d0e8]'
                    }`}>
                      {day}
                    </span>
                    {singleDayEvs.length > 0 && (() => {
                      const bdayEvs = singleDayEvs.filter(e => (e.type as string) === 'birthday')
                      const otherEvs = singleDayEvs.filter(e => (e.type as string) !== 'birthday')
                      return (
                        <div className="flex flex-col items-center gap-0.5 mt-0.5 w-full px-0.5">
                          {bdayEvs.slice(0, 2).map((ev, idx) => (
                            <p key={idx} className="text-[7px] leading-tight font-semibold truncate w-full text-center" style={{ color: ev.color }}>
                              {ev.title.split(' ').slice(-1)[0]}
                            </p>
                          ))}
                          {otherEvs.length > 0 && (
                            <div className="flex gap-0.5">
                              {otherEvs.slice(0, 3).map((ev, idx) => (
                                <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {cellBars.length > 0 && (
                      <div className="absolute bottom-0 left-0 right-0 flex flex-col" style={{ gap: 1 }}>
                        {cellBars.map((bar, i) => (
                          <div
                            key={i}
                            className="h-[4px] w-full"
                            style={{ backgroundColor: bar.event.color, opacity: isSelected ? 0.6 : 1 }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

        </div>{/* end transition div */}
      </div>{/* end swipeable area */}

      {/* Selected day events */}
      {selectedDay && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[#8888a0]">{selectedDay} {MONTH_NAMES[month]}</h3>
            <button onClick={() => { setStartDate(`${year}-${String(month+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`); setShowCreate(true) }} className="text-xs text-[#7070a0] hover:text-red-400 transition-colors">+ ajouter</button>
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
                    <button onClick={() => openEdit(ev)} className="text-xs text-[#7070a0] hover:text-[#f0f0f5] px-2 py-1 rounded-lg hover:bg-[#22222e] transition-colors flex-shrink-0">
                      Modifier
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create event sheet */}
      {showCreate && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <form className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 pb-28 flex flex-col gap-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={createEvent}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">Nouvel événement</h3>
            <Input label="Titre" placeholder="Soirée raclette" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Type</p>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => (
                  <div key={t.value} className="relative flex items-center">
                    <button type="button" onClick={() => setType(t.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${type === t.value ? 'text-white' : 'bg-[#22222e] text-[#8888a0]'} ${t.value.startsWith('custom_') ? 'pr-6' : ''}`}
                      style={type === t.value ? { backgroundColor: t.color } : {}}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: type === t.value ? 'rgba(255,255,255,0.6)' : t.color }} />
                      {t.label}
                    </button>
                    {t.value.startsWith('custom_') && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeCustomType(t.value) }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-[#3e3e5e] text-[#8888a0] hover:bg-red-500 hover:text-white text-xs leading-none">×</button>
                    )}
                  </div>
                ))}
                {showAddType ? (
                  <div className="flex items-center gap-1">
                    <input autoFocus value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomType(newTypeName) } if (e.key === 'Escape') { setShowAddType(false); setNewTypeName('') } }}
                      placeholder="Nom du type" className="px-2 py-1.5 rounded-lg text-sm bg-[#22222e] border border-[#6366f1] text-[#f0f0f5] outline-none w-28" />
                    <button type="button" onClick={() => addCustomType(newTypeName)} className="px-2 py-1.5 rounded-lg text-sm bg-[#6366f1] text-white">OK</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowAddType(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#22222e] text-[#8888a0] border border-dashed border-[#3e3e5e]">+ Type</button>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Input label="Début" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="flex-1" />
              <Input label="Fin (optionnel)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="flex-1" />
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <Button type="submit" loading={loading} className="w-full">Ajouter</Button>
          </form>
        </div>,
        document.body
      )}

      {/* Edit event sheet */}
      {showEdit && createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={() => setShowEdit(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <form className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 pb-28 flex flex-col gap-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={updateEvent}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">Modifier l'événement</h3>
            <Input label="Titre" placeholder="Soirée raclette" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Type</p>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map((t) => (
                  <div key={t.value} className="relative flex items-center">
                    <button type="button" onClick={() => setEditType(t.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${editType === t.value ? 'text-white' : 'bg-[#22222e] text-[#8888a0]'} ${t.value.startsWith('custom_') ? 'pr-6' : ''}`}
                      style={editType === t.value ? { backgroundColor: t.color } : {}}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: editType === t.value ? 'rgba(255,255,255,0.6)' : t.color }} />
                      {t.label}
                    </button>
                    {t.value.startsWith('custom_') && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeCustomType(t.value) }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-[#3e3e5e] text-[#8888a0] hover:bg-red-500 hover:text-white text-xs leading-none">×</button>
                    )}
                  </div>
                ))}
                {showEditAddType ? (
                  <div className="flex items-center gap-1">
                    <input autoFocus value={newEditTypeName} onChange={e => setNewEditTypeName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomType(newEditTypeName, true) } if (e.key === 'Escape') { setShowEditAddType(false); setNewEditTypeName('') } }}
                      placeholder="Nom du type" className="px-2 py-1.5 rounded-lg text-sm bg-[#22222e] border border-[#6366f1] text-[#f0f0f5] outline-none w-28" />
                    <button type="button" onClick={() => addCustomType(newEditTypeName, true)} className="px-2 py-1.5 rounded-lg text-sm bg-[#6366f1] text-white">OK</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowEditAddType(true)} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#22222e] text-[#8888a0] border border-dashed border-[#3e3e5e]">+ Type</button>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Input label="Début" type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} required className="flex-1" />
              <Input label="Fin (optionnel)" type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="flex-1" />
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <Button type="submit" loading={loading} className="w-full">Enregistrer</Button>
            <button type="button" onClick={deleteEvent} disabled={deleteLoading} className="w-full py-2 text-sm text-red-400 hover:text-red-300 transition-colors disabled:opacity-40">
              {deleteLoading ? 'Suppression...' : 'Supprimer cet événement'}
            </button>
          </form>
        </div>,
        document.body
      )}
    </div>
  )
}
