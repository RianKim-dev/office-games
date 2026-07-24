import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSavedDisplayName, getSavedPlayerId, joinBingoRoom, sweepExpiredRooms } from '../../lib/room'
import { useBingoRoom } from './useBingoRoom'
import BingoWaiting from './BingoWaiting'
import BingoFill from './BingoFill'
import BingoPlay from './BingoPlay'
import BingoResult from './BingoResult'
import AppShell from '../../components/AppShell'

export default function BingoRoom() {
  const { code } = useParams<{ code: string }>()
  const roomId = code ?? ''
  const [playerId, setPlayerId] = useState<string | null>(() =>
    roomId ? getSavedPlayerId(roomId) : null,
  )
  const [joinName, setJoinName] = useState(getSavedDisplayName())
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  useEffect(() => {
    sweepExpiredRooms()
  }, [])

  async function handleJoin() {
    if (!roomId || !joinName.trim()) return
    setJoining(true)
    setJoinError(null)
    try {
      const { playerId: id } = await joinBingoRoom(roomId, joinName.trim())
      setPlayerId(id)
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : '참여에 실패했어요')
    } finally {
      setJoining(false)
    }
  }

  if (!playerId) {
    return (
      <AppShell title="Projects" heading="프로젝트 열기">
        <div className="setup-form">
          <label className="field">
            <span className="field-label">표시 이름</span>
            <input
              className="doc-input"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="예: 김철수"
            />
          </label>
          {joinError && <p className="form-error">{joinError}</p>}
          <button
            className="doc-btn doc-btn--wide"
            disabled={!joinName.trim() || joining}
            onClick={handleJoin}
          >
            {joining ? '입장하는 중…' : '입장'}
          </button>
        </div>
      </AppShell>
    )
  }

  return <ConnectedRoom roomId={roomId} playerId={playerId} />
}

function ConnectedRoom({ roomId, playerId }: { roomId: string; playerId: string }) {
  const navigate = useNavigate()
  const {
    room,
    players,
    me,
    isHost,
    isMyTurn,
    loading,
    error,
    setBoard,
    setReady,
    presentCard,
    matchCard,
    advanceTurn,
    startGame,
    reopenRoom,
    kickPlayer,
    leaveRoom,
    renameRoom,
  } = useBingoRoom(roomId, playerId)

  const hadMe = useRef(false)
  useEffect(() => {
    if (me) hadMe.current = true
  }, [me])

  if (loading) return <div className="bare-shell notice">불러오는 중…</div>
  if (error) return <div className="bare-shell notice notice--error">{error}</div>

  if (!room) return <div className="bare-shell notice notice--error">프로젝트를 찾을 수 없어요.</div>

  if (!me) {
    if (hadMe.current) {
      return (
        <div className="bare-shell notice notice--error">
          방장에게 강퇴되었거나 방을 나갔어요.{' '}
          <button className="doc-btn" onClick={() => navigate('/')}>
            목록으로
          </button>
        </div>
      )
    }
    return <div className="bare-shell notice notice--error">프로젝트를 찾을 수 없어요.</div>
  }

  if (room.status === 'waiting') {
    return (
      <BingoWaiting
        room={room}
        me={me}
        players={players}
        isHost={isHost}
        startGame={startGame}
        kickPlayer={kickPlayer}
        leaveRoom={leaveRoom}
        renameRoom={renameRoom}
      />
    )
  }
  if (room.status === 'filling') {
    return <BingoFill room={room} me={me} players={players} setBoard={setBoard} setReady={setReady} />
  }
  if (room.status === 'playing') {
    return (
      <BingoPlay
        room={room}
        me={me}
        players={players}
        isMyTurn={isMyTurn}
        presentCard={presentCard}
        matchCard={matchCard}
        advanceTurn={advanceTurn}
      />
    )
  }
  return <BingoResult room={room} players={players} isHost={isHost} reopenRoom={reopenRoom} />
}
