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
      {visible.map(({ room, playerCount, hostName, displayStatus }) => (
        <button key={room.id} className="project-row" onClick={() => navigate(`/room/${room.id}`)}>
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
    </div>
  )
}
