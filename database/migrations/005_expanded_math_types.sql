-- ============================================================================
-- Migration 005: expanded_math_types 테이블 생성
-- 505개 성취기준 → 1,139+ 세부유형 분류 체계
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 5.1 expanded_math_types (확장 세부유형 마스터 테이블)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expanded_math_types (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- 유형 코드 (MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ})
    type_code       TEXT NOT NULL UNIQUE,

    -- 유형 정보
    type_name       TEXT NOT NULL,
    description     TEXT,
    solution_method TEXT,

    -- 교육과정 분류
    subject         TEXT NOT NULL,                -- 과목명 (수학, 수학I, 미적분 등)
    area            TEXT NOT NULL,                -- 영역명 (다항식, 방정식과 부등식 등)
    standard_code   TEXT NOT NULL,                -- 성취기준 코드 [10수학01-01]
    standard_content TEXT,                        -- 성취기준 내용

    -- 인지/난이도
    cognitive       TEXT NOT NULL DEFAULT 'UNDERSTANDING'
        CHECK (cognitive IN ('CALCULATION','UNDERSTANDING','INFERENCE','PROBLEM_SOLVING')),
    difficulty_min  SMALLINT NOT NULL DEFAULT 1
        CHECK (difficulty_min BETWEEN 1 AND 5),
    difficulty_max  SMALLINT NOT NULL DEFAULT 3
        CHECK (difficulty_max BETWEEN 1 AND 5),

    -- 키워드
    keywords        JSONB DEFAULT '[]',

    -- 학교급/레벨/도메인
    school_level    TEXT NOT NULL,                -- 초등학교/중학교/고등학교
    level_code      TEXT NOT NULL,                -- ES12, ES34, ES56, MS, HS0, HS1, HS2, CAL, PRB, GEO
    domain_code     TEXT NOT NULL,                -- POL, EQU, INE, SET, FUN, CNT, CRD 등 (24개)

    -- 메타데이터
    is_active       BOOLEAN DEFAULT TRUE,
    problem_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE expanded_math_types IS '505개 성취기준 → 1,139+ 세부유형 마스터 테이블';
COMMENT ON COLUMN expanded_math_types.type_code IS '유형 코드 (예: MA-HS0-POL-01-001)';
COMMENT ON COLUMN expanded_math_types.standard_code IS '성취기준 코드 (예: [10수학01-01])';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_emt_level_code ON expanded_math_types(level_code);
CREATE INDEX IF NOT EXISTS idx_emt_domain_code ON expanded_math_types(domain_code);
CREATE INDEX IF NOT EXISTS idx_emt_standard_code ON expanded_math_types(standard_code);
CREATE INDEX IF NOT EXISTS idx_emt_subject ON expanded_math_types(subject);
CREATE INDEX IF NOT EXISTS idx_emt_school_level ON expanded_math_types(school_level);
CREATE INDEX IF NOT EXISTS idx_emt_cognitive ON expanded_math_types(cognitive);
CREATE INDEX IF NOT EXISTS idx_emt_level_domain ON expanded_math_types(level_code, domain_code);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_emt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emt_updated_at ON expanded_math_types;
CREATE TRIGGER trg_emt_updated_at
    BEFORE UPDATE ON expanded_math_types
    FOR EACH ROW EXECUTE FUNCTION update_emt_updated_at();

-- RLS
ALTER TABLE expanded_math_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expanded_math_types_select" ON expanded_math_types
    FOR SELECT USING (true);

CREATE POLICY "expanded_math_types_insert" ON expanded_math_types
    FOR INSERT WITH CHECK (true);

CREATE POLICY "expanded_math_types_update" ON expanded_math_types
    FOR UPDATE USING (true);

-- ----------------------------------------------------------------------------
-- 5.2 classifications 테이블에 expanded_type_code 컬럼 추가
-- ----------------------------------------------------------------------------
ALTER TABLE classifications
    ADD COLUMN IF NOT EXISTS expanded_type_code TEXT;

-- FK (soft - nullable)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_classifications_expanded_type'
    ) THEN
        ALTER TABLE classifications
            ADD CONSTRAINT fk_classifications_expanded_type
            FOREIGN KEY (expanded_type_code)
            REFERENCES expanded_math_types(type_code)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classifications_expanded_type
    ON classifications(expanded_type_code);

-- ----------------------------------------------------------------------------
-- 5.3 뷰: 문제 + 확장 유형 조인
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_problem_expanded_classification AS
SELECT
    c.id AS classification_id,
    c.problem_id,
    c.type_code AS legacy_type_code,
    c.expanded_type_code,
    c.difficulty,
    c.cognitive_domain,
    c.ai_confidence,
    c.is_verified,
    emt.type_name,
    emt.description AS type_description,
    emt.solution_method,
    emt.subject,
    emt.area,
    emt.standard_code,
    emt.standard_content,
    emt.keywords,
    emt.school_level,
    emt.level_code,
    emt.domain_code,
    emt.difficulty_min,
    emt.difficulty_max
FROM classifications c
LEFT JOIN expanded_math_types emt ON c.expanded_type_code = emt.type_code;
