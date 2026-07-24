export const BINGO_TOPICS = [
  '애니메이션',
  '만화 캐릭터',
  '게임 캐릭터',
  '디즈니 캐릭터',
  '히어로 캐릭터',
  '악당 캐릭터',
  '아이돌 그룹',
  '발라드 명곡',
  'K-POP 안무',
  '예능 프로그램',
  '드라마 명대사',
  '유명 유튜버',
  '짤/밈',
  '레트로 게임',
  '온라인 게임',
  '보드게임',
  '공포영화',
  '만화 주제가',
  '시트콤',
  '판타지 세계관',
  '연예인 별명',
  '올타임 인기가요',
  '추억의 CF',
  '게임 아이템',
]

export function randomTopic(): string {
  return BINGO_TOPICS[Math.floor(Math.random() * BINGO_TOPICS.length)]
}
