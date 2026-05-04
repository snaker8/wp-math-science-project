-- ============================================================================
-- Multi-Tenancy PR-0 (1/2): 계층 스키마 (organizations → institutes)
--
-- 목표: 학원(organization) → 센터(institute) 2단계 계층 + ORG_ADMIN role 추가
-- 영향: 스키마 변경만. 기존 데이터 영향 0 (NULL 컬럼 추가).
-- 후속: 20260504_002 (RLS 정책 + 권한 helper 함수)
--       PR-1 (기존 RLS 정책에 helper 적용)
--       PR-6 (organizations / institutes 시드 데이터)
--
-- 주의: ALTER TYPE ADD VALUE 는 같은 트랜잭션에서 새 값 사용 불가 →
--       정책/함수는 002 마이그레이션으로 분리.
-- ============================================================================

-- ─── 1. organizations 테이블 신설 ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,                          -- URL/식별용
  subscription_tier text NOT NULL DEFAULT 'internal', -- Phase 2 대비
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizations IS '학원(법인/브랜드 단위). 산하에 N개 institutes(센터)를 가짐.';
COMMENT ON COLUMN public.organizations.subscription_tier IS '구독 등급 — Phase 2 데이터 노출량 차등용. 지금은 internal 기본.';

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ─── 2. institutes.organization_id ──────────────────────────────
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.institutes.organization_id IS '소속 학원(organization). 마이그레이션(PR-6) 후 NOT NULL 적용 예정.';

-- ─── 3. user_role enum 에 ORG_ADMIN 추가 ────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'ORG_ADMIN'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'ORG_ADMIN';
  END IF;
END $$;

-- ─── 4. users.organization_id ──────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.organization_id IS 'ORG_ADMIN role 일 때 자기 학원의 모든 산하 institute 접근. 일반 user 는 NULL.';

-- ─── 5. 인덱스 ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_institutes_organization_id ON public.institutes(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON public.users(organization_id);
