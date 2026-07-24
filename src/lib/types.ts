export type RoomStatus = 'waiting' | 'filling' | 'playing' | 'ended'
export type DisplayStatus = 'todo' | 'in_review' | 'in_progress' | 'done'

export interface BingoCell {
  index: number
  text: string
  cleared: boolean
  matchedFrom?: string
  tag: string
  tagColor: string
  ticketCode: string
  avatarInitial: string
  avatarColor: string
  priority: 'up' | 'down' | null
  dateLabel: string | null
}

export interface CurrentCall {
  playerId: string
  playerName: string
  cellIndex: number
  text: string
  presentedAt: string
}

export interface Room {
  id: string
  game_type: string
  room_number: number
  display_name: string
  topic: string | null
  size: 4 | 5
  win_condition: 1 | 2 | 3
  timed: boolean
  max_players: number
  round_number: number
  status: RoomStatus
  host_id: string
  turn_order: string[] | null
  current_turn_index: number | null
  current_call: CurrentCall | null
  turn_deadline: string | null
  fill_deadline: string | null
  winner_id: string | null
  created_at: string
  last_activity_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  board: BingoCell[]
  is_ready: boolean
  is_eliminated: boolean
  is_host: boolean
  joined_at: string
}
