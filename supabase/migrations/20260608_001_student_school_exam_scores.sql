-- ============================================================================
-- student_school_exam_scores — 내신(학교시험) 실점수
--
-- 배경:
--   "학생 성적" 페이지(/tutor/analytics) 재구성 — 모의고사·출제(EX)·진단평가와
--   함께 학교 내신 실점수를 한 성적표로 모은다. 모의고사(student_exam_scores)와
--   별개 라인: 모의고사는 종류(4종) 단위, 내신은 학년·학기·중간/기말 단위.
--
-- 단위 (사용자 확정 2026-06-08): 과목=수학, 학년 + 학기(1·2) + 중간/기말.
--   학생 × (과목·학년·학기·구분) 당 1행 — upsert 의미론.
--   석차·반평균은 선택 입력(nullable) — Phase 3 "반평균 대비" 상세에서 사용.
--
-- 정책:
--   - 정식 등록 학생(users)만 대상 — roster 학생은 promote 후 입력
--   - 학원(institute) 단위 격리 (가드 #8) — RLS can_access_institute
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.student_school_exam_scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  institute_id  UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  subject       TEXT NOT NULL DEFAULT '수학',
  grade         INT  NOT NULL CHECK (grade BETWEEN 1 AND 12),   -- 1~6 초, 7~9 중, 10~12 고
  semester      INT  NOT NULL CHECK (semester IN (1, 2)),
  term          TEXT NOT NULL CHECK (term IN ('중간', '기말')),
  score         NUMERIC(5,1) NOT NULL CHECK (score >= 0 AND score <= 100),
  class_rank    INT  CHECK (class_rank IS NULL OR class_rank >= 1),       -- 석차 (선택)
  class_size    INT  CHECK (class_size IS NULL OR class_size >= 1),       -- 응시 인원 (선택)
  class_avg     NUMERIC(5,1) CHECK (class_avg IS NULL OR (class_avg >= 0 AND class_avg <= 100)), -- 반평균 (선택)
  exam_date     DATE,
  note          TEXT,
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT student_school_exam_scores_unique
    UNIQUE (student_id, subject, grade, semester, term)
);

CREATE INDEX IF NOT EXISTS idx_student_school_exam_scores_student
  ON public.student_school_exam_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_school_exam_scores_institute
  ON public.student_school_exam_scores(institute_id);

COMMENT ON TABLE  public.student_school_exam_scores IS
  '내신(학교시험) 실점수 — 학생×(과목·학년·학기·중간/기말) 당 1행 upsert. 학생 성적 페이지용.';
COMMENT ON COLUMN public.student_school_exam_scores.grade IS
  '학년 정수 (1~6 초, 7~9 중1~3, 10~12 고1~3) — users.grade 와 동일 스케일.';
COMMENT ON COLUMN public.student_school_exam_scores.term IS
  '중간 / 기말.';

-- ============================================================================
-- ROW LEVEL SECURITY — 학원 격리 (student_exam_scores 와 동일 패턴)
-- ============================================================================
ALTER TABLE public.student_school_exam_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_school_exam_scores_select ON public.student_school_exam_scores;
CREATE POLICY student_school_exam_scores_select ON public.student_school_exam_scores
  FOR SELECT TO authenticated
  USING (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS student_school_exam_scores_insert ON public.student_school_exam_scores;
CREATE POLICY student_school_exam_scores_insert ON public.student_school_exam_scores
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS student_school_exam_scores_update ON public.student_school_exam_scores;
CREATE POLICY student_school_exam_scores_update ON public.student_school_exam_scores
  FOR UPDATE TO authenticated
  USING (public.can_access_institute(institute_id))
  WITH CHECK (public.can_access_institute(institute_id));

DROP POLICY IF EXISTS student_school_exam_scores_delete ON public.student_school_exam_scores;
CREATE POLICY student_school_exam_scores_delete ON public.student_school_exam_scores
  FOR DELETE TO authenticated
  USING (public.can_access_institute(institute_id));

-- ============================================================================
-- updated_at 자동 갱신 트리거
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_student_school_exam_scores_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_catalog;  -- ⚠ 따옴표 없는 식별자 리스트 (20260529_001 사고 참고)

DROP TRIGGER IF EXISTS trg_student_school_exam_scores_updated_at ON public.student_school_exam_scores;
CREATE TRIGGER trg_student_school_exam_scores_updated_at
  BEFORE UPDATE ON public.student_school_exam_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_student_school_exam_scores_touch_updated_at();
