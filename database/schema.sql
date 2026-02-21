-- ============================================================================
-- 수작(Suzag) 유사 수학 문제은행 플랫폼 - Database Schema
-- Target: Supabase (PostgreSQL)
-- Version: 1.0.0
-- ============================================================================

-- ============================================================================
-- SECTION 1: EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- 텍스트 검색 최적화

-- ============================================================================
-- SECTION 2: CUSTOM ENUM TYPES
-- ============================================================================

-- 난이도 (1~5단계)
CREATE TYPE difficulty_level AS ENUM ('1', '2', '3', '4', '5');

-- 인지 영역 (4가지)
CREATE TYPE cognitive_domain AS ENUM (
    'CALCULATION',      -- 계산
    'UNDERSTANDING',    -- 이해
    'INFERENCE',        -- 추론
    'PROBLEM_SOLVING'   -- 문제해결
);

-- 채점 상태 (4단계)
CREATE TYPE grading_status AS ENUM (
    'CORRECT',          -- 정답
    'PARTIAL_CORRECT',  -- 부분정답
    'PARTIAL_WRONG',    -- 부분오답
    'WRONG'             -- 오답
);

-- 요금제 등급
CREATE TYPE plan_tier AS ENUM ('LITE', 'CORE', 'PRO');

-- 사용자 역할
CREATE TYPE user_role AS ENUM ('ADMIN', 'TEACHER', 'STUDENT', 'PARENT');

-- 파일 타입
CREATE TYPE file_type AS ENUM ('PDF', 'IMG', 'HWP');

-- 문제 상태
CREATE TYPE problem_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'ARCHIVED');

-- 시험 상태
CREATE TYPE exam_status AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- ============================================================================
-- SECTION 3: CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 institutes (학원/기관)
-- ----------------------------------------------------------------------------
CREATE TABLE institutes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    business_number VARCHAR(20) UNIQUE,           -- 사업자등록번호
    plan_tier plan_tier NOT NULL DEFAULT 'LITE',
    plan_started_at TIMESTAMPTZ,
    plan_expires_at TIMESTAMPTZ,

    -- 연락처 정보
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),

    -- 제한 설정 (요금제별)
    max_teachers INTEGER DEFAULT 3,
    max_students INTEGER DEFAULT 50,
    max_problems INTEGER DEFAULT 1000,
    max_storage_gb DECIMAL(10, 2) DEFAULT 5.0,

    -- 메타데이터
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE institutes IS '학원/기관 정보 및 요금제 관리';
COMMENT ON COLUMN institutes.plan_tier IS 'LITE: 기본, CORE: 중급, PRO: 프리미엄';

-- ----------------------------------------------------------------------------
-- 3.2 users (사용자)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    institute_id UUID REFERENCES institutes(id) ON DELETE SET NULL,

    -- 기본 정보
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role user_role NOT NULL DEFAULT 'STUDENT',

    -- 프로필
    avatar_url TEXT,
    grade INTEGER CHECK (grade >= 1 AND grade <= 12),  -- 학년 (1~12)

    -- 학생 전용 필드
    parent_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- 메타데이터
    preferences JSONB DEFAULT '{}',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE users IS '사용자 (관리자, 선생님, 학생, 학부모)';

-- ----------------------------------------------------------------------------
-- 3.3 source_files (업로드된 원본 파일)
-- ----------------------------------------------------------------------------
CREATE TABLE source_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- 파일 정보
    file_name VARCHAR(255) NOT NULL,
    file_type file_type NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    storage_path TEXT NOT NULL,                    -- Supabase Storage 경로

    -- OCR 처리 상태
    ocr_status VARCHAR(20) DEFAULT 'PENDING',      -- PENDING, PROCESSING, COMPLETED, FAILED
    ocr_result JSONB,                              -- Mathpix API 응답 저장
    ocr_processed_at TIMESTAMPTZ,

    -- 메타데이터
    page_count INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE source_files IS 'PDF/IMG/HWP 업로드 파일 및 OCR 처리 결과';

