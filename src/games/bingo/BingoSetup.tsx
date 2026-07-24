import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createBingoRoom, getSavedDisplayName } from '../../lib/room'
import AppShell from '../../components/AppShell'

export default function BingoSetup() {
  const navigate = useNavigate()
  const [size, setSize] = useState<4 | 5>(4)
  const [winCondition, setWinCondition] = useState<1 | 2 | 3>(1)
  const [timed, setTimed] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [hostName, setHostName] = useState(getSavedDisplayName())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = hostName.trim().length > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const { roomId } = await createBingoRoom({
        size,
        winCondition,
        timed,
        maxPlayers,
        hostName: hostName.trim(),
      })
      navigate(`/room/${roomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '만들기에 실패했어요')
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Projects" heading="새 프로젝트">
      <div className="setup-form">
        <label className="field">
          <span className="field-label">표시 이름</span>
          <input
            className="doc-input"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="예: 김철수"
          />
        </label>

        <div className="field">
          <span className="field-label">게임 종류</span>
          <div className="segmented">
            <button className="segmented-opt is-active">빙고</button>
            <button className="segmented-opt" disabled>
              끝말잇기 (준비중)
            </button>
          </div>
        </div>

        <div className="field">
          <span className="field-label">정원</span>
          <div className="segmented">
            {[2, 4, 6, 8].map((n) => (
              <button
                key={n}
                className={`segmented-opt ${maxPlayers === n ? 'is-active' : ''}`}
                onClick={() => setMaxPlayers(n)}
              >
                {n}명
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">보드 크기</span>
          <div className="segmented">
            {[4, 5].map((n) => (
              <button
                key={n}
                className={`segmented-opt ${size === n ? 'is-active' : ''}`}
                onClick={() => setSize(n as 4 | 5)}
              >
                {n}×{n}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">승리 조건</span>
          <div className="segmented">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                className={`segmented-opt ${winCondition === n ? 'is-active' : ''}`}
                onClick={() => setWinCondition(n as 1 | 2 | 3)}
              >
                {n}빙고
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">시간 제한</span>
          <div className="segmented">
            <button
              className={`segmented-opt ${!timed ? 'is-active' : ''}`}
              onClick={() => setTimed(false)}
            >
              없음
            </button>
            <button
              className={`segmented-opt ${timed ? 'is-active' : ''}`}
              onClick={() => setTimed(true)}
            >
              있음
            </button>
          </div>
          {timed && <p className="field-hint">채우기 최장 2분 · 턴당 30초</p>}
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="doc-btn doc-btn--wide" disabled={!canSubmit} onClick={handleSubmit}>
          {submitting ? '만드는 중…' : '만들기'}
        </button>
      </div>
    </AppShell>
  )
}
