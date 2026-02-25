-- ============================================================================
-- Migration 006: detection_annotations 테이블
-- YOLO 학습 데이터 수집용 - 자산화 시 문제 영역 bbox + 페이지 이미지 저장
-- ============================================================================

-- 문제 영역 감지 어노테이션 (YOLO 트레이닝 데이터)
CREATE TABLE IF NOT EXISTS detection_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- 연결
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
    exam_id UUID REFERENCES exams(id) ON DELETE SET NULL,
    job_id TEXT,                                -- 업로드 작업 ID

    -- 페이지 정보
    page_number INTEGER NOT NULL,              -- 1-based
    page_image_path TEXT NOT NULL,              -- Storage: page-images/{jobId}/page-{n}.png
    page_width INTEGER,                        -- 페이지 이미지 px 너비
    page_height INTEGER,                       -- 페이지 이미지 px 높이

    -- Bbox (top-left origin, normalized 0~1)
    bbox_x REAL NOT NULL,
    bbox_y REAL NOT NULL,
    bbox_w REAL NOT NULL,
    bbox_h REAL NOT NULL,

    -- 클래스 정보 (멀티클래스 YOLO용)
    class_label VARCHAR(20) NOT NULL DEFAULT 'problem',  -- problem | graph | table
    problem_number INTEGER,                    -- 문제 번호 (1-based)
    detection_source VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
        -- MANUAL: 사용자 수동 크롭
        -- AUTO: AutoCrop 픽셀 분석
        -- AI_VISION: GPT-4o Vision
        -- MATHPIX: Mathpix lines.json 기반

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_da_page_image ON detection_annotations(page_image_path);
CREATE INDEX IF NOT EXISTS idx_da_class ON detection_annotations(class_label);
CREATE INDEX IF NOT EXISTS idx_da_exam ON detection_annotations(exam_id);
CREATE INDEX IF NOT EXISTS idx_da_job ON detection_annotations(job_id);

-- RLS
ALTER TABLE detection_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view detection annotations"
    ON detection_annotations FOR SELECT
    USING (true);

CREATE POLICY "Service can insert detection annotations"
    ON detection_annotations FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service can update detection annotations"
    ON detection_annotations FOR UPDATE
    USING (true);

CREATE POLICY "Service can delete detection annotations"
    ON detection_annotations FOR DELETE
    USING (true);
