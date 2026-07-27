import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  clearSavedPlayerId,
  getSavedPlayerId,
  joinBingoRoom,
  sweepExpiredRooms,
} from '../../lib/room'
import { useDisplayName } from '../../lib/useDisplayName'
import { useBingoRoom } from './useBingoRoom'
import BingoWaiting from './BingoWaiting'
import BingoFill from './BingoFill'
import BingoPlay from './BingoPlay'
import BingoResult from './BingoResult'
import AppShell from '../../components/AppShell'

export default function BingoRoom() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const roomId = code ?? ''
  const [playerId, setPlayerId] = useState<string | null>(() =>
    roomId ? getSavedPlayerId(roomId) : null,
  )
  const { name: displayName } = useDisplayName()
  const [joinError, setJoinError] = useState<string | null>(null)
  // StrictMode에서 effect가 두 번 돌아 플레이어가 중복 생성되는 걸 막는다
  const joinAttempted = useRef(false)

  useEffect(() => {
    sweepExpiredRooms()
  }, [])

  // 이름은 이미 정해져 있으므로 폼 없이 바로 입장시킨다
  useEffect(() => {
    if (playerId || !roomId || joinAttempted.current) return
    if (!displayName) {
      navigate('/')
      return
    }
    joinAttempted.current = true
    joinBingoRoom(roomId, displayName)
      .then(({ playerId: id }) => setPlayerId(id))
      .catch((e) => setJoinError(e instanceof Error ? e.message : '참여에 실패했어요'))
  }, [playerId, roomId, displayName, navigate])

  if (!playerId) {
    return (
      <AppShell title="Projects" heading="프로젝트 열기">
        {joinError ? (
          <div className="setup-form">
            <p className="form-error">{joinError}</p>
            <button className="doc-btn doc-btn--wide" onClick={() => navigate('/')}>
              목록으로
            </button>
          </div>
        ) : (
          <p className="notice notice--muted">입장하는 중…</p>
        )}
      </AppShell>
    )
  }

  return (
    <ConnectedRoom
      roomId={roomId}
      playerId={playerId}
      onResetPlayer={() => {
        clearSavedPlayerId(roomId)
        // 가드를 풀어줘야 위 자동 입장 effect가 다시 시도한다
        joinAttempted.current = false
        setJoinError(null)
        setPlayerId(null)
      }}
    />
  )
}

function ConnectedRoom({
  roomId,
  playerId,
  onResetPlayer,
}: {
  roomId: string
  playerId: string
  onResetPlayer: () => void
}) {
  const navigate = useNavigate()
  const {
    room,
    players,
    me,
    isHost,
    isMyTurn,
    loading,
    error,
    pendingSubmitters,
    setBoard,
    setReady,
    presentCard,
    submitTurn,
    advanceTurn,
    setTopic,
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
    // 저장된 참가 정보가 남아있지만 실제 플레이어 행은 사라진 경우(방이 정리됐거나 이전에 강퇴됨).
    // 그대로 두면 참가 폼이 안 뜨고 오류 화면에 갇히므로, 정리하고 다시 입장할 길을 준다.
    return (
      <div className="bare-shell notice">
        이 프로젝트의 참가 정보가 만료됐어요.{' '}
        <button className="doc-btn" onClick={onResetPlayer}>
          다시 입장
        </button>{' '}
        <button className="doc-btn" onClick={() => navigate('/')}>
          목록으로
        </button>
      </div>
    )
  }

  if (room.status === 'waiting') {
    return (
      <BingoWaiting
        room={room}
        me={me}
        players={players}
        isHost={isHost}
        setTopic={setTopic}
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
        isHost={isHost}
        isMyTurn={isMyTurn}
        pendingSubmitters={pendingSubmitters}
        presentCard={presentCard}
        submitTurn={submitTurn}
        advanceTurn={advanceTurn}
      />
    )
  }
  return <BingoResult room={room} players={players} isHost={isHost} reopenRoom={reopenRoom} />
}
