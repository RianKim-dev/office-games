import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from './AppShell'
import ProjectList from './ProjectList'

export default function Landing() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  return (
    <AppShell
      title="Projects"
      heading="전체 프로젝트"
      searchPlaceholder="Search projects"
      search={query}
      onSearchChange={setQuery}
      right={
        <button className="toolbar-create" onClick={() => navigate('/new')}>
          Create
        </button>
      }
    >
      <ProjectList query={query} />
    </AppShell>
  )
}
