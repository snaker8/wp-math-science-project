-- ============================================================================
-- RLS 정책 강화 — diagnostics.* + diagram_images / science_curriculum_types
--
-- 배경 (2026-05-17 P1-5):
--   보안 감사 D-1: 11개 테이블 RLS 정책이 USING (true) — 모든 authenticated
--   사용자 통과. supabaseAdmin (service_role) 우회는 별개로, 클라이언트가
--   supabaseBrowser 로 직접 접근 시 다른 학원 데이터 누설 위험.
--
-- 정책 원칙:
--   1) diagnostics.* — institute_id 기반 격리 (can_access_institute 헬퍼)
--      · institute_id 직접 있는 테이블: 그대로
--      · 없는 테이블: session_id / student_id 조인으로 institute_id 추적
--   2) 글로벌 메타데이터 (prerequisites, diagram_images, science_curriculum_types):
--      · SELECT: USING (true) 유지 — 모든 인증 사용자 읽기 가능
--      · INSERT/UPDATE/DELETE: super_admin only (현재 ALL USING true 사고 차단)
--   3) latex_render_corrections — 기존 정책 (SELECT all, INSERT user_id 검증) 유지
--
-- 트리거 호환:
--   refresh_node_status_for_student 가 SECURITY INVOKER → RLS 적용 시 차단 위험.
--   → SECURITY DEFINER 로 전환 (마이그레이션 마지막).
--
-- 멱등: 모든 정책 DROP IF EXISTS → CREATE. 재실행 안전.
-- ============================================================================

-- ============================================================================
-- 1. diagnostics.sessions — institute_id 직접 있음
-- ============================================================================
DROP POLICY IF EXISTS teachers_all_sessions ON diagnostics.sessions;

CREATE POLICY sessions_select ON diagnostics.sessions
  FOR SELECT
  USING (public.can_access_institute(institute_id));

CREATE POLICY sessions_insert ON diagnostics.sessions
  FOR INSERT
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY sessions_update ON diagnostics.sessions
  FOR UPDATE
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY sessions_delete ON diagnostics.sessions
  FOR DELETE
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- 2. diagnostics.items — institute_id 직접 있음
-- ============================================================================
DROP POLICY IF EXISTS teachers_all_items ON diagnostics.items;

CREATE POLICY items_select ON diagnostics.items
  FOR SELECT
  USING (public.can_access_institute(institute_id));

CREATE POLICY items_insert ON diagnostics.items
  FOR INSERT
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY items_update ON diagnostics.items
  FOR UPDATE
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY items_delete ON diagnostics.items
  FOR DELETE
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- 3. diagnostics.lesson_plans — institute_id 직접 있음
-- ============================================================================
DROP POLICY IF EXISTS teachers_all_plans ON diagnostics.lesson_plans;

CREATE POLICY lesson_plans_select ON diagnostics.lesson_plans
  FOR SELECT
  USING (public.can_access_institute(institute_id));

CREATE POLICY lesson_plans_insert ON diagnostics.lesson_plans
  FOR INSERT
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY lesson_plans_update ON diagnostics.lesson_plans
  FOR UPDATE
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY lesson_plans_delete ON diagnostics.lesson_plans
  FOR DELETE
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- 4. diagnostics.student_node_status — institute_id 직접 있음
-- ============================================================================
DROP POLICY IF EXISTS read_status ON diagnostics.student_node_status;
DROP POLICY IF EXISTS write_status ON diagnostics.student_node_status;
DROP POLICY IF EXISTS update_status ON diagnostics.student_node_status;

CREATE POLICY student_node_status_select ON diagnostics.student_node_status
  FOR SELECT
  USING (public.can_access_institute(institute_id));

CREATE POLICY student_node_status_insert ON diagnostics.student_node_status
  FOR INSERT
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY student_node_status_update ON diagnostics.student_node_status
  FOR UPDATE
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

CREATE POLICY student_node_status_delete ON diagnostics.student_node_status
  FOR DELETE
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- 5. diagnostics.session_problems — session_id 조인 (institute_id 없음)
-- ============================================================================
DROP POLICY IF EXISTS sp_all ON diagnostics.session_problems;

CREATE POLICY session_problems_select ON diagnostics.session_problems
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY session_problems_insert ON diagnostics.session_problems
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY session_problems_update ON diagnostics.session_problems
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY session_problems_delete ON diagnostics.session_problems
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

