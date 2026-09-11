export type UserRole = 'member' | 'admin'
export type TaskFrequency = 'daily' | 'weekly' | 'monthly' | 'as_needed'
export type TicketStatus = 'todo' | 'in_progress' | 'done'
export type EventType = 'party' | 'absence' | 'shopping' | 'other'

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  color: string
  created_at: string
}

export interface Household {
  id: string
  name: string
  invite_code: string
  created_by: string
  created_at: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  role: UserRole
  joined_at: string
  profile?: Profile
}

export interface TaskType {
  id: string
  household_id: string
  label: string
  category: string
  points: number
  frequency: TaskFrequency
}

export interface TaskLog {
  id: string
  household_id: string
  task_type_id: string
  done_by: string
  done_at: string
  points_awarded: number
  task_type?: TaskType
  profile?: Profile
}

export interface Ticket {
  id: string
  household_id: string
  title: string
  task_type_id: string | null
  assigned_to: string | null
  status: TicketStatus
  due_date: string | null
  note: string | null
  created_by: string
  completed_by: string | null
  completed_at: string | null
  assignee?: Profile
  creator?: Profile
}

export interface CalendarEvent {
  id: string
  household_id: string
  title: string
  type: EventType
  start: string
  end: string
  created_by: string
  color: string
  creator?: Profile
}

export interface Achievement {
  id: string
  key: string
  label: string
  description: string
  icon: string
  condition: Record<string, unknown>
}

export interface UserAchievement {
  user_id: string
  achievement_id: string
  unlocked_at: string | null
  progress: number
  achievement?: Achievement
}

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  color: string
  avatar_url: string | null
  points: number
  level: number
  streak: number
}
