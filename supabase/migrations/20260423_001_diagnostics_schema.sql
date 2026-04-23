-- ============================================================================
-- 과사람수학 진단(diagnostics) 시스템 스키마
-- 수학비서(mathsecr) 분류 체계 기반
-- Generated: 2026-04-23 (재설계 v2)
-- Target: 기존 과사람수학 Supabase 프로젝트 (동일 auth/users + public.mathsecr_types 재사용)
-- ============================================================================

-- 이전 버전이 이미 적용되어 있으면 통째로 제거 (실 데이터 없을 때만 안전)
DROP SCHEMA IF EXISTS diagnostics CASCADE;

-- 전용 스키마 생성 (기존 public과 분리)
CREATE SCHEMA diagnostics;
COMMENT ON SCHEMA diagnostics IS '과사람수학 학생 진단/온보딩/스팟체크 데이터 (수학비서 분류 기반)';

-- ============================================================================
-- TABLES
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- sessions : 진단 세션
--   session_type:
--     BS = Broad Scan (1회차 광역 스캔)
--     DD = Deep Dive (2회차 정밀 진단)
--     PT = Prerequisite Trace (3회차 선수 추적)
--     SC = Spot Check (재원생 주기 점검)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE diagnostics.sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            TEXT NOT NULL,          -- public.users.id (UUID 문자열 규약)
  session_type          TEXT NOT NULL CHECK (session_type IN ('BS','DD','PT','SC')),
  round_no              SMALLINT,                -- 1,2,3 (BS/DD/PT) · NULL (SC)
  target_grade          SMALLINT,                -- 학생 현재 학년 (7=중1 … 12=고3)
  mathflat_sheet_id     TEXT,                    -- 매쓰플랫 학습지 ID
  mathflat_sheet_name   TEXT,                    -- 학습지 이름 (BS_M2_STU0412_R1_…)
  conducted_at          TIMESTAMPTZ,
  conducted_by          TEXT,                    -- 담임 ID/이름
  duration_min          SMALLINT,
  note                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_student ON diagnostics.sessions(student_id);
CREATE INDEX idx_sessions_conducted ON diagnostics.sessions(conducted_at DESC);

-- ──────────────────────────────────────────────────────────────────────────
-- items : 문항별 결과 (로우 데이터)
--   mathsecr_code : public.mathsecr_types.code 참조 (MS07-01-03-02-05 형식)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE diagnostics.items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES diagnostics.sessions(id) ON DELETE CASCADE,
  mathsecr_code     TEXT NOT NULL,               -- public.mathsecr_types.code (소프트 참조)
  seq               SMALLINT NOT NULL,
  difficulty        SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
  mathflat_item_id  TEXT,
  is_correct        BOOLEAN NOT NULL,
  error_cause       TEXT CHECK (error_cause IN ('개념','유형','계산','문장제','시간')),
  time_taken_sec    INT,
  note              TEXT
);

CREATE INDEX idx_items_session ON diagnostics.items(session_id);
CREATE INDEX idx_items_mathsecr ON diagnostics.items(mathsecr_code);

-- ──────────────────────────────────────────────────────────────────────────
-- student_node_status : 학생 × 수학비서 코드 최신 상태 (집계)
--   items INSERT/UPDATE/DELETE 시 트리거로 자동 갱신
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE diagnostics.student_node_status (
  student_id            TEXT NOT NULL,
  mathsecr_code         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'unknown'
                          CHECK (status IN ('alpha','beta','gamma','unknown')),
                        -- alpha = 마스터 (≥80%), beta = 안정 (60~79%), gamma = 불안정 (<60%)
  last_tested_at        TIMESTAMPTZ,
  last_score            NUMERIC(5,2),
  items_total           INT DEFAULT 0,
  items_correct         INT DEFAULT 0,
  dominant_error_cause  TEXT,
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (student_id, mathsecr_code)
);

CREATE INDEX idx_status_student ON diagnostics.student_node_status(student_id);
CREATE INDEX idx_status_status ON diagnostics.student_node_status(status);

