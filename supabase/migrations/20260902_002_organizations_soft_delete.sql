-- ============================================================================
-- 학원(organizations) 소프트 삭제 칸 추가 (prod 적용 완료 2026-09-02, 저장소 기록용)
-- ----------------------------------------------------------------------------
-- 대표 요청: "센터 학원은 지울 수 있게 해야지"
--
-- ★ 진짜로 DELETE 하면 안 된다. institutes 를 가리키는 FK 상당수가 CASCADE 라
--   센터 행 하나를 지우면 **시험지·반·명단·성적이 함께 사라진다** (되돌릴 수 없다).
--     exams · classes · roster_students · source_files ·
--     student_exam_scores · student_school_exam_scores  → CASCADE
--   institutes 에는 이미 deleted_at 이 있고, organizations 에만 없어서 맞춘다.
--
-- 목록에서 감추고 못 쓰게 하되 자료는 남긴다. 되돌리려면 deleted_at = NULL.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS organizations_deleted_at_idx
  ON public.organizations (deleted_at) WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.organizations.deleted_at IS
  '소프트 삭제. 실삭제 금지 — 산하 institutes 의 CASCADE 로 시험지·명단·성적이 함께 사라진다.';
