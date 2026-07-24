import { useEffect, useState } from 'react'
import type { Player, Room } from '../../lib/types'
import { remainingCount } from './bingoLogic'
import { CardFooter, CardTop } from './CardParts'
import ColumnHeaders from './ColumnHeaders'
import AppShell from '../../components/AppShell'
import { roomKey } from '../../lib/gameTypes'

interface Props {
  room: Room
  me: Player
  players: Player[]
  isMyTurn: boolean
  presentCard: (index: number) => Promise<void>
  matchCard: (index: number) => Promise<void>
  advanceTurn: () => Promise<void>
}

export default function BingoPlay({
  room,
  me,
  players,
  isMyTurn,
  presentCard,
  matchCard,
  advanceTurn,
}: Props) {
  const currentPlayerId =
    room.turn_order && room.current_turn_index !== null
      ? room.turn_order[room.current_turn_index]
      : null
  const currentPlayer = players.find((p) => p.id === currentPlayerId)

  const canPresent = isMyTurn && !room.current_call
  const canMatch = !!room.current_call && room.current_call.playerId !== me.id

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

  function handleCellClick(index: number) {
    const cell = me.board[index]
    if (!cell || cell.cleared) return
    if (canPresent) presentCard(index)
    else if (canMatch) matchCard(index)
  }

  return (
    <AppShell
      title="Projects"
      heading={`${roomKey(room.game_type, room.room_number)} board`}
      right={
        <span className="field-hint">
          {isMyTurn ? '내 차례' : `${currentPlayer?.name ?? '...'}님 차례`}
          {remaining !== null && ` · ${remaining}초`}
        </span>
      }
    >
      <div className="review-slot">
        {room.current_call ? (
          <>
            <span className="review-slot-label">검토 요청 · {room.current_call.playerName}</span>
            <span className="review-slot-text">{room.current_call.text}</span>
            {canMatch && (
              <span className="field-hint">일치하는 항목이 있으면 내 보드에서 선택하세요</span>
            )}
            <button className="doc-btn doc-btn--ghost" onClick={advanceTurn}>
              다음 턴으로
            </button>
          </>
        ) : (
          <span className="review-slot-empty">
            {canPresent ? '내 보드에서 항목을 골라 제시하세요' : '제시를 기다리는 중…'}
          </span>
        )}
      </div>

      <ColumnHeaders roomId={room.id} size={room.size} />
      <div className="board-grid" style={{ gridTemplateColumns: `repeat(${room.size}, 1fr)` }}>
        {me.board.map((cell) => (
          <button
            key={cell.index}
            className={`card ${cell.cleared ? 'card--done' : ''} ${
              !cell.cleared && (canPresent || canMatch) ? 'card--interactive' : ''
            }`}
            onClick={() => handleCellClick(cell.index)}
            disabled={cell.cleared || (!canPresent && !canMatch)}
          >
            <CardTop cell={cell} />
            <div className="card-text">{cell.text}</div>
            {cell.cleared && <div className="card-stamp">완료</div>}
            {cell.matchedFrom && <div className="card-matched">원문: {cell.matchedFrom}</div>}
            <CardFooter cell={cell} />
          </button>
        ))}
      </div>

      <div className="player-strip">
        {players.map((p) => (
          <span
            key={p.id}
            className={`player-chip ${p.id === currentPlayerId ? 'is-turn' : ''} ${p.is_eliminated ? 'is-out' : ''}`}
          >
            {p.name} · {remainingCount(p.board)}칸 남음
          </span>
        ))}
      </div>
    </AppShell>
  )
}
