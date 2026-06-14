-- ============================================================================
-- 자유 조합(임의 시험지 여러 개) 종합 리포트 학부모 공유 지원
--
-- 자유 조합 리포트는 set_key 가 아니라 examIds 배열로 합산 계산되는데,
-- parent_share_tokens 가 set_key 만 저장 → 공유 페이지 resolver 가 examIds 를
-- 못 받아 "리포트를 찾을 수 없음" 으로 실패. exam_ids(csv) 컬럼 추가로 해결.
-- report_kind 는 'diagnostic_set' 그대로 두되, exam_ids 가 있으면 자유 조합으로 계산.
-- 순수 추가형 — 데이터 손실/기존 동작 변경 없음.
-- ============================================================================

ALTER TABLE parent_share_tokens ADD COLUMN IF NOT EXISTS exam_ids TEXT;

COMMENT ON COLUMN parent_share_tokens.exam_ids
  IS '자유 조합 종합 리포트의 시험지 id 목록(csv). 있으면 set_key 대신 이 조합으로 합산. report_kind=diagnostic_set.';