-- ----------------------------------------------------------------------------
-- 3.4 problem_types (문제 유형 마스터 - 3,569개 유형)
-- ----------------------------------------------------------------------------
CREATE TABLE problem_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 유형 코드 체계
    type_code VARCHAR(20) NOT NULL UNIQUE,         -- 예: "MA-ALG-001-A"

    -- 계층 구조
    subject VARCHAR(50) NOT NULL,                  -- 과목 (수학I, 수학II, 미적분 등)
    chapter VARCHAR(100) NOT NULL,                 -- 대단원
    section VARCHAR(100),                          -- 중단원
    subsection VARCHAR(100),                       -- 소단원

    -- 유형 정보
    type_name VARCHAR(255) NOT NULL,               -- 유형명
    description TEXT,

    -- 통계
    total_problems INTEGER DEFAULT 0,
    avg_correct_rate DECIMAL(5, 2),

    -- 메타데이터
    keywords TEXT[],                               -- 검색 키워드
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE problem_types IS '(레거시) 문제 유형 마스터 테이블';
COMMENT ON COLUMN problem_types.type_code IS '유형 코드 (예: MA-ALG-001-A)';

-- ----------------------------------------------------------------------------
-- 3.4b expanded_math_types (확장 세부유형 - 505개 성취기준 → 1,139+ 유형)
-- ----------------------------------------------------------------------------
CREATE TABLE expanded_math_types (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type_code       TEXT NOT NULL UNIQUE,             -- MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ}
    type_name       TEXT NOT NULL,
    description     TEXT,
    solution_method TEXT,
    subject         TEXT NOT NULL,                    -- 과목명
    area            TEXT NOT NULL,                    -- 영역명
    standard_code   TEXT NOT NULL,                    -- 성취기준 코드 [10수학01-01]
    standard_content TEXT,                            -- 성취기준 내용
    cognitive       TEXT NOT NULL DEFAULT 'UNDERSTANDING'
        CHECK (cognitive IN ('CALCULATION','UNDERSTANDING','INFERENCE','PROBLEM_SOLVING')),
    difficulty_min  SMALLINT NOT NULL DEFAULT 1 CHECK (difficulty_min BETWEEN 1 AND 5),
    difficulty_max  SMALLINT NOT NULL DEFAULT 3 CHECK (difficulty_max BETWEEN 1 AND 5),
    keywords        JSONB DEFAULT '[]',
    school_level    TEXT NOT NULL,                    -- 초등학교/중학교/고등학교
    level_code      TEXT NOT NULL,                    -- ES12, ES34, ES56, MS, HS0, HS1, HS2, CAL, PRB, GEO
    domain_code     TEXT NOT NULL,                    -- POL, EQU, INE 등 (24개)
    is_active       BOOLEAN DEFAULT TRUE,
    problem_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE expanded_math_types IS '505개 성취기준 → 1,139+ 세부유형 마스터 테이블';

CREATE INDEX idx_emt_level_code ON expanded_math_types(level_code);
CREATE INDEX idx_emt_domain_code ON expanded_math_types(domain_code);
CREATE INDEX idx_emt_standard_code ON expanded_math_types(standard_code);
CREATE INDEX idx_emt_level_domain ON expanded_math_types(level_code, domain_code);

