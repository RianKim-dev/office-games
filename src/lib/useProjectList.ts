import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { displayStatus, getSavedPlayerId, isOnline, sweepExpiredRooms } from './room'
import type { DisplayStatus, Room } from './types'

/** 목록에 보이는 상태. 'stale'은 아무도 접속해 있지 않은 진행중 방 */
export type RowStatus = DisplayStatus | 'stale'

export interface ProjectRow {
  room: Room
  playerCount: number
  onlineCount: number
  hostName: string | null
  status: RowStatus
  canJoin: boolean
  /** 이미 이 방의 참가자다 — 상태와 무관하게 다시 들어갈 수 있어야 한다 */
  isMember: boolean
  /** 못 들어가는 이유 (canJoin이 false일 때) */
  blockedReason: string | null
}

const STATUS_ORDER: Record<RowStatus, number> = {
  todo: 0,
  in_review: 1,
  in_progress: 2,
  done: 3,
  stale: 4,
}

export function useProjectList() {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function refresh() {
      try {
        const [roomsRes, playersRes] = await Promise.all([
          supabase.from('rooms').select('*').order('last_activity_at', { ascending: false }).limit(30),
          supabase.from('players').select('id, room_id, name, is_host, last_seen_at'),
        ])
        if (cancelled) return

        const failure = roomsRes.error ?? playersRes.error
        if (failure) {
          setError(failure.message)
          return
        }

        const counts = new Map<string, number>()
        const online = new Map<string, number>()
        const hosts = new Map<string, string>()
        const memberOf = new Set<string>()
        for (const p of playersRes.data ?? []) {
          counts.set(p.room_id, (counts.get(p.room_id) ?? 0) + 1)
          if (isOnline(p.last_seen_at)) online.set(p.room_id, (online.get(p.room_id) ?? 0) + 1)
          if (p.is_host) hosts.set(p.room_id, p.name)
          // 저장된 참가 정보가 실제 행과 맞아야 참가자로 인정 (자동 퇴장된 뒤의 잔여 값 배제)
          if (getSavedPlayerId(p.room_id) === p.id) memberOf.add(p.room_id)
        }

        const built = (roomsRes.data ?? []).map((r) => {
          const room = r as Room
          const playerCount = counts.get(room.id) ?? 0
          const onlineCount = online.get(room.id) ?? 0
          const base = displayStatus(room)

          // 진행중인데 아무도 접속해 있지 않으면 사실상 죽은 방이다.
          // 예전에는 이런 방이 In Progress로 남아, 눌러보면 에러가 났다.
          const isStale = (base === 'in_progress' || base === 'todo') && onlineCount === 0
          const status: RowStatus = isStale ? 'stale' : base

          const isMember = memberOf.has(room.id)

          let canJoin = false
          let blockedReason: string | null = null
          if (isMember) {
            // 이미 참가 중이면 진행 상태와 무관하게 돌아갈 수 있어야 한다.
            // (브레드크럼이나 뒤로가기로 목록에 나온 경우 여기로 복귀한다)
            canJoin = true
          } else if (isStale) blockedReason = '중단됨'
          else if (base === 'in_progress') blockedReason = '진행 중'
          else if (base === 'in_review' || base === 'done') blockedReason = '종료됨'
          else if (playerCount >= room.max_players) blockedReason = '정원 참'
          else canJoin = true

          return {
            room,
            playerCount,
            onlineCount,
            hostName: hosts.get(room.id) ?? null,
            status,
            canJoin,
            isMember,
            blockedReason,
          }
        })

        built.sort((a, b) => {
          const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          if (byStatus !== 0) return byStatus
          return (
            new Date(b.room.last_activity_at).getTime() - new Date(a.room.last_activity_at).getTime()
          )
        })

        setError(null)
        setRows(built)
      } catch (e) {
        // 네트워크 자체가 실패하면(잘못된 URL, 오프라인 등) supabase-js가 throw한다.
        // 여기서 잡지 않으면 loading이 영원히 true로 남아 화면이 "불러오는 중…"에 멈춘다.
        if (!cancelled) setError(e instanceof Error ? e.message : '네트워크 오류')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    // 목록을 여는 순간이 죽은 방을 걷어낼 가장 좋은 시점이다.
    // (cron은 5분 주기라 그 사이에 만들어진 시체가 목록에 남는다)
    void sweepExpiredRooms()
      .then(refresh)
      .catch(() => refresh())

    let debounceTimer: ReturnType<typeof setTimeout>
    const scheduleRefresh = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(refresh, 300)
    }

    const channel = supabase
      .channel('project-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, scheduleRefresh)
      .subscribe()

    // 접속 여부는 시간이 지나면 바뀌므로 주기적으로도 다시 계산한다
    const poll = setInterval(refresh, 30_000)

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [])

  return { rows, loading, error }
}
