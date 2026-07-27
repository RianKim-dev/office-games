import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { clearSavedPlayerId, reconcileRoomMembership, shuffle, touchRoom } from '../../lib/room'
import type { BingoCell, Player, Room } from '../../lib/types'
import { createEmptyBoard, hasWon, isBoardCleared, isBoardFilled } from './bingoLogic'

const TURN_SECONDS = 30
const FILL_SECONDS = 2 * 60

export function useBingoRoom(roomId: string, playerId: string) {
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 초기 로드
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: r, error: rErr }, { data: p, error: pErr }] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase.from('players').select('*').eq('room_id', roomId).order('joined_at'),
      ])
      if (cancelled) return
      if (rErr || pErr) {
        setError(rErr?.message ?? pErr?.message ?? '알 수 없는 오류')
      } else {
        setRoom(r as Room)
        setPlayers((p ?? []) as Player[])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [roomId])

  // 실시간 구독
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return
          setRoom(payload.new as Room)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setPlayers((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((pl) => pl.id !== (payload.old as Player).id)
            }
            const updated = payload.new as Player
            const exists = prev.some((pl) => pl.id === updated.id)
            return exists
              ? prev.map((pl) => (pl.id === updated.id ? updated : pl))
              : [...prev, updated]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  const me = useMemo(() => players.find((p) => p.id === playerId) ?? null, [players, playerId])
  const activePlayers = useMemo(() => players.filter((p) => !p.is_eliminated), [players])
  const isHost = me?.is_host ?? false

  // 채우기 단계 시간제한: 마감 지나면 스스로 탈락 처리
  useEffect(() => {
    if (!room || room.status !== 'filling' || !room.fill_deadline || !me) return
    if (me.is_ready || me.is_eliminated) return
    const deadline = new Date(room.fill_deadline).getTime()
    const timer = setInterval(() => {
      if (Date.now() >= deadline) {
        supabase.from('players').update({ is_eliminated: true }).eq('id', playerId).eq('is_ready', false)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [room, me, playerId])

  // 전원 준비 완료 시 게임 시작 (한 번만 성공하도록 status 가드)
  useEffect(() => {
    if (!room || room.status !== 'filling') return
    if (activePlayers.length === 0) return
    const allReady = activePlayers.every((p) => p.is_ready)
    if (!allReady) return

    const order = shuffle(activePlayers.map((p) => p.id))
    supabase
      .from('rooms')
      .update({
        status: 'playing',
        turn_order: order,
        current_turn_index: 0,
        current_call: null,
        turn_deadline: room.timed ? new Date(Date.now() + TURN_SECONDS * 1000).toISOString() : null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('status', 'filling')
  }, [room, activePlayers, roomId])

  const findNextTurnIndex = useCallback(
    (fromIndex: number, order: string[]) => {
      for (let step = 1; step <= order.length; step++) {
        const idx = (fromIndex + step) % order.length
        const candidate = players.find((p) => p.id === order[idx])
        if (candidate && !candidate.is_eliminated && !isBoardCleared(candidate.board)) {
          return idx
        }
      }
      return -1
    },
    [players],
  )

  const advanceTurn = useCallback(async () => {
    if (!room || room.status !== 'playing' || !room.turn_order) return
    const nextIndex = findNextTurnIndex(room.current_turn_index ?? 0, room.turn_order)

    if (nextIndex === -1) {
      await supabase
        .from('rooms')
        .update({ status: 'ended', winner_id: null, current_call: null })
        .eq('id', roomId)
        .eq('status', 'playing')
      return
    }

    await supabase
      .from('rooms')
      .update({
        current_turn_index: nextIndex,
        current_call: null,
        turn_deadline: room.timed ? new Date(Date.now() + TURN_SECONDS * 1000).toISOString() : null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('status', 'playing')
      .eq('current_turn_index', room.current_turn_index)
  }, [room, roomId, findNextTurnIndex])

  // 시간제한 모드: 턴 마감 지나면 자동으로 다음 턴
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.timed || !room.turn_deadline) return
    const deadline = new Date(room.turn_deadline).getTime()
    const timer = setInterval(() => {
      if (Date.now() >= deadline) advanceTurn()
    }, 1000)
    return () => clearInterval(timer)
  }, [room, advanceTurn])

  const isMyTurn = useMemo(() => {
    if (!room || room.status !== 'playing' || !room.turn_order || room.current_turn_index === null)
      return false
    return room.turn_order[room.current_turn_index] === playerId
  }, [room, playerId])

  const setBoard = useCallback(
    async (board: BingoCell[]) => {
      await supabase.from('players').update({ board }).eq('id', playerId)
    },
    [playerId],
  )

  const setReady = useCallback(
    // board를 넘기면 그걸로 검증한다. 방금 저장한 보드의 realtime 에코가 아직
    // 도착하지 않았을 때 me.board가 옛날 값이라 준비가 조용히 무시되는 걸 막는다.
    async (ready: boolean, board?: BingoCell[]) => {
      if (!me) return
      if (ready && !isBoardFilled(board ?? me.board)) return
      await supabase.from('players').update({ is_ready: ready }).eq('id', playerId)
      await touchRoom(roomId)
    },
    [me, playerId, roomId],
  )

  const checkAndReportWin = useCallback(
    async (board: BingoCell[]) => {
      if (!room) return
      if (hasWon(board, room.size, room.win_condition)) {
        await supabase
          .from('rooms')
          .update({ status: 'ended', winner_id: playerId, current_call: null })
          .eq('id', roomId)
          .eq('status', 'playing')
      }
    },
    [room, roomId, playerId],
  )

  const presentCard = useCallback(
    async (cellIndex: number) => {
      if (!room || !me || !isMyTurn || room.current_call) return
      const cell = me.board[cellIndex]
      if (!cell || cell.cleared) return

      const newBoard = me.board.map((c) => (c.index === cellIndex ? { ...c, cleared: true } : c))
      await setBoard(newBoard)
      await supabase
        .from('rooms')
        .update({
          current_call: {
            playerId,
            playerName: me.name,
            cellIndex,
            text: cell.text,
            presentedAt: new Date().toISOString(),
          },
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', roomId)
        .is('current_call', null)

      await checkAndReportWin(newBoard)
    },
    [room, me, isMyTurn, playerId, roomId, setBoard, checkAndReportWin],
  )

  const matchCard = useCallback(
    async (cellIndex: number) => {
      if (!room || !me || !room.current_call) return
      if (room.current_call.playerId === playerId) return
      const cell = me.board[cellIndex]
      if (!cell || cell.cleared) return

      const newBoard = me.board.map((c) =>
        c.index === cellIndex ? { ...c, cleared: true, matchedFrom: room.current_call!.text } : c,
      )
      await setBoard(newBoard)
      await checkAndReportWin(newBoard)
    },
    [room, me, playerId, setBoard, checkAndReportWin],
  )

  /** waiting -> filling: 주제를 정하고 전원 보드를 새로 만들어 게임을 시작한다 (최초 시작/재시작 공통) */
  const startGame = useCallback(
    async (topic: string) => {
      if (!room || room.status !== 'waiting' || players.length === 0) return
      const now = new Date().toISOString()

      await Promise.all(
        players.map((p) =>
          supabase
            .from('players')
            .update({ board: createEmptyBoard(room.size), is_ready: false, is_eliminated: false })
            .eq('id', p.id),
        ),
      )

      await supabase
        .from('rooms')
        .update({
          topic,
          status: 'filling',
          turn_order: null,
          current_turn_index: null,
          current_call: null,
          turn_deadline: null,
          fill_deadline: room.timed ? new Date(Date.now() + FILL_SECONDS * 1000).toISOString() : null,
          winner_id: null,
          last_activity_at: now,
        })
        .eq('id', roomId)
        .eq('status', 'waiting')
    },
    [room, players, roomId],
  )

  /** ended -> waiting: 방은 그대로 두고 다음 라운드를 위한 로비로 되돌린다 */
  const reopenRoom = useCallback(async () => {
    if (!room || room.status !== 'ended') return

    await Promise.all(
      players.map((p) =>
        supabase
          .from('players')
          .update({ board: [], is_ready: false, is_eliminated: false })
          .eq('id', p.id),
      ),
    )

    await supabase
      .from('rooms')
      .update({
        status: 'waiting',
        topic: null,
        turn_order: null,
        current_turn_index: null,
        current_call: null,
        turn_deadline: null,
        fill_deadline: null,
        winner_id: null,
        round_number: room.round_number + 1,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('status', 'ended')
  }, [room, players, roomId])

  const kickPlayer = useCallback(
    async (targetId: string) => {
      if (!isHost || targetId === playerId) return
      await supabase.from('players').delete().eq('id', targetId)
      await reconcileRoomMembership(roomId)
    },
    [isHost, playerId, roomId],
  )

  const leaveRoom = useCallback(async () => {
    await supabase.from('players').delete().eq('id', playerId)
    await reconcileRoomMembership(roomId)
    clearSavedPlayerId(roomId)
  }, [playerId, roomId])

  const renameRoom = useCallback(
    async (name: string) => {
      if (!isHost || !name.trim()) return
      await supabase.from('rooms').update({ display_name: name.trim() }).eq('id', roomId)
    },
    [isHost, roomId],
  )

  return {
    room,
    players,
    me,
    activePlayers,
    isHost,
    isMyTurn,
    loading,
    error,
    setBoard,
    setReady,
    presentCard,
    matchCard,
    advanceTurn,
    startGame,
    reopenRoom,
    kickPlayer,
    leaveRoom,
    renameRoom,
  }
}
