-- ============================================================================
-- exams RLS 공통 풀(NULL) 허용 — problems/book_groups 와 동일 패턴으로 통일
-- ★ prod 에 MCP apply_migration(exams_rls_common_pool) 으로 2026-06-11 적용 완료 — 재적용 금지.
--
-- 사고: 시험지저장소(useExams — 브라우저 RLS 직접 조회)에서 선생님/ORG_ADMIN 에게
--   공통 풀(institute_id IS NULL) 시험지 99건이 전부 안 보임 (자기 센터 것만 표시).
--   super_admin 은 RLS 통과라 증상 없음 → 선생님 계정에서만 발견됨.
--
-- 원인: can_access_institute(NULL) 은 NULL 비교라 super_admin 외 항상 false.
--   problems/book_groups SELECT 정책엔 "(institute_id IS NULL) OR ..." 가
--   있는데 exams 두 정책만 누락돼 있었음.
--
-- 정책(불변): 공통 풀 = 모든 로그인 사용자 R/W, 센터 자산(엄궁차수학 등) = 해당
--   센터만. 서버 앱레벨 가드(assertExamAccess, 2026-05-27 fix)와 일치.
-- ============================================================================

ALTER POLICY "Users can view exams in their institute" ON public.exams
  USING ((institute_id IS NULL) OR can_access_institute(institute_id));

ALTER POLICY "Teachers can manage exams" ON public.exams
  USING (
    (( SELECT users.role FROM users WHERE (users.id = ( SELECT auth.uid() AS uid)))
      = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'ORG_ADMIN'::user_role]))
    AND ((institute_id IS NULL) OR can_access_institute(institute_id))
  );