-- ──────────────────────────────────────────────────────────────────────────
-- prerequisites : 수학비서 코드 간 선수 관계 (DAG)
--   수학비서 자체엔 선수 정보가 없어 수동 큐레이션. MVP는 빈 상태로 시작.
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE diagnostics.prerequisites (
  mathsecr_code         TEXT NOT NULL,
  prereq_mathsecr_code  TEXT NOT NULL,
  strength              SMALLINT NOT NULL DEFAULT 2 CHECK (strength BETWEEN 1 AND 3),
                        -- 1=약한 연관, 2=보통, 3=강한 필수 선수
  note                  TEXT,
  PRIMARY KEY (mathsecr_code, prereq_mathsecr_code),
  CHECK (mathsecr_code <> prereq_mathsecr_code)
);

CREATE INDEX idx_prereq_node ON diagnostics.prerequisites(mathsecr_code);
CREATE INDEX idx_prereq_prereq ON diagnostics.prerequisites(prereq_mathsecr_code);

-- ──────────────────────────────────────────────────────────────────────────
-- lesson_plans : 주차별 수업 계획
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE diagnostics.lesson_plans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             TEXT NOT NULL,
  week_start             DATE NOT NULL,             -- 해당 주의 월요일
  target_mathsecr_codes  TEXT[] NOT NULL DEFAULT '{}',
  materials              JSONB DEFAULT '{}'::jsonb, -- {"매쓰플랫": [...], "교재": [...]}
  goals                  TEXT,
  notes                  TEXT,
  created_by             TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, week_start)
);

CREATE INDEX idx_plans_student ON diagnostics.lesson_plans(student_id, week_start DESC);

-- ============================================================================
-- TRIGGERS — items 입력/수정 시 student_node_status 자동 갱신
-- ============================================================================

CREATE OR REPLACE FUNCTION diagnostics.refresh_node_status_for_student()
RETURNS TRIGGER AS $$
DECLARE
  v_student_id    TEXT;
  v_mathsecr_code TEXT;
BEGIN
  v_mathsecr_code := COALESCE(NEW.mathsecr_code, OLD.mathsecr_code);

  SELECT s.student_id INTO v_student_id
  FROM diagnostics.sessions s
  WHERE s.id = COALESCE(NEW.session_id, OLD.session_id);

  INSERT INTO diagnostics.student_node_status AS sns (
    student_id, mathsecr_code, last_tested_at, last_score,
    items_total, items_correct, dominant_error_cause, status, updated_at
  )
  SELECT
    v_student_id,
    v_mathsecr_code,
    MAX(s.conducted_at),
    ROUND(SUM(CASE WHEN i.is_correct THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*),0), 2),
    COUNT(*)::INT,
    SUM(CASE WHEN i.is_correct THEN 1 ELSE 0 END)::INT,
    (SELECT ec FROM (
       SELECT i2.error_cause AS ec, COUNT(*) AS cnt
       FROM diagnostics.items i2
       JOIN diagnostics.sessions s2 ON s2.id = i2.session_id
       WHERE s2.student_id = v_student_id
         AND i2.mathsecr_code = v_mathsecr_code
         AND i2.is_correct = false
         AND i2.error_cause IS NOT NULL
       GROUP BY i2.error_cause
       ORDER BY cnt DESC
       LIMIT 1
     ) x),
    CASE
      WHEN COUNT(*) = 0 THEN 'unknown'
      WHEN SUM(CASE WHEN i.is_correct THEN 1 ELSE 0 END) * 100.0 / COUNT(*) >= 80 THEN 'alpha'
      WHEN SUM(CASE WHEN i.is_correct THEN 1 ELSE 0 END) * 100.0 / COUNT(*) >= 60 THEN 'beta'
      ELSE 'gamma'
    END,
    NOW()
  FROM diagnostics.sessions s
  JOIN diagnostics.items i ON i.session_id = s.id
  WHERE s.student_id = v_student_id
    AND i.mathsecr_code = v_mathsecr_code
  ON CONFLICT (student_id, mathsecr_code) DO UPDATE SET
    last_tested_at       = EXCLUDED.last_tested_at,
    last_score           = EXCLUDED.last_score,
    items_total          = EXCLUDED.items_total,
    items_correct        = EXCLUDED.items_correct,
    dominant_error_cause = EXCLUDED.dominant_error_cause,
    status               = EXCLUDED.status,
    updated_at           = NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_status_on_item
