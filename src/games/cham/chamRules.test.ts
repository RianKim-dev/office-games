import { describe, expect, it } from 'vitest'
import {
  TUNING,
  classifyAttack,
  classifyDefense,
  createMatch,
  defenderIdOf,
  judgeAttack,
  judgeDefense,
  resolveRound,
  type MatchState,
  type Verdict,
} from './chamRules'
import type { VisionSample } from './vision'

const T0 = 10_000

/** -1200ms ~ +550ms 구간을 60fps 샘플로 채운다 (t는 t0 기준 상대 ms) */
function samples(opts: {
  yawAt?: (t: number) => number
  handAt?: (t: number) => number
  faceFoundAt?: (t: number) => boolean
  handFoundAt?: (t: number) => boolean
}): VisionSample[] {
  const out: VisionSample[] = []
  for (let t = -1200; t <= 550; t += 16) {
    out.push({
      t: T0 + t,
      faceFound: opts.faceFoundAt ? opts.faceFoundAt(t) : true,
      yawDeg: opts.yawAt ? opts.yawAt(t) : 0,
      handFound: opts.handFoundAt ? opts.handFoundAt(t) : true,
      handOffset: opts.handAt ? opts.handAt(t) : 0,
      debug: null,
    })
  }
  return out
}

/** t0부터 300ms에 걸쳐 target까지 돌리고 유지 */
const turnTo = (target: number) => (t: number) =>
  t <= 0 ? 0 : Math.sign(target) * Math.min(Math.abs(target), (t / 300) * Math.abs(target))

const brief = (v: Verdict) => [v.choice, v.grade, v.foul]

describe('classifyDefense', () => {
  it('가만히 있으면 가운데 A', () => {
    expect(brief(classifyDefense(2, 3))).toEqual(['center', 'A', null])
  })

  it('가운데인데 흔들리면 등급이 내려간다', () => {
    expect(brief(classifyDefense(2, 9))).toEqual(['center', 'C', null])
  })

  it('돌렸다가 제자리로 돌아오면 가운데를 지킨 게 아니라 파울', () => {
    expect(brief(classifyDefense(2, 40))).toEqual([null, null, 'unstable_center'])
  })

  it('가운데와 좌우 사이의 죽은 구간은 파울', () => {
    expect(brief(classifyDefense(12, 12))).toEqual([null, null, 'dead_zone'])
  })

  it.each([
    [20, 'C'],
    [35, 'B'],
    [50, 'A'],
  ])('왼쪽 %d도는 %s등급', (deg, grade) => {
    expect(brief(classifyDefense(deg, deg))).toEqual(['left', grade, null])
  })

  it('음수 yaw는 오른쪽', () => {
    expect(brief(classifyDefense(-50, 50))).toEqual(['right', 'A', null])
  })
})

describe('classifyAttack', () => {
  it.each([
    [0.02, 'center', null],
    [0.2, 'left', null],
    [-0.2, 'right', null],
  ])('오프셋 %f → %s', (offset, choice) => {
    expect(classifyAttack(offset).choice).toBe(choice)
  })

  it('가운데와 좌우 사이는 파울', () => {
    expect(brief(classifyAttack(0.07))).toEqual([null, null, 'dead_zone'])
  })
})

