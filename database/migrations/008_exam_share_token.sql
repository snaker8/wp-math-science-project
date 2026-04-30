-- ============================================================================
-- Phase 8: Exam Share Token — 학부모 공개 링크용 토큰
-- ============================================================================

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS share_token VARCHAR(32) UNIQUE;

COMMENT ON COLUMN exams.share_token IS
  '학부모 공유용 공개 토큰. 32자 랜덤 hex. NULL = 공유 비활성. /share/exam/{token} 경로로 인증 없이 접근.';

CREATE INDEX IF NOT EXISTS idx_exams_share_token
  ON exams(share_token)
  WHERE share_token IS NOT NULL;
