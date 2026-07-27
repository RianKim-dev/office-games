import { useNavigate } from 'react-router-dom'
import type { Player, Room } from '../../lib/types'
import { remainingCount } from './bingoLogic'
import AppShell from '../../components/AppShell'
import { roomKey } from '../../lib/gameTypes'

interface Props {
  room: Room
  players: Player[]
  isHost: boolean
  reopenRoom: () => Promise<void>
}

export default function BingoResult({ room, players, isHost, reopenRoom }: Props) {
  const navigate = useNavigate()
  const winner = players.find((p) => p.id === room.winner_id) ?? null
  const ranked = [...players].sort((a, b) => remainingCount(a.board) - remainingCount(b.board))

  return (
    <AppShell title="Projects" heading={`${roomKey(room.game_type, room.room_number)} board`}>
      <div className="result-banner">
        {winner ? (
          <>
            <span className="result-banner-stamp">완료</span>
            <span className="result-banner-text">{winner.name}님이 가장 먼저 현황판을 완료했어요</span>
          </>
        ) : (
          <span className="result-banner-text">이번 라운드는 완료된 사람 없이 종료됐어요</span>
        )}
      </div>

      <div className="result-boards">
        {ranked.map((p, i) => {
          const rem = remainingCount(p.board)
          const isWinner = p.id === room.winner_id
          return (
            <div
              key={p.id}
              className={`result-board ${isWinner ? 'result-board--winner' : ''}`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <div className="result-board-head">
                <span>{p.name}</span>
                {isWinner ? (
                  <span className="result-board-tag result-board-tag--win">완료</span>
                ) : (
                  <span className="result-board-tag">{rem}칸 남음</span>
                )}
              </div>
              <div
                className="board-grid board-grid--mini"
                style={{ gridTemplateColumns: `repeat(${room.size}, 1fr)` }}
              >
                {p.board.map((cell) => (
                  <div key={cell.index} className={`mini-card ${cell.cleared ? 'mini-card--done' : ''}`}>
                    <span className="mini-card-text">{cell.text}</span>
                    {/* 무엇으로 지워졌는지 — 정확히 일치할 필요는 없는 규칙이라
                        끝나고 서로 확인할 수 있도록 원문을 같이 보여준다 */}
                    {cell.cleared &&
                      (cell.matchedFrom ? (
                        <span className="mini-card-origin">← {cell.matchedFrom}</span>
                      ) : (
                        <span className="mini-card-origin mini-card-origin--self">직접 제시</span>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {isHost ? (
        <button className="btn-primary btn-block" onClick={reopenRoom}>
          새 라운드 시작
        </button>
      ) : (
        <div className="status-note status-note--wait">
          <span className="status-note-icon">◷</span>
          <span>방장이 새 라운드를 시작하길 기다리는 중이에요.</span>
        </div>
      )}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn-quiet" onClick={() => navigate('/')}>
          목록으로
        </button>
        <button className="btn-quiet" onClick={() => navigate('/new')}>
          새 프로젝트 만들기
        </button>
      </div>
    </AppShell>
  )
}