describe('judgeDefense — 커밋 윈도우', () => {
  it('제대로 돌려서 버티면 A', () => {
    expect(brief(judgeDefense(samples({ yawAt: turnTo(48) }), T0))).toEqual(['left', 'A', null])
  })

  it('얕게 돌리면 C', () => {
    expect(brief(judgeDefense(samples({ yawAt: turnTo(22) }), T0))).toEqual(['left', 'C', null])
  })

  // 정착값을 쓰는 이유. 최대각을 썼다면 이게 A로 잡혔을 것이다
  it('홱 튕겼다 돌아오면 파울', () => {
    const flick = (t: number) => {
      if (t <= 0) return 0
      return t < 250 ? 60 * (t / 250) : Math.max(0, 60 - 60 * ((t - 250) / 150))
    }
    expect(brief(judgeDefense(samples({ yawAt: flick }), T0))).toEqual([
      null,
      null,
      'unstable_center',
    ])
  })

  it('미세하게 흔들려도 가운데 A', () => {
    expect(brief(judgeDefense(samples({ yawAt: (t) => 3 * Math.sin(t / 80) }), T0))).toEqual([
      'center',
      'A',
      null,
    ])
  })

  it('카운트다운 중에 이미 돌아가 있으면 부정출발', () => {
    expect(brief(judgeDefense(samples({ yawAt: (t) => (t < -300 ? 30 : 48) }), T0))).toEqual([
      null,
      null,
      'early_move',
    ])
  })

  it('마지막 150ms의 예비동작은 부정출발로 보지 않는다', () => {
    // 감시 구간이 끝난 뒤(-140ms)에 임계값을 훌쩍 넘겨 돌리기 시작한다
    const lateStart = (t: number) => (t < -140 ? 0 : 48)
    expect(brief(judgeDefense(samples({ yawAt: lateStart }), T0))).toEqual(['left', 'A', null])
  })

  it('감시 구간 안에서 돌아가면 부정출발로 잡는다', () => {
    const tooEarly = (t: number) => (t < -160 ? 0 : 48)
    expect(judgeDefense(samples({ yawAt: tooEarly }), T0).foul).toBe('early_move')
  })

  it('너무 많이 돌려 얼굴을 놓치면 파울', () => {
    const s = samples({ yawAt: (t) => (t <= 0 ? 0 : 70), faceFoundAt: (t) => t < 350 })
    expect(brief(judgeDefense(s, T0))).toEqual([null, null, 'no_face'])
  })

  it('샘플이 없으면 시간 초과', () => {
    expect(brief(judgeDefense([], T0))).toEqual([null, null, 'timeout'])
  })
})

describe('judgeAttack — 커밋 윈도우', () => {
  it('손을 왼쪽으로 뻗으면 왼쪽', () => {
    expect(judgeAttack(samples({ handAt: (t) => (t <= 0 ? 0 : 0.25) }), T0).choice).toBe('left')
  })

  it('손이 안 보이면 파울', () => {
    expect(judgeAttack(samples({ handFoundAt: () => false }), T0).foul).toBe('no_hand')
  })

  it('정착 구간의 절반 미만에서만 보이면 파울', () => {
    const s = samples({ handAt: () => 0.25, handFoundAt: (t) => t < 400 })
    expect(judgeAttack(s, T0).foul).toBe('no_hand')
  })
})

// ─── 매치 진행 ────────────────────────────────────────────────────────────

const A = 'alice'
const B = 'bob'
const dodge = (grade: 'A' | 'B' | 'C'): Verdict => ({ choice: 'left', grade, foul: null })
const attackAt = (choice: 'left' | 'right' | 'center'): Verdict => ({
  choice,
  grade: null,
  foul: null,
})
const fouled: Verdict = { choice: null, grade: null, foul: 'dead_zone' }

function match(): MatchState {
  return createMatch([A, B], 15, A) // A가 공격, B가 수비
}

describe('resolveRound', () => {
  it('방향이 다르면 수비가 등급만큼 점수를 얻고 역할은 그대로', () => {
    const { state, outcome } = resolveRound(match(), attackAt('right'), dodge('A'))
    expect(outcome.kind).toBe('dodge')
    expect(state.scores[B]).toBe(3)
    expect(state.attackerId).toBe(A)
    expect(state.runDodges).toBe(1)
    expect(outcome.runEnded).toBe(false)
  })

  it('방향이 같으면 공격이 3점을 얻고 런이 끝나며 역할이 바뀐다', () => {
    const { state, outcome } = resolveRound(match(), attackAt('left'), dodge('A'))
    expect(outcome.kind).toBe('hit')
    expect(state.scores[A]).toBe(TUNING.scoreOnHit)
    expect(state.scores[B]).toBe(0)
    expect(state.attackerId).toBe(B)
    expect(outcome.runEnded).toBe(true)
  })

  it('수비만 파울이면 적중과 같다', () => {
    const { state, outcome } = resolveRound(match(), attackAt('right'), fouled)
    expect(outcome.kind).toBe('hit')
    expect(state.scores[A]).toBe(TUNING.scoreOnHit)
  })

  it('공격만 파울이면 수비가 자기 등급 그대로 점수를 받는다', () => {
    const { state, outcome } = resolveRound(match(), fouled, dodge('B'))
    expect(outcome.kind).toBe('dodge')
    expect(state.scores[B]).toBe(2)
  })

  it('양쪽 파울이면 무효 — 아무 점수도 안 움직인다', () => {
    const { state, outcome } = resolveRound(match(), fouled, fouled)
    expect(outcome.kind).toBe('void')
    expect(state.scores).toEqual({ [A]: 0, [B]: 0 })
    expect(state.voidStreak).toBe(1)
    expect(state.attackerId).toBe(A)
  })

  it('무효가 연달아 나오면 런을 끊는다 (스톨링 방지)', () => {
    let state = match()
    for (let i = 0; i < TUNING.maxVoidRounds; i++) {
      state = resolveRound(state, fouled, fouled).state
    }
    expect(state.attackerId).toBe(B) // 역할이 바뀌었다
    expect(state.scores).toEqual({ [A]: 0, [B]: 0 }) // 아무도 점수를 못 얻었다
    expect(state.voidStreak).toBe(0)
  })

  it('성공하면 무효 연속 기록이 초기화된다', () => {
    let state = resolveRound(match(), fouled, fouled).state
    expect(state.voidStreak).toBe(1)
    state = resolveRound(state, attackAt('right'), dodge('C')).state
    expect(state.voidStreak).toBe(0)
  })

  it('끝난 매치는 더 진행할 수 없다', () => {
    const ended = { ...match(), winnerId: A }
    expect(() => resolveRound(ended, attackAt('left'), dodge('A'))).toThrow()
  })
})

