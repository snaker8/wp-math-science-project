-- ============================================================================
-- diagnostics schema GRANT — PostgREST 노출 후 service_role/authenticated
-- role 의 USAGE/CRUD 권한 부여.
--
-- 사고 이력 (2026-05-12):
--   diagnostics schema 의 테이블이 RLS policy 만 정의되어 있고 schema-level
--   GRANT 가 빠져 있어, PostgREST 가 schema 인식 후에도 "permission denied for
--   schema diagnostics" 에러로 모든 호출 실패.
--   QR 채점 시스템(20260424_002_print_sessions_schema.sql)부터 진단
--   (20260423_001_diagnostics_schema.sql) 까지 운영 환경에서 실제로는 한 번도
--   동작 안 했던 상태.
--
-- 본 파일은 멱등(idempotent) — 이미 권한 있는 role 에 GRANT 해도 무해.
-- ============================================================================

GRANT USAGE ON SCHEMA diagnostics TO authenticated, service_role, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA diagnostics
  TO authenticated, service_role;

GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA diagnostics
  TO authenticated, service_role;

-- 향후 새로 추가되는 객체에도 자동 적용
ALTER DEFAULT PRIVILEGES IN SCHEMA diagnostics
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA diagnostics
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated, service_role;

-- PostgREST 스키마 캐시 즉시 갱신
NOTIFY pgrst, 'reload schema';
