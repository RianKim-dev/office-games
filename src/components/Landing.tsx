import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from './AppShell'
import ProjectList from './ProjectList'

export default function Landing() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  return (
    <AppShell title="Projects" heading="전체 프로젝트">
      <div className="doc-row doc-row--join" style={{ marginBottom: 16 }}>
        <span className="doc-row-icon">↳</span>
        <div className="doc-row-join-body">
          <div className="doc-row-title">코드로 열기</div>
          <div className="doc-join-input-wrap">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="공유받은 코드 입력"
              className="doc-input"
            />
            <button className="doc-btn" disabled={!code} onClick={() => navigate(`/room/${code}`)}>
              열기
            </button>
          </div>
        </div>
      </div>

      <ProjectList />
    </AppShell>
  )
}
