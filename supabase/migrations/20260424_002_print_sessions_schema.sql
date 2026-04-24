-- ============================================================================
-- Phase 2.5 — QR 채점 시스템 스키마
-- ----------------------------------------------------------------------------
-- 목적:
--   학생 × 학습지 × 회차 단위의 채점 세션. 세션마다 고유 QR (session_id) 부여.
--   강사용 PDF → 스캔 → /grade/[session_id] 모바일 채점 → 결과 저장.
--
-- 기존 diagnostics.sessions 와 병행 운영:
--   diagnostics.sessions        : 수동 입력형(구 체계), prescription/entry 에서 사용
--   diagnostics.print_sessions  : QR·인쇄 기반(신규), 이 파일에서 추가
--
-- 안전:
--   신규 테이블만 추가 (IF NOT EXISTS). 기존 스키마/데이터 변경 없음.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- print_sessions : 학생별 × 학습지별 × 회차별 채점 세션
--   session_type: BS / DD / PT / SC (기존 enum 재사용)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostics.print_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL,                         -- public.users.id
  exam_id           UUID NOT NULL,                         -- public.exams.id
  round_number      SMALLINT NOT NULL DEFAULT 1,
  session_type      TEXT NOT NULL DEFAULT 'BS'
                   CHECK (session_type IN ('BS', 'DD', 'PT', 'SC')),
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- 세션 생성(PDF 발급) 시각
  started_at        TIMESTAMPTZ,                           -- 채점 시작 시각
  completed_at      TIMESTAMPTZ,                           -- 채점 완료 시각
  duration_minutes  INT,                                   -- 학생 풀이 소요 시간(분)
  issued_by         UUID,                                  -- 발급 강사 (public.users.id)
  teacher_note      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  diagnostics.print_sessions IS 'QR 채점 세션 (학생×시험지×회차)';
COMMENT ON COLUMN diagnostics.print_sessions.student_id IS 'public.users.id 소프트 참조';
COMMENT ON COLUMN diagnostics.print_sessions.exam_id IS 'public.exams.id 소프트 참조';

CREATE INDEX IF NOT EXISTS idx_ps_student  ON diagnostics.print_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_ps_exam     ON diagnostics.print_sessions(exam_id);
CREATE INDEX IF NOT EXISTS idx_ps_issued   ON diagnostics.print_sessions(issued_at DESC);
-- 같은 학생×시험지×회차 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS uq_ps_student_exam_round
  ON diagnostics.print_sessions(student_id, exam_id, round_number);

