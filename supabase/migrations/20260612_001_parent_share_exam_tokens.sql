-- ============================================================================
-- 개별 시험 리포트 학부모 공유 — QR/수동(라인B) 채점 학생 지원
--
-- 기존 토큰 저장소가 diagnostics.sessions.share_token(라인A=EX 세션 전용)뿐이라
-- print_sessions+session_results 로만 채점된 학생은 공유 발급이 404
-- ("이 학생의 채점 기록이 없습니다") 로 실패하던 문제.
--
-- parent_share_tokens 에 exam_id 추가 → report_kind='exam' 토큰 수용.
-- 라인A 학생은 기존 sessions.share_token 경로 그대로 (레거시 토큰 유효).
-- 순수 추가형 — 데이터 손실/기존 동작 변경 없음.
-- ============================================================================

ALTER TABLE parent_share_tokens ADD COLUMN IF NOT EXISTS exam_id UUID;

CREATE INDEX IF NOT EXISTS idx_pst_exam
  ON parent_share_tokens(student_id, exam_id)
  WHERE report_kind = 'exam';

COMMENT ON COLUMN parent_share_tokens.exam_id
  IS '개별 시험 리포트 공유(report_kind=exam) 대상 시험. 라인A(EX 세션) 레거시 토큰은 diagnostics.sessions.share_token 병행.';
