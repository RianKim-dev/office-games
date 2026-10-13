/**
 * 1단계 튜닝용 랩 페이지 (`/cham/lab`). 게임이 아니라 계측기다.
 *
 * 여기서 확인해야 하는 것:
 *  1. 좌/우 부호 — 내 왼쪽을 봤을 때 yaw가 +로 나오는가
 *  2. 각도 임계값 — 편하게 돌렸을 때 몇 도가 나오고 등급이 어디서 갈리는가
 *  3. 커밋 윈도우 — 실제 리듬에 맞춰 돌렸을 때 정착 판정이 제대로 잡히는가
 *     (특히 홱 튕겼다 돌아오면 unstable_center 파울로 걸려야 한다)
 *
 * 게임이 완성되면 지워도 되지만, 임계값을 다시 만질 때마다 필요해서 남겨둔다.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { VisionSampler, requestCamera, type VisionSample } from './vision'
import {
  CHOICE_LABEL,
  FOUL_LABEL,
  TUNING,
  classifyAttack,
  classifyDefense,
  judgeAttack,
  judgeDefense,
  type Verdict,
} from './chamRules'

/** 샘플 보관 시간. 부정출발 감시가 t0-1200ms부터라 넉넉히 잡는다 */
const BUFFER_MS = 3000

type Phase = { kind: 'idle' } | { kind: 'countdown'; t0: number } | { kind: 'judged' }

function verdictText(v: Verdict): string {
  if (v.foul) return `파울 — ${FOUL_LABEL[v.foul]}`
  if (!v.choice) return '—'
  return v.grade ? `${CHOICE_LABEL[v.choice]} · ${v.grade}` : CHOICE_LABEL[v.choice]
}

