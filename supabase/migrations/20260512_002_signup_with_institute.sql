-- ============================================================================
-- 회원가입 트리거 업데이트 — user_metadata.institute_id 를 public.users 에 박음.
--
-- 이전 (20260421_signup_auto_create_user.sql):
--   handle_new_auth_user() 가 role/full_name/phone/grade 만 읽음.
--   institute_id 가 항상 NULL 로 시작 → 가입 직후 cloud 페이지에서 시험지 0건.
--   super_admin 이 /admin/users 에서 수동 배정해야 했음.
--
-- 변경 (2026-05-12):
--   가입 폼이 사용자에게 직접 institute 선택 받고 user_metadata.institute_id 로
--   전달. 트리거가 이를 읽어 public.users.institute_id 에 박음.
--
--   institute_id 가 잘못된 UUID 또는 존재하지 않는 institute 면 NULL fallback —
--   사용자가 가입은 되지만 cloud 등은 안 보임 (어드민이 사후 배정).
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
  v_institute_id_raw text := nullif(meta ->> 'institute_id', '');
  v_institute_id uuid;
begin
  -- role 값 유효성 검증 (체크 제약 통과)
  if v_role not in ('ADMIN', 'TEACHER', 'STUDENT', 'PARENT') then
    v_role := 'STUDENT';
  end if;

  -- institute_id: UUID 캐스팅 시도 → 실제 institutes 에 존재하는지 검증.
  -- 실패 또는 미입력이면 NULL — 어드민이 사후 배정 가능.
  begin
    v_institute_id := v_institute_id_raw::uuid;
    if not exists (select 1 from public.institutes where id = v_institute_id) then
      v_institute_id := null;
    end if;
  exception when others then
    v_institute_id := null;
  end;

  insert into public.users (
    id, email, full_name, phone, role, grade, institute_id, preferences
  )
  values (
    new.id, new.email, v_full_name, v_phone, v_role, v_grade, v_institute_id, '{}'::jsonb
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 트리거는 기존 것 그대로 — 함수만 갱신했으니 자동 적용.

-- 기존에 가입한 user 중 institute_id 가 NULL 인 강사·관리자는 본부 institute 로 일괄 이동.
-- (가입 시점에 트리거가 institute 못 받았던 사용자들 백필.)
update public.users
set institute_id = (select id from public.institutes where name = '본부' limit 1)
where role in ('ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN')
  and institute_id is null;
