import type { BingoCell } from '../../lib/types'

const DUMMY_TAGS = [
  'R2Sprint7',
  'rev54',
  'MR_Sprint2',
  'ReleasedForAEM',
  'T2_SP8',
  'team#PDT',
  'SP2',
  'CNXSP2',
  'SP1',
  'tdbcapacity',
  'tdbv2',
  'Enhancement',
  'UT-CNX',
]
const TAG_COLORS = ['green', 'gray', 'orange', 'purple', 'teal', 'pink', 'navy']
const AVATAR_COLORS = ['blue', 'teal', 'red', 'orange', 'pink', 'purple', 'gold', 'green']
const AVATAR_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'S', 'T', 'Y']
const TICKET_PREFIXES = ['HVAC', 'PRJ', 'OPS', 'SYS', 'DEV', 'CNX']
const COLUMN_NAME_POOL = [
  'DEV READY',
  'US WIP',
  'TO DO',
  'HOLD',
  'REQUESTOR ACTION',
  'BLOCKED',
  'IN REVIEW',
  'QA',
  'BACKLOG',
]

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function dummyDateLabel(): string {
  const month = 1 + Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 28)
  return `~${month}/${day}`
}

function dummyTicketCode(prefix: string): string {
  return `${prefix}-${1000 + Math.floor(Math.random() * 9000)}`
}

export function createEmptyBoard(size: number): BingoCell[] {
  const prefix = pick(TICKET_PREFIXES)
  return Array.from({ length: size * size }, (_, index) => ({
    index,
    text: '',
    cleared: false,
    tag: pick(DUMMY_TAGS),
    tagColor: pick(TAG_COLORS),
    ticketCode: dummyTicketCode(prefix),
    avatarInitial: pick(AVATAR_LETTERS),
    avatarColor: pick(AVATAR_COLORS),
    priority: Math.random() < 0.3 ? pick(['up', 'down'] as const) : null,
    dateLabel: Math.random() < 0.5 ? dummyDateLabel() : null,
  }))
}

export interface DummyColumn {
  name: string
  count: number
}

/** 보드 위에 얹는 장식용 컬럼 헤더 (진짜 칸반처럼 보이게 하는 순수 시각 요소) */
export function createDummyColumns(size: number): DummyColumn[] {
  const shuffled = [...COLUMN_NAME_POOL].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, size).map((name) => ({
    name,
    count: 3 + Math.floor(Math.random() * 170),
  }))
}

export function isBoardFilled(board: BingoCell[]): boolean {
  return board.every((cell) => cell.text.trim().length > 0)
}

export function isBoardCleared(board: BingoCell[]): boolean {
  return board.every((cell) => cell.cleared)
}

/** 완성된 줄(가로/세로/대각선) 개수를 센다 */
export function countCompletedLines(board: BingoCell[], size: number): number {
  const grid = (r: number, c: number) => board[r * size + c]?.cleared ?? false
  let lines = 0

  for (let r = 0; r < size; r++) {
    if (Array.from({ length: size }, (_, c) => grid(r, c)).every(Boolean)) lines++
  }
  for (let c = 0; c < size; c++) {
    if (Array.from({ length: size }, (_, r) => grid(r, c)).every(Boolean)) lines++
  }
  if (Array.from({ length: size }, (_, i) => grid(i, i)).every(Boolean)) lines++
  if (Array.from({ length: size }, (_, i) => grid(i, size - 1 - i)).every(Boolean)) lines++

  return lines
}

export function hasWon(board: BingoCell[], size: number, winCondition: number): boolean {
  return countCompletedLines(board, size) >= winCondition
}

/** 완성된 줄에 속한 칸 index 집합 (완성된 줄을 화면에서 강조하는 데 쓴다) */
export function completedLineCells(board: BingoCell[], size: number): Set<number> {
  const cleared = (i: number) => board[i]?.cleared ?? false
  const result = new Set<number>()
  const addIfComplete = (idx: number[]) => {
    if (idx.every(cleared)) idx.forEach((i) => result.add(i))
  }

  for (let r = 0; r < size; r++) {
    addIfComplete(Array.from({ length: size }, (_, c) => r * size + c))
  }
  for (let c = 0; c < size; c++) {
    addIfComplete(Array.from({ length: size }, (_, r) => r * size + c))
  }
  addIfComplete(Array.from({ length: size }, (_, i) => i * size + i))
  addIfComplete(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)))

  return result
}

export function remainingCount(board: BingoCell[]): number {
  return board.filter((cell) => !cell.cleared).length
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

/** 문자 바이그램 기반 유사도 (0~1). 한글에서도 무난하게 동작한다. */
function diceSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const bigrams = (s: string) => {
    const out = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      out.set(g, (out.get(g) ?? 0) + 1)
    }
    return out
  }
  const A = bigrams(a)
  const B = bigrams(b)
  let shared = 0
  for (const [g, countA] of A) {
    const countB = B.get(g)
    if (countB) shared += Math.min(countA, countB)
  }
  const total = a.length - 1 + (b.length - 1)
  return (2 * shared) / total
}

/**
 * 제시어와 고른 카드가 "그래도 같은 걸 가리키는 것 같은지" 판단한다.
 * 규칙상 토씨까지 같을 필요는 없으므로(도쿄 ↔ 도쿄타워), 느슨하게 본다.
 * 실수로 엉뚱한 카드를 내는 걸 되묻기 위한 용도일 뿐 제출을 막지는 않는다.
 */
export function looksLikeMatch(called: string, picked: string): boolean {
  const a = normalize(called)
  const b = normalize(picked)
  if (!a || !b) return true // 판단할 수 없으면 굳이 되묻지 않는다
  if (a === b) return true
  // 한쪽이 다른 쪽을 포함하면 같은 대상으로 본다 (오사카 ↔ 오사카성)
  if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) return true
  return diceSimilarity(a, b) >= 0.5
}
