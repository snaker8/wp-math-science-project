-- ============================================================================
-- diagram_images: 도식 이미지 DB (이미지 파이프라인 Phase 1)
-- HWP/PDF에서 추출된 도식 이미지 메타데이터 + Supabase Storage 연동
-- ============================================================================

-- 1. diagram_images 테이블
CREATE TABLE IF NOT EXISTS diagram_images (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL UNIQUE,       -- Supabase Storage 경로
  public_url    TEXT,                        -- CDN public URL
  source_name   TEXT NOT NULL,               -- 원본 파일명 (예: 비상_물리1)
  subject       TEXT NOT NULL DEFAULT 'math', -- math | physics | chemistry | biology | earth_science
  page_number   INT DEFAULT 0,
  width         INT NOT NULL DEFAULT 0,
  height        INT NOT NULL DEFAULT 0,
  phash         TEXT DEFAULT '',             -- Perceptual Hash (유사도 매칭용)
  file_hash     TEXT DEFAULT '',             -- MD5 해시 (중복 체크용)
  diagram_type  TEXT DEFAULT '미분류',        -- 도식 유형 (예: 회로도, 원자모형)
  tags          JSONB DEFAULT '{}'::jsonb,   -- AI 태깅 결과 JSON
  is_enhanced   BOOLEAN DEFAULT FALSE,       -- 보정본 여부
  -- 문제 연결 (Phase 2에서 활용)
  problem_id    UUID REFERENCES problems(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_diagram_images_subject ON diagram_images(subject);
CREATE INDEX IF NOT EXISTS idx_diagram_images_source ON diagram_images(source_name);
CREATE INDEX IF NOT EXISTS idx_diagram_images_file_hash ON diagram_images(file_hash);
CREATE INDEX IF NOT EXISTS idx_diagram_images_diagram_type ON diagram_images(diagram_type);
CREATE INDEX IF NOT EXISTS idx_diagram_images_problem_id ON diagram_images(problem_id);
CREATE INDEX IF NOT EXISTS idx_diagram_images_tags ON diagram_images USING gin(tags);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_diagram_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_diagram_images_updated_at ON diagram_images;
CREATE TRIGGER trigger_diagram_images_updated_at
  BEFORE UPDATE ON diagram_images
  FOR EACH ROW
  EXECUTE FUNCTION update_diagram_images_updated_at();

-- 4. RLS 정책 (관리자만 접근)
ALTER TABLE diagram_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diagram_images_admin_all" ON diagram_images
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Storage 버킷 (수동 생성 필요 시 참조)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('diagram-images', 'diagram-images', true)
-- ON CONFLICT DO NOTHING;
