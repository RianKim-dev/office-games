import type { ReactNode } from 'react'

const TABS = [
  'Summary',
  'Board',
  'List',
  'Calendar',
  'Timeline',
  'Approvals',
  'Forms',
  'Docs',
  'Reports',
]

interface Props {
  space?: string
  title: string
  heading?: string
  right?: ReactNode
  children: ReactNode
}

export default function AppShell({ space = 'Spaces', title, heading, right, children }: Props) {
  return (
    <div className="shell">
      <div className="shell-top">
        <span className="shell-space">{space}</span>
        <div className="shell-crumb">
          <span className="shell-crumb-title">{title}</span>
          <span className="shell-crumb-icon">⋯</span>
        </div>
        <div className="shell-top-icons">
          <span className="shell-icon">⇪</span>
          <span className="shell-icon">⚡</span>
        </div>
      </div>
      {heading && <div className="shell-heading">{heading}</div>}

      <div className="shell-tabs">
        {TABS.map((t) => (
          <span key={t} className={`shell-tab ${t === 'Board' ? 'is-active' : ''}`}>
            {t}
          </span>
        ))}
      </div>

      <div className="shell-toolbar">
        <input className="shell-search" placeholder="Search board" readOnly />
        <span className="shell-toolbar-btn">Filter</span>
        <span className="shell-toolbar-btn">Group</span>
        {right && <div className="shell-toolbar-right">{right}</div>}
      </div>

      <div className="shell-body">{children}</div>
    </div>
  )
}
