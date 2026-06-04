-- ============================================================================
-- Phase 4 — 채점(grading) 두 라인 통합: QR 채점 → mastery 히트맵
--
-- 배경: 학생 채점이 두 갈래로 분리돼 있고, mastery 히트맵(student_node_status)은
--   진단/엑셀 라인(items)만 공급받아 왔다. QR/디지털 채점(session_results)은
--   히트맵에 전혀 닿지 않아, QR로 채점한 학생은 단원 히트맵이 공백이었다.
--
-- 목표: 두 입력 방식(엑셀 일괄 + QR/디지털)을 모두 보존하면서, 집계 레이어만 통합.
--   QR 채점도 Excel 채점과 동일한 α/β/γ 로직으로 student_node_status 에 합류.
--   읽기 경로(리포트·analytics·프리스크립션 히트맵)·앱 코드 전부 불변.
--
-- 설계:
--   - 공유 헬퍼 recompute_node_status(student, code): items ∪ session_results 를
--     "한 곳에서" 합산(클로버 방지)해 upsert. 보류 문항 제외.
--   - items 트리거 함수: 인라인 집계 → 헬퍼 호출로 교체.
--     ★ session_results 가 없으면 합산 결과 = items-only 와 동일 → 기존 진단 학생
--       무회귀 (백필 후 스냅샷 비교로 검증).
--   - session_results 트리거 신설: 헬퍼 호출 (예외 가드로 채점 저장 보호).
--
-- 보류 제외: from-student 자동채점은 판정 불가 문항을 is_correct=false +
--   teacher_note '[자동채점 보류 · ...]' 로 저장(미응답은 아예 row 미생성).
--   안 푼/판정불가 문항이 단원을 γ(약점)로 끌어내리는 것 방지 → 집계에서 제외.
--
-- 안전:
--   - search_path 는 per-element 따옴표 (통째 따옴표 금지 — 20260528 hotfix 교훈).
--   - 본문 전부 schema-qualified.
--   - 멀티테넌시: 트리거는 DB 레벨, 읽기 측이 이미 institute 필터. status.institute_id
--     는 전 라인 NULL 유지(기존과 동일, 신규 누수 경로 없음).
-- ============================================================================

-- ── 1) 공유 재계산 헬퍼 ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION diagnostics.recompute_node_status(
  p_student_id    TEXT,
  p_mathsecr_code TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'diagnostics', 'pg_catalog'
AS $$
DECLARE
  v_total   INT;
  v_correct INT;
  v_score   NUMERIC;
  v_last    TIMESTAMPTZ;
  v_status  TEXT;
  v_cause   TEXT;
BEGIN
  IF p_student_id IS NULL OR p_mathsecr_code IS NULL THEN
    RETURN;
  END IF;

  -- 합산 집계 (두 라인) — 보류 문항 제외
  WITH combined AS (
    -- 라인 A: 진단/엑셀 items
    SELECT i.is_correct, s.conducted_at AS tested_at
    FROM diagnostics.sessions s
    JOIN diagnostics.items i ON i.session_id = s.id
    WHERE s.student_id = p_student_id
      AND i.mathsecr_code = p_mathsecr_code
    UNION ALL
    -- 라인 B: QR/인쇄 session_results (보류 제외)
    SELECT sr.is_correct,
           COALESCE(ps.completed_at, ps.issued_at, sr.graded_at) AS tested_at
    FROM diagnostics.print_sessions ps
    JOIN diagnostics.session_problems spb ON spb.session_id = ps.id
    JOIN diagnostics.session_results  sr  ON sr.session_id = ps.id
                                         AND sr.sequence_number = spb.sequence_number
    WHERE ps.student_id::text = p_student_id
      AND spb.type_code_snapshot = p_mathsecr_code
      AND COALESCE(sr.teacher_note, '') NOT LIKE '%자동채점 보류%'
  )
  SELECT
    COUNT(*)::INT,
    SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::INT,
    MAX(tested_at)
  INTO v_total, v_correct, v_last
  FROM combined;

  -- 집계할 (보류 제외) 결과 없음 → status 미생성/미변경
  IF v_total IS NULL OR v_total = 0 THEN
    RETURN;
  END IF;

  v_score := ROUND(v_correct * 100.0 / NULLIF(v_total, 0), 2);
  v_status := CASE
    WHEN v_score >= 80 THEN 'alpha'
    WHEN v_score >= 60 THEN 'beta'
    ELSE 'gamma'
  END;

  -- dominant_error_cause: 합산 오답 중 최빈 원인
  SELECT ec INTO v_cause FROM (
    SELECT c.error_cause AS ec, COUNT(*) AS cnt
    FROM (
      SELECT i.is_correct, i.error_cause
      FROM diagnostics.sessions s
      JOIN diagnostics.items i ON i.session_id = s.id
      WHERE s.student_id = p_student_id
        AND i.mathsecr_code = p_mathsecr_code
      UNION ALL
      SELECT sr.is_correct, sr.error_cause
      FROM diagnostics.print_sessions ps
      JOIN diagnostics.session_problems spb ON spb.session_id = ps.id
      JOIN diagnostics.session_results  sr  ON sr.session_id = ps.id
                                           AND sr.sequence_number = spb.sequence_number
      WHERE ps.student_id::text = p_student_id
        AND spb.type_code_snapshot = p_mathsecr_code
        AND COALESCE(sr.teacher_note, '') NOT LIKE '%자동채점 보류%'
    ) c
    WHERE c.is_correct = false AND c.error_cause IS NOT NULL
    GROUP BY c.error_cause
    ORDER BY cnt DESC
    LIMIT 1
  ) y;

  INSERT INTO diagnostics.student_node_status AS sns (
    student_id, mathsecr_code, last_tested_at, last_score,
    items_total, items_correct, dominant_error_cause, status, updated_at
  ) VALUES (
    p_student_id, p_mathsecr_code, v_last, v_score,
    v_total, v_correct, v_cause, v_status, NOW()
  )
  ON CONFLICT (student_id, mathsecr_code) DO UPDATE SET
    last_tested_at       = EXCLUDED.last_tested_at,
    last_score           = EXCLUDED.last_score,
    items_total          = EXCLUDED.items_total,
    items_correct        = EXCLUDED.items_correct,
    dominant_error_cause = EXCLUDED.dominant_error_cause,
    status               = EXCLUDED.status,
    updated_at           = NOW();
END;
$$;

-- ── 2) items 트리거 함수 — 인라인 집계 → 헬퍼 호출로 교체 ────────────────────
--   (트리거 바인딩 trg_refresh_status_on_item 은 그대로, 함수 본문만 교체)
--   session_results 가 없으면 합산 = items-only → 기존 결과와 동일(무회귀).
CREATE OR REPLACE FUNCTION diagnostics.refresh_node_status_for_student()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_student_id    TEXT;
  v_mathsecr_code TEXT;
