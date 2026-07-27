import type { Player, Room } from '../../lib/types'
import { countCompletedLines, remainingCount } from './bingoLogic'

interface Props {
  room: Room
  players: Player[]
  meId: string
  /** 지금 차례인 플레이어 (게임 중에만) */
  currentPlayerId?: string | null
  /** 방금 빙고 수가 오른 플레이어 — 잠깐 하이라이트 */
  celebratingId?: string | null
  isHost?: boolean
  onKick?: (id: string) => void
}

function initial(name: string) {
  return name.trim().charAt(0) || '?'
}

export default function PlayerRoster({
  room,
  players,
  meId,
  currentPlayerId,
  celebratingId,
  isHost,
  onKick,
}: Props) {
  const playing = room.status === 'playing'
  const hasCall = playing && !!room.current_call

  return (
    <div className="roster">
      {players.map((p) => {
        const lines = p.board.length ? countCompletedLines(p.board, room.size) : 0
        const isTurn = playing && p.id === currentPlayerId
        const isPresenter = hasCall && room.current_call!.playerId === p.id
        const submitted = hasCall && (isPresenter || p.submitted_turn === room.turn_seq)

        return (
          <div
            key={p.id}
            className={`roster-row ${isTurn ? 'is-turn' : ''} ${
              celebratingId === p.id ? 'is-celebrating' : ''
            } ${p.is_eliminated ? 'is-out' : ''}`}
          >
            <span className="roster-avatar">{initial(p.name)}</span>

            <div className="roster-main">
              <div className="roster-name-line">
                <span className="roster-name">
                  {p.name}
                  {p.id === meId && <span className="roster-you"> (나)</span>}
                </span>
                {p.is_host && <span className="roster-badge">방장</span>}
              </div>
              <div className="roster-meta">
                {playing ? (
                  <>
                    <span className={lines > 0 ? 'roster-lines is-on' : 'roster-lines'}>
                      {lines}빙고
                    </span>
                    <span className="roster-dot">·</span>
                    <span>{remainingCount(p.board)}칸 남음</span>
                  </>
                ) : room.status === 'filling' ? (
                  <span>{p.is_eliminated ? '탈락' : p.is_ready ? '제출 완료' : '작성 중'}</span>
                ) : (
                  <span>대기 중</span>
                )}
              </div>
            </div>

            {hasCall && (
              <span className={`roster-state ${submitted ? 'is-done' : ''}`}>
                {isPresenter ? '제시' : submitted ? '제출' : '대기'}
              </span>
            )}
            {isTurn && !hasCall && <span className="roster-state is-turn-tag">차례</span>}

            {isHost && onKick && p.id !== meId && (
              <button className="roster-kick" onClick={() => onKick(p.id)} title="강퇴">
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
