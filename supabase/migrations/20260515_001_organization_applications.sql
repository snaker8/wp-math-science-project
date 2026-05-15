-- ============================================================================
-- 가맹 학원 신청 시스템 — 매쓰플랫식 B2B SaaS 가입 흐름.
--
-- 흐름:
--   1) 사용자가 가입 시 "학원" 자유 입력
--   2) 시스템이 organizations 에서 정확 일치/ILIKE 매칭 시도
--   3) 매칭 안 됨 → 본 테이블에 신청 INSERT, 가입은 보류 상태(institute_id NULL)
--   4) super_admin 이 본부 화면에서 신청 검토 → 승인 시 organizations/institutes
--      추가 + applicant_user_id 의 institute_id 박음 → 사용자 활성화
--   5) 거부 시 reason 박고 사용자에게 안내
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.organization_applications (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 신청자 입력값 (raw, 매칭 실패한 원본)
  proposed_organization_name  TEXT NOT NULL,
  proposed_institute_name     TEXT,           -- 센터 이름 (옵션 — 같이 입력했을 때만)

  -- 신청자 정보 (auth.users 와 일치하는 user id; 가입 시점에 박힘)
  applicant_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_role              TEXT,           -- 신청 시점 희망 role (TEACHER/ADMIN/STUDENT)
  applicant_full_name         TEXT,
  applicant_email             TEXT,
  applicant_phone             TEXT,

  -- 상태
  status                      TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),

  -- super_admin 결정
  decided_by                  UUID REFERENCES auth.users(id),
  decided_at                  TIMESTAMPTZ,
  decision_note               TEXT,

  -- 승인 결과 — 어떤 학원·센터에 배정됐는지
  assigned_organization_id    UUID REFERENCES public.organizations(id),
  assigned_institute_id       UUID REFERENCES public.institutes(id),

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_app_status     ON public.organization_applications(status);
CREATE INDEX IF NOT EXISTS idx_org_app_applicant  ON public.organization_applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_org_app_created    ON public.organization_applications(created_at DESC);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.fn_org_app_set_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_app_updated ON public.organization_applications;
CREATE TRIGGER trg_org_app_updated
  BEFORE UPDATE ON public.organization_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_org_app_set_updated();

-- RLS — super_admin 만 전체 조회·결정. 신청자는 자기 신청만 조회.
ALTER TABLE public.organization_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_app_super_admin_all  ON public.organization_applications;
DROP POLICY IF EXISTS org_app_self_select      ON public.organization_applications;
DROP POLICY IF EXISTS org_app_self_insert      ON public.organization_applications;

-- super_admin: 전체 권한
CREATE POLICY org_app_super_admin_all
  ON public.organization_applications
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 신청자: 자기 신청만 SELECT
CREATE POLICY org_app_self_select
  ON public.organization_applications
  FOR SELECT
  TO authenticated
  USING (applicant_user_id = auth.uid());

-- 신청자: 자기 신청 INSERT (가입 직후)
CREATE POLICY org_app_self_insert
  ON public.organization_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (applicant_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.organization_applications TO authenticated, service_role;

COMMENT ON TABLE  public.organization_applications IS '가맹 학원 신청 — super_admin 승인 대기 큐';
COMMENT ON COLUMN public.organization_applications.proposed_organization_name IS '신청자가 자유 입력한 학원 이름 (매칭 실패 원본)';
COMMENT ON COLUMN public.organization_applications.status IS 'pending → approved/rejected';
