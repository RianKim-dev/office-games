import type { ReactNode } from 'react'

export function DetailsPanel({ title = 'Details', children }: { title?: string; children: ReactNode }) {
  return (
    <div className="details-panel">
      <div className="details-panel-head">{title}</div>
      <div className="details-panel-body">{children}</div>
    </div>
  )
}

/** 지라 상세 패널의 "라벨 / 값" 한 줄 */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <div className="detail-row-value">{children}</div>
    </div>
  )
}
