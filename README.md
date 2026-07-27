# office-games

회사에서 동료와 실시간으로 즐길 수 있는 미니게임 웹앱. 1단계로 **칸반형 빙고**만 구현되어 있음 (끝말잇기는 2단계 예정).

## 무엇을 하는가

- 랜딩은 지라 스타일 **Projects 목록** — 방 하나 = 프로젝트 하나(`BINGO-14` 같은 키), 상태 pill(`TO DO`/`IN REVIEW`/`IN PROGRESS`/`DONE`)로 참여 가능 여부를 보여줌
- 방(=프로젝트)을 만들면 대기 로비(`waiting`)에 들어가고, 정원이 찰 때까지 자유롭게 입장/퇴장 가능. 방장이 강퇴 가능
- 방장이 "게임 시작"을 누르는 순간 주제(랜덤/리롤/직접입력)를 정하고 빙고 시작 — 각자 빙고판(4×4/5×5)을 채운 뒤, 턴제로 카드를 제시/매칭
- 빙고판은 "업무 카드보드"처럼 위장 — 더미 태그/아바타/날짜 라벨, 컬럼 헤더로 실제 칸반 보드처럼 보이게 함
- 게임이 끝나도 방은 사라지지 않고, 방장이 "새 라운드 시작"을 누르면 같은 방에서 다음 라운드 진행
- 로그인 없음. **사이트에 처음 들어올 때 표시 이름만 한 번 정하면** 이후 방 생성/입장에서 다시 묻지 않는다 (목록에서 방을 클릭하면 바로 입장). 이름은 상단 툴바의 이름 칩을 눌러 언제든 변경 가능
- 방은 누구나 자유롭게 생성 가능하되 `pg_cron` + 클라이언트 보조 스윕으로 자동 정리됨

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

### ⚠️ 스키마 마이그레이션 필요 (3단계 턴 제출 모델)

턴 제출 모델을 도입하면서 컬럼이 두 개 늘었다. **Supabase SQL Editor에서 `supabase/schema.sql`을 다시 실행**해야 게임이 동작한다 (여러 번 실행해도 안전). 급하면 이 두 줄만 실행해도 된다:

```sql
alter table rooms   add column if not exists turn_seq int not null default 0;
alter table players add column if not exists submitted_turn int;
```

### ⚠️ 남은 작업

1. **Vercel 환경변수 설정 (필수, 아직 안 됨)** — 배포본 콘솔에 "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다" 경고가 뜬다.
   Vercel 프로젝트 → Settings → Environment Variables에 `.env.local`과 같은 두 값을 넣고 **재배포**해야 배포본이 동작한다.
   (Vite는 빌드 시점에 env를 인라인하므로, 변수만 추가하고 재배포하지 않으면 반영되지 않는다.)
2. 끝말잇기는 미착수 (`src/lib/gameTypes.ts`에 게임 타입 확장 지점만 마련됨)

### e2e로 검증 완료 (2인 실플레이, 로컬 + 실제 Supabase)

방 생성 → 목록 실시간 등장 → 목록에서 입장 → 로비(정원/방장 컨트롤/게스트 대기 화면) → 게임 시작 →
16칸 입력(글자 유실 없음) → 양쪽 준비 완료 → 자동으로 게임 시작 → 턴 순서 셔플 및 턴 강제 →
카드 제시 → 상대 실시간 수신 → 매칭(완료 스탬프 + "원문:" 캡션) → 다음 턴 → 빙고 판정 →
결과 화면 양쪽 동기화 → 새 라운드 시작(waiting 복귀, round_number 증가, 보드 초기화) →
강퇴(양쪽 실시간 반영 + 강퇴된 사람 안내) → 채우기 마감 자동 탈락

**아직 e2e로 안 본 것**: 턴 30초 타이머 자동 넘김(코드는 위 lazy 이슈와 무관하게 `advanceTurn`을 await하므로 정상일 것으로 보이나 실제로 30초를 기다려보지는 않음), 3인 이상 동시 플레이

### e2e 테스트에서 잡은 것 (2026-07-24) — 정적 검사로는 절대 안 잡히는 것들

- **`await` 없는 supabase 호출은 아예 전송되지 않는다.** supabase-js의 쿼리 빌더는 lazy해서 `.then()`(=await)을 호출해야 HTTP 요청이 나간다. `useBingoRoom`의 두 곳이 await 없이 쓰여 완전히 죽은 코드였다:
  - 전원 준비 완료 시 `playing`으로 전환 → **게임이 아예 시작되지 않았다**
  - 채우기 마감 시 자동 탈락 → 시간제한 모드에서 탈락이 동작하지 않았다
- **realtime DELETE 이벤트에 필터를 걸면 안 된다.** Postgres가 DELETE에 실어주는 `old` 레코드에는 기본키만 들어있어서(REPLICA IDENTITY DEFAULT) `room_id=eq.…` 필터가 절대 매칭되지 않고 이벤트가 통째로 버려진다. 그래서 **강퇴/퇴장이 어느 화면에도 반영되지 않았다.** DELETE는 필터 없이 구독하고 로컬 목록에 있는 id일 때만 제거하도록 변경

### 코드 검수에서 고친 것 (2026-07-24)

- `useProjectList`: 네트워크 실패 시 `loading`이 영원히 true로 남아 "불러오는 중…"에 멈추던 문제 (배포본에서 실제 발생). try/catch + error 상태 추가
- `reconcileRoomMembership`: 방장이 나가면 방에 방장이 없어져 아무도 시작/강퇴를 못 하던 문제. 가장 먼저 들어온 사람에게 자동 위임
- `BingoFill`: 키 입력마다 DB 쓰기 + realtime 에코가 로컬 입력을 덮어쓰던 레이스. 500ms 디바운스 + 입력 중 에코 무시
- `setReady(ready, board?)`: 방금 저장한 보드의 에코가 늦어 "준비 완료"가 조용히 무시되던 레이스
- `BingoRoom`: localStorage의 참가 정보가 만료되면 참가 폼이 안 뜨고 오류 화면에 갇히던 문제. "다시 입장" 경로 추가
