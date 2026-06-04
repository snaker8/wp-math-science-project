-- ============================================================================
-- student_exam_scores — 모의고사 점수 (자사관 플래너 연동)
--
-- 배경:
--   자사관 내신 플래너가 GET /api/msb/students/{id}/exams 로 학생 1명의
--   모의고사 4종 점수를 동기화한다. PR #266 당시 저장 테이블이 없어 빈 배열
--   스텁이었고, 이 마이그레이션이 그 후속 (저장 테이블 + 입력 UI + 연결).
--
-- 모의고사 4종 (exam_type):
--   mockFinal1 / mockFinal2 — 미리보는 기말 1·2회
--   mock1 / mock2           — 모의고사 1·2회
--
-- 정책:
--   - 학생(users.id) × 종류(exam_type) 당 1행 — upsert 의미론 (최신 점수 유지)
--   - 정식 등록 학생(users)만 대상 — roster 학생은 promote 후 입력
--   - 학원(institute) 단위 격리 (가드 #8) — RLS can_access_institute
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_exam_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id  UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  exam_type     TEXT NOT NULL CHECK (exam_type IN ('mockFinal1', 'mockFinal2', 'mock1', 'mock2')),
  score         NUMERIC(5,1) NOT NULL CHECK (score >= 0 AND score <= 100),
  exam_date     DATE,
  note          TEXT,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT student_exam_scores_unique_per_type
    UNIQUE (student_id, exam_type)
);

CREATE INDEX IF NOT EXISTS idx_student_exam_scores_student
  ON public.student_exam_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_exam_scores_institute
  ON public.student_exam_scores(institute_id);

COMMENT ON TABLE  public.student_exam_scores IS
  '모의고사 점수 — 자사관 플래너 동기화용. 학생×종류(4종) 당 1행 upsert.';
COMMENT ON COLUMN public.student_exam_scores.exam_type IS
  'mockFinal1·mockFinal2=미리보는 기말 1·2회 / mock1·mock2=모의고사 1·2회.';
COMMENT ON COLUMN public.student_exam_scores.score IS
  '점수 0~100 (소수 1자리 허용).';

-- ============================================================================
-- ROW LEVEL SECURITY — 학원 격리 (roster_students 와 동일 패턴)
-- ============================================================================
ALTER TABLE public.student_exam_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_exam_scores_select ON public.student_exam_scores;
CREATE POLICY student_exam_scores_select ON public.student_exam_scores
  FOR SELECT TO authenticated
  USING (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS student_exam_scores_insert ON public.student_exam_scores;
CREATE POLICY student_exam_scores_insert ON public.student_exam_scores
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS student_exam_scores_update ON public.student_exam_scores;
CREATE POLICY student_exam_scores_update ON public.student_exam_scores
  FOR UPDATE TO authenticated
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS student_exam_scores_delete ON public.student_exam_scores;
CREATE POLICY student_exam_scores_delete ON public.student_exam_scores
  FOR DELETE TO authenticated
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- updated_at 자동 갱신 트리거
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_student_exam_scores_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_catalog;  -- ⚠ 따옴표 없는 식별자 리스트 (20260529_001 사고 참고)

DROP TRIGGER IF EXISTS trg_student_exam_scores_updated_at ON public.student_exam_scores;
CREATE TRIGGER trg_student_exam_scores_updated_at
  BEFORE UPDATE ON public.student_exam_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_student_exam_scores_touch_updated_at();