-- ============================================================================
-- 6. diagnostics.session_results — session_id 조인
-- ============================================================================
DROP POLICY IF EXISTS sr_all ON diagnostics.session_results;

CREATE POLICY session_results_select ON diagnostics.session_results
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY session_results_insert ON diagnostics.session_results
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY session_results_update ON diagnostics.session_results
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY session_results_delete ON diagnostics.session_results
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM diagnostics.print_sessions ps
    JOIN public.users u ON u.id = ps.student_id
    WHERE ps.id = session_id
      AND public.can_access_institute(u.institute_id)
  ));

-- ============================================================================
-- 7. diagnostics.print_sessions — student_id 조인
-- ============================================================================
DROP POLICY IF EXISTS ps_all ON diagnostics.print_sessions;

CREATE POLICY print_sessions_select ON diagnostics.print_sessions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY print_sessions_insert ON diagnostics.print_sessions
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY print_sessions_update ON diagnostics.print_sessions
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY print_sessions_delete ON diagnostics.print_sessions
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

-- ============================================================================
-- 7-bis. diagnostics.student_pitfall_history — student_id 조인
-- (RLS enabled 상태인데 정책 없음 → deny all. 명시적 격리 정책 추가)
-- ============================================================================
CREATE POLICY student_pitfall_history_select ON diagnostics.student_pitfall_history
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY student_pitfall_history_insert ON diagnostics.student_pitfall_history
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY student_pitfall_history_update ON diagnostics.student_pitfall_history
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

CREATE POLICY student_pitfall_history_delete ON diagnostics.student_pitfall_history
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = student_id
      AND public.can_access_institute(u.institute_id)
  ));

-- ============================================================================
-- 8. diagnostics.prerequisites — 글로벌 메타 (수학 선수 관계 트리)
-- SELECT: 모두 / 쓰기: super_admin only
-- ============================================================================
DROP POLICY IF EXISTS read_prereqs ON diagnostics.prerequisites;

CREATE POLICY prerequisites_select ON diagnostics.prerequisites
  FOR SELECT
  USING (true);

CREATE POLICY prerequisites_insert ON diagnostics.prerequisites
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY prerequisites_update ON diagnostics.prerequisites
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY prerequisites_delete ON diagnostics.prerequisites
  FOR DELETE
  USING (public.is_super_admin());

-- ============================================================================
-- 9. public.diagram_images — 도형 이미지 (글로벌)
-- 사고: ALL USING true → 외부 ORG_ADMIN 이 도형 자산 수정·삭제 가능
-- SELECT 글로벌 / 쓰기 super_admin only
-- ============================================================================
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.diagram_images;

CREATE POLICY diagram_images_select ON public.diagram_images
  FOR SELECT
  USING (true);

CREATE POLICY diagram_images_insert ON public.diagram_images
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY diagram_images_update ON public.diagram_images
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY diagram_images_delete ON public.diagram_images
  FOR DELETE
  USING (public.is_super_admin());

-- ============================================================================
-- 10. public.science_curriculum_types — 과학 분류 마스터 (글로벌)
-- 사고: ALL USING true → 외부 ORG_ADMIN 이 분류 마스터 손상 가능
-- SELECT 글로벌 / 쓰기 super_admin only
-- ============================================================================
DROP POLICY IF EXISTS science_types_admin_write ON public.science_curriculum_types;
DROP POLICY IF EXISTS science_types_read_all ON public.science_curriculum_types;

CREATE POLICY science_types_select ON public.science_curriculum_types
  FOR SELECT
  USING (true);

CREATE POLICY science_types_insert ON public.science_curriculum_types
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY science_types_update ON public.science_curriculum_types
  FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY science_types_delete ON public.science_curriculum_types
  FOR DELETE
  USING (public.is_super_admin());

-- ============================================================================
-- 11. 트리거 호환 — refresh_node_status_for_student SECURITY DEFINER 전환
--
-- 이유: 위 정책들은 student_node_status INSERT/UPDATE 를 institute 격리하는데,
--   트리거가 SECURITY INVOKER (호출자 권한)면 trigger 호출 컨텍스트에서 RLS 적용
--   → 트리거가 자기 데이터 못 박는 사고. DEFINER 로 전환해 RLS 우회.
-- 안전: search_path 명시 + 함수 본문은 호환성 검증된 기존 로직.
-- ============================================================================
ALTER FUNCTION diagnostics.refresh_node_status_for_student()
  SECURITY DEFINER
  SET search_path = public, diagnostics;