-- ----------------------------------------------------------------------------
-- 3.5 problems (문제)
-- ----------------------------------------------------------------------------
CREATE TABLE problems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID REFERENCES institutes(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,

    -- 문제 내용 (LaTeX)
    content_latex TEXT NOT NULL,                   -- 문제 본문 (LaTeX 포함)
    content_html TEXT,                             -- 렌더링용 HTML
    solution_latex TEXT,                           -- 해설 (LaTeX)
    solution_html TEXT,                            -- 해설 렌더링용 HTML

    -- 정답 데이터
    answer_json JSONB NOT NULL,                    -- 정답 데이터 (다양한 형식 지원)
    /*
        answer_json 구조 예시:
        {
            "type": "multiple_choice" | "short_answer" | "essay" | "multi_step",
            "correct_answer": "3" | ["1", "4"] | "\\frac{1}{2}",
            "acceptable_answers": ["0.5", "1/2", "\\frac{1}{2}"],
            "points": 10,
            "partial_criteria": [
                { "step": 1, "points": 3, "keywords": ["미분"] },
                { "step": 2, "points": 4, "keywords": ["적분"] },
                { "step": 3, "points": 3, "keywords": ["대입"] }
            ]
        }
    */

    -- 이미지/첨부파일
    images JSONB DEFAULT '[]',                     -- 문제에 포함된 이미지 URLs

    -- 상태
    status problem_status DEFAULT 'DRAFT',

    -- 출처 정보
    source_name VARCHAR(255),                      -- 출처 (예: "2024 수능", "모의고사")
    source_year INTEGER,
    source_month INTEGER,
    source_number INTEGER,                         -- 문제 번호

    -- AI 분석 결과
    ai_analysis JSONB DEFAULT '{}',                -- GPT-4o 분석 결과 저장

    -- 메타데이터
    tags TEXT[],
    view_count INTEGER DEFAULT 0,
    usage_count INTEGER DEFAULT 0,                 -- 시험에 출제된 횟수
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE problems IS '수학 문제 (LaTeX 기반)';
COMMENT ON COLUMN problems.content_latex IS '문제 본문 (LaTeX 수식 포함)';
COMMENT ON COLUMN problems.answer_json IS '정답 데이터 (다양한 문제 유형 지원)';

-- ----------------------------------------------------------------------------
-- 3.6 classifications (문제 분류 - 수작 분류 체계)
-- ----------------------------------------------------------------------------
CREATE TABLE classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,

    -- 분류 체계
    type_code VARCHAR(20) NOT NULL,                -- 유형 코드 (레거시 또는 확장)
    type_id UUID REFERENCES problem_types(id) ON DELETE SET NULL,
    expanded_type_code TEXT REFERENCES expanded_math_types(type_code) ON DELETE SET NULL,  -- 확장 세부유형 FK
    difficulty difficulty_level NOT NULL,          -- 1~5 난이도
    cognitive_domain cognitive_domain NOT NULL,    -- 인지 영역

    -- AI 분류 신뢰도
    ai_confidence DECIMAL(5, 4),                   -- 0.0000 ~ 1.0000
    is_verified BOOLEAN DEFAULT FALSE,             -- 선생님 검수 여부
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,

    -- 추가 분류 정보
    estimated_time_minutes INTEGER,                -- 예상 풀이 시간 (분)
    prerequisite_types TEXT[],                     -- 선수 유형 코드들

    -- 메타데이터
    classification_source VARCHAR(20) DEFAULT 'AI', -- AI, MANUAL, IMPORTED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 복합 유니크 제약
    UNIQUE(problem_id, type_code)
);

COMMENT ON TABLE classifications IS '문제 분류 (1,139+ 세부유형, 5단계 난이도, 4가지 인지영역)';
COMMENT ON COLUMN classifications.type_code IS '유형 코드';
COMMENT ON COLUMN classifications.expanded_type_code IS '확장 세부유형 코드 (MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ})';
COMMENT ON COLUMN classifications.difficulty IS '1(최하) ~ 5(최상) 단계';
COMMENT ON COLUMN classifications.cognitive_domain IS 'CALCULATION, UNDERSTANDING, INFERENCE, PROBLEM_SOLVING';

-- ----------------------------------------------------------------------------
-- 3.7 exams (시험/테스트)
-- ----------------------------------------------------------------------------
CREATE TABLE exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- 시험 정보
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status exam_status DEFAULT 'DRAFT',

    -- 시간 설정
    time_limit_minutes INTEGER,                    -- 제한 시간
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,

    -- 설정
    settings JSONB DEFAULT '{
        "shuffle_problems": false,
        "shuffle_choices": false,
        "show_solution_after": "SUBMIT",
        "allow_partial_grading": true,
        "passing_score": 60
    }',

    -- 통계
    total_points INTEGER DEFAULT 0,
    avg_score DECIMAL(5, 2),
    completion_count INTEGER DEFAULT 0,

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE exams IS '시험/테스트';

