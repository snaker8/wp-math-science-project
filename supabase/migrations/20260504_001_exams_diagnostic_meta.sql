-- ============================================================================
-- exams 테이블 진단 메타 컬럼 추가
--
-- 진단지 PDF 자산화 흐름 — 자산화 시 제목이 BS_M1_R1 / DD_M2_* / PT_M3_* /
-- SC_* 패턴이면 자동 태깅. 학원자료 페이지(materials) 가 is_diagnostic=true
-- 로 필터링하여 진단지 카탈로그 표시. diagnostics.sessions 와는 향후 PR
-- 에서 연동 (학생이 친 진단지 결과 → 약점 분석).
--
-- 영향 범위:
--   - 새 컬럼만 추가 (NULL/FALSE 기본값) — 기존 exams 행 전부 안전
--   - 기존 INSERT 코드는 새 컬럼 안 채워도 됨 — DEFAULT 적용
--   - 롤백: 컬럼 4개 DROP 만 하면 됨
-- ============================================================================

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS is_diagnostic BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS diagnostic_category TEXT
    CHECK (diagnostic_category IS NULL OR diagnostic_category IN ('BS','DD','PT','SC')),
  ADD COLUMN IF NOT EXISTS diagnostic_round TEXT,             -- 'R1' / 'R2' / 'R3' / 'R4'... (숫자 자유)
  ADD COLUMN IF NOT EXISTS diagnostic_difficulty TEXT;        -- '하' / '중하' / '중' / '상' / '최상' (NULL 허용)

CREATE INDEX IF NOT EXISTS idx_exams_is_diagnostic
  ON exams(is_diagnostic) WHERE is_diagnostic = TRUE;

CREATE INDEX IF NOT EXISTS idx_exams_diagnostic_category
  ON exams(diagnostic_category) WHERE diagnostic_category IS NOT NULL;

COMMENT ON COLUMN exams.is_diagnostic IS '진단지 여부. TRUE 면 학원자료 페이지의 진단평가 카테고리에 노출.';
COMMENT ON COLUMN exams.diagnostic_category IS '진단 종류. BS=광역스캔, DD=정밀진단, PT=선수추적, SC=스팟체크. 자산화 시 제목 패턴 자동 인식 또는 수동 보정.';
COMMENT ON COLUMN exams.diagnostic_round IS 'BS 회차. R1/R2/R3 형식. DD/PT/SC 는 보통 NULL.';
COMMENT ON COLUMN exams.diagnostic_difficulty IS '진단지 난이도(하/중하/중/상/최상). 자동 인식 어려워 보통 수동 입력.';
