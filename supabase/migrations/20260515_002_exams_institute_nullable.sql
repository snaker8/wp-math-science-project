-- ============================================================================
-- exams.institute_id NOT NULL 제약 해제 — 본부 공통 라이브러리 허용
--
-- 배경:
--   SHARED_LIBRARY_MODE (콜드스타트 정책) 가 ON 이면 자산화된 exams 의
--   institute_id 를 NULL 로 강제 → 본부 공통 풀로 모든 가맹 학원이 공유.
--   그런데 기존 exams 스키마가 institute_id NOT NULL 이라 거부됨.
--
-- 변경:
--   - exams.institute_id 를 NULLABLE 로 (problems / book_groups 와 같은 정책)
--
-- 본부 공통 풀 vs 학원 자산 구분:
--   - institute_id IS NULL  = 본부 공통 풀 (모든 가맹 학원 접근 가능)
--   - institute_id = <uuid> = 특정 센터 자산 (그 institute 만 접근)
-- ============================================================================

ALTER TABLE public.exams
  ALTER COLUMN institute_id DROP NOT NULL;
