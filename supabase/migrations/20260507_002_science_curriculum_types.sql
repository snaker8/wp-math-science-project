-- ============================================================================
-- science_curriculum_types: 과학 분류 트리 (mathsecr_types 의 과학판)
-- ----------------------------------------------------------------------------
-- 목적: 통합과학·물리/화학/생명/지구 분류 체계를 mathsecr_types 와 평행 구조로
--       적재. 자산화 시 과학 트랙 시험지의 분류 코드 부여, UI 트리 표시 등에 사용.
--
-- 코드 형식 (예: 통합과학):
--   SC01                       — 과목(통합과학)
--   SC01-1                     — 대단원
--   SC01-1-1                   — 중단원
--   SC01-1-1-1                 — 소단원
--   SC01-1-1-1-01              — 세부유형
--
-- 안전성: 신규 테이블 — 기존 수학 라인 영향 0.
-- 시드: scripts/seed-science-curriculum.ts 로 별도 적재 (이번 마이그레이션은 schema 만).
--
-- 참고: split-1-db 브랜치 검증 완료. 구조 그대로 가져옴.
-- ============================================================================

CREATE TABLE IF NOT EXISTS science_curriculum_types (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,             -- 풀 코드 (예: SC01-1-1-1-01)
  subject_code  TEXT NOT NULL,                    -- 과목 코드 (01=통합과학, 02=물리, 03=화학, 04=생명, 05=지구)
  subject_name  TEXT NOT NULL,                    -- 과목명
  level1_code   TEXT,                             -- 대단원 코드
  level1_name   TEXT,                             -- 대단원명
  level2_code   TEXT,                             -- 중단원 코드
  level2_name   TEXT,
  level3_code   TEXT,                             -- 소단원 코드
  level3_name   TEXT,
  level4_code   TEXT,                             -- 세부유형 코드
  level4_name   TEXT,
  depth         INT  NOT NULL,                    -- 1=과목, 2=대, 3=중, 4=소, 5=유형
  is_leaf       BOOLEAN NOT NULL DEFAULT FALSE,
  parent_code   TEXT,
  full_path     TEXT NOT NULL,                    -- "통합과학 > 과학의 기초 > ... > 시간과 공간"
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sci_types_subject_code ON science_curriculum_types(subject_code);
CREATE INDEX IF NOT EXISTS idx_sci_types_parent       ON science_curriculum_types(parent_code);
CREATE INDEX IF NOT EXISTS idx_sci_types_depth        ON science_curriculum_types(depth);
CREATE INDEX IF NOT EXISTS idx_sci_types_is_leaf      ON science_curriculum_types(is_leaf);
CREATE INDEX IF NOT EXISTS idx_sci_types_level1_code  ON science_curriculum_types(level1_code);

-- RLS: 모든 인증 사용자 read 허용 (mathsecr_types 와 동일 정책)
ALTER TABLE science_curriculum_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS science_types_read_all ON science_curriculum_types;
DROP POLICY IF EXISTS science_types_admin_write ON science_curriculum_types;

CREATE POLICY science_types_read_all ON science_curriculum_types
  FOR SELECT USING (true);

CREATE POLICY science_types_admin_write ON science_curriculum_types
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE science_curriculum_types IS
  '과학 분류 체계 트리 (mathsecr_types 와 동일 구조). 통합과학·물리·화학·생명·지구 시드 예정.';
COMMENT ON COLUMN science_curriculum_types.code IS '풀 코드 (예: SC01-1-1-1-01). 자산화 시 problems.classifications.type_code 에 저장.';
COMMENT ON COLUMN science_curriculum_types.depth IS '1=과목, 2=대단원, 3=중단원, 4=소단원, 5=세부유형. 트리 깊이.';