-- ----------------------------------------------------------------------------
-- 3.8 exam_problems (시험-문제 연결)
-- ----------------------------------------------------------------------------
CREATE TABLE exam_problems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,

    -- 순서 및 배점
    sequence_number INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 10,

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(exam_id, problem_id),
    UNIQUE(exam_id, sequence_number)
);

COMMENT ON TABLE exam_problems IS '시험-문제 연결 테이블';

-- ----------------------------------------------------------------------------
-- 3.9 exam_records (시험 응시 기록 - 4단계 채점)
-- ----------------------------------------------------------------------------
CREATE TABLE exam_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 응시 정보
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,
    time_spent_seconds INTEGER,

    -- 점수
    total_score DECIMAL(6, 2),
    max_score INTEGER,
    score_percentage DECIMAL(5, 2),

    -- 상태
    is_completed BOOLEAN DEFAULT FALSE,

    -- 메타데이터
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(exam_id, student_id)
);

COMMENT ON TABLE exam_records IS '학생 시험 응시 기록';

-- ----------------------------------------------------------------------------
-- 3.10 exam_answers (개별 문제 답안 - 4단계 채점)
-- ----------------------------------------------------------------------------
CREATE TABLE exam_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_record_id UUID NOT NULL REFERENCES exam_records(id) ON DELETE CASCADE,
    exam_problem_id UUID NOT NULL REFERENCES exam_problems(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,

    -- 학생 답안
    student_answer JSONB,                          -- 학생이 입력한 답
    student_work_latex TEXT,                       -- 학생 풀이 과정 (LaTeX)

    -- 4단계 채점
    grading_status grading_status,                 -- CORRECT, PARTIAL_CORRECT, PARTIAL_WRONG, WRONG
    earned_points DECIMAL(5, 2),
    max_points INTEGER,

    -- 부분 점수 상세
    partial_scores JSONB,                          -- 단계별 부분 점수
    /*
        partial_scores 구조:
        {
            "steps": [
                { "step": 1, "earned": 3, "max": 3, "status": "CORRECT" },
                { "step": 2, "earned": 2, "max": 4, "status": "PARTIAL_CORRECT" },
                { "step": 3, "earned": 0, "max": 3, "status": "WRONG" }
            ],
            "feedback": "2단계에서 적분 상수 누락"
        }
    */

    -- AI 채점 정보
    ai_grading_result JSONB,                       -- AI 채점 상세 결과
    ai_confidence DECIMAL(5, 4),

    -- 선생님 검토
    is_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    teacher_feedback TEXT,

    -- 메타데이터
    answered_at TIMESTAMPTZ,
    time_spent_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(exam_record_id, exam_problem_id)
);

COMMENT ON TABLE exam_answers IS '문제별 답안 및 4단계 채점 결과';
COMMENT ON COLUMN exam_answers.grading_status IS 'CORRECT(정답), PARTIAL_CORRECT(부분정답), PARTIAL_WRONG(부분오답), WRONG(오답)';

-- ----------------------------------------------------------------------------
-- 3.11 student_analytics (학생 분석 데이터 - 히트맵용)
-- ----------------------------------------------------------------------------
CREATE TABLE student_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type_code VARCHAR(20) NOT NULL,                -- 문제 유형 코드

    -- 유형별 통계
    total_attempts INTEGER DEFAULT 0,
    correct_count INTEGER DEFAULT 0,
    partial_correct_count INTEGER DEFAULT 0,
    partial_wrong_count INTEGER DEFAULT 0,
    wrong_count INTEGER DEFAULT 0,

    -- 계산된 지표
    mastery_level DECIMAL(5, 2),                   -- 숙달도 (0~100)
    avg_time_seconds INTEGER,

    -- 추세
    recent_trend VARCHAR(20),                      -- IMPROVING, STABLE, DECLINING
    last_attempt_at TIMESTAMPTZ,

    -- 메타데이터
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(student_id, type_code)
);

