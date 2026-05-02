-- ============================================================================
-- 객관식 정답 박힘 차단 — DB CHECK 제약 (마지막 수비선)
-- ============================================================================
-- 어떤 진입 경로(자산화/PATCH/auto-fix/generate-solution)로 들어와도
-- 객관식인데 정답이 ① ~ ⑤ / 1~5 / 빈값(미입력) / null 외면 INSERT/UPDATE 거부.
--
-- NOT VALID 옵션 — 기존 261개 박힌 데이터는 그대로 두고 신규만 적용.
-- (admin/answer-fix 도구로 회복 후 별도 VALIDATE 필요)
--
-- 메모리: feedback_objective_answer_safety.md
-- ============================================================================

ALTER TABLE problems
  ADD CONSTRAINT chk_objective_answer_valid CHECK (
    answer_json->>'type' IS NULL
    OR answer_json->>'type' != 'multiple_choice'
    OR answer_json->>'correct_answer' IS NULL
    OR answer_json->>'correct_answer' = ''
    OR answer_json->>'correct_answer' IN ('①','②','③','④','⑤','1','2','3','4','5')
  ) NOT VALID;

COMMENT ON CONSTRAINT chk_objective_answer_valid ON problems IS
  '객관식 정답은 ① ~ ⑤ / 1~5 / 빈값(미입력) 만 허용. 0/모호값 박힘 차단.';
