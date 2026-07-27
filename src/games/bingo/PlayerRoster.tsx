import type { Player, Room } from '../../lib/types'
import { isOnline } from '../../lib/room'
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
  onKick?: (player: Player) => void
  onTransferHost?: (player: Player) => void
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
  onTransferHost,
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
        const online = isOnline(p.last_seen_at)

        return (
          <div
            key={p.id}
            className={`roster-row ${isTurn ? 'is-turn' : ''} ${
              celebratingId === p.id ? 'is-celebrating' : ''
            } ${p.is_eliminated ? 'is-out' : ''}`}
          >
            <span className={`roster-avatar ${online ? '' : 'is-offline'}`}>{initial(p.name)}</span>

            <div className="roster-main">
              <div className="roster-name-line">
                <span className="roster-name">
                  {p.name}
                  {p.id === meId && <span className="roster-you"> (나)</span>}
                </span>
                {p.is_host && <span className="roster-badge">방장</span>}
                {!online && <span className="roster-badge roster-badge--off">오프라인</span>}
              </div>
              <div className="roster-meta">
                {playing ? (
                  <>
                    <span className={lines > 0 ? 'roster-lines is-on' : 'roster-lines'}>
                      {lines}빙고
                    </span>
                    <span className="roster-dot">·</span>
                    <span>{p.is_eliminated ? '탈락' : `${remainingCount(p.board)}칸 남음`}</span>
                  </>
                ) : room.status === 'filling' ? (
                  <span>{p.is_eliminated ? '탈락' : p.is_ready ? '제출 완료' : '작성 중'}</span>
                ) : (
                  <span className={p.is_ready ? 'roster-ready' : undefined}>
                    {p.is_host ? '방장' : p.is_ready ? '준비 완료' : '준비 안 됨'}
                  </span>
                )}
              </div>
            </div>

            {hasCall && (
              <span className={`roster-state ${submitted ? 'is-done' : ''}`}>
                {isPresenter ? '제시' : submitted ? '제출' : '대기'}
              </span>
            )}
            {isTurn && !hasCall && <span className="roster-state is-turn-tag">차례</span>}
            {room.status === 'waiting' && !p.is_host && p.is_ready && (
              <span className="roster-state is-done">준비</span>
            )}

            {isHost && p.id !== meId && (
              <div className="roster-actions">
                {onTransferHost && room.status === 'waiting' && (
                  <button
                    className="roster-action"
                    onClick={() => onTransferHost(p)}
                    title="방장 위임"
                  >
                    ♛
                  </button>
                )}
                {onKick && (
                  <button className="roster-action roster-action--kick" onClick={() => onKick(p)} title="내보내기">
                    ×
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
