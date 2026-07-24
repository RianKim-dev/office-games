import { useNavigate } from 'react-router-dom'
import { useProjectList } from '../lib/useProjectList'
import { roomKey } from '../lib/gameTypes'
import type { DisplayStatus } from '../lib/types'

const STATUS_LABEL: Record<DisplayStatus, string> = {
  todo: 'TO DO',
  in_review: 'IN REVIEW',
  in_progress: 'IN PROGRESS',
  done: 'DONE',
}

export default function ProjectList() {
  const navigate = useNavigate()
  const { rows, loading } = useProjectList()

  return (
    <div className="project-list">
      {loading && <p className="notice notice--muted">불러오는 중…</p>}

      {!loading &&
        rows.map(({ room, playerCount, hostName, displayStatus }) => (
          <button
            key={room.id}
            className="project-row"
            onClick={() => navigate(`/room/${room.id}`)}
          >
            <span className="project-row-key">{roomKey(room.game_type, room.room_number)}</span>
            <span className="project-row-name">{room.display_name}</span>
            <span className="project-row-meta">{hostName ?? '-'}</span>
            <span className="project-row-meta">
              {playerCount}/{room.max_players}
            </span>
            <span className={`status-pill status-pill--${displayStatus}`}>
              {STATUS_LABEL[displayStatus]}
            </span>
          </button>
        ))}

      <button className="project-row project-row--create" onClick={() => navigate('/new')}>
        <span className="project-row-icon">＋</span>
        <span className="project-row-name">새 프로젝트 만들기</span>
      </button>
    </div>
  )
}