COMMENT ON TABLE student_analytics IS '학생별 유형별 분석 데이터 (히트맵 시각화용)';

-- ----------------------------------------------------------------------------
-- 3.12 difficulty_analytics (난이도별 분석 - 히트맵용)
-- ----------------------------------------------------------------------------
CREATE TABLE difficulty_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    difficulty difficulty_level NOT NULL,
    cognitive_domain cognitive_domain NOT NULL,

    -- 통계
    total_attempts INTEGER DEFAULT 0,
    correct_rate DECIMAL(5, 2),
    avg_time_seconds INTEGER,

    -- 메타데이터
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(student_id, difficulty, cognitive_domain)
);

COMMENT ON TABLE difficulty_analytics IS '난이도×인지영역별 분석 (히트맵 매트릭스)';

-- ============================================================================
-- SECTION 4: INDEXES
-- ============================================================================

-- institutes
CREATE INDEX idx_institutes_plan_tier ON institutes(plan_tier);
CREATE INDEX idx_institutes_deleted_at ON institutes(deleted_at) WHERE deleted_at IS NULL;

-- users
CREATE INDEX idx_users_institute_id ON users(institute_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- source_files
CREATE INDEX idx_source_files_institute_id ON source_files(institute_id);
CREATE INDEX idx_source_files_ocr_status ON source_files(ocr_status);
CREATE INDEX idx_source_files_uploaded_by ON source_files(uploaded_by);

-- problem_types
CREATE INDEX idx_problem_types_type_code ON problem_types(type_code);
CREATE INDEX idx_problem_types_subject ON problem_types(subject);
CREATE INDEX idx_problem_types_chapter ON problem_types(chapter);
CREATE INDEX idx_problem_types_keywords ON problem_types USING GIN(keywords);

-- problems
CREATE INDEX idx_problems_institute_id ON problems(institute_id);
CREATE INDEX idx_problems_source_file_id ON problems(source_file_id);
CREATE INDEX idx_problems_status ON problems(status);
CREATE INDEX idx_problems_created_by ON problems(created_by);
CREATE INDEX idx_problems_tags ON problems USING GIN(tags);
CREATE INDEX idx_problems_content_search ON problems USING GIN(content_latex gin_trgm_ops);
CREATE INDEX idx_problems_deleted_at ON problems(deleted_at) WHERE deleted_at IS NULL;

-- classifications
CREATE INDEX idx_classifications_problem_id ON classifications(problem_id);
CREATE INDEX idx_classifications_type_code ON classifications(type_code);
CREATE INDEX idx_classifications_type_id ON classifications(type_id);
CREATE INDEX idx_classifications_difficulty ON classifications(difficulty);
CREATE INDEX idx_classifications_cognitive_domain ON classifications(cognitive_domain);
CREATE INDEX idx_classifications_composite ON classifications(type_code, difficulty, cognitive_domain);

-- exams
CREATE INDEX idx_exams_institute_id ON exams(institute_id);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_created_by ON exams(created_by);
CREATE INDEX idx_exams_scheduled ON exams(scheduled_start, scheduled_end);

-- exam_records
CREATE INDEX idx_exam_records_exam_id ON exam_records(exam_id);
CREATE INDEX idx_exam_records_student_id ON exam_records(student_id);
CREATE INDEX idx_exam_records_completed ON exam_records(is_completed);

-- exam_answers
CREATE INDEX idx_exam_answers_exam_record_id ON exam_answers(exam_record_id);
CREATE INDEX idx_exam_answers_problem_id ON exam_answers(problem_id);
CREATE INDEX idx_exam_answers_grading_status ON exam_answers(grading_status);

-- student_analytics
CREATE INDEX idx_student_analytics_student_id ON student_analytics(student_id);
CREATE INDEX idx_student_analytics_type_code ON student_analytics(type_code);
CREATE INDEX idx_student_analytics_mastery ON student_analytics(mastery_level);

-- difficulty_analytics
CREATE INDEX idx_difficulty_analytics_student_id ON difficulty_analytics(student_id);

-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE difficulty_analytics ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies
-- ----------------------------------------------------------------------------

-- institutes: 소속 기관만 조회 가능
CREATE POLICY "Users can view their own institute"
    ON institutes FOR SELECT
    USING (id = (SELECT institute_id FROM users WHERE id = auth.uid()));

-- users: 같은 기관 사용자만 조회
CREATE POLICY "Users can view users in same institute"
    ON users FOR SELECT
    USING (
        institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
        OR id = auth.uid()
    );

CREATE POLICY "Users can update their own profile"
    ON users FOR UPDATE
    USING (id = auth.uid());

-- problems: 기관 소속 문제 또는 공개 문제
CREATE POLICY "Users can view problems in their institute"
    ON problems FOR SELECT
    USING (
        institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
        OR institute_id IS NULL
    );

CREATE POLICY "Teachers can insert problems"
    ON problems FOR INSERT
    WITH CHECK (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'TEACHER')
    );

