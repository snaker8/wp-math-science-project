-- ============================================================================
-- handle_new_auth_user() — 회원가입 role 화이트리스트 축소 (보안 강화)
--
-- 배경 (2026-05-17):
--   외부 개발팀이 ORG_ADMIN 권한으로 플랫폼 분석 예정.
--   기존 가입 폼이 'ADMIN' 옵션 노출 + 트리거 화이트리스트도 ADMIN/ORG_ADMIN 통과시킴
--   → 누구나 가입 직후 학원 전체 관리 권한 획득 가능 (권한 승격 사고).
--
-- 변경:
--   - 화이트리스트: ('ADMIN', 'TEACHER', 'TUTOR', 'STUDENT', 'PARENT', 'ORG_ADMIN')
--     → ('TEACHER', 'TUTOR', 'STUDENT', 'PARENT')
--   - ADMIN / ORG_ADMIN 입력은 STUDENT 로 강등 (트리거 폴백 활용)
--   - 클라이언트 폼 우회(API 직접 호출) 차단 — 방어심층화 (defense in depth)
--
-- 사용자 영향:
--   - 신규 가입자: ADMIN / ORG_ADMIN role 직접 가입 불가
--   - 기존 사용자: 영향 없음 (이미 박힌 role 그대로)
--   - 학원장·외부팀 권한 부여: super_admin 이 /admin/users 페이지에서 수동 배정
--     또는 /api/admin/tenancy/users/[userId] PATCH (super_admin only)
--
-- 멱등: CREATE OR REPLACE — 재실행 안전.
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
  -- ★ 화이트리스트 — ADMIN / ORG_ADMIN 제외 (super_admin 수동 배정만 허용)
  --   클라이언트 폼이 우회해서 ADMIN/ORG_ADMIN 보내도 STUDENT 로 강등.
  IF v_role NOT IN ('TEACHER', 'TUTOR', 'STUDENT', 'PARENT') THEN
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
