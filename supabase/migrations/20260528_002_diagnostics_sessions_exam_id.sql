-- ============================================================================
-- diagnostics.sessions.exam_id — 시험(exams)과 진단 세션 연결
--
-- 배경:
--   학습 분석 리포트 기능: 강사가 시험 1개를 골라 학생 답안 엑셀 일괄 업로드.
--   학생별로 진단 세션(diagnostics.sessions) 1건씩 생성하면서 어느 시험인지
--   추적할 컬럼 필요.
--
-- 정책:
--   - exam_id NULL 허용 — 기존 비-시험 세션(BS/DD/PT) 호환
--   - exams 삭제 시 SET NULL — 진단 이력 보존
-- ============================================================================

ALTER TABLE diagnostics.sessions
  ADD COLUMN IF NOT EXISTS exam_id UUID
    REFERENCES public.exams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_exam
  ON diagnostics.sessions(exam_id)
  WHERE exam_id IS NOT NULL;

COMMENT ON COLUMN diagnostics.sessions.exam_id IS
  '시험(public.exams) 연결. NULL=비-시험 세션. 학습 분석 리포트의 엑셀 일괄 업로드 시 채워짐.';

-- session_type 'EX' (Exam = 내신/모의시험 일괄 채점) 추가
ALTER TABLE diagnostics.sessions
  DROP CONSTRAINT IF EXISTS sessions_session_type_check;

ALTER TABLE diagnostics.sessions
  ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('BS','DD','PT','SC','EX'));

COMMENT ON COLUMN diagnostics.sessions.session_type IS
  'BS=광역스캔, DD=정밀진단, PT=선수추적, SC=스팟체크, EX=시험일괄채점(학습분석리포트)';
