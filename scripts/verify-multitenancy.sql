-- ============================================================================
-- Multi-Tenancy 격리 검증 스크립트
--
-- 사용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행 (또는 supabase mcp 로)
-- 운영 중 정기 점검 / 신규 테이블 추가 후 회귀 검증 / PR-5 패치 후 검증.
--
-- 통과 기준: 모든 row 가 ✓ PASS.
-- ============================================================================

WITH checks AS (
  -- ─── 인프라 (PR-0/1) ────────────────────────────────────────
  SELECT '01. organizations 테이블 존재' AS test,
         EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='organizations') AS ok
  UNION ALL SELECT '02. institutes.organization_id NOT NULL',
    (SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='institutes' AND column_name='organization_id') = 'NO'
  UNION ALL SELECT '03. users.organization_id 컬럼 존재',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='users' AND column_name='organization_id')
  UNION ALL SELECT '04. ORG_ADMIN enum 값',
    EXISTS(SELECT 1 FROM pg_enum WHERE enumlabel='ORG_ADMIN'
           AND enumtypid=(SELECT oid FROM pg_type WHERE typname='user_role'))
  UNION ALL SELECT '05. is_super_admin() 함수',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='is_super_admin' AND pronamespace='public'::regnamespace)
  UNION ALL SELECT '06. get_my_organization_id() 함수',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='get_my_organization_id' AND pronamespace='public'::regnamespace)
  UNION ALL SELECT '07. can_access_institute() 함수',
    EXISTS(SELECT 1 FROM pg_proc WHERE proname='can_access_institute' AND pronamespace='public'::regnamespace)
  UNION ALL SELECT '08. organizations RLS enabled',
    (SELECT relrowsecurity FROM pg_class WHERE relname='organizations' AND relnamespace='public'::regnamespace)

  -- ─── RLS 정책에 helper 적용 (PR-1) ───────────────────────────
  UNION ALL SELECT '09. exams 정책 can_access_institute',
    (SELECT COUNT(*) FROM pg_policies WHERE tablename='exams' AND qual LIKE '%can_access_institute%') >= 1
  UNION ALL SELECT '10. problems 정책 NULL+can_access',
    (SELECT COUNT(*) FROM pg_policies WHERE tablename='problems' AND qual LIKE '%institute_id IS NULL%') >= 1
  UNION ALL SELECT '11. classes 정책 ORG_ADMIN OR is_super',
    EXISTS(SELECT 1 FROM pg_policies WHERE tablename='classes' AND (qual LIKE '%ORG_ADMIN%' OR qual LIKE '%is_super_admin%'))
  UNION ALL SELECT '12. book_groups 4 정책 모두 can_access',
    (SELECT COUNT(*) FROM pg_policies WHERE tablename='book_groups' AND (qual LIKE '%can_access_institute%' OR with_check LIKE '%can_access_institute%')) >= 4
  UNION ALL SELECT '13. source_files can_access',
    EXISTS(SELECT 1 FROM pg_policies WHERE tablename='source_files' AND qual LIKE '%can_access_institute%')

  -- ─── diagnostics + class_enrollments (PR-2/3) ────────────────
  UNION ALL SELECT '14. diagnostics.* 4개 institute_id 컬럼',
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='diagnostics' AND column_name='institute_id') = 4
  UNION ALL SELECT '15. class_enrollments.institute_id',
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='class_enrollments' AND column_name='institute_id')
  UNION ALL SELECT '16. class_enrollments 트리거 (자동 복사)',
    EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name='trg_class_enrollments_set_institute_id')

  -- ─── 운영 데이터 (PR-6) ──────────────────────────────────────
  UNION ALL SELECT '17. snaker super_admin metadata',
    EXISTS(SELECT 1 FROM auth.users WHERE email='snaker@hanmail.net'
           AND (raw_app_meta_data->>'super_admin')::boolean = true)
  UNION ALL SELECT '18. icegimbab17 ORG_ADMIN role',
    EXISTS(SELECT 1 FROM public.users WHERE email='icegimbab17@gmail.com' AND role::text='ORG_ADMIN')
  UNION ALL SELECT '19. 과사람 organization 시드',
    EXISTS(SELECT 1 FROM public.organizations WHERE slug='gwasaram')
  UNION ALL SELECT '20. 본부 institute',
    EXISTS(SELECT 1 FROM public.institutes WHERE name='본부')
  UNION ALL SELECT '21. 본부 institute organization 연결',
    EXISTS(SELECT 1 FROM public.institutes i
           JOIN public.organizations o ON o.id = i.organization_id
           WHERE i.name='본부' AND o.slug='gwasaram')
  UNION ALL SELECT '22. 모든 institute 가 organization 보유',
    NOT EXISTS(SELECT 1 FROM public.institutes WHERE organization_id IS NULL)
  UNION ALL SELECT '23. problems 격리 (NULL 또는 본부)',
    NOT EXISTS(SELECT 1 FROM public.problems WHERE institute_id IS NOT NULL
               AND institute_id != (SELECT id FROM public.institutes WHERE name='본부'))
  UNION ALL SELECT '24. book_groups 모두 본부 귀속',
    NOT EXISTS(SELECT 1 FROM public.book_groups
               WHERE institute_id IS NULL OR institute_id != (SELECT id FROM public.institutes WHERE name='본부'))
)
SELECT
  test,
  CASE WHEN ok THEN '✓ PASS' ELSE '✗ FAIL' END AS result
FROM checks
ORDER BY test;
