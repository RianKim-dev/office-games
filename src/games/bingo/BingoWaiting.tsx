import { useState } from 'react'
import type { Player, Room } from '../../lib/types'
import { randomTopic } from '../../lib/topics'
import { roomKey } from '../../lib/gameTypes'
import AppShell from '../../components/AppShell'
import { DetailRow, DetailsPanel } from '../../components/DetailsPanel'
import PlayerRoster from './PlayerRoster'

interface Props {
  room: Room
  me: Player
  players: Player[]
  isHost: boolean
  setTopic: (topic: string) => Promise<void>
  startGame: () => Promise<void>
  kickPlayer: (targetId: string) => Promise<void>
  leaveRoom: () => Promise<void>
  renameRoom: (name: string) => Promise<void>
}

export default function BingoWaiting({
  room,
  me,
  players,
  isHost,
  setTopic,
  startGame,
  kickPlayer,
  leaveRoom,
  renameRoom,
}: Props) {
  const [customTopic, setCustomTopic] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(room.display_name)

  const enoughPlayers = players.length >= 2
  const canStart = enoughPlayers && !!room.topic && !starting

  async function handleStart() {
    if (!canStart) return
    setStarting(true)
    try {
      await startGame()
    } finally {
      setStarting(false)
    }
  }

  async function applyCustomTopic() {
    if (!customTopic.trim()) return
    await setTopic(customTopic)
    setUseCustom(false)
    setCustomTopic('')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function saveName() {
    await renameRoom(nameDraft)
    setEditingName(false)
  }

  return (
    <AppShell
      title="Projects"
      heading={`${roomKey(room.game_type, room.room_number)} board`}
      aside={
        <DetailsPanel>
          <DetailRow label="프로젝트">
            {isHost && editingName ? (
              <div className="doc-join-input-wrap">
                <input
                  className="doc-input"
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') saveName()
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                />
                <button className="btn-secondary" onClick={saveName}>
                  저장
                </button>
              </div>
            ) : (
              <div className="detail-inline">
                <span>{room.display_name}</span>
                {isHost && (
                  <button
                    className="btn-quiet"
                    onClick={() => {
                      setNameDraft(room.display_name)
                      setEditingName(true)
                    }}
                  >
                    수정
                  </button>
                )}
              </div>
            )}
          </DetailRow>

          <DetailRow label="키">
            <span className="detail-mono">{roomKey(room.game_type, room.room_number)}</span>
          </DetailRow>

          <DetailRow label="라운드">{room.round_number}번째</DetailRow>

          <DetailRow label={`참가자 (${players.length}/${room.max_players})`}>
            <PlayerRoster
              room={room}
              players={players}
              meId={me.id}
              isHost={isHost}
              onKick={kickPlayer}
            />
          </DetailRow>

          <div className="btn-row">
            <button className="btn-secondary" onClick={copyLink}>
              {copied ? '복사됨' : '초대 링크 복사'}
            </button>
            <button className="btn-danger-quiet" onClick={leaveRoom}>
              나가기
            </button>
          </div>
        </DetailsPanel>
      }
    >
      <section className="panel">
        <h2 className="panel-title">라운드 설정</h2>

        <div className="panel-body">
          <div className="field">
            <span className="field-label">주제</span>
            {isHost && useCustom ? (
              <div className="doc-join-input-wrap">
                <input
                  className="doc-input"
                  value={customTopic}
                  autoFocus
                  onChange={(e) => setCustomTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') applyCustomTopic()
                    if (e.key === 'Escape') setUseCustom(false)
                  }}
                  placeholder="주제를 직접 입력하세요"
                />
                <button className="btn-secondary" disabled={!customTopic.trim()} onClick={applyCustomTopic}>
                  적용
                </button>
                <button className="btn-quiet" onClick={() => setUseCustom(false)}>
                  취소
                </button>
              </div>
            ) : (
              <div className="topic-display">
                <span className="topic-display-word">{room.topic ?? '주제를 정하는 중…'}</span>
                {isHost && (
                  <div className="btn-row">
                    <button className="btn-secondary" onClick={() => setTopic(randomTopic())}>
                      다른 주제
                    </button>
                    <button className="btn-secondary" onClick={() => setUseCustom(true)}>
                      직접 입력
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="field">
            <span className="field-label">규칙</span>
            <span className="rule-summary">
              {room.size}×{room.size} · {room.win_condition}빙고 승리 ·{' '}
              {room.timed ? '시간제한 있음 (채우기 2분 · 턴당 30초)' : '시간제한 없음'}
            </span>
          </div>

          {isHost ? (
            <>
              <button className="btn-primary btn-block" disabled={!canStart} onClick={handleStart}>
                {starting ? '시작하는 중…' : '게임 시작'}
              </button>
              {!enoughPlayers && (
                <p className="field-hint">최소 2명이 모여야 시작할 수 있어요.</p>
              )}
            </>
          ) : (
            <div className="status-note status-note--wait">
              <span className="status-note-icon">◷</span>
              <span>방장이 게임을 시작하길 기다리는 중이에요.</span>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  )
}
