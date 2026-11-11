-- 수학교재 권한 요청 (2026-11-11 대표: 선생님이 사이트에서 바로 요청 → 관리자는 스위치만)
-- ★ prod 적용 완료 (2026-11-11, MCP apply_migration). 재적용 금지.
ALTER TABLE public.textbook_access ADD COLUMN IF NOT EXISTS requested_at timestamptz;
ALTER TABLE public.textbook_access ADD COLUMN IF NOT EXISTS requested_levels text[];
COMMENT ON COLUMN public.textbook_access.requested_at IS '선생님이 「권한 요청」을 누른 때. 관리자가 권한을 저장하면 NULL 로 지운다.';
COMMENT ON COLUMN public.textbook_access.requested_levels IS '요청한 학교급 {중등,고등}';
