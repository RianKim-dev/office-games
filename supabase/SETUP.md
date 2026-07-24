# Supabase 설정

o11-quiz 때와 같은 절차입니다.

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행 (테이블 + RLS + Realtime + 자동 정리 cron까지 한 번에 설정됨)
3. Project Settings → API에서 **Project URL**과 **anon public** 키 확인
4. 프로젝트 루트에 `.env.local` 생성 (`.env.local.example` 참고):
   ```
   VITE_SUPABASE_URL=<Project URL>
   VITE_SUPABASE_ANON_KEY=<anon public 키>
   ```

## 이번 프로젝트가 o11-quiz와 다른 점

- **로그인이 없음**: 표시 이름만 입력하고 바로 플레이하는 캐주얼 용도라 사용자별 RLS(`auth.uid()` 기반)를 쓸 수 없습니다. 대신 `anon` 키로 모든 요청을 허용하는 permissive 정책을 사용합니다. 즉, 방 코드(`room.id`)를 아는 사람은 누구나 그 방을 읽고 쓸 수 있습니다 — o11-quiz의 `restrict-domain.sql` 같은 도메인 제한은 이번엔 해당 사항이 없습니다.
- **방 자동 정리**: `schema.sql`에 `pg_cron` 잡이 포함되어 있어 30분마다 오래된 방을 자동 삭제합니다. Supabase 무료 티어에서도 pg_cron 확장을 쓸 수 있어 별도 서버나 유료 스케줄러가 필요 없습니다.

## 배포 (Vercel)

새 GitHub 저장소를 만들어 push한 뒤, Vercel에서 그 저장소를 Import(연동)하면 이후 `main`에 push할 때마다 자동 재배포됩니다. Vercel 프로젝트 설정의 Environment Variables에 위 두 값(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)을 입력해야 합니다.
