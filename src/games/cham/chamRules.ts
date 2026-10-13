/**
 * 참참참 규칙 — 순수 함수만 있다. 웹캠도 네트워크도 React도 모른다.
 *
 * 튜닝할 값은 전부 TUNING 한 곳에 모아뒀다. 실플레이 후 균형을 고치는 일이
 * 반복될 게 뻔하므로 흩어놓지 않는다.
 */
import type { VisionSample } from './vision'

export type Choice = 'left' | 'center' | 'right'
export type Grade = 'A' | 'B' | 'C'

export type FoulReason =
  | 'no_face' // 얼굴을 놓침 (너무 많이 돌렸거나 프레임 밖)
  | 'dead_zone' // 어중간하게 걸침 — 가운데도 좌우도 아님
  | 'unstable_center' // 가운데를 골랐는데 흔들림이 너무 큼
  | 'early_move' // 부정출발
  | 'no_hand' // 손이 안 보임
  | 'timeout' // 커밋 마감을 놓침

export interface Verdict {
  /** null이면 파울 */
  choice: Choice | null
  /** 공격은 등급이 없어 항상 null. 수비는 성공 시 A/B/C */
  grade: Grade | null
  foul: FoulReason | null
}

export const TUNING = {
  /** 비트 간격. "참 — 참 — 참!" */
  beatMs: 600,
  /** 마지막 비트(t0)부터 커밋 마감까지 */
  commitWindowMs: 500,
  /** 이 시점 이후 구간의 중앙값을 정착값으로 쓴다 (t0 기준 상대 ms) */
  settleFromMs: 350,

  /** 부정출발 감시 구간 (t0 기준 상대 ms). 마지막 150ms는 예비동작으로 봐준다 */
  falseStartFromMs: -1200,
  falseStartToMs: -150,

  /** 수비 — 정착 각도(도) */
  centerMaxDeg: 8, // 이 밑이면 '가운데'
  sideMinDeg: 18, // 이 위면 '좌/우'. 사이는 죽은 구간 = 파울
  sideGradeBDeg: 32,
  sideGradeADeg: 45,

  /** 수비 — 가운데를 골랐을 때 윈도우 전체의 최대 이탈(도) */
  centerGradeADeg: 6,
  centerGradeBDeg: 8,
  centerGradeCDeg: 10,

  /** 공격 — 손목과 얼굴 중심의 거리(프레임 너비 대비) */
  handCenterMax: 0.05,
  handSideMin: 0.1,

  /** 점수 */
  scoreByGrade: { A: 3, B: 2, C: 1 } as Record<Grade, number>,
  scoreOnHit: 3,

  /** 양쪽 파울이 이만큼 연달아 나오면 라운드를 넘긴다 (스톨링 방지) */
  maxVoidRounds: 2,
} as const

export const TARGET_SCORES = [7, 15, 30] as const
export type TargetScore = (typeof TARGET_SCORES)[number]

// ─── 측정값 → 판정 ────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function foul(reason: FoulReason): Verdict {
  return { choice: null, grade: null, foul: reason }
}

/**
 * 수비 판정. 정착 각도가 방향과 좌/우 등급을 정하고, 가운데일 때만
 * 윈도우 전체의 최대 이탈로 등급을 매긴다.
 *
 * 좌우는 "얼마나 확실히 돌렸나", 가운데는 "얼마나 안 흔들렸나"를 재는 것이라
 * 재는 대상이 다르다. 둘 다 A를 노릴 수 있어야 3택이 살아있다.
 */
export function classifyDefense(settleDeg: number, windowMaxAbsDeg: number): Verdict {
  const abs = Math.abs(settleDeg)

  if (abs < TUNING.centerMaxDeg) {
    if (windowMaxAbsDeg <= TUNING.centerGradeADeg) return { choice: 'center', grade: 'A', foul: null }
    if (windowMaxAbsDeg <= TUNING.centerGradeBDeg) return { choice: 'center', grade: 'B', foul: null }
    if (windowMaxAbsDeg <= TUNING.centerGradeCDeg) return { choice: 'center', grade: 'C', foul: null }
    // 돌렸다가 돌아온 것. 가운데를 지킨 게 아니다
    return foul('unstable_center')
  }

  if (abs < TUNING.sideMinDeg) return foul('dead_zone')

  const choice: Choice = settleDeg > 0 ? 'left' : 'right'
  const grade: Grade =
    abs >= TUNING.sideGradeADeg ? 'A' : abs >= TUNING.sideGradeBDeg ? 'B' : 'C'
  return { choice, grade, foul: null }
}

/** 공격 판정. 등급 없이 3택만 가른다 */
export function classifyAttack(handOffset: number): Verdict {
  const abs = Math.abs(handOffset)
  if (abs <= TUNING.handCenterMax) return { choice: 'center', grade: null, foul: null }
  if (abs < TUNING.handSideMin) return foul('dead_zone')
  return { choice: handOffset > 0 ? 'left' : 'right', grade: null, foul: null }
}

