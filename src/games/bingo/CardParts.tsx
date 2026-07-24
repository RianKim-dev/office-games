import type { BingoCell } from '../../lib/types'

export function CardTop({ cell }: { cell: BingoCell }) {
  return (
    <div className="card-top">
      <span className={`card-chip chip--${cell.tagColor}`}>{cell.tag}</span>
      {cell.priority && (
        <span className={`card-priority card-priority--${cell.priority}`}>
          {cell.priority === 'up' ? '▲' : '▼'}
        </span>
      )}
    </div>
  )
}

export function CardFooter({ cell }: { cell: BingoCell }) {
  return (
    <>
      {cell.dateLabel && <div className="card-date">{cell.dateLabel}</div>}
      <div className="card-id-row">
        <span className="card-id">
          <span className="card-id-icon" />
          {cell.ticketCode}
        </span>
        <span className={`card-avatar avatar--${cell.avatarColor}`}>{cell.avatarInitial}</span>
      </div>
    </>
  )
}
