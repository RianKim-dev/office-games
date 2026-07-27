import { useEffect, useRef, useState } from 'react'

/**
 * 국면이 바뀔 때(게임 시작 / 첫 턴 / 완료) 잠깐 뜨는 배너.
 * phaseKey가 바뀌면 messageFor로 문구를 만들어 보여주고 스스로 사라진다.
 * 화면 전체를 덮지 않아 위장을 크게 해치지 않는다.
 */
export default function PhaseAnnounce({
  phaseKey,
  messageFor,
  durationMs = 2200,
}: {
  phaseKey: string
  messageFor: (from: string, to: string) => { mark: string; text: string } | null
  durationMs?: number
}) {
  const prev = useRef<string | null>(null)
  const [shown, setShown] = useState<{ mark: string; text: string } | null>(null)

  useEffect(() => {
    const from = prev.current
    prev.current = phaseKey
    // 처음 마운트될 때는 알리지 않는다 (중간 참가자에게 헛배너가 뜨지 않도록)
    if (from === null || from === phaseKey) return
    const msg = messageFor(from, phaseKey)
    if (!msg) return
    setShown(msg)
    const t = setTimeout(() => setShown(null), durationMs)
    return () => clearTimeout(t)
  }, [phaseKey, messageFor, durationMs])

  if (!shown) return null
  return (
    <div className="phase-announce">
      <span className="phase-announce-mark">{shown.mark}</span>
      <span className="phase-announce-text">{shown.text}</span>
    </div>
  )
}