AFTER INSERT OR UPDATE OR DELETE ON diagnostics.items
FOR EACH ROW
EXECUTE FUNCTION diagnostics.refresh_node_status_for_student();

-- ============================================================================
-- VIEWS — UI에서 바로 쓰는 조회용
-- ============================================================================

-- 학생 × (과목=학년·학기) × 대단원 히트맵 집계
CREATE OR REPLACE VIEW diagnostics.v_student_mathsecr_heatmap AS
SELECT
  sns.student_id,
  mt.subject_code,
  mt.subject_name,
  mt.level1_code,
  mt.level1_name,
  COUNT(*)                            AS nodes_total,
  SUM((sns.status = 'alpha')::INT)    AS alpha_count,
  SUM((sns.status = 'beta')::INT)     AS beta_count,
  SUM((sns.status = 'gamma')::INT)    AS gamma_count,
  SUM((sns.status = 'unknown')::INT)  AS unknown_count,
  ROUND(AVG(sns.last_score)::NUMERIC, 2) AS avg_score
FROM diagnostics.student_node_status sns
JOIN public.mathsecr_types mt ON mt.code = sns.mathsecr_code
GROUP BY sns.student_id, mt.subject_code, mt.subject_name, mt.level1_code, mt.level1_name;

-- 학생 오답 원인 분포 (성향 파악)
CREATE OR REPLACE VIEW diagnostics.v_student_error_profile AS
SELECT
  s.student_id,
  i.error_cause,
  COUNT(*) AS cnt,
  ROUND(COUNT(*) * 100.0 /
    NULLIF(SUM(COUNT(*)) OVER (PARTITION BY s.student_id), 0), 2) AS pct
FROM diagnostics.items i
JOIN diagnostics.sessions s ON s.id = i.session_id
WHERE i.is_correct = false AND i.error_cause IS NOT NULL
GROUP BY s.student_id, i.error_cause;

-- 선수 관계를 따라 약점 체인 탐색 (재귀 함수)
--   prerequisites 테이블이 비어있으면 depth=0만 반환.
CREATE OR REPLACE FUNCTION diagnostics.trace_weakness_chain(p_student_id TEXT, p_root_code TEXT)
RETURNS TABLE (
  depth         INT,
  mathsecr_code TEXT,
  full_path     TEXT,
  status        TEXT,
  last_score    NUMERIC
) AS $$
  WITH RECURSIVE chain AS (
    SELECT 0 AS depth, mt.code AS mathsecr_code, mt.full_path,
           sns.status, sns.last_score
    FROM public.mathsecr_types mt
    LEFT JOIN diagnostics.student_node_status sns
      ON sns.mathsecr_code = mt.code AND sns.student_id = p_student_id
    WHERE mt.code = p_root_code
    UNION ALL
    SELECT c.depth + 1, mt.code, mt.full_path, sns.status, sns.last_score
    FROM chain c
    JOIN diagnostics.prerequisites p ON p.mathsecr_code = c.mathsecr_code
    JOIN public.mathsecr_types mt ON mt.code = p.prereq_mathsecr_code
    LEFT JOIN diagnostics.student_node_status sns
      ON sns.mathsecr_code = mt.code AND sns.student_id = p_student_id
    WHERE c.depth < 5
  )
  SELECT * FROM chain ORDER BY depth, mathsecr_code;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- ROW LEVEL SECURITY (MVP: authenticated 통과 — 운영 전 teachers 테이블 제약 추가)
-- ============================================================================
ALTER TABLE diagnostics.sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics.items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics.student_node_status   ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics.prerequisites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics.lesson_plans          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teachers_all_sessions"
  ON diagnostics.sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "teachers_all_items"
  ON diagnostics.items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_status"
  ON diagnostics.student_node_status FOR SELECT TO authenticated USING (true);

CREATE POLICY "write_status"
  ON diagnostics.student_node_status FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "update_status"
  ON diagnostics.student_node_status FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "read_prereqs"
  ON diagnostics.prerequisites FOR SELECT TO authenticated USING (true);

CREATE POLICY "teachers_all_plans"
  ON diagnostics.lesson_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
