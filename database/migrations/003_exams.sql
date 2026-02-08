-- ============================================================================
-- Phase 5: Exams Management Tables
-- 시험지 및 시험지-문제 연결 테이블
-- ============================================================================

-- Exams 테이블 (시험지)
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID REFERENCES institutes(id),
  created_by UUID REFERENCES auth.users(id),
  
  -- 기본 정보
  title TEXT NOT NULL,
  description TEXT,
  grade VARCHAR(50),        -- '고등 1학년', '중등 3학년'
  subject VARCHAR(100),     -- '수학I', '미적분'
  unit VARCHAR(100),        -- '다항식의 연산'
  
  -- 상태 관리
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETED', 'PUBLISHED')),
  difficulty VARCHAR(10),   -- 'Lv.1' ~ 'Lv.5'
  
  -- 메타데이터
  problem_count INT DEFAULT 0,
  total_points INT DEFAULT 100,
  time_limit_minutes INT,
  
  -- 타임스탬프
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  published_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Exam Problems 테이블 (시험지-문제 연결)
CREATE TABLE IF NOT EXISTS exam_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE NOT NULL,
  problem_id UUID REFERENCES problems(id) NOT NULL,
  
  -- 문제 순서 및 배점
  order_index INT NOT NULL,
  points INT DEFAULT 5,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- 유니크 제약 (같은 시험지에 같은 문제 중복 방지)
  UNIQUE(exam_id, problem_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_exams_created_by ON exams(created_by);
CREATE INDEX IF NOT EXISTS idx_exams_institute_id ON exams(institute_id);
CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exam_problems_exam_id ON exam_problems(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_problems_problem_id ON exam_problems(problem_id);

-- RLS 정책
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_problems ENABLE ROW LEVEL SECURITY;

-- Exams RLS: 본인이 생성한 시험지만 조회/수정 가능
CREATE POLICY "Users can view own exams"
  ON exams FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert own exams"
  ON exams FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own exams"
  ON exams FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Users can delete own exams"
  ON exams FOR DELETE
  USING (auth.uid() = created_by);

-- Exam Problems RLS: 시험지 소유자만 문제 관리 가능
CREATE POLICY "Users can manage exam problems for own exams"
  ON exam_problems FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_problems.exam_id
      AND exams.created_by = auth.uid()
    )
  );

-- Updated at 트리거
CREATE OR REPLACE FUNCTION update_exams_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_exams_updated_at
  BEFORE UPDATE ON exams
  FOR EACH ROW
  EXECUTE FUNCTION update_exams_updated_at();

-- 문제 수 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_exam_problem_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    UPDATE exams
    SET problem_count = (
      SELECT COUNT(*) FROM exam_problems WHERE exam_id = COALESCE(NEW.exam_id, OLD.exam_id)
    )
    WHERE id = COALESCE(NEW.exam_id, OLD.exam_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_exam_problem_count
  AFTER INSERT OR DELETE ON exam_problems
  FOR EACH ROW
  EXECUTE FUNCTION update_exam_problem_count();
