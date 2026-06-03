-- search_path mutable 경고 해소 + anon 권한 명시적 차단
ALTER FUNCTION public.tg_roster_students_touch_updated_at()
  SET search_path = public;

ALTER FUNCTION public.merge_roster_into_user(uuid, uuid)
  SET search_path = public, diagnostics;

REVOKE EXECUTE ON FUNCTION public.merge_roster_into_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_roster_into_user(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.merge_roster_into_user(uuid, uuid) TO authenticated;
