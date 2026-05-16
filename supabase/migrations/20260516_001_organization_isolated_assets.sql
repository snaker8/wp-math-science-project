-- ============================================================================
-- organizations.isolated_assets — 자산화 격리 모드
--
-- 사용자 지시 (2026-05-16):
--   "엄궁차수학에서 만들거나 올리는 데이터는 다른 학원에서 조회 되지 않게 해줘.
--    엄궁차수학은 다른학원데이터가 보이지만"
--   "공통 자산화하는 데이터만 그렇게 하자"
--
-- 정책:
--   isolated_assets=false (default, 매쓰플랫 공통풀 모델):
--     - 자산화 시 problems.institute_id = NULL → 공통풀 → 모든 학원 조회 가능
--   isolated_assets=true (예: 엄궁차수학):
--     - 자산화 시 problems.institute_id = 사용자 institute → 본인 학원만 조회
--     - 다른 학원 자산화(NULL)는 그대로 조회 가능 → 비대칭 권한
--
-- 코드 적용: src/app/api/workflow/upload/route.ts 의 problems.insert 2곳에서
--           organization.isolated_assets 조회 후 institute_id 결정.
-- ============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS isolated_assets BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.isolated_assets IS
  '자산화 격리 모드. true=자산화 problems.institute_id 박힘(본인 학원만 조회), false=NULL(공통풀, 모든 학원 조회 가능)';

-- 운영 데이터 — 엄궁차수학 organization 이 이미 존재하면 isolated_assets=true 토글.
-- (organization 신규 생성 후 본 SQL 또는 admin UI 로 별도 처리)