describe('이닝', () => {
  it('두 사람이 각각 수비를 마쳐야 이닝이 넘어간다', () => {
    let state = match()
    expect(defenderIdOf(state)).toBe(B)

    const first = resolveRound(state, attackAt('left'), dodge('A')) // B 적중당함
    state = first.state
    expect(first.outcome.inningEnded).toBe(false)
    expect(state.inning).toBe(1)
    expect(defenderIdOf(state)).toBe(A)

    const second = resolveRound(state, attackAt('left'), dodge('A')) // A 적중당함
    state = second.state
    expect(second.outcome.inningEnded).toBe(true)
    expect(state.inning).toBe(2)
    expect(state.defendedThisInning).toEqual([])
  })

  it('런이 끝날 때마다 런 집계가 초기화된다', () => {
    let state = resolveRound(match(), attackAt('right'), dodge('A')).state
    expect(state.runScore).toBe(3)
    state = resolveRound(state, attackAt('left'), dodge('A')).state
    expect(state.runScore).toBe(0)
    expect(state.runDodges).toBe(0)
  })
})

describe('승리 판정', () => {
  /** A가 공격으로 점수를 쌓도록 적중을 반복시킨다 */
  function withScores(a: number, b: number): MatchState {
    return { ...match(), scores: { [A]: a, [B]: b } }
  }

  it('목표에 닿아도 이닝이 끝나기 전에는 확정되지 않는다', () => {
    // B가 수비 중이고 A가 목표를 넘긴 상태. A의 수비 런이 아직 안 끝났다
    const { state, outcome } = resolveRound(withScores(14, 0), attackAt('left'), dodge('A'))
    expect(state.scores[A]).toBe(17)
    expect(outcome.inningEnded).toBe(false)
    expect(outcome.matchEnded).toBe(false)
    expect(state.winnerId).toBeNull()
  })

  it('이닝이 끝나고 목표를 넘겼으면 최고 점수가 이긴다', () => {
    let state = withScores(14, 0)
    state = resolveRound(state, attackAt('left'), dodge('A')).state // A 17점, B 수비 끝
    const last = resolveRound(state, attackAt('left'), dodge('A')) // A 수비도 끝 → 이닝 종료
    expect(last.outcome.inningEnded).toBe(true)
    expect(last.state.winnerId).toBe(A)
    expect(last.outcome.matchEnded).toBe(true)
  })

  it('목표를 넘겼는데 동점이면 서든데스로 이닝을 더 돈다', () => {
    let state = { ...withScores(15, 12), attackerId: A }
    state = resolveRound(state, attackAt('right'), dodge('A')).state // B 15점, 아직 수비 중
    const first = resolveRound(state, attackAt('left'), dodge('A')) // B 런 종료
    const second = resolveRound(first.state, attackAt('left'), dodge('A')) // A 런 종료 → 이닝 끝
    expect(second.outcome.inningEnded).toBe(true)
    expect(second.state.scores[A]).toBe(second.state.scores[B])
    expect(second.state.winnerId).toBeNull()
    expect(second.state.suddenDeath).toBe(true)
  })
})
