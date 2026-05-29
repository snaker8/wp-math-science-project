-- ============================================================================
-- roster_students — 명단 학생 (auth 미연동 임시 학생)
--
-- 배경:
--   학습 분석 리포트 기능에서 강사가 학생 답안 엑셀을 일괄 업로드할 때,
--   public.users 는 auth.users FK 강제라 가짜 계정 없이는 행을 만들 수 없음.
--   별도 명단 테이블을 두어 auth 가입 전에도 채점/리포트 작동시킴.
--
-- 정책:
--   - 학원(institute) 단위 격리
--   - 동일 학원 내 (full_name, grade, class_label) 유일
--   - 학생이 직접 회원가입하면 promoted_user_id 채워 users.id 와 머지
--     (diagnostics 의 student_id 도 일괄 업데이트하는 별도 함수 제공)
--
-- diagnostics.sessions.student_id 는 TEXT NOT NULL 이지만 FK 없는 소프트 참조
-- → roster_students.id (UUID 문자열) 또는 users.id 둘 다 박을 수 있음.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roster_students (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id      UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  full_name         TEXT NOT NULL,
  grade             SMALLINT CHECK (grade BETWEEN 1 AND 12),
  class_label       TEXT,                                              -- "2-3" 등 동명이인 구분
  promoted_user_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT roster_students_unique_per_institute
    UNIQUE (institute_id, full_name, grade, class_label)
);

CREATE INDEX IF NOT EXISTS idx_roster_students_institute
  ON public.roster_students(institute_id);
CREATE INDEX IF NOT EXISTS idx_roster_students_name
  ON public.roster_students(institute_id, full_name);
CREATE INDEX IF NOT EXISTS idx_roster_students_promoted
  ON public.roster_students(promoted_user_id)
  WHERE promoted_user_id IS NOT NULL;

COMMENT ON TABLE  public.roster_students IS
  '명단 학생 — auth 가입 전 임시 학생. promoted_user_id 채워지면 실제 user 와 머지된 상태.';
COMMENT ON COLUMN public.roster_students.promoted_user_id IS
  '학생이 직접 회원가입하면 강사가 머지 — 이 컬럼 채우고 diagnostics.student_id 도 users.id 로 업데이트.';

-- ============================================================================
-- ROW LEVEL SECURITY — 학원 격리
-- ============================================================================
ALTER TABLE public.roster_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roster_students_select ON public.roster_students;
CREATE POLICY roster_students_select ON public.roster_students
  FOR SELECT TO authenticated
  USING (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS roster_students_insert ON public.roster_students;
CREATE POLICY roster_students_insert ON public.roster_students
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS roster_students_update ON public.roster_students;
CREATE POLICY roster_students_update ON public.roster_students
  FOR UPDATE TO authenticated
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS roster_students_delete ON public.roster_students;
CREATE POLICY roster_students_delete ON public.roster_students
  FOR DELETE TO authenticated
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- updated_at 자동 갱신 트리거
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_roster_students_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roster_students_updated_at ON public.roster_students;
CREATE TRIGGER trg_roster_students_updated_at
  BEFORE UPDATE ON public.roster_students
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_roster_students_touch_updated_at();

-- ============================================================================
-- 머지 함수 — roster_students.id 가진 모든 diagnostics 데이터를 users.id 로 일괄 이전
--
-- 사용 예:
--   SELECT public.merge_roster_into_user('<roster_uuid>', '<user_uuid>');
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_roster_into_user(
  p_roster_id UUID,
  p_user_id   UUID
)
RETURNS TABLE (
  updated_sessions       INT,
  updated_node_status    INT,
  updated_lesson_plans   INT
) AS $$
DECLARE
  v_sessions_cnt    INT;
  v_status_cnt      INT;
  v_plans_cnt       INT;
  v_roster_text     TEXT := p_roster_id::TEXT;
  v_user_text       TEXT := p_user_id::TEXT;
BEGIN
  -- 1. diagnostics.sessions
  UPDATE diagnostics.sessions
     SET student_id = v_user_text
   WHERE student_id = v_roster_text;
  GET DIAGNOSTICS v_sessions_cnt = ROW_COUNT;

  -- 2. diagnostics.student_node_status (트리거가 자동 재계산하긴 하지만 직접 이전)
  UPDATE diagnostics.student_node_status
     SET student_id = v_user_text
   WHERE student_id = v_roster_text;
  GET DIAGNOSTICS v_status_cnt = ROW_COUNT;

  -- 3. diagnostics.lesson_plans
  UPDATE diagnostics.lesson_plans
     SET student_id = v_user_text
   WHERE student_id = v_roster_text;
  GET DIAGNOSTICS v_plans_cnt = ROW_COUNT;

  -- 4. roster_students 자체에 promoted_user_id 박기
  UPDATE public.roster_students
     SET promoted_user_id = p_user_id,
         updated_at = NOW()
   WHERE id = p_roster_id;

  RETURN QUERY SELECT v_sessions_cnt, v_status_cnt, v_plans_cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.merge_roster_into_user(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_roster_into_user(UUID, UUID) TO authenticated;
