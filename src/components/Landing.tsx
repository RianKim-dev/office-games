import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from './AppShell'
import ProjectList from './ProjectList'
import NameGate from './NameGate'
import { useDisplayName } from '../lib/useDisplayName'

export default function Landing() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { name, setDisplayName } = useDisplayName()
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  if (!name) return <NameGate onSubmit={setDisplayName} />

  function startEditing() {
    setNameDraft(name)
    setEditingName(true)
  }

  function commitName() {
    setDisplayName(nameDraft)
    setEditingName(false)
  }

  return (
    <AppShell
      title="Projects"
      heading="전체 프로젝트"
      searchPlaceholder="Search projects"
      search={query}
      onSearchChange={setQuery}
      right={
        <>
          {editingName ? (
            <>
              <input
                className="doc-input name-chip-input"
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter' && nameDraft.trim()) commitName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
              />
              <button className="shell-toolbar-btn" disabled={!nameDraft.trim()} onClick={commitName}>
                저장
              </button>
            </>
          ) : (
            <button className="name-chip" onClick={startEditing} title="표시 이름 바꾸기">
              {name}
            </button>
          )}
          <button className="toolbar-create" onClick={() => navigate('/new')}>
            Create
          </button>
        </>
      }
    >
      <ProjectList query={query} />
    </AppShell>
  )
}
