-- ============================================================================
-- 학생 학교(school) 등록 필드 추가
--
-- 배경: 강사가 학생을 등록할 때 소속 학교를 함께 입력할 수 있도록 함.
--   - public.users.school           — 정식 등록 학생의 학교명
--   - public.roster_students.school — 채점 명단 학생의 학교명 (promote 시 이전 가능)
--
-- 주의: exams.school_name (시험지 대상 학교, 집계 리포트용) 과는 별개 개념.
--   여기 school 은 "학생 프로필상의 소속 학교".
--
-- nullable TEXT — 무손실·하위호환 (기존 행은 NULL 유지).
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS school TEXT;

ALTER TABLE public.roster_students
  ADD COLUMN IF NOT EXISTS school TEXT;

COMMENT ON COLUMN public.users.school IS
  '학생 소속 학교명 (자유 입력). 집계 리포트의 exams.school_name 과는 별개 — 학생 프로필 학교.';
COMMENT ON COLUMN public.roster_students.school IS
  '명단 학생 학교명. promote(merge_roster_into_user) 시 users.school 로 이전될 수 있음.';
