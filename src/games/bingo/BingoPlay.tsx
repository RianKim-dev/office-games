import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../../components/ConfirmDialog'
import type { Player, Room } from '../../lib/types'
import { completedLineCells, countCompletedLines } from './bingoLogic'
import { CardFooter, CardTop } from './CardParts'
import ColumnHeaders from './ColumnHeaders'
import AppShell from '../../components/AppShell'
import { DetailRow, DetailsPanel } from '../../components/DetailsPanel'
import PlayerRoster from './PlayerRoster'
import { roomKey } from '../../lib/gameTypes'

interface Props {
  room: Room
  me: Player
  players: Player[]
  isHost: boolean
  isMyTurn: boolean
  pendingSubmitters: Player[]
  presentCard: (index: number) => Promise<void>
  submitTurn: (index: number | null) => Promise<void>
  advanceTurn: () => Promise<void>
  leaveRoom: () => Promise<void>
}

const BINGO_WORD = ['', '원', '투', '쓰리', '포', '파이브']

function bingoLabel(n: number) {
  return `${BINGO_WORD[n] ?? n}빙고`
}

export default function BingoPlay({
  room,
  me,
  players,
  isHost,
  isMyTurn,
  pendingSubmitters,
  presentCard,
  submitTurn,
  advanceTurn,
  leaveRoom,
}: Props) {
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const currentPlayerId =
    room.turn_order && room.current_turn_index !== null
      ? room.turn_order[room.current_turn_index]
      : null
  const currentPlayer = players.find((p) => p.id === currentPlayerId)

  const call = room.current_call
  const iPresented = !!call && call.playerId === me.id
  const iSubmitted = me.submitted_turn === room.turn_seq
  const canPresent = isMyTurn && !call
  const canSubmit = !!call && !iPresented && !iSubmitted

  const [selected, setSelected] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // 턴이 바뀌면 선택 초기화
  useEffect(() => {
    setSelected(null)
  }, [room.turn_seq, call?.playerId])

  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!room.timed || !room.turn_deadline) {
      setRemaining(null)
      return
    }
    const deadline = new Date(room.turn_deadline).getTime()
    const tick = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [room.turn_deadline, room.timed])

  // 내 보드에서 완성된 줄에 속한 칸들 (강조용)
  const myLineCells = useMemo(
    () => completedLineCells(me.board, room.size),
    [me.board, room.size],
  )

  // 빙고 달성 감지 — 모든 플레이어의 board가 공개되어 있어 각자 계산할 수 있다
  const [celebration, setCelebration] = useState<{ playerId: string; name: string; lines: number } | null>(
    null,
  )
  const prevLines = useRef<Map<string, number>>(new Map())
  useEffect(() => {
    let latest: { playerId: string; name: string; lines: number } | null = null
    for (const p of players) {
      const lines = p.board.length ? countCompletedLines(p.board, room.size) : 0
      const before = prevLines.current.get(p.id)
      if (before !== undefined && lines > before) {
        latest = { playerId: p.id, name: p.name, lines }
      }
      prevLines.current.set(p.id, lines)
    }
    if (!latest) return
    setCelebration(latest)
    const t = setTimeout(() => setCelebration(null), 2600)
    return () => clearTimeout(t)
  }, [players, room.size])

  function handleCardClick(index: number) {
    const cell = me.board[index]
    if (!cell || cell.cleared) return
    if (!canPresent && !canSubmit) return
    setSelected((prev) => (prev === index ? null : index))
  }

  async function run(fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const waitingNames = pendingSubmitters.map((p) => p.name).join(', ')

  return (
    <AppShell
      title="Projects"
      heading={`${roomKey(room.game_type, room.room_number)} board`}
      showSearch={false}
      right={
        <span className="turn-indicator">
          {isMyTurn ? '내 차례' : `${currentPlayer?.name ?? '...'}님 차례`}
          {remaining !== null && <span className="turn-timer"> · {remaining}초</span>}
        </span>
      }
      aside={
        <DetailsPanel>
          <DetailRow label="주제">
            <span className="detail-topic">{room.topic}</span>
          </DetailRow>
          <DetailRow label="승리 조건">{room.win_condition}빙고</DetailRow>
          <DetailRow label={`참가자 (${players.length})`}>
            <PlayerRoster
              room={room}
              players={players}
              meId={me.id}
              currentPlayerId={currentPlayerId}
              celebratingId={celebration?.playerId ?? null}
            />
          </DetailRow>
          <div className="btn-row">
            <button className="btn-danger-quiet" onClick={() => setLeaving(true)}>
              나가기
            </button>
          </div>
        </DetailsPanel>
      }
    >
      {celebration && (
        <div className="bingo-banner">
          <span className="bingo-banner-mark">{bingoLabel(celebration.lines)}</span>
          <span className="bingo-banner-text">
            {celebration.playerId === me.id ? '내가 ' : `${celebration.name}님 `}
            {bingoLabel(celebration.lines)}!
          </span>
        </div>
      )}

      {/* 제시된 카드 */}
      <div className="call-slot">
        {call ? (
          <>
            <span className="call-slot-label">검토 요청 · {call.playerName}</span>
            <span className="call-slot-text">{call.text}</span>
          </>
        ) : (
          <span className="call-slot-empty">
            {canPresent ? '내 보드에서 항목을 하나 골라 제시하세요' : '제시를 기다리는 중…'}
          </span>
        )}
      </div>

      {/* 상태 안내 */}
      {call && canSubmit && (
        <div className="status-note">
          <span className="status-note-icon">→</span>
          <span>일치하는 항목을 하나 고른 뒤 제출하세요. 없으면 '일치 없음'을 누르면 돼요.</span>
        </div>
      )}
      {call && (iPresented || iSubmitted) && pendingSubmitters.length > 0 && (
        <div className="status-note status-note--wait">
          <span className="status-note-icon">◷</span>
          <span>
            {waitingNames}님의 제출을 기다리는 중… ({players.length - pendingSubmitters.length}/
            {players.length})
          </span>
        </div>
      )}

      <ColumnHeaders roomId={room.id} size={room.size} />
      <div className="board-grid" style={{ gridTemplateColumns: `repeat(${room.size}, 1fr)` }}>
        {me.board.map((cell) => {
          const selectable = !cell.cleared && (canPresent || canSubmit)
          return (
            <button
              key={cell.index}
              className={[
                'card',
                cell.cleared ? 'card--done' : '',
                myLineCells.has(cell.index) ? 'card--in-line' : '',
                selected === cell.index ? 'card--selected' : '',
                selectable ? 'card--interactive' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleCardClick(cell.index)}
              disabled={!selectable}
            >
              <CardTop cell={cell} />
              <div className="card-text">{cell.text}</div>
              {cell.cleared && <div className="card-stamp">완료</div>}
              {cell.matchedFrom && (
                <div className="card-matched">
                  <span className="card-matched-label">원문</span>
                  {cell.matchedFrom}
                </div>
              )}
              <CardFooter cell={cell} />
            </button>
          )
        })}
      </div>

      {/* 액션 바 */}
      <div className="action-bar">
        {canPresent && (
          <button
            className="btn-primary"
            disabled={selected === null || busy}
            onClick={() => run(() => presentCard(selected!))}
          >
            제시하기
          </button>
        )}
        {canSubmit && (
          <>
            <button
              className="btn-primary"
              disabled={selected === null || busy}
              onClick={() => run(() => submitTurn(selected))}
            >
              제출
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => run(() => submitTurn(null))}>
              일치 없음
            </button>
          </>
        )}
        {iSubmitted && !iPresented && <span className="action-bar-note">제출 완료</span>}

        {isHost && call && pendingSubmitters.length > 0 && (
          <button
            className="btn-quiet"
            disabled={busy}
            onClick={() => run(advanceTurn)}
            title="아직 제출하지 않은 사람이 있어도 이번 턴을 끝내고 다음 사람에게 넘깁니다"
          >
            이 턴 건너뛰기
          </button>
        )}
      </div>

      {leaving && (
        <ConfirmDialog
          title="게임 도중에 나갈까요?"
          body="이번 라운드는 포기하게 되고, 남은 사람이 한 명뿐이면 그 사람의 승리로 끝나요."
          confirmLabel="나가기"
          danger
          onConfirm={async () => {
            setLeaving(false)
            await leaveRoom()
            navigate('/')
          }}
          onCancel={() => setLeaving(false)}
        />
      )}
    </AppShell>
  )
}
