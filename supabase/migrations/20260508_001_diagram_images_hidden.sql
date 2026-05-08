-- ============================================================================
-- 도식 이미지 soft-delete 마커 테이블
-- ----------------------------------------------------------------------------
-- 사고: /api/diagram-images DELETE 가 로컬 index.json 출처 도식을 삭제 시도하면
--   pipeline server 가 Vercel 의 read-only filesystem 을 수정 못 해 실패 →
--   캐시 무효화만 되고 다음 GET 에서 같은 index 다시 읽혀 도식이 살아남.
--
-- 해결: 이 테이블에 hidden image_id 누적 → GET 이 로컬 인덱스 결과를 이 테이블로
--   필터링. DB 업로드 (diagram_images) 도식은 기존 hard delete 그대로,
--   여기엔 마킹용으로도 사용 가능 (양쪽 안전).
-- ============================================================================

CREATE TABLE IF NOT EXISTS diagram_images_hidden (
  image_id  TEXT PRIMARY KEY,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_diagram_images_hidden_hidden_at
  ON diagram_images_hidden(hidden_at);

COMMENT ON TABLE diagram_images_hidden IS
  '도식 갤러리 soft-delete 마커. 로컬 index.json 도식의 image_id 누적 → GET 시 필터링.';
