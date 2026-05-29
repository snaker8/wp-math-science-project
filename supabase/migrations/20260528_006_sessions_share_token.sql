-- 학생 1인 리포트 학부모 공유 토큰
-- 세션당 1개. 강사가 발급/회수.
ALTER TABLE diagnostics.sessions
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_sessions_share_token
  ON diagnostics.sessions(share_token)
  WHERE share_token IS NOT NULL;

COMMENT ON COLUMN diagnostics.sessions.share_token IS
  '학부모 공유 URL 토큰. NULL=비공개. /share/student-report/[token] 으로 접근.';