CREATE POLICY "Teachers can update their problems"
    ON problems FOR UPDATE
    USING (
        created_by = auth.uid()
        OR (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
    );

-- exams: 기관 내 시험
CREATE POLICY "Users can view exams in their institute"
    ON exams FOR SELECT
    USING (
        institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "Teachers can manage exams"
    ON exams FOR ALL
    USING (
        (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'TEACHER')
        AND institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
    );

-- exam_records: 본인 기록만
CREATE POLICY "Students can view their own records"
    ON exam_records FOR SELECT
    USING (
        student_id = auth.uid()
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'TEACHER')
    );

CREATE POLICY "Students can insert their own records"
    ON exam_records FOR INSERT
    WITH CHECK (student_id = auth.uid());

-- exam_answers: 본인 답안만
CREATE POLICY "Students can view their own answers"
    ON exam_answers FOR SELECT
    USING (
        exam_record_id IN (SELECT id FROM exam_records WHERE student_id = auth.uid())
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'TEACHER')
    );

-- student_analytics: 본인 또는 선생님
CREATE POLICY "View own analytics or as teacher"
    ON student_analytics FOR SELECT
    USING (
        student_id = auth.uid()
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('ADMIN', 'TEACHER')
    );

-- problem_types: 모든 사용자 조회 가능
CREATE POLICY "Everyone can view problem types"
    ON problem_types FOR SELECT
    USING (true);

-- classifications: problems와 동일
CREATE POLICY "Users can view classifications"
    ON classifications FOR SELECT
    USING (
        problem_id IN (
            SELECT id FROM problems
            WHERE institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
            OR institute_id IS NULL
        )
    );

-- source_files: 기관 내 파일
CREATE POLICY "Users can view files in their institute"
    ON source_files FOR SELECT
    USING (
        institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
    );

-- ============================================================================
-- SECTION 6: FUNCTIONS & TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 6.1 Updated_at 자동 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_institutes_updated_at BEFORE UPDATE ON institutes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_source_files_updated_at BEFORE UPDATE ON source_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_problem_types_updated_at BEFORE UPDATE ON problem_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_problems_updated_at BEFORE UPDATE ON problems
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classifications_updated_at BEFORE UPDATE ON classifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at BEFORE UPDATE ON exams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exam_records_updated_at BEFORE UPDATE ON exam_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exam_answers_updated_at BEFORE UPDATE ON exam_answers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_analytics_updated_at BEFORE UPDATE ON student_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 6.2 문제 유형 통계 자동 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_problem_type_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE problem_types
    SET total_problems = (
        SELECT COUNT(*) FROM classifications WHERE type_code = NEW.type_code
    )
    WHERE type_code = NEW.type_code;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_type_stats_on_classification
    AFTER INSERT OR DELETE ON classifications
    FOR EACH ROW EXECUTE FUNCTION update_problem_type_stats();

-- ----------------------------------------------------------------------------
-- 6.3 학생 분석 데이터 자동 갱신
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_student_analytics_on_answer()
RETURNS TRIGGER AS $$
DECLARE
    v_student_id UUID;
    v_type_code VARCHAR(20);
