-- ============================================================================
-- Multi-Tenancy PR-6 (Step 7): institutes.organization_id NOT NULL 강제
--
-- 의존: 20260504_005 (모든 institute 가 organization_id 보유)
-- 효과: 이후 신규 institute INSERT 시 organization 필수
-- ============================================================================

ALTER TABLE public.institutes
  ALTER COLUMN organization_id SET NOT NULL;
