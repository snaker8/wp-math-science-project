-- ============================================================================
-- Multi-Tenancy PR-0 (2/2): 권한 helper 함수 + organizations RLS 정책
--
-- 의존: 20260504_001 (스키마 + ORG_ADMIN enum 값)
-- 후속: PR-1 (기존 RLS 정책 6종에 can_access_institute() 적용)
-- ============================================================================

-- ─── organizations RLS 정책 ──────────────────────────────────────
-- 자기 학원 / 자기 institute 가 속한 학원만 조회 가능
CREATE POLICY "organizations_read_own"
  ON public.organizations
  FOR SELECT
  USING (
    id IN (SELECT organization_id FROM public.users WHERE id = auth.uid())
    OR id IN (
      SELECT organization_id FROM public.institutes
      WHERE id = (SELECT institute_id FROM public.users WHERE id = auth.uid())
    )
  );

-- ─── 권한 helper 함수들 ──────────────────────────────────────────

-- 시스템 슈퍼관리자 — JWT app_metadata.super_admin 읽음
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'super_admin')::boolean,
    false
  );
$$;

COMMENT ON FUNCTION public.is_super_admin() IS '시스템 슈퍼관리자 여부. JWT raw_app_meta_data.super_admin=true 일 때 true.';

-- 현재 user 의 organization_id (ORG_ADMIN 전용)
CREATE OR REPLACE FUNCTION public.get_my_organization_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.users WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_organization_id() IS 'ORG_ADMIN 의 학원 ID. 일반 user 는 NULL.';

-- 통합 접근 권한 — super_admin / 자기 센터 / ORG_ADMIN(산하) 셋 중 하나면 true
CREATE OR REPLACE FUNCTION public.can_access_institute(target_institute_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- (a) 시스템 슈퍼관리자
    public.is_super_admin()
    -- (b) 자기 institute (일반 user)
    OR target_institute_id = (SELECT institute_id FROM public.users WHERE id = auth.uid())
    -- (c) ORG_ADMIN — 자기 학원 산하 모든 institute
    OR (
      (SELECT organization_id FROM public.users WHERE id = auth.uid()) IS NOT NULL
      AND target_institute_id IN (
        SELECT i.id FROM public.institutes i
        WHERE i.organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid())
      )
    );
$$;

COMMENT ON FUNCTION public.can_access_institute(uuid) IS 'institute 접근 권한 통합 체크 — super_admin / 자기 센터 / ORG_ADMIN(산하) 셋 중 하나면 true.';
