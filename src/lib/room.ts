import { customAlphabet } from 'nanoid'
import { supabase } from './supabase'
import { randomProjectName } from './projectNames'
import type { DisplayStatus, Room } from './types'

const ROOM_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const generateRoomCode = customAlphabet(ROOM_CODE_ALPHABET, 8)
const generateId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16)

export function newRoomCode() {
  return generateRoomCode()
}

export function newId() {
  return generateId()
}

const DISPLAY_NAME_KEY = 'og_display_name'
const PLAYER_ID_KEY = (roomId: string) => `og_player_${roomId}`

export function getSavedDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) ?? ''
}

export function saveDisplayName(name: string) {
  localStorage.setItem(DISPLAY_NAME_KEY, name)
}

export function getSavedPlayerId(roomId: string): string | null {
  return localStorage.getItem(PLAYER_ID_KEY(roomId))
}

export function savePlayerId(roomId: string, playerId: string) {
  localStorage.setItem(PLAYER_ID_KEY(roomId), playerId)
}

export function clearSavedPlayerId(roomId: string) {
  localStorage.removeItem(PLAYER_ID_KEY(roomId))
}

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const IN_REVIEW_MS = 30 * 60 * 1000

/** ended 상태를 last_activity_at 경과 시간으로 In Review/Done 두 단계로 나눠 표시한다 */
export function displayStatus(room: Room): DisplayStatus {
  if (room.status === 'waiting') return 'todo'
  if (room.status === 'filling' || room.status === 'playing') return 'in_progress'
  const elapsed = Date.now() - new Date(room.last_activity_at).getTime()
  return elapsed < IN_REVIEW_MS ? 'in_review' : 'done'
}

/** 이 시간 넘게 소식이 없으면 접속이 끊긴 것으로 본다 (배지 표시용) */
export const OFFLINE_MS = 60 * 1000
/** 이 시간 넘으면 자동으로 내보낸다 */
export const DROP_MS = 90 * 1000

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false
  return Date.now() - new Date(lastSeenAt).getTime() < OFFLINE_MS
}

const ENDED_TTL_MS = 30 * 60 * 1000
const ABANDONED_TTL_MS = 10 * 60 * 1000

/**
 * pg_cron이 5분마다 정리하지만, 랜딩을 여는 시점에도 보조로 한 번 스윕한다.
 * cron 주기 사이의 공백을 메우기 위한 클라이언트 측 보조 장치.
 */
export async function sweepExpiredRooms() {
  const now = Date.now()
  const endedCutoff = new Date(now - ENDED_TTL_MS).toISOString()
  const abandonedCutoff = new Date(now - ABANDONED_TTL_MS).toISOString()

  // 종료되고 한참 지난 방
  await supabase.from('rooms').delete().eq('status', 'ended').lt('last_activity_at', endedCutoff)

  // 접속자가 아무도 없이 방치된 방. 목록에 "In Progress"로 남아 클릭하면 에러가 나던 것들.
  const { data: stale } = await supabase
    .from('rooms')
    .select('id, players(last_seen_at)')
    .lt('last_activity_at', abandonedCutoff)
  const dropCutoff = now - DROP_MS
  const dead = (stale ?? [])
    .filter((r) => {
      const members = (r as { players?: { last_seen_at: string }[] }).players ?? []
      return members.every((p) => new Date(p.last_seen_at).getTime() < dropCutoff)
    })
    .map((r) => r.id)
  if (dead.length > 0) {
    await supabase.from('rooms').delete().in('id', dead)
  }
}

export async function touchRoom(roomId: string) {
  await supabase
    .from('rooms')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', roomId)
}

/**
 * 인원이 빠진 뒤 방 상태를 정리한다 (강퇴/퇴장 직후 호출).
 * - 아무도 안 남았으면 방 삭제
 * - 방장이 나가서 방장이 없어졌으면 가장 먼저 들어온 사람에게 위임
 *   (위임을 안 하면 남은 사람들이 게임 시작/강퇴/이름변경을 아무도 못 해 방이 고아가 된다)
 */
export async function reconcileRoomMembership(roomId: string) {
  const { data: remaining, error } = await supabase
    .from('players')
    .select('id, is_host')
    .eq('room_id', roomId)
    .order('joined_at')
  if (error) return

  if (!remaining || remaining.length === 0) {
    await supabase.from('rooms').delete().eq('id', roomId)
    return
  }

  if (remaining.some((p) => p.is_host)) return

  const heir = remaining[0]
  await supabase.from('players').update({ is_host: true }).eq('id', heir.id)
  await supabase.from('rooms').update({ host_id: heir.id }).eq('id', roomId)
}

export interface CreateRoomInput {
  size: 4 | 5
  winCondition: 1 | 2 | 3
  timed: boolean
  maxPlayers: number
  hostName: string
}

export async function createBingoRoom(input: CreateRoomInput) {
  const roomId = newRoomCode()
  const playerId = newId()
  const now = new Date().toISOString()

  const { data: roomNumber, error: rpcError } = await supabase.rpc('next_room_number', {
    p_game_type: 'bingo',
  })
  if (rpcError) throw rpcError

  const { error: roomError } = await supabase.from('rooms').insert({
    id: roomId,
    game_type: 'bingo',
    room_number: roomNumber,
    display_name: randomProjectName(),
    topic: null,
    size: input.size,
    win_condition: input.winCondition,
    timed: input.timed,
    max_players: input.maxPlayers,
    round_number: 1,
    status: 'waiting',
    host_id: playerId,
    turn_order: null,
    current_turn_index: null,
    current_call: null,
    turn_deadline: null,
    fill_deadline: null,
    winner_id: null,
    created_at: now,
    last_activity_at: now,
  })
  if (roomError) throw roomError

  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    room_id: roomId,
    name: input.hostName,
    is_ready: false,
    is_eliminated: false,
    is_host: true,
    joined_at: now,
  })
  if (playerError) throw playerError

  saveDisplayName(input.hostName)
  savePlayerId(roomId, playerId)
  return { roomId, playerId }
}

export async function joinBingoRoom(roomId: string, name: string) {
  const existing = getSavedPlayerId(roomId)
  if (existing) {
    const { data } = await supabase.from('players').select('id').eq('id', existing).maybeSingle()
    if (data) return { roomId, playerId: existing }
  }

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('status, max_players')
    .eq('id', roomId)
    .maybeSingle()
  if (roomError) throw roomError
  if (!room) throw new Error('프로젝트를 찾을 수 없어요.')
  if (room.status !== 'waiting') {
    throw new Error('이미 시작됐거나 종료된 프로젝트예요.')
  }

  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if ((count ?? 0) >= room.max_players) {
    throw new Error('정원이 찼어요.')
  }

  const playerId = newId()
  const { error: playerError } = await supabase.from('players').insert({
    id: playerId,
    room_id: roomId,
    name,
    is_ready: false,
    is_eliminated: false,
    is_host: false,
    joined_at: new Date().toISOString(),
  })
  if (playerError) throw playerError

  saveDisplayName(name)
  savePlayerId(roomId, playerId)
  return { roomId, playerId }
}