function inWindow(samples: VisionSample[], t0: number, fromMs: number, toMs: number) {
  return samples.filter((s) => s.t - t0 >= fromMs && s.t - t0 <= toMs)
}

/** 카운트다운 중에 이미 고개를 돌려버렸는지 */
export function detectFalseStart(samples: VisionSample[], t0: number): boolean {
  const watched = inWindow(samples, t0, TUNING.falseStartFromMs, TUNING.falseStartToMs)
  return watched.some((s) => s.faceFound && Math.abs(s.yawDeg) >= TUNING.sideMinDeg)
}

/**
 * 커밋 윈도우의 샘플들로 수비를 판정한다.
 * 부정출발을 먼저 보고, 그다음 정착값과 윈도우 최대 이탈을 낸다.
 */
export function judgeDefense(samples: VisionSample[], t0: number): Verdict {
  if (detectFalseStart(samples, t0)) return foul('early_move')

  const window = inWindow(samples, t0, 0, TUNING.commitWindowMs)
  const settle = inWindow(samples, t0, TUNING.settleFromMs, TUNING.commitWindowMs)
  if (window.length === 0 || settle.length === 0) return foul('timeout')

  // 정착 구간에서 얼굴을 놓쳤으면 판정할 수 없다 (대개 90° 가까이 돌린 경우)
  const settleFaces = settle.filter((s) => s.faceFound)
  if (settleFaces.length === 0) return foul('no_face')

  const settleDeg = median(settleFaces.map((s) => s.yawDeg))
  const windowMaxAbs = Math.max(
    ...window.filter((s) => s.faceFound).map((s) => Math.abs(s.yawDeg)),
    0,
  )
  return classifyDefense(settleDeg, windowMaxAbs)
}

/** 커밋 윈도우의 샘플들로 공격을 판정한다 */
export function judgeAttack(samples: VisionSample[], t0: number): Verdict {
  const settle = inWindow(samples, t0, TUNING.settleFromMs, TUNING.commitWindowMs)
  if (settle.length === 0) return foul('timeout')

  const withHand = settle.filter((s) => s.handFound)
  // 정착 구간의 절반 이상에서 손이 보여야 인정한다 (스쳐 지나간 손 배제)
  if (withHand.length * 2 < settle.length) return foul('no_hand')

  return classifyAttack(median(withHand.map((s) => s.handOffset)))
}

// ─── 매치 진행 ────────────────────────────────────────────────────────────

export interface MatchState {
  targetScore: TargetScore
  players: [string, string]
  scores: Record<string, number>
  attackerId: string
  /** 1부터. 한 이닝 = 두 사람이 각각 수비 런을 1회씩 마친 것 */
  inning: number
  /** 이번 이닝에서 이미 수비 런을 마친 사람 */
  defendedThisInning: string[]
  /** 현재 런에서 수비자가 벌어들인 점수와 회피 횟수 (표시용) */
  runScore: number
  runDodges: number
  /** 연속 무효 라운드 수 */
  voidStreak: number
  winnerId: string | null
  /** 목표 점수에 도달했는데 동점이라 이닝을 더 도는 중 */
  suddenDeath: boolean
}

export type OutcomeKind =
  | 'dodge' // 수비 성공 — 점수를 얻고 같은 역할로 계속
  | 'hit' // 적중 — 런 종료, 역할 교대
  | 'void' // 양쪽 파울 — 아무 일도 없음, 재시도
  | 'run_void' // 무효가 반복돼 런을 강제 종료 (스톨링 방지)

export interface RoundOutcome {
  kind: OutcomeKind
  attacker: Verdict
  defender: Verdict
  /** 이번 라운드에 오간 점수 */
  points: number
  scorerId: string | null
  runEnded: boolean
  inningEnded: boolean
  matchEnded: boolean
}

export function defenderIdOf(state: MatchState): string {
  return state.players[0] === state.attackerId ? state.players[1] : state.players[0]
}

export function createMatch(
  players: [string, string],
  targetScore: TargetScore,
  firstAttackerId: string,
): MatchState {
  return {
    targetScore,
    players,
    scores: { [players[0]]: 0, [players[1]]: 0 },
    attackerId: firstAttackerId,
    inning: 1,
    defendedThisInning: [],
    runScore: 0,
    runDodges: 0,
    voidStreak: 0,
    winnerId: null,
    suddenDeath: false,
  }
}

