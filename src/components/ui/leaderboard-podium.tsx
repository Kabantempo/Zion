"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface LeaderboardRanking {
  userId: string
  userName: string
  rank: 1 | 2 | 3
  value: number
  color?: string
  avatarUrl?: string | null
}

interface PodiumSlotProps {
  ranking: LeaderboardRanking
  isCenter?: boolean
}

function PodiumSlot({ ranking, isCenter }: PodiumSlotProps) {
  const initials = ranking.userName.slice(0, 2).toUpperCase()
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const heights = { 1: 'h-16', 2: 'h-10', 3: 'h-8' }
  const avatarSizes = { 1: 'w-16 h-16 text-xl', 2: 'w-13 h-13 text-lg', 3: 'w-12 h-12 text-base' }

  return (
    <div className={cn('flex flex-col items-center gap-1.5', isCenter ? 'order-2 z-10' : ranking.rank === 2 ? 'order-1' : 'order-3')}>
      <span className="text-lg">{medals[ranking.rank]}</span>
      <div
        className={cn('rounded-full flex items-center justify-center font-black text-white shadow-lg flex-shrink-0', avatarSizes[ranking.rank])}
        style={{ backgroundColor: ranking.color ?? '#555', boxShadow: ranking.rank === 1 ? `0 8px 24px ${ranking.color ?? '#ef4444'}50` : undefined }}
      >
        {ranking.avatarUrl
          ? <img src={ranking.avatarUrl} alt={ranking.userName} className="w-full h-full object-cover rounded-full" />
          : initials
        }
      </div>
      <div className="text-center">
        <p className={cn('font-bold text-[#f0f0f8] leading-tight', isCenter ? 'text-sm' : 'text-xs')}>{ranking.userName.split(' ')[0]}</p>
        <p className={cn('font-black text-red-400', isCenter ? 'text-base' : 'text-sm')}>{ranking.value.toLocaleString()}<span className="text-[#7070a0] font-normal text-xs"> pts</span></p>
      </div>
      <div className={cn('w-full rounded-t-xl bg-gradient-to-t from-[#1c1c26] to-[#252535] border border-[#252535] border-b-0', heights[ranking.rank])} />
    </div>
  )
}

interface LeaderboardPodiumProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRanking[]
}

const LeaderboardPodium = React.forwardRef<HTMLDivElement, LeaderboardPodiumProps>(
  ({ rankings, className, ...props }, ref) => {
    const first = rankings.find((r) => r.rank === 1)
    const second = rankings.find((r) => r.rank === 2)
    const third = rankings.find((r) => r.rank === 3)

    return (
      <div ref={ref} className={cn('flex items-end justify-center gap-3 px-2', className)} {...props}>
        {second && <PodiumSlot ranking={second} />}
        {first && <PodiumSlot ranking={first} isCenter />}
        {third && <PodiumSlot ranking={third} />}
      </div>
    )
  }
)
LeaderboardPodium.displayName = "LeaderboardPodium"

export { LeaderboardPodium }
