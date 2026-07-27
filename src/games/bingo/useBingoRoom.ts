import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  DROP_MS,
  clearSavedPlayerId,
  reconcileRoomMembership,
  shuffle,
  touchRoom,
} from '../../lib/room'
import type { BingoCell, Player, Room } from '../../lib/types'
import { createEmptyBoard, hasWon, isBoardCleared, isBoardFilled } from './bingoLogic'
import { randomTopic } from '../../lib/topics'

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
        { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const added = payload.new as Player
          setPlayers((prev) => (prev.some((pl) => pl.id === added.id) ? prev : [...prev, added]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as Player
          setPlayers((prev) =>
            prev.some((pl) => pl.id === updated.id)
              ? prev.map((pl) => (pl.id === updated.id ? updated : pl))
              : [...prev, updated],
          )
        },
      )
      // DELETE는 필터를 걸 수 없다. Postgres가 DELETE 이벤트에 실어주는 old 레코드에는
      // 기본키(id)만 들어있어서 room_id 필터가 절대 매칭되지 않고 이벤트가 통째로 버려진다
      // (그래서 강퇴/퇴장이 상대 화면에 반영되지 않았다).
      // 필터 없이 받은 뒤, 내가 들고 있는 목록에 있는 id일 때만 제거한다.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players' },
        (payload) => {
          const goneId = (payload.old as Partial<Player>).id
          if (!goneId) return
          setPlayers((prev) => prev.filter((pl) => pl.id !== goneId))
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

  // 접속 확인 신호를 주기적으로 보낸다. 이게 있어야 브라우저를 그냥 닫은
  // 유령 참가자를 구분해 내보낼 수 있다.
  useEffect(() => {
    const beat = () => {
      void supabase
        .from('players')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', playerId)
        .then(() => {})
    }
    beat()
    const timer = setInterval(beat, 20_000)
    return () => clearInterval(timer)
  }, [playerId])

  // 오래 응답이 없는 참가자 정리. 접속해 있는 아무 클라이언트나 수행하며,
  // 대상 id로 조작하므로 여러 명이 동시에 실행해도 결과가 같다.
  const sweepingRef = useRef(false)
  useEffect(() => {
    if (!room || players.length === 0) return
    const timer = setInterval(async () => {
      if (sweepingRef.current) return
      const cutoff = Date.now() - DROP_MS
      const gone = players.filter(
        (p) => p.id !== playerId && new Date(p.last_seen_at).getTime() < cutoff,
      )
      if (gone.length === 0) return

      sweepingRef.current = true
      try {
        if (room.status === 'waiting') {
          // 대기실에서는 자리를 돌려준다
          await supabase.from('players').delete().in('id', gone.map((p) => p.id))
          await reconcileRoomMembership(roomId)
        } else {
          // 게임 중에는 탈락 처리만 한다. 보드가 결과화면에 남아야 하고,
          // 탈락자는 턴 순서와 "전원 제출" 판정에서 자동으로 빠진다.
          const stillIn = gone.filter((p) => !p.is_eliminated).map((p) => p.id)
          if (stillIn.length > 0) {
            await supabase.from('players').update({ is_eliminated: true }).in('id', stillIn)
          }
        }
      } finally {
        sweepingRef.current = false
      }
    }, 10_000)
    return () => clearInterval(timer)
  }, [room, players, playerId, roomId])

  // 채우기 단계 시간제한: 마감 지나면 스스로 탈락 처리
  useEffect(() => {
    if (!room || room.status !== 'filling' || !room.fill_deadline || !me) return
    if (me.is_ready || me.is_eliminated) return
    const deadline = new Date(room.fill_deadline).getTime()
    const timer = setInterval(() => {
      if (Date.now() < deadline) return
      clearInterval(timer)
      // supabase 쿼리 빌더는 lazy라 await(=then) 하지 않으면 요청이 전송되지 않는다.
      void supabase
        .from('players')
        .update({ is_eliminated: true })
        .eq('id', playerId)
        .eq('is_ready', false)
        .then(({ error }) => {
          if (error) setError(error.message)
        })
    }, 1000)
    return () => clearInterval(timer)
  }, [room, me, playerId])

  // 전원 준비 완료 시 게임 시작.
  // 모든 클라이언트가 동시에 시도하지만 .eq('status','filling') 가드 때문에 한 번만 성공한다.
  const startingRef = useRef(false)
  useEffect(() => {
    if (!room || room.status !== 'filling') {
      startingRef.current = false
      return
    }
    if (activePlayers.length === 0) return
    if (!activePlayers.every((p) => p.is_ready)) return
    if (startingRef.current) return // 요청 진행 중 중복 발사 방지
    startingRef.current = true

    const order = shuffle(activePlayers.map((p) => p.id))
    void supabase
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
      .then(({ error }) => {
        if (error) {
          startingRef.current = false
          setError(error.message)
        }
      })
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

  // 시간제한 모드: 턴 마감 지나면 미제출자가 있어도 그냥 넘어간다
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.timed || !room.turn_deadline) return
    const deadline = new Date(room.turn_deadline).getTime()
    const timer = setInterval(() => {
      if (Date.now() >= deadline) advanceTurn()
    }, 1000)
    return () => clearInterval(timer)
  }, [room, advanceTurn])

  /** 이번 턴에 아직 제출하지 않은 사람들 (제시자 본인은 제외) */
  const pendingSubmitters = useMemo(() => {
    if (!room || room.status !== 'playing' || !room.current_call) return []
    return activePlayers.filter(
      (p) => p.id !== room.current_call!.playerId && p.submitted_turn !== room.turn_seq,
    )
  }, [room, activePlayers])

  // 전원 제출 완료 시 자동으로 다음 턴. 모든 클라이언트가 시도하지만
  // advanceTurn의 조건부 update(current_turn_index 일치) 덕분에 한 번만 성공한다.
  const advancingRef = useRef(0)
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.current_call) return
    if (pendingSubmitters.length > 0) return
    if (advancingRef.current === room.turn_seq) return // 이 턴은 이미 넘기려고 시도함
    advancingRef.current = room.turn_seq
    void advanceTurn()
  }, [room, pendingSubmitters, advanceTurn])

  // 사람들이 나가서 혼자만 남으면 그 사람 승리로 끝낸다.
  // (안 그러면 혼자 남은 방에서 턴만 계속 돌게 된다)
  const lastStandingRef = useRef(false)
  useEffect(() => {
    if (!room || room.status !== 'playing') return
    if (activePlayers.length !== 1 || players.length === 0) return
    if (lastStandingRef.current) return
    lastStandingRef.current = true
    void supabase
      .from('rooms')
      .update({
        status: 'ended',
        winner_id: activePlayers[0].id,
        current_call: null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', roomId)
      .eq('status', 'playing')
      .then(({ error }) => {
        if (error) lastStandingRef.current = false
      })
  }, [room, activePlayers, players, roomId])

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
      // 제시하는 순간 턴 번호를 올린다. 이 번호와 각자의 submitted_turn을 비교해
      // 이번 턴에 누가 아직 제출을 안 했는지 판단한다.
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
          turn_seq: room.turn_seq + 1,
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', roomId)
        .is('current_call', null)

      await checkAndReportWin(newBoard)
    },
    [room, me, isMyTurn, playerId, roomId, setBoard, checkAndReportWin],
  )

  /**
   * 이번 턴 제출. cellIndex가 null이면 "일치 없음"(칸을 지우지 않고 제출만 기록).
   * 제출은 한 턴에 한 번만 가능하다 — 이게 여러 칸을 연달아 지우던 문제를 막는다.
   */
  const submitTurn = useCallback(
    async (cellIndex: number | null) => {
      if (!room || !me || !room.current_call) return
      if (room.current_call.playerId === playerId) return
      if (me.submitted_turn === room.turn_seq) return // 이미 제출함

      if (cellIndex !== null) {
        const cell = me.board[cellIndex]
        if (!cell || cell.cleared) return
        const newBoard = me.board.map((c) =>
          c.index === cellIndex ? { ...c, cleared: true, matchedFrom: room.current_call!.text } : c,
        )
        await supabase
          .from('players')
          .update({ board: newBoard, submitted_turn: room.turn_seq })
          .eq('id', playerId)
        await checkAndReportWin(newBoard)
      } else {
        await supabase
          .from('players')
          .update({ submitted_turn: room.turn_seq })
          .eq('id', playerId)
      }
    },
    [room, me, playerId, checkAndReportWin],
  )

  /**
   * 대기 중 주제를 바꾼다. 로컬 상태가 아니라 방에 바로 기록해서
   * 참가자들도 시작 전에 어떤 주제인지 실시간으로 볼 수 있게 한다.
   */
  const setTopic = useCallback(
    async (topic: string) => {
      if (!isHost || !room || room.status !== 'waiting' || !topic.trim()) return
      await supabase
        .from('rooms')
        .update({ topic: topic.trim(), last_activity_at: new Date().toISOString() })
        .eq('id', roomId)
        .eq('status', 'waiting')
    },
    [isHost, room, roomId],
  )

  // 대기 상태인데 주제가 비어있으면 방장이 랜덤으로 하나 채워 넣는다
  const seedingTopicRef = useRef(false)
  useEffect(() => {
    if (!isHost || !room || room.status !== 'waiting' || room.topic) return
    if (seedingTopicRef.current) return
    seedingTopicRef.current = true
    void supabase
      .from('rooms')
      .update({ topic: randomTopic() })
      .eq('id', roomId)
      .eq('status', 'waiting')
      .is('topic', null)
      .then(() => {
        seedingTopicRef.current = false
      })
  }, [isHost, room, roomId])

  /** waiting -> filling: 전원 보드를 새로 만들어 게임을 시작한다 (주제는 이미 방에 기록되어 있다) */
  /** 방장을 뺀 참가자 전원이 준비를 눌렀는가 (방장의 준비는 시작 버튼을 누르는 것으로 갈음) */
  const allGuestsReady = useMemo(() => {
    const guests = players.filter((p) => !p.is_host)
    return guests.length > 0 && guests.every((p) => p.is_ready)
  }, [players])

  const startGame = useCallback(
    async () => {
      if (!room || room.status !== 'waiting' || players.length === 0 || !room.topic) return
      if (!allGuestsReady) return
      const now = new Date().toISOString()

      await Promise.all(
        players.map((p) =>
          supabase
            .from('players')
            .update({
              board: createEmptyBoard(room.size),
              is_ready: false,
              is_eliminated: false,
              submitted_turn: null,
            })
            .eq('id', p.id),
        ),
      )

      await supabase
        .from('rooms')
        .update({
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
    [room, players, roomId, allGuestsReady],
  )

  /** ended -> waiting: 방은 그대로 두고 다음 라운드를 위한 로비로 되돌린다 */
  const reopenRoom = useCallback(async () => {
    if (!room || room.status !== 'ended') return

    await Promise.all(
      players.map((p) =>
        supabase
          .from('players')
          .update({ board: [], is_ready: false, is_eliminated: false, submitted_turn: null })
          .eq('id', p.id),
      ),
    )

    await supabase
      .from('rooms')
      .update({
        status: 'waiting',
        topic: null,
        turn_seq: 0,
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

  /** 대기실 준비 토글. is_ready는 startGame에서 어차피 초기화되므로 그대로 재사용한다. */
  const toggleReady = useCallback(async () => {
    if (!me || !room || room.status !== 'waiting') return
    await supabase.from('players').update({ is_ready: !me.is_ready }).eq('id', playerId)
    await touchRoom(roomId)
  }, [me, room, playerId, roomId])

  const transferHost = useCallback(
    async (targetId: string) => {
      if (!isHost || targetId === playerId) return
      await supabase.from('players').update({ is_host: false }).eq('id', playerId)
      await supabase.from('players').update({ is_host: true }).eq('id', targetId)
      await supabase.from('rooms').update({ host_id: targetId }).eq('id', roomId)
    },
    [isHost, playerId, roomId],
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
    pendingSubmitters,
    allGuestsReady,
    toggleReady,
    transferHost,
    setBoard,
    setReady,
    presentCard,
    submitTurn,
    advanceTurn,
    setTopic,
    startGame,
    reopenRoom,
    kickPlayer,
    leaveRoom,
    renameRoom,
  }
}
