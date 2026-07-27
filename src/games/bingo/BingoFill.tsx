import { useEffect, useRef, useState } from 'react'
import type { BingoCell, Player, Room } from '../../lib/types'
import { isBoardFilled } from './bingoLogic'
import { CardFooter, CardTop } from './CardParts'
import ColumnHeaders from './ColumnHeaders'
import AppShell from '../../components/AppShell'
import { roomKey } from '../../lib/gameTypes'

interface Props {
  room: Room
  me: Player
  players: Player[]
  setBoard: (board: BingoCell[]) => Promise<void>
  setReady: (ready: boolean, board?: BingoCell[]) => Promise<void>
}

export default function BingoFill({ room, me, players, setBoard, setReady }: Props) {
  const [board, setLocalBoard] = useState(me.board)
  const [copied, setCopied] = useState(false)
  // 내가 입력 중인 동안에는 서버 에코가 로컬 상태를 덮어쓰지 못하게 막는다.
  // (안 막으면 내 예전 보드가 되돌아와 방금 친 글자가 사라진다)
  const dirty = useRef(false)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!me.is_ready && !dirty.current) setLocalBoard(me.board)
  }, [me.board, me.is_ready])

  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!room.fill_deadline) {
      setRemaining(null)
      return
    }
    const deadline = new Date(room.fill_deadline).getTime()
    const tick = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [room.fill_deadline])

  // 키 입력마다 DB에 쓰면 25칸 × 글자수만큼 쓰기가 발생하고, 그 변경이 realtime으로
  // 다시 브로드캐스트되며 입력이 튄다. 입력이 멎은 뒤 한 번만 저장한다.
  function updateCell(index: number, text: string) {
    const next = board.map((c) => (c.index === index ? { ...c, text } : c))
    setLocalBoard(next)
    dirty.current = true
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => {
      setBoard(next).finally(() => {
        dirty.current = false
      })
    }, 500)
  }

  /** 준비 완료처럼 즉시 반영돼야 하는 시점엔 대기 중인 저장을 먼저 밀어낸다 */
  async function flushBoard() {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    if (!dirty.current) return
    await setBoard(board)
    dirty.current = false
  }

  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  }, [])

  async function handleReady() {
    await flushBoard()
    await setReady(true, board)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const filled = isBoardFilled(board)
  const readyCount = players.filter((p) => p.is_ready).length
  const activeCount = players.filter((p) => !p.is_eliminated).length

  return (
    <AppShell title="Projects" heading={`${roomKey(room.game_type, room.room_number)} board`}>
      {me.is_eliminated ? (
        <p className="notice notice--muted">시간 내에 채우지 못해 이번 라운드는 관전으로 전환됐어요.</p>
      ) : me.is_ready ? (
        <p className="notice">
          제출 완료. 다른 팀원을 기다리는 중… ({readyCount}/{activeCount})
        </p>
      ) : (
        <>
          {remaining !== null && <p className="notice notice--timer">남은 시간 {remaining}초</p>}
          <p className="field-hint">'{room.topic}'에 맞는 항목을 각 칸에 입력해주세요.</p>
        </>
      )}

      <ColumnHeaders roomId={room.id} size={room.size} />
      <div className="board-grid" style={{ gridTemplateColumns: `repeat(${room.size}, 1fr)` }}>
        {board.map((cell) => (
          <div key={cell.index} className="card">
            <CardTop cell={cell} />
            <input
              className="card-input"
              value={cell.text}
              disabled={me.is_ready || me.is_eliminated}
              onChange={(e) => updateCell(cell.index, e.target.value)}
              placeholder="항목 입력"
            />
            <CardFooter cell={cell} />
          </div>
        ))}
      </div>

      {!me.is_ready && !me.is_eliminated && (
        <button className="doc-btn doc-btn--wide" disabled={!filled} onClick={handleReady}>
          준비 완료
        </button>
      )}

      <button className="doc-btn doc-btn--ghost" onClick={copyLink}>
        {copied ? '링크 복사됨' : '초대 링크 복사'}
      </button>

      <div className="player-strip">
        {players.map((p) => (
          <span
            key={p.id}
            className={`player-chip ${p.is_ready ? 'is-ready' : ''} ${p.is_eliminated ? 'is-out' : ''}`}
          >
            {p.name}
          </span>
        ))}
      </div>
    </AppShell>
  )
}
