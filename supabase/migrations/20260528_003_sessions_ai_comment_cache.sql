-- 학생 1인 리포트 AI 코멘트 캐싱 (Claude Sonnet 호출 결과)
-- 학생 × 시험 = 1 세션이므로 sessions 에 직접 컬럼 추가
ALTER TABLE diagnostics.sessions
  ADD COLUMN IF NOT EXISTS ai_comment_json JSONB;

COMMENT ON COLUMN diagnostics.sessions.ai_comment_json IS
  '학생 1인 리포트 AI 맞춤 코멘트 캐시. shape: { strong, weak, method, generatedAt, model }';
