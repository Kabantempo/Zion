'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'
import { getOrCreateKeyPair, encryptMessage, decryptMessage } from '@/lib/crypto'
import type { Profile } from '@/types'

interface Message {
  id: string
  from_profile_id: string
  encrypted_content: string
  created_at: string
  plain?: string
}

interface Conversation {
  profile: Profile
  lastMessage?: string
  lastAt?: string
  unread?: number
}

export default function MessagesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [myProfileId, setMyProfileId] = useState('')
  const [householdId, setHouseholdId] = useState('')
  const [members, setMembers] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [keyReady, setKeyReady] = useState(false)
  const keyPairRef = useRef<CryptoKeyPair | null>(null)
  const theirKeyRef = useRef<JsonWebKey | null>(null)
  const myKeyRef = useRef<JsonWebKey | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    setMyProfileId(session.profileId)
    setHouseholdId(session.householdId)
    init(session.profileId, session.householdId)
  }, [])

  async function init(profileId: string, householdId: string) {
    // Generate/load keypair and register public key
    const { keyPair, publicKeyJwk } = await getOrCreateKeyPair(profileId)
    keyPairRef.current = keyPair
    myKeyRef.current = publicKeyJwk

    // Register public key in DB (upsert)
    await supabase.from('profile_keys').upsert({ profile_id: profileId, public_key_jwk: JSON.stringify(publicKeyJwk), updated_at: new Date().toISOString() })

    // Load members
    const { data } = await supabase.from('household_members')
      .select('profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId)

    const profiles: Profile[] = (data ?? [])
      .map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile)
      .filter((p: any) => p && p.id !== profileId)

    setMembers(profiles)
    setKeyReady(true)
    setLoading(false)
  }

  async function openChat(profile: Profile) {
    setActiveProfile(profile)
    setMessages([])

    // Load their public key
    const { data: keyRow } = await supabase.from('profile_keys').select('public_key_jwk').eq('profile_id', profile.id).single()
    if (!keyRow) {
      theirKeyRef.current = null
    } else {
      theirKeyRef.current = JSON.parse(keyRow.public_key_jwk)
    }

    // Load messages between the two
    const { data: msgs } = await supabase.from('messages')
      .select('*')
      .or(`and(from_profile_id.eq.${myProfileId},to_profile_id.eq.${profile.id}),and(from_profile_id.eq.${profile.id},to_profile_id.eq.${myProfileId})`)
      .order('created_at', { ascending: true })

    const decrypted = await decryptAll(msgs ?? [])
    setMessages(decrypted)

    // Subscribe to new messages
    if (channelRef.current) await supabase.removeChannel(channelRef.current)
    channelRef.current = supabase.channel(`messages-${myProfileId}-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as Message
        const isMine = msg.from_profile_id === myProfileId
        if (msg.from_profile_id !== profile.id && !isMine) return
        if (msg.to_profile_id !== myProfileId && !isMine) return
        const theirKey = isMine ? myKeyRef.current : theirKeyRef.current
        if (!keyPairRef.current || !theirKey) { setMessages(p => [...p, msg]); return }
        const senderKey = isMine ? theirKey : theirKey
        try {
          const plain = await decryptMessage(msg.encrypted_content, keyPairRef.current.privateKey, isMine ? theirKeyRef.current! : myKeyRef.current!)
          setMessages(p => [...p, { ...msg, plain }])
        } catch {
          setMessages(p => [...p, msg])
        }
      })
      .subscribe()

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function decryptAll(msgs: Message[]): Promise<Message[]> {
    if (!keyPairRef.current) return msgs
    const out: Message[] = []
    for (const msg of msgs) {
      const isMine = msg.from_profile_id === myProfileId
      const theirKey = isMine ? theirKeyRef.current : theirKeyRef.current
      if (!theirKey) { out.push(msg); continue }
      try {
        const plain = await decryptMessage(msg.encrypted_content, keyPairRef.current.privateKey, theirKey)
        out.push({ ...msg, plain })
      } catch {
        out.push({ ...msg, plain: '🔒 (indéchiffrable)' })
      }
    }
    return out
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !activeProfile || !keyPairRef.current || !theirKeyRef.current) return
    setSending(true)
    try {
      const encrypted = await encryptMessage(text.trim(), keyPairRef.current.privateKey, theirKeyRef.current)
      await supabase.from('messages').insert({
        household_id: householdId,
        from_profile_id: myProfileId,
        to_profile_id: activeProfile.id,
        encrypted_content: encrypted,
      })
      setText('')
    } catch (err) {
      console.error('send error', err)
    }
    setSending(false)
  }

  function back() {
    setActiveProfile(null)
    setMessages([])
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  // Chat view
  if (activeProfile) {
    const canSend = !!theirKeyRef.current

    return (
      <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#252535] flex-shrink-0">
          <button onClick={back} className="text-[#7070a0] hover:text-[#f0f0f8] transition-colors text-sm">← Retour</button>
          <Avatar name={activeProfile.display_name} color={activeProfile.color} avatarUrl={activeProfile.avatar_url} size="sm" />
          <div>
            <p className="text-sm font-bold text-[#f0f0f8]">{activeProfile.display_name}</p>
            <p className="text-[10px] text-[#7070a0]">🔒 Chiffré de bout en bout</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <p className="text-4xl">💬</p>
              <p className="text-sm text-[#7070a0]">Début de la conversation</p>
              {!canSend && <p className="text-xs text-yellow-400 mt-2">⚠️ {activeProfile.display_name} n'a pas encore activé la messagerie.</p>}
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.from_profile_id === myProfileId
            const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl ${isMine ? 'bg-red-500 text-white rounded-br-sm' : 'bg-[#1e1e2e] border border-[#2e2e3e] text-[#f0f0f8] rounded-bl-sm'}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.plain ?? '🔒'}</p>
                  <p className={`text-[10px] mt-0.5 ${isMine ? 'text-red-200' : 'text-[#555570]'} text-right`}>{time}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-[#252535] flex-shrink-0 pb-safe">
          {!canSend ? (
            <p className="text-xs text-yellow-400 flex-1">En attente que {activeProfile.display_name} active la messagerie…</p>
          ) : (
            <>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message chiffré…"
                className="flex-1 bg-[#1a1a24] border border-[#2e2e3e] rounded-full px-4 py-2.5 text-sm text-[#f0f0f8] placeholder-[#555570] outline-none focus:border-red-500"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="w-10 h-10 bg-red-500 hover:bg-red-400 disabled:opacity-40 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white translate-x-0.5">
                  <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
                </svg>
              </button>
            </>
          )}
        </form>
      </div>
    )
  }

  // Conversations list
  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Messages</h2>
        <p className="text-xs text-[#7070a0]">🔒 Chiffré E2E</p>
      </div>

      {members.length === 0 && (
        <p className="text-sm text-[#555570] text-center py-8">Aucun autre membre dans le foyer.</p>
      )}

      <div className="flex flex-col gap-2">
        {members.map((profile) => (
          <button
            key={profile.id}
            onClick={() => openChat(profile)}
            className="flex items-center gap-3 bg-[#13131a] border border-[#252535] rounded-2xl px-4 py-3 text-left hover:border-[#3e3e5e] transition-colors"
          >
            <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f0f0f8]">{profile.display_name}</p>
              <p className="text-xs text-[#555570]">Appuie pour écrire</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#44445a]">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
