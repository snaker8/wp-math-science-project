-- ============================================================================
-- 카파시 self-compiling — 분류 보정 누적 학습 (Phase C-2a)
--
-- 사용자가 분류를 수동으로 보정할 때마다 누적 → 다음 분류 호출 시 비슷한
-- 패턴 검색해서 few-shot으로 Sonnet에 주입 → 시간이 갈수록 정확도 향상.
-- 카파시·루만 self-compiling의 본질: 학원이 쓸수록 시스템이 똑똑해진다.
--
-- 이번 마이그레이션은 인프라(테이블)만. INSERT hook + few-shot 주입은
-- /api/problems/[problemId] PATCH + classify.ts 코드 변경에서.
-- ============================================================================

CREATE TABLE IF NOT EXISTS classification_corrections (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id        UUID         NOT NULL REFERENCES problems(id) ON DELETE CASCADE,

  -- 보정 시점 본문 snapshot (이후 problems.content_latex가 바뀌어도 학습 데이터는 보존)
  problem_content   TEXT,

  -- 분류 변경 (before == after는 INSERT 안 함; 변경된 경우만 누적)
  before_code       VARCHAR(50),
  after_code        VARCHAR(50)  NOT NULL,
  before_type_name  TEXT,
  after_type_name   TEXT,

  -- 보정 시점 시험지 컨텍스트 (few-shot 검색 시 학년·과목 매칭용)
  exam_subject      VARCHAR(50),
  exam_grade        VARCHAR(20),

  -- 강사 메모 (왜 보정했는지)
  reason            TEXT,

  corrected_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
  corrected_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corrections_after_code   ON classification_corrections(after_code);
CREATE INDEX IF NOT EXISTS idx_corrections_subject      ON classification_corrections(exam_subject);
CREATE INDEX IF NOT EXISTS idx_corrections_problem_id   ON classification_corrections(problem_id);
CREATE INDEX IF NOT EXISTS idx_corrections_corrected_at ON classification_corrections(corrected_at DESC);

COMMENT ON TABLE  classification_corrections IS '강사가 분류를 수동 보정할 때마다 누적. classify.ts가 다음 분류 호출 시 비슷한 패턴 검색해서 few-shot으로 주입 (Phase C-2b).';
COMMENT ON COLUMN classification_corrections.problem_content IS '보정 시점 본문 snapshot. problems.content_latex와 별도 (학습 데이터 보존).';
COMMENT ON COLUMN classification_corrections.before_code IS 'AI 또는 직전 분류. 보정 직전 type_code.';
COMMENT ON COLUMN classification_corrections.after_code IS '강사가 정답으로 지정한 type_code.';
