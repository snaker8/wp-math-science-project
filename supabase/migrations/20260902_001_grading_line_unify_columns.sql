-- ============================================================================
-- 채점 두 라인 통합 준비 — B라인(print_sessions/session_results)에 칸 추가
-- (prod 적용 완료 2026-09-02. 저장소 기록용 사본)
-- ----------------------------------------------------------------------------
-- 배경: 같은 사실("이 학생이 이 문제를 맞았나")을 두 곳에 다르게 써 왔다.
--   A: diagnostics.sessions + items                  111세션 · 2,746문항  (수동 입력)
--   B: diagnostics.print_sessions + session_results    96세션 · 1,658문항  (QR·엑셀·이미지)
-- A 는 problem_id 가 없어 "무슨 문제를 틀렸는지"를 몰라 오답·취약 과제의 재료가 못 됐다.
--
-- 실측 (2026-09-02)
--   · A 문항 2,721건 전부 seq ↔ exam_problems.sequence_number 로 문제 복원 (110/110 세션)
--   · 두 라인 세션 겹침 0 → 순수 합집합
--   · A 만 가진 값: time_taken_sec 0 · error_cause 0 · difficulty 0 → 사실상 유형코드뿐
--   · 유형코드 2,527건 일치 / 194건 불일치 → 버리지 않고 session_results 에 보존
--
-- 칸만 추가한다. 기존 동작 무영향. 데이터 복사는 scripts/migrate-grading-line-a-to-b.ts.
-- A 테이블은 지우지 않는다 (원본 보존).
-- ============================================================================

ALTER TABLE diagnostics.print_sessions
  ADD COLUMN IF NOT EXISTS institute_id          uuid,
  ADD COLUMN IF NOT EXISTS share_token           text,
  ADD COLUMN IF NOT EXISTS ai_comment_json       jsonb,
  ADD COLUMN IF NOT EXISTS teacher_comment_json  jsonb,
  ADD COLUMN IF NOT EXISTS migrated_from_session uuid;

CREATE UNIQUE INDEX IF NOT EXISTS print_sessions_share_token_key
  ON diagnostics.print_sessions (share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS print_sessions_institute_idx
  ON diagnostics.print_sessions (institute_id);
CREATE INDEX IF NOT EXISTS print_sessions_migrated_from_idx
  ON diagnostics.print_sessions (migrated_from_session) WHERE migrated_from_session IS NOT NULL;

ALTER TABLE diagnostics.session_results
  ADD COLUMN IF NOT EXISTS mathsecr_code      text,
  ADD COLUMN IF NOT EXISTS time_taken_sec     integer,
  ADD COLUMN IF NOT EXISTS migrated_from_item uuid;

CREATE INDEX IF NOT EXISTS session_results_mathsecr_idx
  ON diagnostics.session_results (mathsecr_code) WHERE mathsecr_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS session_results_migrated_from_idx
  ON diagnostics.session_results (migrated_from_item) WHERE migrated_from_item IS NOT NULL;

COMMENT ON COLUMN diagnostics.print_sessions.migrated_from_session IS
  '이관 출처 diagnostics.sessions.id — 되돌릴 때: DELETE WHERE migrated_from_session IS NOT NULL';
COMMENT ON COLUMN diagnostics.session_results.migrated_from_item IS
  '이관 출처 diagnostics.items.id — 되돌릴 때: DELETE WHERE migrated_from_item IS NOT NULL';
COMMENT ON COLUMN diagnostics.session_results.mathsecr_code IS
  '채점 당시 지정된 유형코드. 문제의 현재 분류와 다를 수 있어 별도 보존 (실측 194건 불일치)';
