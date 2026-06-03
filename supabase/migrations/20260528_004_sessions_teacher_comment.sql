-- 학생 1인 리포트에 강사 수동 메시지 첨부
-- AI 코멘트(ai_comment_json)와 별도 — AI 재생성 시 강사 의견 보존
ALTER TABLE diagnostics.sessions
  ADD COLUMN IF NOT EXISTS teacher_comment_json JSONB;

COMMENT ON COLUMN diagnostics.sessions.teacher_comment_json IS
  '강사가 박은 추가 의견. shape: { text, updatedBy (user uuid), updatedAt (iso) }. NULL=의견 없음.';
