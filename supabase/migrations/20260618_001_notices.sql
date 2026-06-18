-- 공지사항(시스템 공지) — 운영자(super_admin)가 작성, 전체 로그인 사용자 열람.
-- 대시보드 공지 섹션의 더미(mockNotices) 대체. (2026-06-18)
-- prod 적용 완료(MCP apply_migration). 멱등 SQL.

create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  is_urgent boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists notices_created_at_idx on public.notices (created_at desc);

alter table public.notices enable row level security;

-- 로그인 사용자: 게시된 공지만 읽기
drop policy if exists notices_select_published on public.notices;
create policy notices_select_published on public.notices
  for select to authenticated
  using (is_published = true);

-- super_admin: 전체 관리(읽기 포함 — 미게시도 열람)
drop policy if exists notices_admin_all on public.notices;
create policy notices_admin_all on public.notices
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
