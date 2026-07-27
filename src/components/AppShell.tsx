import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
  searchPlaceholder?: string
  /** 넘기면 검색창이 실제로 동작하고, 안 넘기면 위장용 장식으로만 남는다 */
  search?: string
  onSearchChange?: (value: string) => void
  /** 검색/Filter/Group 줄. 목록 화면에서만 의미가 있어 방 안에서는 끈다 */
  showSearch?: boolean
  right?: ReactNode
  /** 넘기면 지라 이슈 상세화면처럼 본문 + 우측 Details 패널 2단이 된다 */
  aside?: ReactNode
  children: ReactNode
}

export default function AppShell({
  space = 'Spaces',
  title,
  heading,
  searchPlaceholder = 'Search board',
  search,
  onSearchChange,
  showSearch = true,
  right,
  aside,
  children,
}: Props) {
  const searchable = onSearchChange !== undefined
  return (
    <div className="shell">
      <div className="shell-top">
        <span className="shell-space">{space}</span>
        <div className="shell-crumb">
          {/* 어느 화면에서든 목록으로 돌아갈 수 있는 유일한 상시 경로 */}
          <Link className="shell-crumb-title" to="/">
            {title}
          </Link>
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

      {(showSearch || right) && (
        <div className="shell-toolbar">
          {showSearch && (
            <>
              <input
                className="shell-search"
                placeholder={searchPlaceholder}
                value={searchable ? (search ?? '') : undefined}
                onChange={searchable ? (e) => onSearchChange(e.target.value) : undefined}
                readOnly={!searchable}
              />
              <span className="shell-toolbar-btn">Filter</span>
              <span className="shell-toolbar-btn">Group</span>
            </>
          )}
          {right && <div className="shell-toolbar-right">{right}</div>}
        </div>
      )}

      {aside ? (
        <div className="shell-body shell-body--split">
          <div className="shell-main">{children}</div>
          <aside className="shell-aside">{aside}</aside>
        </div>
      ) : (
        <div className="shell-body">{children}</div>
      )}
    </div>
  )
}
