-- ============================================================================
-- Multi-Tenancy PR-2 + PR-3 (스키마만): diagnostics + class_enrollments
--   → institute_id 컬럼 추가 (NULL 허용)
--   → class_enrollments 자동 복사 트리거
--   → RLS 정책은 변경하지 않음 (운영 멈춤 위험 차단)
--
-- 의존: 20260504_001 (institutes 테이블), 20260504_002 (helper 함수)
-- 후속: PR-5 — INSERT 코드 패치 + 정책 can_access_institute() 적용
--
-- 안전 원칙:
--   - 모든 컬럼 NULL 허용 (기존 row 0 이지만 점진 마이그레이션 패턴)
--   - 기존 RLS 정책 그대로 유지 (현재 qual:true → 운영 동작 보존)
--   - 트리거는 INSERT/UPDATE 시 institute_id 빠지면 class.institute_id 자동 복사
-- ============================================================================

-- ─── diagnostics.* 4개 테이블에 institute_id ────────────────────
ALTER TABLE diagnostics.sessions
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes(id) ON DELETE RESTRICT;

ALTER TABLE diagnostics.items
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes(id) ON DELETE RESTRICT;

ALTER TABLE diagnostics.lesson_plans
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes(id) ON DELETE RESTRICT;

ALTER TABLE diagnostics.student_node_status
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN diagnostics.sessions.institute_id IS 'PR-5 에서 INSERT 코드 패치 후 정책으로 격리 강화 예정. 지금은 NULL 허용.';
COMMENT ON COLUMN diagnostics.items.institute_id IS '같은 의도. session 의 institute_id 와 일치해야 함.';
COMMENT ON COLUMN diagnostics.lesson_plans.institute_id IS '같은 의도.';
COMMENT ON COLUMN diagnostics.student_node_status.institute_id IS '같은 의도.';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_diag_sessions_institute_id ON diagnostics.sessions(institute_id);
CREATE INDEX IF NOT EXISTS idx_diag_items_institute_id ON diagnostics.items(institute_id);
CREATE INDEX IF NOT EXISTS idx_diag_lesson_plans_institute_id ON diagnostics.lesson_plans(institute_id);
CREATE INDEX IF NOT EXISTS idx_diag_status_institute_id ON diagnostics.student_node_status(institute_id);

-- ─── class_enrollments.institute_id + 자동 복사 트리거 ─────────
ALTER TABLE public.class_enrollments
  ADD COLUMN IF NOT EXISTS institute_id uuid REFERENCES public.institutes(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.class_enrollments.institute_id IS '부모 class.institute_id 자동 복사 (트리거). 격리 정책은 PR-5 에서 강화.';

CREATE INDEX IF NOT EXISTS idx_class_enrollments_institute_id ON public.class_enrollments(institute_id);

-- 트리거 함수: INSERT/UPDATE 시 institute_id 가 NULL 이면 class 에서 복사
CREATE OR REPLACE FUNCTION public.fn_class_enrollments_set_institute_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.institute_id IS NULL AND NEW.class_id IS NOT NULL THEN
    SELECT institute_id INTO NEW.institute_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_class_enrollments_set_institute_id() IS 'class_enrollments INSERT/UPDATE 시 institute_id 자동 복사 (class FK 통한 자연 격리 강화).';

DROP TRIGGER IF EXISTS trg_class_enrollments_set_institute_id ON public.class_enrollments;
CREATE TRIGGER trg_class_enrollments_set_institute_id
  BEFORE INSERT OR UPDATE OF class_id ON public.class_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_class_enrollments_set_institute_id();

-- ─── 검증 쿼리 (수동용) ────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns WHERE table_schema='diagnostics' AND column_name='institute_id';
-- SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='class_enrollments' AND column_name='institute_id';
-- SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'trg_class_enrollments_set_institute_id';