export default function ChamLab() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const samplerRef = useRef<VisionSampler | null>(null)
  const bufferRef = useRef<VisionSample[]>([])
  const phaseRef = useRef<Phase>({ kind: 'idle' })

  const [status, setStatus] = useState('시작을 누르세요')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [live, setLive] = useState<VisionSample | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [beat, setBeat] = useState(0)
  const [result, setResult] = useState<{ defense: Verdict; attack: Verdict } | null>(null)
  const [flipX, setFlipX] = useState(false)

  // phaseRef는 rAF 루프가 읽고, phase는 렌더가 읽는다. 항상 같이 옮긴다
  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const start = useCallback(async () => {
    try {
      setStatus('카메라 권한 요청 중…')
      const stream = await requestCamera()
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      setStatus('모델 로딩 중… (첫 실행은 11MB 받느라 몇 초 걸립니다)')
      samplerRef.current = await VisionSampler.create(
        { face: true, hand: true, debug: true },
        !flipX,
      )
      setReady(true)
      setStatus('측정 중')
      setError(null)
    } catch (e) {
      setReady(false)
      setStatus('시작하지 못했어요')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [flipX])

  // 측정 루프
  useEffect(() => {
    let raf = 0
    // 판정은 매 프레임 하되 화면 숫자는 10fps로만 갱신한다.
    // 매 프레임 setState하면 리렌더가 카운트다운 연출을 끊는다.
    let lastRender = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const sampler = samplerRef.current
      const video = videoRef.current
      if (!sampler || !video) return

      const sample = sampler.sample(video)
      if (!sample) return

      if (sample.t - lastRender > 100) {
        lastRender = sample.t
        setLive(sample)
      }
      const buffer = bufferRef.current
      buffer.push(sample)
      while (buffer.length > 0 && sample.t - buffer[0].t > BUFFER_MS) buffer.shift()

      const current = phaseRef.current
      if (current.kind === 'countdown') {
        const elapsed = sample.t - current.t0
        setBeat(elapsed < -TUNING.beatMs ? 1 : elapsed < 0 ? 2 : 3)
        // 마감 후 한 프레임 여유를 두고 판정한다
        if (elapsed > TUNING.commitWindowMs + 50) {
          setResult({
            defense: judgeDefense(buffer, current.t0),
            attack: judgeAttack(buffer, current.t0),
          })
          phaseRef.current = { kind: 'judged' }
          setPhase({ kind: 'judged' })
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => () => samplerRef.current?.close(), [])

  const rehearse = useCallback(() => {
    setResult(null)
    setBeat(0)
    // "참 — 참 — 참!" 두 박자 뒤가 t0
    setPhaseBoth({ kind: 'countdown', t0: performance.now() + TUNING.beatMs * 2 })
  }, [setPhaseBoth])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && phaseRef.current.kind !== 'countdown') {
        e.preventDefault()
        rehearse()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rehearse])

  const liveDefense = live?.faceFound
    ? classifyDefense(live.yawDeg, Math.abs(live.yawDeg))
    : null
  const liveAttack = live?.handFound ? classifyAttack(live.handOffset) : null

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 20 }}>
      <h2 style={{ margin: '0 0 4px' }}>참참참 판정 랩</h2>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 12px' }}>{status}</p>

      {error && (
        <p
          style={{
            color: 'var(--danger)',
            background: 'rgba(248, 113, 113, .08)',
            border: '1px solid rgba(248, 113, 113, .3)',
            borderRadius: 6,
            padding: '10px 12px',
            margin: '0 0 16px',
            lineHeight: 1.6,
          }}
        >
          {error}
        </p>
      )}

      <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          // 거울로 보여준다. MediaPipe에는 원본이 들어가므로 판정에는 영향이 없다
          style={{ width: '100%', display: 'block', transform: 'scaleX(-1)' }}
        />
        {phase.kind === 'countdown' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              fontSize: 96,
              fontWeight: 700,
              color: beat === 3 ? '#fbbf24' : '#fff',
              textShadow: '0 2px 16px rgba(0,0,0,.6)',
            }}
          >
            {beat === 3 ? '참!' : '참'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button onClick={start}>카메라 시작</button>
        <button onClick={rehearse} disabled={!ready}>
          리허설 (Space)
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <input type="checkbox" checked={flipX} onChange={(e) => setFlipX(e.target.checked)} />
          좌우 부호 뒤집기 (체크 후 카메라 다시 시작)
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Panel title="실시간 측정">
          <Row label="얼굴" value={live?.faceFound ? '있음' : '없음'} />
          <Row label="yaw" value={`${(live?.yawDeg ?? 0).toFixed(1)}°`} />
          <Row
            label="코 비율 (교차검증)"
            value={(live?.debug?.noseRatio ?? 0).toFixed(2)}
            hint="yaw와 부호가 같아야 정상"
          />
          <Row label="손" value={live?.handFound ? '있음' : '없음'} />
          <Row label="손 오프셋" value={(live?.handOffset ?? 0).toFixed(3)} />
        </Panel>

        <Panel title="지금 이 프레임이면">
          <Row label="수비" value={liveDefense ? verdictText(liveDefense) : '—'} />
          <Row label="공격" value={liveAttack ? verdictText(liveAttack) : '—'} />
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 12 }}>
            <strong>부호 확인:</strong> 자기 <strong>왼쪽</strong>을 봤을 때 yaw가 <strong>양수</strong>
            이고 수비가 "왼쪽"으로 나와야 합니다. 반대로 나오면 위 체크박스를 켜세요.
          </p>
        </Panel>
      </div>

      {result && (
        <Panel title="리허설 판정 (정착값 기준)">
          <Row label="수비" value={verdictText(result.defense)} />
          <Row label="공격" value={verdictText(result.attack)} />
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 12 }}>
            홱 돌렸다가 제자리로 돌아오면 <code>파울 — 흔들렸어요</code>가 떠야 정상입니다.
          </p>
        </Panel>
      )}

      <Panel title="현재 임계값">
        <Row label="가운데" value={`|yaw| < ${TUNING.centerMaxDeg}°`} />
        <Row label="죽은 구간" value={`${TUNING.centerMaxDeg}° ~ ${TUNING.sideMinDeg}°`} />
        <Row
          label="좌/우 등급"
          value={`C ${TUNING.sideMinDeg}° · B ${TUNING.sideGradeBDeg}° · A ${TUNING.sideGradeADeg}°`}
        />
        <Row
          label="가운데 등급"
          value={`A ${TUNING.centerGradeADeg}° · B ${TUNING.centerGradeBDeg}° · C ${TUNING.centerGradeCDeg}°`}
        />
        <Row
          label="커밋 윈도우"
          value={`t0 ~ +${TUNING.commitWindowMs}ms (정착 +${TUNING.settleFromMs}ms부터)`}
        />
      </Panel>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--panel-bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 14,
        marginTop: 12,
      }}
    >
      <h3 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>
        {label}
        {hint && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}> · {hint}</span>}
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
