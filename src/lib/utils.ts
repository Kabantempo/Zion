import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLevel(points: number): number {
  if (points < 100) return 1
  if (points < 300) return 2
  if (points < 600) return 3
  if (points < 1000) return 4
  if (points < 1500) return 5
  if (points < 2500) return 6
  if (points < 4000) return 7
  if (points < 6000) return 8
  if (points < 9000) return 9
  return 10
}

export function getLevelName(level: number): string {
  const names = ['', 'Rookie', 'Apprenti', 'Régulier', 'Assidu', 'Expert', 'Pro', 'Maître', 'Champion', 'Légende', 'Dieu du ménage']
  return names[level] ?? 'Inconnu'
}

export function getPointsForNextLevel(points: number): { current: number; next: number; level: number } {
  const thresholds = [0, 100, 300, 600, 1000, 1500, 2500, 4000, 6000, 9000, Infinity]
  const level = getLevel(points)
  return {
    current: thresholds[level - 1],
    next: thresholds[level],
    level,
  }
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date))
}

export function formatRelative(date: string | Date): string {
  const now = new Date()
  const d = new Date(date)
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "à l'instant"
  if (diffMins < 60) return `il y a ${diffMins} min`
  if (diffHours < 24) return `il y a ${diffHours}h`
  if (diffDays === 1) return 'hier'
  if (diffDays < 7) return `il y a ${diffDays} jours`
  return formatDate(date)
}

export function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD']

export function getDefaultColor(index: number): string {
  return COLORS[index % COLORS.length]
}
