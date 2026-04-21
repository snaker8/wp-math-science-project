-- ============================================================================
-- auth.users → public.users 자동 생성 트리거
-- 회원가입 시 클라이언트 INSERT 실패해도 DB 레벨에서 보장
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(meta ->> 'role', 'STUDENT');
  v_full_name text := coalesce(meta ->> 'full_name', split_part(new.email, '@', 1));
  v_phone text := nullif(meta ->> 'phone', '');
  v_grade int := case
    when (meta ->> 'grade') ~ '^[0-9]+$' then (meta ->> 'grade')::int
    else null
  end;
begin
  -- role 값 유효성 검증 (체크 제약 통과)
  if v_role not in ('ADMIN', 'TEACHER', 'STUDENT', 'PARENT') then
    v_role := 'STUDENT';
  end if;

  insert into public.users (
    id, email, full_name, phone, role, grade, preferences
  )
  values (
    new.id, new.email, v_full_name, v_phone, v_role, v_grade, '{}'::jsonb
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 트리거 재생성 (idempotent)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
