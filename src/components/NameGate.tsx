import { useState } from 'react'
import AppShell from './AppShell'

/** 표시 이름이 아직 없을 때 한 번만 보여주는 진입 화면 */
export default function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [draft, setDraft] = useState('')

  return (
    <AppShell title="Projects" heading="사용자 설정">
      <div className="setup-form">
        <label className="field">
          <span className="field-label">표시 이름</span>
          <input
            className="doc-input"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 한글 입력 중의 Enter는 조합 확정용이라 제출로 취급하면 안 된다
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' && draft.trim()) onSubmit(draft)
            }}
            placeholder="예: 김철수"
          />
          <p className="field-hint">보드에 표시될 이름이에요. 나중에 언제든 바꿀 수 있어요.</p>
        </label>
        <button className="doc-btn doc-btn--wide" disabled={!draft.trim()} onClick={() => onSubmit(draft)}>
          시작하기
        </button>
      </div>
    </AppShell>
  )
}