/**
 * 라운드 하나를 해소해 다음 상태와 결과를 낸다.
 *
 * 파울 우선순위가 규칙의 핵심이다:
 *  - 양쪽 파울 → 무효 (아무도 손해 안 봄). 단 연속되면 런을 끊는다
 *  - 수비만 파울 → 적중과 동일하게 취급. 참참참은 반드시 고개를 돌려야 하는 게임이다
 *  - 공격만 파울 → 수비 성공. 등급은 수비자가 실제 수행한 대로 준다
 */
export function resolveRound(
  state: MatchState,
  attacker: Verdict,
  defender: Verdict,
): { state: MatchState; outcome: RoundOutcome } {
  if (state.winnerId) throw new Error('이미 끝난 매치입니다')

  const defenderId = defenderIdOf(state)
  const bothFouled = attacker.foul !== null && defender.foul !== null

  if (bothFouled) {
    const voidStreak = state.voidStreak + 1
    // 반복되는 무효는 스톨링일 수 있다. 아무도 점수를 못 얻은 채 런만 끊는다
    if (voidStreak >= TUNING.maxVoidRounds) {
      return endRun(state, {
        kind: 'run_void',
        attacker,
        defender,
        points: 0,
        scorerId: null,
      })
    }
    return {
      state: { ...state, voidStreak },
      outcome: {
        kind: 'void',
        attacker,
        defender,
        points: 0,
        scorerId: null,
        runEnded: false,
        inningEnded: false,
        matchEnded: false,
      },
    }
  }

  const hit =
    defender.foul !== null ||
    (attacker.foul === null && attacker.choice === defender.choice)

  if (hit) {
    const points = TUNING.scoreOnHit
    const next: MatchState = {
      ...state,
      scores: { ...state.scores, [state.attackerId]: state.scores[state.attackerId] + points },
      voidStreak: 0,
    }
    return endRun(next, {
      kind: 'hit',
      attacker,
      defender,
      points,
      scorerId: state.attackerId,
    })
  }

  // 수비 성공. 공격이 파울이어도 수비는 자기가 해낸 등급을 그대로 받는다
  const points = defender.grade ? TUNING.scoreByGrade[defender.grade] : 0
  return {
    state: {
      ...state,
      scores: { ...state.scores, [defenderId]: state.scores[defenderId] + points },
      runScore: state.runScore + points,
      runDodges: state.runDodges + 1,
      voidStreak: 0,
    },
    outcome: {
      kind: 'dodge',
      attacker,
      defender,
      points,
      scorerId: defenderId,
      runEnded: false,
      inningEnded: false,
      matchEnded: false,
    },
  }
}

/**
 * 런을 끝내고 역할을 교대한다. 두 사람이 다 수비를 마쳤으면 이닝이 끝나고,
 * 그때만 승리를 판정한다.
 *
 * 점수 대부분이 수비에서 나오므로 수비 기회 수가 같아야 공평하다. 목표 점수에
 * 먼저 닿았다고 바로 끝내면 선공이 유리해진다. 이닝이 끝났는데도 동점이면
 * 승자가 갈릴 때까지 이닝을 더 돈다(서든데스).
 */
function endRun(
  state: MatchState,
  partial: Pick<RoundOutcome, 'kind' | 'attacker' | 'defender' | 'points' | 'scorerId'>,
): { state: MatchState; outcome: RoundOutcome } {
  const defenderId = defenderIdOf(state)
  const defended = [...state.defendedThisInning, defenderId]
  const inningEnded = state.players.every((p) => defended.includes(p))

  let winnerId: string | null = null
  let suddenDeath = state.suddenDeath

  if (inningEnded) {
    const [a, b] = state.players
    const best = Math.max(state.scores[a], state.scores[b])
    if (best >= state.targetScore) {
      if (state.scores[a] !== state.scores[b]) {
        winnerId = state.scores[a] > state.scores[b] ? a : b
      } else {
        // 목표엔 닿았는데 동점 — 이닝을 하나 더 돈다
        suddenDeath = true
      }
    }
  }

  return {
    state: {
      ...state,
      // 수비하던 사람이 다음 라운드의 공격자가 된다
      attackerId: defenderId,
      defendedThisInning: inningEnded ? [] : defended,
      inning: inningEnded ? state.inning + 1 : state.inning,
      runScore: 0,
      runDodges: 0,
      voidStreak: 0,
      winnerId,
      suddenDeath,
    },
    outcome: {
      ...partial,
      runEnded: true,
      inningEnded,
      matchEnded: winnerId !== null,
    },
  }
}

export const FOUL_LABEL: Record<FoulReason, string> = {
  no_face: '얼굴을 놓쳤어요',
  dead_zone: '어중간해요',
  unstable_center: '흔들렸어요',
  early_move: '부정출발',
  no_hand: '손이 안 보여요',
  timeout: '시간 초과',
}

export const CHOICE_LABEL: Record<Choice, string> = {
  left: '왼쪽',
  center: '가운데',
  right: '오른쪽',
}
