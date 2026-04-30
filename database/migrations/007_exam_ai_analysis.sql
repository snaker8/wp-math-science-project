-- ============================================================================
-- Phase 7: Exam-level AI Analysis
-- 시험지 단위 AI 분석 결과 저장 (시험총평/단원별/고난도)
-- ============================================================================

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT '{}';

COMMENT ON COLUMN exams.ai_analysis IS
  '시험지 단위 AI 분석 결과: { summary, overallDifficulty, unitAnalyses[], hardQuestions[], generatedAt, modelVersion }';

-- 분석 완료된 시험지 빠른 조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_exams_ai_analysis_generated
  ON exams ((ai_analysis->>'generatedAt'))
  WHERE ai_analysis ? 'generatedAt';
