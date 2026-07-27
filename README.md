# office-games

회사에서 동료와 실시간으로 즐길 수 있는 미니게임 웹앱. 1단계로 **칸반형 빙고**만 구현되어 있음 (끝말잇기는 2단계 예정).

## 무엇을 하는가

- 랜딩은 지라 스타일 **Projects 목록** — 방 하나 = 프로젝트 하나(`BINGO-14` 같은 키), 상태 pill(`TO DO`/`IN REVIEW`/`IN PROGRESS`/`DONE`)로 참여 가능 여부를 보여줌
- 방(=프로젝트)을 만들면 대기 로비(`waiting`)에 들어가고, 정원이 찰 때까지 자유롭게 입장/퇴장 가능. 방장이 강퇴 가능
- 방장이 "게임 시작"을 누르는 순간 주제(랜덤/리롤/직접입력)를 정하고 빙고 시작 — 각자 빙고판(4×4/5×5)을 채운 뒤, 턴제로 카드를 제시/매칭
- 빙고판은 "업무 카드보드"처럼 위장 — 더미 태그/아바타/날짜 라벨, 컬럼 헤더로 실제 칸반 보드처럼 보이게 함
- 게임이 끝나도 방은 사라지지 않고, 방장이 "새 라운드 시작"을 누르면 같은 방에서 다음 라운드 진행
- 로그인 없이 표시 이름만 입력. 방은 누구나 자유롭게 생성 가능하되 `pg_cron` + 클라이언트 보조 스윕으로 자동 정리됨

## 로컬 실행

```bash
npm install
cp .env.local.example .env.local   # Supabase URL/anon key 입력
npm run dev
```

## Supabase 설정

`supabase/SETUP.md` 참고. 요약:
1. 프로젝트 생성 → `supabase/schema.sql` 실행 (테이블 + RLS + Realtime + 자동 정리 cron + 방 번호 카운터)
2. Settings → API의 Project URL + anon/publishable 키를 `.env.local`에

**주의**: `schema.sql`을 이미 한 번 실행한 프로젝트에서 스키마가 바뀐 뒤 다시 실행해도, `rooms`/`players`처럼 이미 있는 테이블에는 새 컬럼이 자동으로 안 생긴다 (`create table if not exists`는 기존 테이블을 건드리지 않음). 그래서 `schema.sql` 안에 `alter table ... add column if not exists` 마이그레이션 블록을 넣어뒀다 — 스키마가 바뀔 때마다 그냥 전체를 다시 실행하면 됨.

## 배포 (Vercel)

새 GitHub 저장소 생성 → push → Vercel에서 Import(연동) → 환경변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) 입력.
이후 `main`에 push할 때마다 자동 재배포.

## 현재 상태 (2026-07-24 기준)

- 빙고 1단계 + 2단계(로비/강퇴/멀티라운드/Projects 목록) 코드 완성, 빌드/타입체크 통과
- Supabase 연결 완료, `schema.sql` 마이그레이션 적용 완료 — 로컬에서 방 생성/목록 실시간 반영 확인함
- Vercel 배포됨: https://office-games-sigma.vercel.app

### ⚠️ 남은 작업

1. **Vercel 환경변수 설정 (필수, 아직 안 됨)** — 배포본 콘솔에 "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다" 경고가 뜬다.
   Vercel 프로젝트 → Settings → Environment Variables에 `.env.local`과 같은 두 값을 넣고 **재배포**해야 배포본이 동작한다.
   (Vite는 빌드 시점에 env를 인라인하므로, 변수만 추가하고 재배포하지 않으면 반영되지 않는다.)
2. 브라우저 탭 여러 개로 실제 대전 e2e 테스트 (로비 입장 → 게임 시작 → 턴 진행 → 강퇴 → 새 라운드)
3. 끝말잇기는 미착수 (`src/lib/gameTypes.ts`에 게임 타입 확장 지점만 마련됨)

### 코드 검수에서 고친 것 (2026-07-24)

- `useProjectList`: 네트워크 실패 시 `loading`이 영원히 true로 남아 "불러오는 중…"에 멈추던 문제 (배포본에서 실제 발생). try/catch + error 상태 추가
- `reconcileRoomMembership`: 방장이 나가면 방에 방장이 없어져 아무도 시작/강퇴를 못 하던 문제. 가장 먼저 들어온 사람에게 자동 위임
- `BingoFill`: 키 입력마다 DB 쓰기 + realtime 에코가 로컬 입력을 덮어쓰던 레이스. 500ms 디바운스 + 입력 중 에코 무시
- `setReady(ready, board?)`: 방금 저장한 보드의 에코가 늦어 "준비 완료"가 조용히 무시되던 레이스
- `BingoRoom`: localStorage의 참가 정보가 만료되면 참가 폼이 안 뜨고 오류 화면에 갇히던 문제. "다시 입장" 경로 추가
