-- 트리거 NULL 가드 추가
-- 세션이 CASCADE 로 먼저 삭제된 상태에서 items 삭제 트리거가 fire 되면
-- sessions 에서 student_id 조회가 NULL 반환 → student_node_status INSERT 시
-- PRIMARY KEY (student_id, mathsecr_code) NOT NULL 위반.
-- 해결: v_student_id IS NULL 이면 트리거 skip.

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

  -- 세션이 이미 삭제됐으면 (DELETE CASCADE 흐름) 갱신 skip
  -- → orphan 한 student_node_status row 는 남지만 다음 채점에서 자연 갱신
  IF v_student_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

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