BEGIN
    -- 학생 ID 조회
    SELECT student_id INTO v_student_id
    FROM exam_records WHERE id = NEW.exam_record_id;

    -- 문제 유형 코드 조회
    SELECT c.type_code INTO v_type_code
    FROM classifications c
    WHERE c.problem_id = NEW.problem_id
    LIMIT 1;

    IF v_type_code IS NOT NULL THEN
        -- UPSERT 학생 분석 데이터
        INSERT INTO student_analytics (student_id, type_code, total_attempts,
            correct_count, partial_correct_count, partial_wrong_count, wrong_count, last_attempt_at)
        VALUES (v_student_id, v_type_code, 1,
            CASE WHEN NEW.grading_status = 'CORRECT' THEN 1 ELSE 0 END,
            CASE WHEN NEW.grading_status = 'PARTIAL_CORRECT' THEN 1 ELSE 0 END,
            CASE WHEN NEW.grading_status = 'PARTIAL_WRONG' THEN 1 ELSE 0 END,
            CASE WHEN NEW.grading_status = 'WRONG' THEN 1 ELSE 0 END,
            NOW()
        )
        ON CONFLICT (student_id, type_code) DO UPDATE SET
            total_attempts = student_analytics.total_attempts + 1,
            correct_count = student_analytics.correct_count +
                CASE WHEN NEW.grading_status = 'CORRECT' THEN 1 ELSE 0 END,
            partial_correct_count = student_analytics.partial_correct_count +
                CASE WHEN NEW.grading_status = 'PARTIAL_CORRECT' THEN 1 ELSE 0 END,
            partial_wrong_count = student_analytics.partial_wrong_count +
                CASE WHEN NEW.grading_status = 'PARTIAL_WRONG' THEN 1 ELSE 0 END,
            wrong_count = student_analytics.wrong_count +
                CASE WHEN NEW.grading_status = 'WRONG' THEN 1 ELSE 0 END,
            mastery_level = (
                (student_analytics.correct_count +
                 CASE WHEN NEW.grading_status = 'CORRECT' THEN 1 ELSE 0 END +
                 (student_analytics.partial_correct_count +
                  CASE WHEN NEW.grading_status = 'PARTIAL_CORRECT' THEN 1 ELSE 0 END) * 0.7 +
                 (student_analytics.partial_wrong_count +
                  CASE WHEN NEW.grading_status = 'PARTIAL_WRONG' THEN 1 ELSE 0 END) * 0.3
                )::DECIMAL / (student_analytics.total_attempts + 1) * 100
            ),
            last_attempt_at = NOW(),
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_analytics_on_answer_insert
    AFTER INSERT ON exam_answers
    FOR EACH ROW
    WHEN (NEW.grading_status IS NOT NULL)
    EXECUTE FUNCTION update_student_analytics_on_answer();

-- ----------------------------------------------------------------------------
-- 6.4 시험 총점 자동 계산
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_exam_total_points()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE exams
    SET total_points = (
        SELECT COALESCE(SUM(points), 0)
        FROM exam_problems
        WHERE exam_id = NEW.exam_id
    )
    WHERE id = NEW.exam_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_exam_total_on_problem_change
    AFTER INSERT OR UPDATE OR DELETE ON exam_problems
    FOR EACH ROW EXECUTE FUNCTION calculate_exam_total_points();

-- ============================================================================
-- SECTION 7: VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7.1 문제 상세 뷰 (분류 정보 포함)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_problems_with_classification AS
SELECT
    p.id,
    p.institute_id,
    p.content_latex,
    p.solution_latex,
    p.answer_json,
    p.status,
    p.source_name,
    p.tags,
    p.created_at,
    c.type_code,
    c.difficulty,
    c.cognitive_domain,
    c.ai_confidence,
    c.is_verified,
    pt.type_name,
    pt.subject,
    pt.chapter,
    pt.section
