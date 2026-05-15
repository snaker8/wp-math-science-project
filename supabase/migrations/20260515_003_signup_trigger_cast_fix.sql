-- ============================================================================
-- handle_new_auth_user() 트리거 fix — 학생 등록 'Database error creating new user' 차단
--
-- 사고 (2026-05-15):
--   /api/students POST → supabaseAdmin.auth.admin.createUser →
--   handle_new_auth_user 트리거 발동 → public.users INSERT 시 'Database error
--   creating new user' 반환.
--
-- 원인 (의심):
--   1) v_role 가 text 타입 → user_role enum 컬럼 INSERT 시 implicit cast 실패
--      (PostgreSQL 의 text→enum 자동 cast 가 환경에 따라 안 됨).
--   2) role 화이트리스트에 TUTOR / ORG_ADMIN 누락 — multi-tenancy 마이그레이션
--      후 추가된 role 들이 트리거 IF 에 안 들어가 있어 STUDENT 로 강등됨.
--
-- 수정:
--   - v_role::user_role 명시 cast
--   - 화이트리스트에 TUTOR, ORG_ADMIN 추가
--
-- 본 마이그레이션은 멱등 — CREATE OR REPLACE 이므로 안전.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_role text := COALESCE(meta ->> 'role', 'STUDENT');
  v_full_name text := COALESCE(meta ->> 'full_name', split_part(NEW.email, '@', 1));
  v_phone text := NULLIF(meta ->> 'phone', '');
  v_grade int := CASE
    WHEN (meta ->> 'grade') ~ '^[0-9]+$' THEN (meta ->> 'grade')::int
    ELSE NULL
  END;
  v_institute_id_raw text := NULLIF(meta ->> 'institute_id', '');
  v_institute_id uuid;
BEGIN
  -- role 화이트리스트 (multi-tenancy 후 TUTOR / ORG_ADMIN 추가)
  IF v_role NOT IN ('ADMIN', 'TEACHER', 'TUTOR', 'STUDENT', 'PARENT', 'ORG_ADMIN') THEN
    v_role := 'STUDENT';
  END IF;

  -- institute_id: UUID 캐스팅 + 실제 institutes 존재 검증.
  -- 실패/미입력이면 NULL → 어드민이 사후 배정 가능.
  BEGIN
    v_institute_id := v_institute_id_raw::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.institutes WHERE id = v_institute_id) THEN
      v_institute_id := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_institute_id := NULL;
  END;

  INSERT INTO public.users (
    id, email, full_name, phone, role, grade, institute_id, preferences
  )
  VALUES (
    NEW.id, NEW.email, v_full_name, v_phone, v_role::user_role,
    v_grade, v_institute_id, '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
