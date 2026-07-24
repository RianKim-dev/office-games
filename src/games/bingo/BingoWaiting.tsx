import { useState } from 'react'
import type { Player, Room } from '../../lib/types'
import { randomTopic } from '../../lib/topics'
import { roomKey } from '../../lib/gameTypes'
import AppShell from '../../components/AppShell'

interface Props {
  room: Room
  me: Player
  players: Player[]
  isHost: boolean
  startGame: (topic: string) => Promise<void>
  kickPlayer: (targetId: string) => Promise<void>
  leaveRoom: () => Promise<void>
  renameRoom: (name: string) => Promise<void>
}

export default function BingoWaiting({
  room,
  me,
  players,
  isHost,
  startGame,
  kickPlayer,
  leaveRoom,
  renameRoom,
}: Props) {
  const [topic, setTopic] = useState(randomTopic)
  const [customTopic, setCustomTopic] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [starting, setStarting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(room.display_name)

  const canStart = players.length >= 2 && (useCustom ? customTopic.trim().length > 0 : true)

  async function handleStart() {
    if (!canStart || starting) return
    setStarting(true)
    await startGame(useCustom ? customTopic.trim() : topic)
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
      right={
        <span className="field-hint">
          정원 {players.length}/{room.max_players}
        </span>
      }
    >
      {isHost && (
        <div className="field" style={{ marginBottom: 12 }}>
          <span className="field-label">프로젝트 이름</span>
          {editingName ? (
            <div className="doc-join-input-wrap">
              <input
                className="doc-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
              <button className="doc-btn" onClick={saveName}>
                저장
              </button>
            </div>
          ) : (
            <div className="doc-join-input-wrap">
              <span className="topic-picker-word" style={{ flex: 1 }}>
                {room.display_name}
              </span>
              <button className="doc-btn" onClick={() => setEditingName(true)}>
                수정
              </button>
            </div>
          )}
        </div>
      )}

      {isHost ? (
        <div className="topic-picker-block">
          <span className="field-label">주제</span>
          {useCustom ? (
            <div className="doc-join-input-wrap">
              <input
                className="doc-input"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="주제를 직접 입력하세요"
              />
              <button className="doc-btn" onClick={() => setUseCustom(false)}>
                랜덤으로
              </button>
            </div>
          ) : (
            <div className="topic-picker">
              <span className="topic-picker-word">{topic}</span>
              <button className="topic-picker-reroll" onClick={() => setTopic(randomTopic())}>
                다른 주제
              </button>
              <button className="topic-picker-reroll" onClick={() => setUseCustom(true)}>
                직접 입력
              </button>
            </div>
          )}

          <button className="doc-btn doc-btn--wide" disabled={!canStart || starting} onClick={handleStart}>
            {starting ? '시작하는 중…' : '게임 시작'}
          </button>
          {players.length < 2 && <p className="field-hint">최소 2명이 모여야 시작할 수 있어요.</p>}
        </div>
      ) : (
        <p className="notice notice--muted">방장이 시작하길 기다리는 중…</p>
      )}

      <button className="doc-btn doc-btn--ghost" onClick={copyLink}>
        {copied ? '링크 복사됨' : '초대 링크 복사'}
      </button>

      <div className="waiting-players">
        {players.map((p) => (
          <div key={p.id} className="waiting-player-row">
            <span>
              {p.name}
              {p.is_host && <span className="field-hint"> · 방장</span>}
            </span>
            {isHost && p.id !== me.id && (
              <button className="doc-btn" onClick={() => kickPlayer(p.id)}>
                강퇴
              </button>
            )}
          </div>
        ))}
      </div>

      {!isHost && (
        <button className="doc-btn doc-btn--ghost" onClick={leaveRoom}>
          나가기
        </button>
      )}
    </AppShell>
  )
}