FROM problems p
LEFT JOIN classifications c ON p.id = c.problem_id
LEFT JOIN problem_types pt ON c.type_id = pt.id
WHERE p.deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 7.2 학생 성적 히트맵 뷰
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_student_heatmap AS
SELECT
    sa.student_id,
    u.full_name AS student_name,
    sa.type_code,
    pt.subject,
    pt.chapter,
    pt.type_name,
    sa.total_attempts,
    sa.correct_count,
    sa.partial_correct_count,
    sa.partial_wrong_count,
    sa.wrong_count,
    sa.mastery_level,
    sa.recent_trend,
    sa.last_attempt_at
FROM student_analytics sa
JOIN users u ON sa.student_id = u.id
LEFT JOIN problem_types pt ON sa.type_code = pt.type_code;

-- ----------------------------------------------------------------------------
-- 7.3 난이도×인지영역 매트릭스 뷰
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_difficulty_cognitive_matrix AS
SELECT
    da.student_id,
    da.difficulty,
    da.cognitive_domain,
    da.total_attempts,
    da.correct_rate,
    da.avg_time_seconds
FROM difficulty_analytics da;

-- ============================================================================
-- SECTION 8: SEED DATA (문제 유형 예시)
-- ============================================================================

-- 일부 문제 유형 예시 데이터 (실제로는 3,569개 필요)
INSERT INTO problem_types (type_code, subject, chapter, section, type_name, keywords) VALUES
    ('MA1-POL-001', '수학I', '다항식', '다항식의 연산', '다항식의 덧셈과 뺄셈', ARRAY['다항식', '연산', '덧셈', '뺄셈']),
    ('MA1-POL-002', '수학I', '다항식', '다항식의 연산', '다항식의 곱셈', ARRAY['다항식', '연산', '곱셈']),
    ('MA1-POL-003', '수학I', '다항식', '항등식과 나머지정리', '항등식', ARRAY['항등식', '계수비교']),
    ('MA1-POL-004', '수학I', '다항식', '항등식과 나머지정리', '나머지정리', ARRAY['나머지정리', '인수정리']),
    ('MA1-EQU-001', '수학I', '방정식', '복소수', '복소수의 사칙연산', ARRAY['복소수', '사칙연산', 'i']),
    ('MA1-EQU-002', '수학I', '방정식', '이차방정식', '근의 공식', ARRAY['이차방정식', '근의 공식', '판별식']),
    ('MA2-FUN-001', '수학II', '함수', '함수의 극한', '함수의 극한값 계산', ARRAY['극한', '함수', '수렴']),
    ('MA2-FUN-002', '수학II', '함수', '함수의 연속', '연속함수의 성질', ARRAY['연속', '함수', '중간값정리']),
    ('MA2-DIF-001', '수학II', '미분', '미분계수', '미분계수의 정의', ARRAY['미분', '미분계수', '도함수']),
    ('MA2-DIF-002', '수학II', '미분', '도함수의 활용', '접선의 방정식', ARRAY['미분', '접선', '기울기']),
    ('CAL-INT-001', '미적분', '적분', '부정적분', '부정적분 계산', ARRAY['적분', '부정적분', '원시함수']),
    ('CAL-INT-002', '미적분', '적분', '정적분', '정적분의 계산', ARRAY['적분', '정적분', '면적']),
    ('CAL-INT-003', '미적분', '적분', '정적분의 활용', '넓이 계산', ARRAY['적분', '넓이', '면적']),
    ('PRB-PRB-001', '확률과 통계', '확률', '확률의 뜻과 활용', '확률의 기본 성질', ARRAY['확률', '경우의 수']),
    ('PRB-STA-001', '확률과 통계', '통계', '확률분포', '이산확률변수', ARRAY['통계', '확률분포', '기댓값']),
    ('GEO-VEC-001', '기하', '벡터', '벡터의 연산', '벡터의 덧셈과 뺄셈', ARRAY['벡터', '연산', '덧셈']),
    ('GEO-VEC-002', '기하', '벡터', '벡터의 내적', '내적의 계산', ARRAY['벡터', '내적', '각도'])
ON CONFLICT (type_code) DO NOTHING;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
