-- office-games / 빙고 스키마
-- Supabase SQL Editor에서 그대로 실행하세요. 여러 번 실행해도 안전하도록 작성했습니다.

-- 게임 종류별로 독립적으로 증가하는 방 번호 카운터 (예: BINGO-1, BINGO-2 ... 나중에 다른 게임이 추가되면 그 게임만의 번호로 별도 시작)
create table if not exists room_counters (
  game_type text primary key,
  next_number int not null default 1
);

-- 이 테이블은 next_room_number() 함수(security definer)를 통해서만 접근한다.
-- RLS를 켜고 정책은 하나도 안 만들어서 anon/authenticated의 직접 접근을 전부 막는다 —
-- 함수는 security definer라 RLS를 우회하므로 정상 동작한다.
alter table room_counters enable row level security;

create or replace function next_room_number(p_game_type text)
returns int
language sql
security definer
set search_path = public
as $$
  insert into room_counters (game_type, next_number)
  values (p_game_type, 2)
  on conflict (game_type) do update set next_number = room_counters.next_number + 1
  returning next_number - 1;
$$;

grant execute on function next_room_number(text) to anon;

create table if not exists rooms (
  id text primary key,
  topic text,
  size smallint not null check (size in (4, 5)),
  win_condition smallint not null check (win_condition in (1, 2, 3)),
  timed boolean not null default false,
  status text not null default 'waiting',
  host_id text not null,
  turn_order jsonb,
  current_turn_index int,
  current_call jsonb,
  turn_deadline timestamptz,
  fill_deadline timestamptz,
  winner_id text,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table if not exists players (
  id text primary key,
  room_id text not null references rooms (id) on delete cascade,
  name text not null,
  board jsonb not null default '[]'::jsonb,
  is_ready boolean not null default false,
  is_eliminated boolean not null default false,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

create index if not exists players_room_id_idx on players (room_id);

-- 아래는 1단계(빙고 전용 waiting 없는 버전)에서 이미 rooms/players 테이블을 만든 적이 있어도
-- 안전하게 다시 실행할 수 있도록 하는 마이그레이션. 신규 설치에서도 그대로 동작한다.
alter table rooms add column if not exists game_type text not null default 'bingo';
alter table rooms add column if not exists room_number int not null default 0;
alter table rooms add column if not exists display_name text not null default 'Untitled';
alter table rooms add column if not exists max_players smallint not null default 4;
alter table rooms add column if not exists round_number int not null default 1;
alter table rooms alter column topic drop not null;
alter table rooms alter column status set default 'waiting';

do $$
begin
  alter table rooms drop constraint if exists rooms_status_check;
  alter table rooms add constraint rooms_status_check
    check (status in ('waiting', 'filling', 'playing', 'ended'));
  alter table rooms drop constraint if exists rooms_max_players_check;
  alter table rooms add constraint rooms_max_players_check
    check (max_players between 2 and 8);
end $$;

alter table players alter column board set default '[]'::jsonb;

-- 턴 제출 모델: 카드가 제시될 때마다 turn_seq가 1 증가하고, 각 플레이어는 자기가
-- 제출을 마친 턴 번호를 submitted_turn에 남긴다. submitted_turn = turn_seq 인 사람이
-- 이번 턴 제출을 끝낸 사람. 이렇게 비교만 하므로 턴이 넘어갈 때 전원 UPDATE가 필요 없다.
alter table rooms add column if not exists turn_seq int not null default 0;
alter table players add column if not exists submitted_turn int;

-- 접속 상태: 방에 있는 클라이언트가 주기적으로 갱신한다.
-- 브라우저를 그냥 닫은 "유령 참가자" 때문에 게임을 시작할 수 없던 문제를 이걸로 판별한다.
alter table players add column if not exists last_seen_at timestamptz not null default now();

-- RLS: 로그인이 없는 캐주얼 용도라 사용자별 정책은 만들 수 없음.
-- anon key로 전체 select/insert/update/delete를 허용하고,
-- 실질적인 보안은 "추측 불가능한 8자리 방 코드"에 의존한다.
alter table rooms enable row level security;
alter table players enable row level security;

drop policy if exists "anon read rooms" on rooms;
drop policy if exists "anon insert rooms" on rooms;
drop policy if exists "anon update rooms" on rooms;
drop policy if exists "anon delete rooms" on rooms;
create policy "anon read rooms" on rooms for select to anon using (true);
create policy "anon insert rooms" on rooms for insert to anon with check (true);
create policy "anon update rooms" on rooms for update to anon using (true) with check (true);
create policy "anon delete rooms" on rooms for delete to anon using (true);

drop policy if exists "anon read players" on players;
drop policy if exists "anon insert players" on players;
drop policy if exists "anon update players" on players;
drop policy if exists "anon delete players" on players;
create policy "anon read players" on players for select to anon using (true);
create policy "anon insert players" on players for insert to anon with check (true);
create policy "anon update players" on players for update to anon using (true) with check (true);
create policy "anon delete players" on players for delete to anon using (true);

-- Realtime: rooms/players 테이블 변경을 클라이언트에 push
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table players;
  end if;
end $$;

-- 방 자동 정리 (터뜨리기): 무료 티어에서도 쓸 수 있는 pg_cron으로 5분마다 스윕.
-- 죽은 방이 목록에 "In Progress"로 계속 떠 있던 문제 때문에 주기와 기준을 모두 조였다.
-- - 플레이어가 0명인 방은 즉시 정리 대상
-- - 접속자(last_seen_at 기준)가 아무도 없고 10분 넘게 조용한 방은 상태 무관하게 삭제
--   (브라우저를 그냥 닫아 방치된 진행중 방이 여기서 걸린다)
-- - 종료된 방은 30분 뒤 삭제 (그 사이 방장이 "새 라운드"로 이어갈 수 있게 여유를 둠)
-- (랜딩 접속 시 클라이언트에서도 보조로 한 번 더 스윕함 — src/lib/room.ts의 sweepExpiredRooms)
create extension if not exists pg_cron;

select cron.unschedule('cleanup-expired-bingo-rooms')
where exists (select 1 from cron.job where jobname = 'cleanup-expired-bingo-rooms');

select cron.schedule(
  'cleanup-expired-bingo-rooms',
  '*/5 * * * *',
  $$
    delete from rooms r where not exists (select 1 from players p where p.room_id = r.id);

    -- 두 조건이 모두 맞아야 지운다: 10분간 아무 진행이 없었고, 5분간 접속자도 없었다.
    -- 백그라운드 탭은 타이머가 얼어 신호가 늦게 오므로 접속 판정을 넉넉히 잡는다.
    delete from rooms r
    where r.last_activity_at < now() - interval '10 minutes'
      and not exists (
        select 1 from players p
        where p.room_id = r.id and p.last_seen_at > now() - interval '5 minutes'
      );

    delete from rooms where status = 'ended' and last_activity_at < now() - interval '30 minutes';
  $$
);
