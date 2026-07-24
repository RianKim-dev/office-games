import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { displayStatus } from './room'
import type { DisplayStatus, Room } from './types'

export interface ProjectRow {
  room: Room
  playerCount: number
  hostName: string | null
  displayStatus: DisplayStatus
}

const STATUS_ORDER: Record<DisplayStatus, number> = {
  todo: 0,
  in_review: 1,
  in_progress: 2,
  done: 3,
}

function sortRows(rows: ProjectRow[]): ProjectRow[] {
  return [...rows].sort((a, b) => {
    const byStatus = STATUS_ORDER[a.displayStatus] - STATUS_ORDER[b.displayStatus]
    if (byStatus !== 0) return byStatus
    return new Date(b.room.last_activity_at).getTime() - new Date(a.room.last_activity_at).getTime()
  })
}

export function useProjectList() {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    const [{ data: rooms }, { data: players }] = await Promise.all([
      supabase.from('rooms').select('*').order('last_activity_at', { ascending: false }).limit(30),
      supabase.from('players').select('room_id, name, is_host'),
    ])
    const counts = new Map<string, number>()
    const hosts = new Map<string, string>()
    for (const p of players ?? []) {
      counts.set(p.room_id, (counts.get(p.room_id) ?? 0) + 1)
      if (p.is_host) hosts.set(p.room_id, p.name)
    }
    const built = (rooms ?? []).map((r) => {
      const room = r as Room
      return {
        room,
        playerCount: counts.get(room.id) ?? 0,
        hostName: hosts.get(room.id) ?? null,
        displayStatus: displayStatus(room),
      }
    })
    setRows(sortRows(built))
    setLoading(false)
  }

  useEffect(() => {
    refresh()

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

    return () => {
      clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [])

  return { rows, loading }
}
