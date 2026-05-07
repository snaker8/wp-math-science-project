-- ============================================================================
-- ROLLBACK: subject_track 컬럼 + science_curriculum_types 모두 제거
-- ----------------------------------------------------------------------------
-- 사용 시점: Phase 1 적용 후 사고 발생, *완전히* 직전 상태로 되돌리고 싶을 때.
-- 주의: 이 DOWN 실행 시 운영 코드는 *반드시* 트랙 컬럼 의존하지 않는 상태여야 함.
--       (Feature flag false + 트랙 코드 모두 revert 한 상태에서만 실행)
--
-- 안전성:
--   - DROP COLUMN IF EXISTS — 컬럼 없으면 noop
--   - 데이터 손실 가능 — 컬럼 자체가 사라지므로 백필된 'math' 값도 사라짐 (재추가 시 다시 백필 가능)
--   - science_curriculum_types 도 DROP — 시드 데이터 사라짐 (재시드 필요)
-- ============================================================================

-- 5. source_files
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'source_files') THEN
    DROP INDEX IF EXISTS idx_source_files_subject_track;
    ALTER TABLE source_files DROP CONSTRAINT IF EXISTS source_files_subject_track_check;
    ALTER TABLE source_files DROP COLUMN IF EXISTS subject_track;
  END IF;
END$$;

-- 4. book_groups
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'book_groups') THEN
    DROP INDEX IF EXISTS idx_book_groups_subject_track;
    ALTER TABLE book_groups DROP CONSTRAINT IF EXISTS book_groups_subject_track_check;
    ALTER TABLE book_groups DROP COLUMN IF EXISTS subject_track;
  END IF;
END$$;

-- 3. exams
DROP INDEX IF EXISTS idx_exams_subject_track;
ALTER TABLE exams DROP CONSTRAINT IF EXISTS exams_subject_track_check;
ALTER TABLE exams DROP COLUMN IF EXISTS subject_track;

-- 2. problems
DROP INDEX IF EXISTS idx_problems_subject_track;
ALTER TABLE problems DROP CONSTRAINT IF EXISTS problems_subject_track_check;
ALTER TABLE problems DROP COLUMN IF EXISTS subject_track;

-- 1. users
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_active_subject_track_check;
ALTER TABLE users DROP COLUMN IF EXISTS subject_tracks;
ALTER TABLE users DROP COLUMN IF EXISTS active_subject_track;

-- science_curriculum_types 테이블 (Phase 1.2 에서 생성)
DROP TABLE IF EXISTS science_curriculum_types CASCADE;
