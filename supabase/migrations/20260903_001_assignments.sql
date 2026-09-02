-- ============================================================================
-- 과제(assignments) — 학습 운영의 단위
-- ----------------------------------------------------------------------------
-- 근거: docs/PLAN_CLASS_HUB_REBUILD.md 단계 3
--
-- 지금 우리에겐 **시험지만** 있다. 만들어서 인쇄해 주면 끝이라,
-- "누가 언제까지 무엇을 해야 하는지" 가 시스템 어디에도 없다.
-- 매쓰홀릭은 시험지와 별개로 **과제**가 있고 그게 운영의 단위다.
--
--   과제 = 시험지 + 대상(학생) + 기간
--
-- 시험지는 이미 잘 만든다(자산화·출제·인쇄는 불가침). 그 위를 감싸는 층만 만든다.
--
-- kind — 네 갈래. 지금은 unit 만 쓰지만 컬럼은 처음부터 넷을 받는다.
--   unit  단원 과제 (범위를 정해 낸다)
--   wrong 오답 과제 (틀린 문제 다시)
--   weak  취약 과제 (γ 유형에서 뽑는다 — /api/clinic/weak-types 재사용)
--   type  유형 과제 (특정 유형 집중)
--
-- ★ 제출 여부는 **여기에 안 박는다.** 채점 세션(diagnostics.print_sessions)이 이미
--   사실을 갖고 있다. 두 곳에 같은 사실을 쓰면 반드시 어긋난다 — 채점 라인이
--   두 개로 갈려 고생한 게 바로 그 이유였다(2026-09-02 통합 작업).
--   assignment_students.session_id 는 "확정된 연결" 을 캐시하는 자리이고,
--   비어 있으면 (exam_id, student) 로 그때그때 찾는다.
-- ============================================================================

-- ── 과제 ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  uuid REFERENCES public.institutes(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  title         text NOT NULL,
  kind          text NOT NULL DEFAULT 'unit'
                CHECK (kind IN ('unit', 'wrong', 'weak', 'type')),
  exam_id       uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  due_at        timestamptz,
  note          text,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

COMMENT ON TABLE public.assignments IS
  '과제 = 시험지 + 대상 + 기간. 제출 여부는 여기 두지 않는다 — diagnostics.print_sessions 가 사실이다.';
COMMENT ON COLUMN public.assignments.kind IS 'unit 단원 · wrong 오답 · weak 취약 · type 유형';
COMMENT ON COLUMN public.assignments.exam_id IS
  '출제된 시험지. ON DELETE SET NULL — 시험지를 지워도 과제 이력은 남는다.';

CREATE INDEX IF NOT EXISTS assignments_class_idx
  ON public.assignments (class_id, starts_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_institute_idx
  ON public.assignments (institute_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_exam_idx
  ON public.assignments (exam_id) WHERE deleted_at IS NULL;

-- ── 과제 대상 학생 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_students (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  -- ★ FK 를 안 건다. 학생 id 는 users.id 일 수도 roster_students.id 일 수도 있다
  --   (명단으로 채점하다 정식 학생으로 승격하면 기록이 옛 id 에 남는다).
  --   두 테이블을 동시에 가리키는 FK 는 못 만든다 — 앱에서 신원 병합으로 푼다.
  student_id     uuid NOT NULL,
  session_id     uuid,                      -- 확정된 채점 세션 (없으면 앱이 찾는다)
  status         text NOT NULL DEFAULT 'assigned'
                 CHECK (status IN ('assigned', 'submitted', 'graded', 'excused')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

COMMENT ON COLUMN public.assignment_students.student_id IS
  'users.id 또는 roster_students.id. 신원 병합 때문에 FK 를 걸지 않는다.';
COMMENT ON COLUMN public.assignment_students.status IS
  'assigned 배정 · submitted 제출 · graded 채점완료 · excused 면제. 실제 제출 판정은 채점 세션이 우선.';

CREATE INDEX IF NOT EXISTS assignment_students_assignment_idx
  ON public.assignment_students (assignment_id);
CREATE INDEX IF NOT EXISTS assignment_students_student_idx
  ON public.assignment_students (student_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- 앱은 supabaseAdmin(service_role)으로 접근하고 institute-guard 로 격리한다.
-- RLS 는 클라이언트 직접 조회(anon/authed)에 대한 두 번째 방어선.
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assignments_access ON public.assignments;
CREATE POLICY assignments_access ON public.assignments
  FOR ALL
  -- ★ 공통풀(institute_id IS NULL)도 통과시킨다. can_access_institute(NULL) 은 false 라
  --   이 항을 빼면 super_admin 외 전원이 못 본다 (exams 에서 실제로 났던 사고).
  USING (institute_id IS NULL OR public.can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR public.can_access_institute(institute_id));

DROP POLICY IF EXISTS assignment_students_access ON public.assignment_students;
CREATE POLICY assignment_students_access ON public.assignment_students
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id
      AND (a.institute_id IS NULL OR public.can_access_institute(a.institute_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id
      AND (a.institute_id IS NULL OR public.can_access_institute(a.institute_id))
  ));

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_assignments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assignments_updated_at ON public.assignments;
CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_assignments_updated_at();
