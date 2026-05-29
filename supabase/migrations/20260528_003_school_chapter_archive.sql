-- ============================================================================
-- 학교별 단원기출 문제은행 자산화 — 메타 컬럼 7개 추가
--
-- 배경:
--   현재 학교 기출은 "년도별 시험지 PDF" 1개씩 자산화 → exams.title 문자열에만
--   학교명·학년·학기·단원이 박힘. 매쓰플랫처럼 "부산 동래구 동래중 → 중2-1 →
--   방정식 단원" 식으로 문제은행을 필터링하려면 컬럼으로 분리 필요.
--
-- 정책:
--   - 모든 컬럼 NULL 허용 — 기존 자산(년도별 시험지) 회귀 무손실
--   - school_name 은 normalize 함수로 통일된 표기만 박힘 (예: "동래중학교" → "동래중")
--   - exam_round = '단원집' = 학교 여러 회차 기출을 단원별로 모은 PDF (신규 표준)
--   - exam_round = '중간'/'기말' = 기존 년도별 시험지
--   - problems.source_label = 카드 우측 출처 배지 ("동래중 26·1 단원집 3")
-- ============================================================================

ALTER TABLE public.exams
  ADD COLUMN IF NOT EXISTS school_name  TEXT,
  ADD COLUMN IF NOT EXISTS district     TEXT,
  ADD COLUMN IF NOT EXISTS semester     SMALLINT,
  ADD COLUMN IF NOT EXISTS exam_year    SMALLINT,
  ADD COLUMN IF NOT EXISTS exam_round   TEXT,
  ADD COLUMN IF NOT EXISTS chapter      TEXT;

-- semester 는 1 or 2 만 허용 (기존 NULL 보존, 새 INSERT만 검증)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exams_semester_check'
  ) THEN
    ALTER TABLE public.exams
      ADD CONSTRAINT exams_semester_check
      CHECK (semester IS NULL OR semester IN (1, 2));
  END IF;
END $$;

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS source_label TEXT;

-- 검색용 인덱스: 학교+년도+회차
CREATE INDEX IF NOT EXISTS idx_exams_school_year_round
  ON public.exams (school_name, exam_year DESC, exam_round)
  WHERE deleted_at IS NULL AND school_name IS NOT NULL;

-- 검색용 인덱스: 지역+학년+학기 (지역별 필터링)
CREATE INDEX IF NOT EXISTS idx_exams_district_grade
  ON public.exams (district, grade, semester)
  WHERE deleted_at IS NULL AND district IS NOT NULL;

-- 단원집 중복 차단용 인덱스 (학교+학년+학기+단원+회차 조합)
CREATE INDEX IF NOT EXISTS idx_exams_school_chapter_unique_lookup
  ON public.exams (school_name, grade, semester, chapter, exam_round)
  WHERE deleted_at IS NULL
    AND school_name IS NOT NULL
    AND chapter IS NOT NULL;

COMMENT ON COLUMN public.exams.school_name IS
  '학교명 (normalized) — "동래중학교" / "부산동래중" → 모두 "동래중" 으로 통일. school-normalize.ts 의 normalizeSchoolName() 결과만 박힘.';

COMMENT ON COLUMN public.exams.district IS
  '지역 — "시도 + 시군구" (예: "부산 동래구"). 매쓰플랫식 출제 UI 의 지역 필터 데이터 소스.';

COMMENT ON COLUMN public.exams.semester IS
  '학기 — 1 또는 2. NULL=미지정 (기존 데이터 호환).';

COMMENT ON COLUMN public.exams.exam_year IS
  '시험 년도 — 2024, 2025, 2026 등. 폴더 업로드 시 파일명 YYMMDD prefix 에서 자동 추출.';

COMMENT ON COLUMN public.exams.exam_round IS
  '시험 회차 — "중간" / "기말" / "단원집" / "수행평가" / null. "단원집"은 여러 회차 기출을 단원별로 모은 PDF (신규).';

COMMENT ON COLUMN public.exams.chapter IS
  '단원명 — "방정식" / "함수" / "도형" 등. 단원집 PDF 전용. 기존 시험지는 NULL.';

COMMENT ON COLUMN public.problems.source_label IS
  '카드 우측 출처 배지 — "동래중 26·1 단원집 3" 같은 압축 표기. 단원집 안 문제마다 원래 출처(년도/회차)가 다를 수 있어 problem 단위로 저장.';
