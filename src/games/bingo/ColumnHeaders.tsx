import { useMemo } from 'react'
import { createDummyColumns } from './bingoLogic'

export default function ColumnHeaders({ roomId, size }: { roomId: string; size: number }) {
  const columns = useMemo(() => createDummyColumns(size), [roomId, size])

  return (
    <div className="col-headers" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      {columns.map((col) => (
        <div key={col.name} className="col-header">
          <span className="col-header-name">{col.name}</span>
          <span className="col-header-count">{col.count}</span>
        </div>
      ))}
    </div>
  )
}