-- ──────────────────────────────────────────────────────────────────────────
-- session_problems : 세션 내 각 문항 (출제 시점 스냅샷)
--   출제 당시 type_code·difficulty 를 고정 저장 — 이후 분류 바뀌어도 집계 보존
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostics.session_problems (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES diagnostics.print_sessions(id) ON DELETE CASCADE,
  problem_id            UUID NOT NULL,                     -- public.problems.id
  sequence_number       INT NOT NULL,
  type_code_snapshot    TEXT,                              -- MS07-... 출제 시점 코드
  difficulty_snapshot   SMALLINT                           -- 1~10 스냅샷
                       CHECK (difficulty_snapshot IS NULL OR difficulty_snapshot BETWEEN 1 AND 10),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  diagnostics.session_problems IS '세션 문항 스냅샷 (출제 시점 type_code·difficulty 고정)';
COMMENT ON COLUMN diagnostics.session_problems.problem_id IS 'public.problems.id 소프트 참조';

CREATE INDEX IF NOT EXISTS idx_sp_session ON diagnostics.session_problems(session_id);
CREATE INDEX IF NOT EXISTS idx_sp_problem ON diagnostics.session_problems(problem_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sp_session_seq
  ON diagnostics.session_problems(session_id, sequence_number);

-- ──────────────────────────────────────────────────────────────────────────
-- session_results : 채점 결과 (문항 단위)
--   error_cause: 개념/유형/계산/문장제/시간 (기존 diagnostics.items 와 동일 enum)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostics.session_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES diagnostics.print_sessions(id) ON DELETE CASCADE,
  problem_id        UUID NOT NULL,                         -- public.problems.id
  sequence_number   INT NOT NULL,
  is_correct        BOOLEAN NOT NULL,
  error_cause       TEXT CHECK (error_cause IN ('개념','유형','계산','문장제','시간')),
  teacher_note      TEXT,
  graded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  diagnostics.session_results IS '채점 결과 (문항 단위 O/X + 오답 원인)';

CREATE INDEX IF NOT EXISTS idx_sr_session ON diagnostics.session_results(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sr_session_seq
  ON diagnostics.session_results(session_id, sequence_number);

-- ──────────────────────────────────────────────────────────────────────────
-- 트리거: session_results INSERT/UPDATE 시 print_sessions 완료 시각·상태 동기화
--   모든 문항이 채점되면 completed_at 자동 기록, 일부면 started_at 만 기록
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION diagnostics.sync_print_session_progress()
RETURNS TRIGGER AS $$
DECLARE
  total_cnt  INT;
  graded_cnt INT;
BEGIN
  SELECT COUNT(*) INTO total_cnt
    FROM diagnostics.session_problems WHERE session_id = NEW.session_id;
  SELECT COUNT(*) INTO graded_cnt
    FROM diagnostics.session_results WHERE session_id = NEW.session_id;

  UPDATE diagnostics.print_sessions
     SET started_at = COALESCE(started_at, NEW.graded_at),
         completed_at = CASE
           WHEN graded_cnt >= total_cnt AND total_cnt > 0 THEN NEW.graded_at
           ELSE completed_at
         END
   WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sr_sync_progress ON diagnostics.session_results;
CREATE TRIGGER trg_sr_sync_progress
  AFTER INSERT OR UPDATE ON diagnostics.session_results
  FOR EACH ROW EXECUTE FUNCTION diagnostics.sync_print_session_progress();

-- ──────────────────────────────────────────────────────────────────────────
-- 뷰: print_sessions 집계 — 진행률·정답률·소요시간 한 번에 조회
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW diagnostics.v_print_session_summary AS
SELECT
  ps.id                                                      AS session_id,
  ps.student_id,
  ps.exam_id,
  ps.round_number,
  ps.session_type,
  ps.issued_at,
  ps.started_at,
  ps.completed_at,
  ps.duration_minutes,
  ps.teacher_note,
  (SELECT COUNT(*) FROM diagnostics.session_problems sp WHERE sp.session_id = ps.id) AS problems_total,
  (SELECT COUNT(*) FROM diagnostics.session_results  sr WHERE sr.session_id = ps.id) AS problems_graded,
  (SELECT COUNT(*) FROM diagnostics.session_results  sr WHERE sr.session_id = ps.id AND sr.is_correct) AS correct_cnt,
  CASE
    WHEN (SELECT COUNT(*) FROM diagnostics.session_results sr WHERE sr.session_id = ps.id) = 0 THEN NULL
    ELSE ROUND(
      100.0 * (SELECT COUNT(*) FROM diagnostics.session_results sr WHERE sr.session_id = ps.id AND sr.is_correct)
        / (SELECT COUNT(*) FROM diagnostics.session_results sr WHERE sr.session_id = ps.id),
      1
    )
  END                                                         AS score_pct
FROM diagnostics.print_sessions ps;

-- ──────────────────────────────────────────────────────────────────────────
-- RLS 기본 정책 (학생 자신 + 같은 institute 강사)
--   상세 tightening 은 2차 작업에서. 지금은 authenticated 전원 읽기/쓰기 허용.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE diagnostics.print_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics.session_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostics.session_results  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ps_all  ON diagnostics.print_sessions;
DROP POLICY IF EXISTS sp_all  ON diagnostics.session_problems;
DROP POLICY IF EXISTS sr_all  ON diagnostics.session_results;

CREATE POLICY ps_all ON diagnostics.print_sessions   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sp_all ON diagnostics.session_problems FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sr_all ON diagnostics.session_results  FOR ALL TO authenticated USING (true) WITH CHECK (true);
