'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'
import { getOrCreateKeyPair, encryptMessage, decryptMessage } from '@/lib/crypto'
import type { Profile } from '@/types'

type ChatTarget = 'group' | Profile

interface RawMessage {
  id: string
  from_profile_id: string
  to_profile_id: string | null
  encrypted_content: string
  created_at: string
}

interface Message extends RawMessage {
  plain: string
  senderName?: string
  senderColor?: string
  senderAvatar?: string | null
}

export default function MessagesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [myProfileId, setMyProfileId] = useState('')
  const [householdId, setHouseholdId] = useState('')
  const [members, setMembers] = useState<Profile[]>([])
  const [allMembers, setAllMembers] = useState<Profile[]>([])
  const [chat, setChat] = useState<ChatTarget | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [theirKeyMissing, setTheirKeyMissing] = useState(false)
  const keyPairRef = useRef<CryptoKeyPair | null>(null)
  const theirKeyRef = useRef<JsonWebKey | null>(null)
  const lastMsgIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const myProfileIdRef = useRef('')
  const householdIdRef = useRef('')
  const chatRef = useRef<ChatTarget | null>(null)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    setMyProfileId(session.profileId)
    myProfileIdRef.current = session.profileId
    setHouseholdId(session.householdId)
    householdIdRef.current = session.householdId
    init(session.profileId, session.householdId)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function init(profileId: string, householdId: string) {
    const { keyPair, publicKeyJwk } = await getOrCreateKeyPair(profileId)
    keyPairRef.current = keyPair
    await fetch('/api/messages/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, publicKeyJwk }),
    })
    const { data } = await supabase.from('household_members')
      .select('profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId)
    const all: Profile[] = (data ?? [])
      .map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile)
      .filter(Boolean)
    setAllMembers(all)
    setMembers(all.filter(p => p.id !== profileId))
    setLoading(false)
  }

  const decryptMsg = useCallback(async (msg: RawMessage, theirKey: JsonWebKey): Promise<string> => {
    if (!keyPairRef.current) return '🔒'
    try { return await decryptMessage(msg.encrypted_content, keyPairRef.current.privateKey, theirKey) }
    catch { return '🔒' }
  }, [])

  function senderInfo(msg: RawMessage) {
    const p = allMembers.find(m => m.id === msg.from_profile_id)
    return { name: p?.display_name ?? '?', color: p?.color ?? '#555', avatar: p?.avatar_url ?? null }
  }

  async function openChat(target: ChatTarget) {
    if (pollRef.current) clearInterval(pollRef.current)
    setChat(target)
    chatRef.current = target
    setMessages([])
    setTheirKeyMissing(false)
    lastMsgIdRef.current = null
    theirKeyRef.current = null

    if (target !== 'group') {
      const res = await fetch(`/api/messages/keys?profileId=${target.id}`)
      const keyRow = await res.json()
      if (!keyRow?.public_key_jwk) { setTheirKeyMissing(true) }
      else theirKeyRef.current = JSON.parse(keyRow.public_key_jwk)
    }

    await loadMessages(target)
    pollRef.current = setInterval(() => pollNew(target), 3000)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function loadMessages(target: ChatTarget) {
    const myId = myProfileIdRef.current
    const hid = householdIdRef.current
    const url = target === 'group'
      ? `/api/messages?householdId=${hid}`
      : `/api/messages?householdId=${hid}&from=${myId}&to=${target.id}`
    const res = await fetch(url)
    const msgs: RawMessage[] = await res.json()
    if (!Array.isArray(msgs)) return

    const decoded = await Promise.all(msgs.map(async m => {
      if (target === 'group') {
        const { name, color, avatar } = senderInfo(m)
        return { ...m, plain: m.encrypted_content, senderName: name, senderColor: color, senderAvatar: avatar }
      }
      const theirKey = theirKeyRef.current
      if (!theirKey) return { ...m, plain: '🔒' }
      const plain = await decryptMsg(m, theirKey)
      return { ...m, plain }
    }))
    setMessages(decoded)
    if (decoded.length > 0) lastMsgIdRef.current = decoded[decoded.length - 1].id
  }

  async function pollNew(target: ChatTarget) {
    const myId = myProfileIdRef.current
    const hid = householdIdRef.current
    const url = target === 'group'
      ? `/api/messages?householdId=${hid}`
      : `/api/messages?householdId=${hid}&from=${myId}&to=${typeof target === 'string' ? '' : target.id}`
    const res = await fetch(url)
    const msgs: RawMessage[] = await res.json()
    if (!Array.isArray(msgs) || msgs.length === 0) return

    const lastId = lastMsgIdRef.current
    const lastIdx = lastId ? msgs.findIndex(m => m.id === lastId) : -1
    const newRaw = lastIdx >= 0 ? msgs.slice(lastIdx + 1) : []
    if (newRaw.length === 0) return

    const decoded = await Promise.all(newRaw.map(async m => {
      if (target === 'group') {
        const { name, color, avatar } = senderInfo(m)
        return { ...m, plain: m.encrypted_content, senderName: name, senderColor: color, senderAvatar: avatar }
      }
      const theirKey = theirKeyRef.current
      if (!theirKey) return { ...m, plain: '🔒' }
      const plain = await decryptMsg(m, theirKey)
      return { ...m, plain }
    }))

    setMessages(prev => [...prev, ...decoded])
    lastMsgIdRef.current = decoded[decoded.length - 1].id
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const isGroup = chat === 'group'
    if (!isGroup && (!keyPairRef.current || !theirKeyRef.current)) return
    setSending(true)
    try {
      let content = text.trim()
      let toProfileId: string | null = null
      if (!isGroup && chat !== 'group') {
        content = await encryptMessage(text.trim(), keyPairRef.current!.privateKey, theirKeyRef.current!)
        toProfileId = (chat as Profile).id
      }
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, fromProfileId: myProfileId, toProfileId, content }),
      })
      if (res.ok) {
        const msg: RawMessage = await res.json()
        const plain = text.trim()
        const { name, color, avatar } = senderInfo({ ...msg, from_profile_id: myProfileId })
        setMessages(prev => [...prev, { ...msg, plain, senderName: name, senderColor: color, senderAvatar: avatar }])
        lastMsgIdRef.current = msg.id
        setText('')
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } catch (err) { console.error(err) }
    setSending(false)
  }

  function back() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setChat(null)
    chatRef.current = null
    setMessages([])
    theirKeyRef.current = null
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Chat view ──
  if (chat !== null) {
    const isGroup = chat === 'group'
    const chatProfile = isGroup ? null : chat as Profile
    const canSend = isGroup || !!theirKeyRef.current

    return (
      <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#252535] flex-shrink-0">
          <button onClick={back} className="text-[#7070a0] hover:text-[#f0f0f8] transition-colors mr-1">←</button>
          {isGroup ? (
            <div className="flex -space-x-2 mr-1">
              {allMembers.slice(0, 3).map(m => (
                <Avatar key={m.id} name={m.display_name} color={m.color} avatarUrl={m.avatar_url} size="sm" className="ring-2 ring-[#13131a]" />
              ))}
            </div>
          ) : (
            <Avatar name={chatProfile!.display_name} color={chatProfile!.color} avatarUrl={chatProfile!.avatar_url} size="sm" />
          )}
          <div>
            <p className="text-sm font-bold text-[#f0f0f8]">{isGroup ? 'Groupe Zion' : chatProfile!.display_name}</p>
            <p className="text-[10px] text-[#7070a0]">{isGroup ? `${allMembers.length} membres` : '🔒 Chiffré bout en bout'}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <p className="text-4xl">{isGroup ? '👥' : '💬'}</p>
              <p className="text-sm text-[#7070a0]">{isGroup ? 'Début du groupe' : 'Début de la conversation'}</p>
              {theirKeyMissing && !isGroup && (
                <p className="text-xs text-yellow-400 mt-1 max-w-[240px]">
                  ⚠️ {chatProfile!.display_name} doit ouvrir Messages une fois pour activer le chiffrement.
                </p>
              )}
            </div>
          )}
          {messages.map((msg, i) => {
            const isMine = msg.from_profile_id === myProfileId
            const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            const showName = isGroup && !isMine && (i === 0 || messages[i - 1].from_profile_id !== msg.from_profile_id)
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                {showName && (
                  <p className="text-[10px] text-[#7070a0] mb-0.5 ml-1">{msg.senderName}</p>
                )}
                <div className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                  {isGroup && !isMine && (i === messages.length - 1 || messages[i + 1].from_profile_id !== msg.from_profile_id) && (
                    <Avatar name={msg.senderName ?? '?'} color={msg.senderColor ?? '#555'} avatarUrl={msg.senderAvatar} size="sm" className="flex-shrink-0 mb-0.5" />
                  )}
                  {isGroup && !isMine && !(i === messages.length - 1 || messages[i + 1].from_profile_id !== msg.from_profile_id) && (
                    <div className="w-8 flex-shrink-0" />
                  )}
                  <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl ${isMine ? 'bg-red-500 text-white rounded-br-md' : 'bg-[#1e1e2e] border border-[#2e2e3e] text-[#f0f0f8] rounded-bl-md'}`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.plain}</p>
                    <p className={`text-[10px] mt-0.5 ${isMine ? 'text-red-200' : 'text-[#555570]'} text-right`}>{time}</p>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-[#252535] flex-shrink-0">
          {theirKeyMissing && !isGroup ? (
            <p className="text-xs text-yellow-400 flex-1 text-center">En attente que {chatProfile!.display_name} active la messagerie…</p>
          ) : (
            <>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={isGroup ? 'Message au groupe…' : 'Message chiffré…'}
                className="flex-1 bg-[#1a1a24] border border-[#2e2e3e] rounded-full px-4 py-2.5 text-sm text-[#f0f0f8] placeholder-[#555570] outline-none focus:border-red-500 transition-colors"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="w-10 h-10 bg-red-500 hover:bg-red-400 disabled:opacity-40 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="translate-x-0.5">
                  <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
                </svg>
              </button>
            </>
          )}
        </form>
      </div>
    )
  }

  // ── Conversations list ──
  return (
    <div className="p-4 flex flex-col gap-3 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Messages</h2>
        <p className="text-xs text-[#7070a0]">🔒 DMs chiffrés</p>
      </div>

      {/* Group */}
      <button
        onClick={() => openChat('group')}
        className="flex items-center gap-3 bg-gradient-to-r from-red-500/10 to-red-400/5 border border-red-500/20 rounded-2xl px-4 py-3.5 text-left hover:border-red-500/40 transition-colors active:scale-[0.98]"
      >
        <div className="flex -space-x-2">
          {allMembers.slice(0, 3).map(m => (
            <Avatar key={m.id} name={m.display_name} color={m.color} avatarUrl={m.avatar_url} size="sm" className="ring-2 ring-[#13131a]" />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#f0f0f8]">Groupe Zion</p>
          <p className="text-xs text-[#7070a0] mt-0.5">Tout le monde · {allMembers.length} membres</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#44445a] flex-shrink-0">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

      {/* DMs */}
      {members.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest px-1 mt-1">Messages privés</p>
          <div className="flex flex-col gap-2">
            {members.map(profile => (
              <button
                key={profile.id}
                onClick={() => openChat(profile)}
                className="flex items-center gap-3 bg-[#13131a] border border-[#252535] rounded-2xl px-4 py-3.5 text-left hover:border-[#3e3e5e] transition-colors active:scale-[0.98]"
              >
                <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f0f0f8]">{profile.display_name}</p>
                  <p className="text-xs text-[#555570] mt-0.5">🔒 Chiffré bout en bout</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#44445a] flex-shrink-0">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
