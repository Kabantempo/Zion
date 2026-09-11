"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface LeaderboardRankingItem {
  userId: string
  rank: number
  userName: string
  byline?: string
  value: number
  color?: string
  avatarUrl?: string | null
  displayed?: boolean
}

interface LeaderboardRankingsProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRankingItem[]
  currentUserId?: string
  showPagination?: boolean
  defaultPageSize?: number
}

const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

const LeaderboardRankings = React.forwardRef<HTMLDivElement, LeaderboardRankingsProps>(
  ({ rankings, currentUserId, showPagination, defaultPageSize = 10, className, ...props }, ref) => {
    const [page, setPage] = React.useState(0)
    const pageSize = defaultPageSize
    const totalPages = Math.ceil(rankings.length / pageSize)
    const visible = rankings.slice(page * pageSize, (page + 1) * pageSize)

    return (
      <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props}>
        {visible.map((item) => {
          const isMe = item.userId === currentUserId
          const initials = item.userName.slice(0, 2).toUpperCase()
          return (
            <div
              key={item.userId}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
                isMe ? 'bg-red-500/10 border border-red-500/20' : 'bg-[#13131a] border border-[#252535]'
              )}
            >
              <span className="w-7 text-center text-sm font-bold text-[#7070a0] flex-shrink-0">
                {medals[item.rank] ?? `${item.rank}`}
              </span>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: item.color ?? '#555' }}
              >
                {item.avatarUrl
                  ? <img src={item.avatarUrl} alt={item.userName} className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-semibold truncate', isMe ? 'text-red-300' : 'text-[#f0f0f8]')}>
                  {item.userName} {isMe && <span className="text-xs font-normal text-[#7070a0]">(moi)</span>}
                </p>
                {item.byline && <p className="text-xs text-[#7070a0] truncate">{item.byline}</p>}
              </div>
              <span className={cn('text-sm font-black flex-shrink-0', isMe ? 'text-red-400' : 'text-[#f0f0f8]')}>
                {item.value.toLocaleString()}<span className="text-[#7070a0] font-normal text-xs"> pts</span>
              </span>
            </div>
          )
        })}

        {showPagination && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium text-[#7070a0] hover:text-[#f0f0f8] disabled:opacity-30 transition-colors"
            >
              ← Préc
            </button>
            <span className="text-xs text-[#7070a0]">{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium text-[#7070a0] hover:text-[#f0f0f8] disabled:opacity-30 transition-colors"
            >
              Suiv →
            </button>
          </div>
        )}
      </div>
    )
  }
)
LeaderboardRankings.displayName = "LeaderboardRankings"

export { LeaderboardRankings }
