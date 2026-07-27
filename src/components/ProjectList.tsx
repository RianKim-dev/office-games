import { useNavigate } from 'react-router-dom'
import { useProjectList, type RowStatus } from '../lib/useProjectList'
import { roomKey } from '../lib/gameTypes'

const STATUS_LABEL: Record<RowStatus, string> = {
  todo: 'TO DO',
  in_review: 'IN REVIEW',
  in_progress: 'IN PROGRESS',
  done: 'DONE',
  stale: '중단됨',
}

export default function ProjectList({ query = '' }: { query?: string }) {
  const navigate = useNavigate()
  const { rows, loading, error } = useProjectList()

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? rows.filter(({ room, hostName }) =>
        [roomKey(room.game_type, room.room_number), room.display_name, hostName ?? '']
          .join(' ')
          .toLowerCase()
          .includes(needle),
      )
    : rows

  if (loading) return <p className="notice notice--muted">불러오는 중…</p>
  if (error) return <p className="notice notice--error">목록을 불러오지 못했어요. {error}</p>

  if (rows.length === 0) {
    return <p className="notice notice--muted">아직 만들어진 프로젝트가 없어요. Create로 새로 만들어보세요.</p>
  }
  if (visible.length === 0) {
    return <p className="notice notice--muted">'{query}'와 일치하는 프로젝트가 없어요.</p>
  }

  return (
    <div className="project-list">
      {visible.map(
        ({ room, playerCount, onlineCount, hostName, status, canJoin, isMember, blockedReason }) => (
          <button
            key={room.id}
            className={`project-row ${canJoin ? '' : 'project-row--blocked'}`}
            disabled={!canJoin}
            title={canJoin ? undefined : `입장할 수 없어요 · ${blockedReason}`}
            onClick={() => navigate(`/room/${room.id}`)}
          >
            <span className="project-row-key">{roomKey(room.game_type, room.room_number)}</span>
            <span className="project-row-name">{room.display_name}</span>
            <span className="project-row-meta">{hostName ?? '-'}</span>
            <span className="project-row-meta">
              {playerCount}/{room.max_players}
              {onlineCount > 0 && <span className="project-row-online"> · {onlineCount}명 접속</span>}
            </span>
            {isMember && <span className="project-row-mine">참여 중</span>}
            {/* 상태 pill과 같은 말이면 두 번 쓰지 않는다 */}
            {!canJoin && blockedReason && blockedReason !== STATUS_LABEL[status] && (
              <span className="project-row-block">{blockedReason}</span>
            )}
            <span className={`status-pill status-pill--${status}`}>{STATUS_LABEL[status]}</span>
          </button>
        ),
      )}
    </div>
  )
}
