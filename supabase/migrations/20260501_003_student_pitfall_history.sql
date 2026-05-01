-- ============================================================================
-- 카파시 self-compiling — 학생 오답 매칭 (Phase C-2)
--
-- 학생이 채점에서 오답(is_correct=false)을 낼 때, 그 문항에 태깅된
-- problem_pitfalls를 student_pitfall_history에 누적.
-- 시간이 갈수록 학생별 함정 패턴 데이터 풍부 → 학부모 대시보드
-- "이 학생은 분배법칙 함정에서 6번 막혔음" + "이번 주 새 연결" 위젯의
-- base 데이터로 활용.
--
-- diagnostics 스키마에 둠 — student_id는 public.users.id 소프트 참조
-- (print_sessions/sessions와 동일 패턴).
-- ============================================================================

CREATE TABLE IF NOT EXISTS diagnostics.student_pitfall_history (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID         NOT NULL,                         -- public.users.id 소프트 참조
  pitfall_code  VARCHAR(50)  NOT NULL REFERENCES public.pitfall_types(code) ON UPDATE CASCADE,
  problem_id    UUID,        -- public.problems.id 소프트 참조 (어떤 문항에서 빠졌는지)
  session_id    UUID,        -- diagnostics.print_sessions.id 또는 diagnostics.sessions.id 소프트 참조
  exam_id       UUID,        -- public.exams.id 소프트 참조 (시험지 컨텍스트)
  occurred_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sph_student          ON diagnostics.student_pitfall_history(student_id);
CREATE INDEX IF NOT EXISTS idx_sph_pitfall          ON diagnostics.student_pitfall_history(pitfall_code);
CREATE INDEX IF NOT EXISTS idx_sph_student_pitfall  ON diagnostics.student_pitfall_history(student_id, pitfall_code);
CREATE INDEX IF NOT EXISTS idx_sph_occurred         ON diagnostics.student_pitfall_history(occurred_at DESC);

COMMENT ON TABLE  diagnostics.student_pitfall_history IS '학생이 오답을 낸 시점에 그 문항의 problem_pitfalls를 누적. 학부모 대시보드 + 약점 추적의 base.';
COMMENT ON COLUMN diagnostics.student_pitfall_history.pitfall_code IS 'public.pitfall_types.code (외래키, ON UPDATE CASCADE).';
COMMENT ON COLUMN diagnostics.student_pitfall_history.student_id IS 'public.users.id 소프트 참조 (cross-schema FK 회피).';

-- ────────────────────────────────────────────────────────────────────────────
-- 학생별 함정 누적 빈도 뷰 — 학부모 대시보드/약점 추적용
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW diagnostics.v_student_pitfall_summary AS
SELECT
  h.student_id,
  h.pitfall_code,
  pt.label_ko       AS pitfall_label,
  pt.category       AS pitfall_category,
  COUNT(*)::INT     AS occurrence_count,
  MAX(h.occurred_at) AS last_occurred_at,
  MIN(h.occurred_at) AS first_occurred_at,
  COUNT(DISTINCT h.problem_id)::INT AS distinct_problem_count
FROM diagnostics.student_pitfall_history h
LEFT JOIN public.pitfall_types pt ON pt.code = h.pitfall_code
GROUP BY h.student_id, h.pitfall_code, pt.label_ko, pt.category;

COMMENT ON VIEW diagnostics.v_student_pitfall_summary IS '학생 × 함정 유형별 누적 빈도. 학부모 대시보드 "이번 주 새 연결" / 약점 시각화 base.';
