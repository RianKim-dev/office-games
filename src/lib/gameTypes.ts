export type GameType = 'bingo'

export const GAME_TYPE_PREFIX: Record<GameType, string> = {
  bingo: 'BINGO',
}

export const GAME_TYPE_LABEL: Record<GameType, string> = {
  bingo: '빙고',
}

export function roomKey(gameType: string, roomNumber: number): string {
  const prefix = GAME_TYPE_PREFIX[gameType as GameType] ?? gameType.toUpperCase()
  return `${prefix}-${roomNumber}`
}
