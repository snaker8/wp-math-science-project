-- ============================================================================
-- 중요 유형 배지 K1 — 학교기출 출제 빈도 집계 함수 (docs/PLAN_KEY_TYPES.md)
-- ----------------------------------------------------------------------------
-- 출제 빈도(type) = 그 유형 문제가 들어 있는 학교기출 시험지 수 / 분류된 문제가 있는 학교기출 시험지 수
--   · 학교기출 = exams.school_name 이 있고 진단이 아닌 시험지 (제목 파서 백필 컬럼)
--   · 시험지 수로 센다 — 한 시험지에 같은 유형이 여러 문제여도 1회
--   · school 을 주면 그 학교 시험지만 (「이 학교 빈출」)
-- 실측 2026-09-06: 학교기출 1,594장 · 132교 · 분류된 문제 있는 시험지 413장
-- ============================================================================
CREATE OR REPLACE FUNCTION public.key_type_frequency(subject_prefix text, school text DEFAULT NULL)
RETURNS TABLE (type_code text, exam_count bigint, total_exams bigint, schools text[])
LANGUAGE sql STABLE AS $$
WITH ex AS (
  SELECT e.id, e.school_name FROM public.exams e
  WHERE e.deleted_at IS NULL AND COALESCE(e.is_diagnostic, false) = false AND e.school_name IS NOT NULL
    AND (school IS NULL OR e.school_name = school)
), et AS (
  SELECT DISTINCT ex.id AS exam_id, ex.school_name, c.type_code
  FROM ex
  JOIN public.exam_problems ep ON ep.exam_id = ex.id
  JOIN public.classifications c ON c.problem_id = ep.problem_id
  WHERE c.type_code LIKE subject_prefix || '-%'
), tot AS (SELECT count(DISTINCT exam_id) AS n FROM et)
SELECT et.type_code, count(DISTINCT et.exam_id)::bigint, (SELECT n FROM tot)::bigint, array_agg(DISTINCT et.school_name)
FROM et GROUP BY et.type_code;
$$;
COMMENT ON FUNCTION public.key_type_frequency IS '중요 유형 배지 — 학교기출 시험지 중 이 유형이 나온 시험지 수 (docs/PLAN_KEY_TYPES.md K1)';
