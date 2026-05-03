-- ============================================================================
-- Multi-Tenancy PR-1: 기존 RLS 정책에 can_access_institute() 적용
--
-- 의존: 20260504_001 (스키마), 20260504_002 (helper 함수)
-- 목표: 기존 격리 정책 6개 테이블이 super_admin / ORG_ADMIN 도 통과시키도록 확장
-- 영향: 정책 범위 확대 — 기존 일반 user 동작 변화 없음.
--       super_admin / ORG_ADMIN 만 추가 권한 부여됨.
--
-- 변경 패턴:
--   institute_id = get_my_institute_id()  →  can_access_institute(institute_id)
--   role 체크에 ORG_ADMIN 추가
--   공통 풀(institute_id IS NULL) 정책은 유지
-- ============================================================================

-- ─── EXAMS ─────────────────────────────────────────────────────
ALTER POLICY "Users can view exams in their institute" ON public.exams
  USING (can_access_institute(institute_id));

ALTER POLICY "Teachers can manage exams" ON public.exams
  USING (
    ((SELECT users.role FROM public.users WHERE users.id = auth.uid())
       = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'ORG_ADMIN'::user_role]))
    AND can_access_institute(institute_id)
  );

-- ─── PROBLEMS ──────────────────────────────────────────────────
-- 공통 풀(institute_id IS NULL) 은 모두 조회 가능 — 매쓰플랫 모델 핵심
ALTER POLICY "Users can view problems in their institute" ON public.problems
  USING (institute_id IS NULL OR can_access_institute(institute_id));

-- INSERT 정책에 ORG_ADMIN 추가
ALTER POLICY "Teachers can insert problems" ON public.problems
  WITH CHECK (
    (SELECT users.role FROM public.users WHERE users.id = auth.uid())
      = ANY (ARRAY['ADMIN'::user_role, 'TEACHER'::user_role, 'ORG_ADMIN'::user_role])
  );

-- UPDATE 정책 — 본인 작성 / ADMIN / ORG_ADMIN / super_admin
ALTER POLICY "Teachers can update their problems" ON public.problems
  USING (
    created_by = auth.uid()
    OR ((SELECT users.role FROM public.users WHERE users.id = auth.uid())
          = ANY (ARRAY['ADMIN'::user_role, 'ORG_ADMIN'::user_role]))
    OR is_super_admin()
  );

-- ─── CLASSIFICATIONS ──────────────────────────────────────────
-- problems FK 통한 격리 — can_access_institute 로 통일
ALTER POLICY "Users can view classifications" ON public.classifications
  USING (
    problem_id IN (
      SELECT problems.id FROM public.problems
      WHERE problems.institute_id IS NULL OR can_access_institute(problems.institute_id)
    )
  );

-- ─── CLASSES ───────────────────────────────────────────────────
ALTER POLICY "Users can view classes in their institute" ON public.classes
  USING (can_access_institute(institute_id) AND deleted_at IS NULL);

ALTER POLICY "Tutors can manage their own classes" ON public.classes
  USING (
    tutor_id = auth.uid()
    OR ((SELECT users.role FROM public.users WHERE users.id = auth.uid())
          = ANY (ARRAY['ADMIN'::user_role, 'ORG_ADMIN'::user_role]))
    OR is_super_admin()
  );

-- ─── BOOK_GROUPS (4 정책) ──────────────────────────────────────
ALTER POLICY "Users can view their institute book groups" ON public.book_groups
  USING (institute_id IS NULL OR can_access_institute(institute_id));

ALTER POLICY "Users can create book groups in their institute" ON public.book_groups
  WITH CHECK (institute_id IS NULL OR can_access_institute(institute_id));

ALTER POLICY "Users can update their institute book groups" ON public.book_groups
  USING (institute_id IS NULL OR can_access_institute(institute_id));

ALTER POLICY "Users can delete their institute book groups" ON public.book_groups
  USING (institute_id IS NULL OR can_access_institute(institute_id));

-- ─── SOURCE_FILES ──────────────────────────────────────────────
ALTER POLICY "Users can view files in their institute" ON public.source_files
  USING (can_access_institute(institute_id));

-- ─── USERS ─────────────────────────────────────────────────────
-- "Users can view users in same institute" — ORG_ADMIN 은 자기 학원 모든 user 조회
ALTER POLICY "Users can view users in same institute" ON public.users
  USING (
    can_access_institute(institute_id)
    OR id = auth.uid()
  );

-- "users_admin_all" — ADMIN/ORG_ADMIN/super_admin 만
ALTER POLICY "users_admin_all" ON public.users
  USING (
    get_my_role() = ANY (ARRAY['ADMIN'::text, 'ORG_ADMIN'::text])
    OR is_super_admin()
  );
