-- ============================================================================
-- diagram_images: unit_code, unit_name 컬럼 추가
-- AI 태깅 시 과목 레벨뿐 아니라 단원까지 자동 분류
-- ============================================================================

-- 1. 컬럼 추가
ALTER TABLE diagram_images
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_name TEXT;

-- 2. unit_code 인덱스 (prefix 검색용)
CREATE INDEX IF NOT EXISTS idx_diagram_images_unit_code
  ON diagram_images(unit_code);

-- 3. 기존 tags JSONB에 unit_code가 있는 경우 역채움
UPDATE diagram_images
SET
  unit_code = tags->>'unit_code',
  unit_name = tags->>'unit_name'
WHERE
  unit_code IS NULL
  AND tags->>'unit_code' IS NOT NULL;
