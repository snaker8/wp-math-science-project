-- ============================================================================
-- search_path 따옴표 문법 hotfix (2026-05-29)
--
-- 배경:
--   20260527125825 set_function_search_path 마이그레이션이 함수들에
--   `SET search_path = 'public, pg_catalog'` (따옴표로 통째 감쌈) 를 적용 →
--   PostgreSQL 이 "public, pg_catalog" 를 공백 포함 단일 스키마 이름으로 해석 →
--   search_path 가 사실상 비어버림 → 함수 본문의 unqualified `exams` 등이
--   "relation does not exist" 로 실패.
--
-- 증상:
--   calculate_exam_total_points 트리거가 exam_problems INSERT 시 UPDATE exams 실패
--   → 5/27 12:58 이후 모든 자산화의 exam_problems 연결 누락 (시험지에 문제 0개로 보임).
--   채점(update_student_analytics_on_answer)·반등록(fn_class_enrollments_set_institute_id)·
--   학생초대(invite_student_to_class/join_class_by_code) 등 20개 함수가 동일하게 깨짐.
--
-- 수정:
--   깨진 search_path(큰따옴표로 감싼 쉼표 포함 단일 문자열)를 가진 함수를 찾아
--   따옴표를 제거한 올바른 식별자 리스트로 ALTER.
--   (예: "public, pg_catalog" → public, pg_catalog)
--
-- ⚠ 향후 함수 search_path 설정 시 반드시 `SET search_path = public, pg_catalog`
--   (따옴표 없는 식별자 리스트) 형태로. `'public, pg_catalog'` (작은따옴표 통째) 금지.
-- ============================================================================

DO $$
DECLARE
  r record;
  sp_value text;
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           cfg
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL unnest(p.proconfig) AS cfg
    WHERE cfg LIKE 'search_path="%,%"'  -- 큰따옴표로 감싼 쉼표 포함 값 = 깨진 형태
  LOOP
    sp_value := substring(r.cfg from 'search_path=(.*)');
    sp_value := trim(both '"' from sp_value);
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %s',
                   r.nspname, r.proname, r.args, sp_value);
    RAISE NOTICE 'Fixed search_path: %.%(%) -> %', r.nspname, r.proname, r.args, sp_value;
  END LOOP;
END $$;