BEGIN
  v_mathsecr_code := COALESCE(NEW.mathsecr_code, OLD.mathsecr_code);

  SELECT s.student_id INTO v_student_id
  FROM diagnostics.sessions s
  WHERE s.id = COALESCE(NEW.session_id, OLD.session_id);

  -- 세션이 이미 삭제됐으면 (DELETE CASCADE 흐름) skip
  IF v_student_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM diagnostics.recompute_node_status(v_student_id, v_mathsecr_code);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── 3) session_results 트리거 신설 — QR 채점 → 히트맵 ────────────────────────
CREATE OR REPLACE FUNCTION diagnostics.refresh_node_status_from_session_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'diagnostics', 'pg_catalog'
AS $$
DECLARE
  v_student_id    TEXT;
  v_mathsecr_code TEXT;
BEGIN
  SELECT ps.student_id::text INTO v_student_id
  FROM diagnostics.print_sessions ps
  WHERE ps.id = COALESCE(NEW.session_id, OLD.session_id);

  SELECT spb.type_code_snapshot INTO v_mathsecr_code
  FROM diagnostics.session_problems spb
  WHERE spb.session_id = COALESCE(NEW.session_id, OLD.session_id)
    AND spb.sequence_number = COALESCE(NEW.sequence_number, OLD.sequence_number);

  IF v_student_id IS NULL OR v_mathsecr_code IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- status 갱신 실패가 채점 저장(session_results) 트랜잭션을 롤백시키지 않게
  BEGIN
    PERFORM diagnostics.recompute_node_status(v_student_id, v_mathsecr_code);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_status_on_session_result ON diagnostics.session_results;
CREATE TRIGGER trg_refresh_status_on_session_result
  AFTER INSERT OR UPDATE OR DELETE ON diagnostics.session_results
  FOR EACH ROW
  EXECUTE FUNCTION diagnostics.refresh_node_status_from_session_result();

-- 권한
REVOKE ALL ON FUNCTION diagnostics.recompute_node_status(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION diagnostics.recompute_node_status(TEXT, TEXT) TO authenticated, service_role;

-- ── 4) 백필 — 기존 (student, code) 전부 재계산 ───────────────────────────────
--   items 학생: 합산=items-only → 동일 값(무회귀). QR 학생: 신규 status 생성.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT s.student_id AS sid, i.mathsecr_code AS code
    FROM diagnostics.sessions s
    JOIN diagnostics.items i ON i.session_id = s.id
    WHERE s.student_id IS NOT NULL AND i.mathsecr_code IS NOT NULL
    UNION
    SELECT DISTINCT ps.student_id::text, spb.type_code_snapshot
    FROM diagnostics.print_sessions ps
    JOIN diagnostics.session_problems spb ON spb.session_id = ps.id
    JOIN diagnostics.session_results  sr  ON sr.session_id = ps.id
                                         AND sr.sequence_number = spb.sequence_number
    WHERE ps.student_id IS NOT NULL AND spb.type_code_snapshot IS NOT NULL
      AND COALESCE(sr.teacher_note, '') NOT LIKE '%자동채점 보류%'
  LOOP
    PERFORM diagnostics.recompute_node_status(r.sid, r.code);
  END LOOP;
END $$;
