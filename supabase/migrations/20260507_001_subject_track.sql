-- ============================================================================
-- subject_track 컬럼 추가 + 백필 (Phase 1 — DB)
-- ----------------------------------------------------------------------------
-- 목적: 수학·과학 트랙 분리 1단계.
--       모든 컬럼은 DEFAULT 'math' 로 추가하여 기존 수학 워크플로우는 100% 호환.
--       앱 코드는 이 단계에서 한 줄도 변경하지 않음 (Phase 2~ 이후 활성).
--
-- 안전성:
--   - 새 컬럼은 NOT NULL + DEFAULT 'math' (기존 행 자동 백필)
--   - DROP / RENAME 없음
--   - diagram_images 는 이미 subject 컬럼 운영 중이라 손대지 않음
--   - feature flag(NEXT_PUBLIC_TRACK_SPLIT_ENABLED) 기본 false 라 이 컬럼은 *데이터로만 존재*, 동작 변화 0
--
-- 참고: split-1-db 브랜치(검증 완료)의 20260427_001_subject_track.sql 패턴을 그대로 가져옴.
--       날짜만 오늘(20260507) 로 변경.
--
-- 롤백 (사고 시): supabase/migrations/20260507_001_subject_track.DOWN.sql 실행
-- ============================================================================

-- 1. users — 강사·학생이 담당/학습 가능한 트랙들 (배열) + 현재 활성 트랙
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS subject_tracks       text[] NOT NULL DEFAULT ARRAY['math']::text[],
  ADD COLUMN IF NOT EXISTS active_subject_track text   NOT NULL DEFAULT 'math';

-- 백필: 기존 사용자는 모두 ['math'] / 'math'
UPDATE users
   SET subject_tracks = ARRAY['math']::text[]
 WHERE subject_tracks IS NULL OR cardinality(subject_tracks) = 0;

UPDATE users
   SET active_subject_track = 'math'
 WHERE active_subject_track IS NULL;

-- 값 검증 (math/science 만 허용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'users_active_subject_track_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_active_subject_track_check
      CHECK (active_subject_track IN ('math', 'science'));
  END IF;
END$$;

-- 2. problems
ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS subject_track text NOT NULL DEFAULT 'math';

UPDATE problems SET subject_track = 'math' WHERE subject_track IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'problems_subject_track_check'
  ) THEN
    ALTER TABLE problems
      ADD CONSTRAINT problems_subject_track_check
      CHECK (subject_track IN ('math', 'science'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_problems_subject_track ON problems(subject_track);

-- 3. exams (시험지)
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS subject_track text NOT NULL DEFAULT 'math';

UPDATE exams SET subject_track = 'math' WHERE subject_track IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'exams_subject_track_check'
  ) THEN
    ALTER TABLE exams
      ADD CONSTRAINT exams_subject_track_check
      CHECK (subject_track IN ('math', 'science'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_exams_subject_track ON exams(subject_track);

-- 4. book_groups (시험지 그룹·폴더)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'book_groups') THEN
    ALTER TABLE book_groups
      ADD COLUMN IF NOT EXISTS subject_track text NOT NULL DEFAULT 'math';

    UPDATE book_groups SET subject_track = 'math' WHERE subject_track IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage
      WHERE constraint_name = 'book_groups_subject_track_check'
    ) THEN
      ALTER TABLE book_groups
        ADD CONSTRAINT book_groups_subject_track_check
        CHECK (subject_track IN ('math', 'science'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_book_groups_subject_track ON book_groups(subject_track);
  END IF;
END$$;

-- 5. source_files (원본 PDF/HWP 자산) — 테이블이 있으면 추가
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'source_files') THEN
    ALTER TABLE source_files
      ADD COLUMN IF NOT EXISTS subject_track text NOT NULL DEFAULT 'math';

    UPDATE source_files SET subject_track = 'math' WHERE subject_track IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.constraint_column_usage
      WHERE constraint_name = 'source_files_subject_track_check'
    ) THEN
      ALTER TABLE source_files
        ADD CONSTRAINT source_files_subject_track_check
        CHECK (subject_track IN ('math', 'science'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_source_files_subject_track ON source_files(subject_track);
  END IF;
END$$;

COMMENT ON COLUMN users.subject_tracks IS '강사·학생이 담당하거나 학습 가능한 트랙 배열. 일반 사용자는 ["math"] 또는 ["science"]. 둘 다 담당하는 강사는 ["math","science"].';
COMMENT ON COLUMN users.active_subject_track IS '현재 선택한 활성 트랙. /select-track 에서 변경 가능. 미선택 시 math.';
COMMENT ON COLUMN exams.subject_track IS '시험지의 트랙(math|science). 자산화 시 자동 태깅 또는 수동 변경.';
COMMENT ON COLUMN problems.subject_track IS '문제의 트랙. 같은 시험지의 문제는 같은 트랙 (자산화 일관성).';

-- ============================================================================
-- 백필 검증 (수동 확인용 — 마이그레이션 직후 실행 권장)
-- ============================================================================
-- SELECT 'users.active_subject_track' as col, active_subject_track as v, COUNT(*) FROM users GROUP BY 2
-- UNION ALL SELECT 'problems', subject_track, COUNT(*) FROM problems GROUP BY 2
-- UNION ALL SELECT 'exams',    subject_track, COUNT(*) FROM exams    GROUP BY 2;
-- 모두 'math' 만 표시되어야 함.
