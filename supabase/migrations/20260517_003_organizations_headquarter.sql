-- ============================================================================
-- organizations.headquarter_institute_id 추가
--
-- 배경 (2026-05-17):
--   사용자 요구: "동래 본부 소속만 제외하고 ORG_ADMIN 도 강사로 인식".
--   organization 의 "본부" institute 식별이 필요 — institute 이름 매칭은 fragile,
--   organizations 테이블에 명시 컬럼으로.
--
-- 사용:
--   - 강사 카운트: role='TEACHER' OR (role='ORG_ADMIN' AND institute_id != organization.headquarter_institute_id)
--   - 학원 운영자 카운트: role='ORG_ADMIN' AND institute_id == organization.headquarter_institute_id
--
-- 초기 데이터:
--   - 과사람 → 동래 본부 (74412815-bb66-4d49-b35a-87f00f2fcdf1)
--   - 엄궁차수학 → NULL (본부 미지정 — 모든 ORG_ADMIN 이 강사로 카운트)
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS headquarter_institute_id uuid
    REFERENCES public.institutes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.headquarter_institute_id IS
  '학원 본부 institute. 카운팅·표시에서 본부 ORG_ADMIN 만 운영자, 나머지 ORG_ADMIN 은 강사로 분류.';

-- "과사람" organization 의 본부 = "동래 본부" institute
UPDATE public.organizations o
SET headquarter_institute_id = '74412815-bb66-4d49-b35a-87f00f2fcdf1'
WHERE o.name = '과사람'
  AND EXISTS (
    SELECT 1 FROM public.institutes i
    WHERE i.id = '74412815-bb66-4d49-b35a-87f00f2fcdf1'
      AND i.organization_id = o.id
  );
