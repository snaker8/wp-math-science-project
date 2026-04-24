-- ============================================================================
-- LaTeX 렌더 수정 학습 테이블 (latex_render_corrections)
-- ----------------------------------------------------------------------------
-- 목적
--   사용자가 편집 모달에서 수동으로 고친 LaTeX 조각을 (원본, 수정본) 쌍으로
--   저장해 반복 패턴을 학습하고, 다음 자산화 때 자동 적용한다.
--
-- ★ 용어 분리
--   "자동수정(autofix)"은 기존 유형매핑 개념으로 유지하고,
--   이 테이블은 KaTeX 렌더 실패 교정 학습에만 쓴다.
--
-- ★ 안전
--   신규 테이블만 추가 (IF NOT EXISTS). 기존 스키마 변경 없음.
--   RLS 활성화 및 SELECT/INSERT 정책만 허용 (UPDATE/DELETE는 관리자용 RPC로).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.latex_render_corrections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id        UUID        NULL,                 -- 수정한 문제 (삭제되면 NULL 허용)
  user_id           UUID        NULL,                 -- 수정자 (익명 저장도 허용)
  source            TEXT        NOT NULL DEFAULT 'content'  -- 'content' | 'solution'
                               CHECK (source IN ('content', 'solution')),
  original_fragment TEXT        NOT NULL,
  corrected_fragment TEXT       NOT NULL,
  pattern_hash      TEXT        NOT NULL,             -- sha256(normalize(original_fragment))
  pattern_regex     TEXT        NULL,                 -- 추후 자동 추출된 regex (옵션)
  occurrences       INT         NOT NULL DEFAULT 1,
  confidence        REAL        NOT NULL DEFAULT 0.0,
  status            TEXT        NOT NULL DEFAULT 'learning'
                               CHECK (status IN ('learning', 'auto_applied', 'rejected')),
  notes             TEXT        NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.latex_render_corrections IS 'LaTeX 렌더 수정 학습 — 수동 편집 diff 저장, confidence 누적';
COMMENT ON COLUMN public.latex_render_corrections.source IS '수정 대상: content_latex or solution_latex';
COMMENT ON COLUMN public.latex_render_corrections.pattern_hash IS '중복/빈도 집계 키 (공백/수치 무관화한 원본의 sha256)';
COMMENT ON COLUMN public.latex_render_corrections.confidence IS '자동 적용 임계값. 3회↑ = 0.7, 10회↑ = 0.95 로 승급';
COMMENT ON COLUMN public.latex_render_corrections.status IS 'learning=수집 중, auto_applied=confidence 임계 통과, rejected=관리자 거절';

CREATE INDEX IF NOT EXISTS idx_lrc_pattern_hash  ON public.latex_render_corrections (pattern_hash);
CREATE INDEX IF NOT EXISTS idx_lrc_status_conf   ON public.latex_render_corrections (status, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_lrc_problem       ON public.latex_render_corrections (problem_id) WHERE problem_id IS NOT NULL;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION public.latex_render_corrections_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lrc_touch ON public.latex_render_corrections;
CREATE TRIGGER trg_lrc_touch
  BEFORE UPDATE ON public.latex_render_corrections
  FOR EACH ROW EXECUTE FUNCTION public.latex_render_corrections_touch_updated_at();

-- RLS: 로그인 유저 누구나 자기 수정 저장, 전원 조회 가능 (학습 공유)
ALTER TABLE public.latex_render_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lrc_select_all   ON public.latex_render_corrections;
DROP POLICY IF EXISTS lrc_insert_auth  ON public.latex_render_corrections;

CREATE POLICY lrc_select_all
  ON public.latex_render_corrections
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY lrc_insert_auth
  ON public.latex_render_corrections
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
