-- ============================================================================
-- Multi-Tenancy PR-6: 운영 데이터 마이그레이션 (organization + 본부 + 사용자 배정)
--
-- 목표:
--   1. "과사람" organization 생성
--   2. 기존 "개인 사용자" institute 를 "본부"로 rename + organization 연결
--   3. snaker (임세현) → super_admin (auth metadata)
--   4. icegimbab17 → ORG_ADMIN, 과사람 organization, 본부 institute
--   5. problems 1971건 → institute_id NULL (공통풀 통합 — 매쓰플랫 모델)
--   6. book_groups 16건 → 본부 institute 귀속
--   7. institutes.organization_id NOT NULL 강제 (이후 신규 institute 추가 시 필수)
--
-- 안전 원칙:
--   - 기존 institute id (b0e2a055) 보존 → exams 58건의 FK 변경 0
--   - snaker.institute_id 변경 X → 즉시 그대로 본부 데이터 접근
--   - 자사관/고등관/외부학원 institute 신규 추가 X → PR-4 어드민 UI 에서 사용자 직접
--
-- 롤백 (사고 발생 시):
--   ALTER TABLE institutes ALTER COLUMN organization_id DROP NOT NULL;
--   UPDATE book_groups SET institute_id = NULL;
--   UPDATE problems SET institute_id = '<기존-개인사용자-id>' WHERE created_by IN (snaker, icegimbab17) AND institute_id IS NULL;
--   UPDATE users SET role='TEACHER', organization_id=NULL WHERE email='icegimbab17@gmail.com';
--   UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'super_admin' WHERE email='snaker@hanmail.net';
--   UPDATE institutes SET name='개인 사용자', organization_id=NULL WHERE id='<id>';
--   DELETE FROM organizations WHERE slug='gwasaram';
-- ============================================================================

-- 마이그레이션 파일은 idempotent (재실행 안전) 가 아니라 단발성. 이미 적용된 환경에선 재실행 X.

-- Step 1: organizations 시드
INSERT INTO public.organizations (name, slug, subscription_tier, metadata)
VALUES ('과사람', 'gwasaram', 'internal', '{"description": "본 시스템 운영 본사"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Step 2: 기존 "개인 사용자" institute → "본부" rename + 과사람 organization 연결
UPDATE public.institutes
SET name = '본부',
    organization_id = (SELECT id FROM public.organizations WHERE slug = 'gwasaram')
WHERE name = '개인 사용자';

-- Step 3: snaker auth metadata 에 super_admin=true 설정
-- 주의: 적용 후 snaker 는 로그아웃 → 재로그인 해야 JWT 갱신됨
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('super_admin', true)
WHERE email = 'snaker@hanmail.net';

-- Step 4: icegimbab17 → ORG_ADMIN, 과사람 organization, 본부 institute 배정
UPDATE public.users
SET role = 'ORG_ADMIN',
    organization_id = (SELECT id FROM public.organizations WHERE slug = 'gwasaram'),
    institute_id = (SELECT id FROM public.institutes WHERE name = '본부' AND organization_id = (SELECT id FROM public.organizations WHERE slug = 'gwasaram'))
WHERE email = 'icegimbab17@gmail.com';

-- Step 5a (전제조건): chk_objective_answer_valid 위반 row 사전 정리 (CLAUDE.md 가드 #3)
-- ①~⑤/1~5 외 값으로 박힌 객관식 답을 빈값으로. UPDATE 시 row 재검증 차단용.
UPDATE public.problems
SET answer_json = jsonb_set(answer_json, '{correct_answer}', '""'::jsonb)
WHERE answer_json ->> 'type' = 'multiple_choice'
  AND COALESCE(answer_json ->> 'correct_answer', '') NOT IN ('', '①', '②', '③', '④', '⑤', '1', '2', '3', '4', '5');

-- Step 5b: problems 공통풀 통합 — 1971건 institute_id → NULL
-- 매쓰플랫 모델: 모든 학원이 공통 문제 풀 사용 가능
UPDATE public.problems
SET institute_id = NULL
WHERE institute_id IS NOT NULL;

-- Step 6: book_groups 16건 → 본부 institute 귀속
-- (학원이 자기 폴더로 인식. 향후 어드민 UI 에서 공통풀로 옮기기 가능)
UPDATE public.book_groups
SET institute_id = (SELECT id FROM public.institutes WHERE name = '본부')
WHERE institute_id IS NULL;

-- Step 7: institutes.organization_id NOT NULL 강제
-- 이후 신규 institute 추가 시 organization 필수
ALTER TABLE public.institutes
  ALTER COLUMN organization_id SET NOT NULL;
