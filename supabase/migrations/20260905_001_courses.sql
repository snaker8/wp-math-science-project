-- ============================================================================
-- 코스(courses) · 회차(course_steps) — 매쓰홀릭 「수업 = 교재 N회차」 대응 (진행도의 뼈대)
-- ----------------------------------------------------------------------------
-- 근거: docs/PLAN_COURSE_LAYER.md (2026-09-05, 대표 승인) ·
--       docs/benchmark/matholic/10-course-hub-premium-deep.md §0 실측
--
-- 매쓰홀릭 수업 = 과정 하나의 교재 한 권 = 회차 51개(소단원 × 난이도 계단).
-- 학생 탭 「진행도 46/51」 = 완료 회차 / 전체 회차. 우리는 과제가 낱개라 이 층이 없었다.
--
--   코스   = 반 하나 × 과정 하나 (반은 코스를 여러 개 가질 수 있다: 중3-1 · 중3-2)
--   회차   = 소단원 × 난이도 계단 한 단. level_plan 이 그 회차의 난이도별 문항 수.
--            문항은 「낼 때」 뽑는다(문제은행이 자라면 다시 계획할 수 있게) → assignment_id 는 낸 뒤에 채워진다.
--   진행도 = 제출한 회차 / 전체 회차. 제출은 채점 세션에서 매번 계산 (단계 3 원칙 — 여기 안 박는다).
--
-- ★ 잃는 것 없음: 기존 과제·시험지·채점 그대로. assignments.course_step_id 는 nullable 추가.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.courses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  uuid REFERENCES public.institutes(id) ON DELETE CASCADE,
  class_id      uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_code  text NOT NULL,                       -- 수학비서 과목 코드 (MS05 = 중3-1)
  title         text NOT NULL,
  -- { issueMode: 'common'|'personal', perStep: 10, ladder: [...] , range: { l1: [...] } }
  settings      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

COMMENT ON TABLE public.courses IS
  '코스 = 반 × 과정. 매쓰홀릭 「수업(교재)」 대응. 회차(course_steps)의 묶음.';
COMMENT ON COLUMN public.courses.settings IS
  'issueMode 공통/개인화 · perStep 회차당 문항 · ladder 난이도 계단 · range 단원 범위';

CREATE INDEX IF NOT EXISTS courses_class_idx
  ON public.courses (class_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS courses_institute_idx
  ON public.courses (institute_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.course_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  seq            integer NOT NULL,                   -- 1..N, 코스 안 순서
  unit_code      text NOT NULL,                      -- 소단원 (수학비서 depth4, 예 MS05-06-02-01)
  unit_round     integer NOT NULL DEFAULT 1,         -- 그 소단원의 몇 회차인가 (1회차·2회차…)
  label          text NOT NULL,                      -- "1회차"
  -- { "A": 9, "B": 1 }  난이도 밴드별 문항 수 (계단). 키는 lib/class/mastery-bands 의 밴드 키
  level_plan     jsonb NOT NULL DEFAULT '{}'::jsonb,
  short          boolean NOT NULL DEFAULT false,     -- 문제은행 공급이 모자라 계획보다 적게 잡힌 회차
  assignment_id  uuid REFERENCES public.assignments(id) ON DELETE SET NULL,
  issued_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, seq)
);

COMMENT ON TABLE public.course_steps IS
  '회차 = 소단원 × 난이도 계단 한 단. 문항은 낼 때 뽑는다 — assignment_id 는 낸 뒤 채워진다.';
COMMENT ON COLUMN public.course_steps.level_plan IS '난이도 밴드별 문항 수. 예 {"A":9,"B":1}';

CREATE INDEX IF NOT EXISTS course_steps_course_idx
  ON public.course_steps (course_id, seq);
CREATE INDEX IF NOT EXISTS course_steps_assignment_idx
  ON public.course_steps (assignment_id) WHERE assignment_id IS NOT NULL;

-- 과제 → 회차 연결 (낱개 과제는 NULL 그대로)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS course_step_id uuid REFERENCES public.course_steps(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assignments_course_step_idx
  ON public.assignments (course_step_id) WHERE course_step_id IS NOT NULL;
COMMENT ON COLUMN public.assignments.course_step_id IS '이 과제가 코스의 어느 회차인지. 낱개 과제는 NULL.';

-- ── RLS — assignments 와 같은 규칙 (공통풀 NULL 통과 포함) ──────────────────
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS courses_access ON public.courses;
CREATE POLICY courses_access ON public.courses
  FOR ALL
  USING (institute_id IS NULL OR public.can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR public.can_access_institute(institute_id));

DROP POLICY IF EXISTS course_steps_access ON public.course_steps;
CREATE POLICY course_steps_access ON public.course_steps
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_id AND (c.institute_id IS NULL OR public.can_access_institute(c.institute_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.id = course_id AND (c.institute_id IS NULL OR public.can_access_institute(c.institute_id))
  ));

DROP TRIGGER IF EXISTS trg_courses_updated_at ON public.courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_assignments_updated_at();

-- 계단 단 이름 — 첫 단(개념)이 공급 부족으로 건너뛰어지면 unit_round 로 되짚을 수 없다 (2026-09-05 실측)
ALTER TABLE public.course_steps ADD COLUMN IF NOT EXISTS rung_label text NOT NULL DEFAULT '';
COMMENT ON COLUMN public.course_steps.rung_label IS '계단 단 이름 (개념·기본·실력·심화). 첫 단이 건너뛰어질 수 있어 unit_round 로 못 되짚는다.';

-- 오답유사 짝 (C6) — 회차 과제마다 학생별 「오답유사 학습」이 붙는다 (매쓰홀릭 회차 = 학습 + 오답유사 학습)
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS parent_assignment_id uuid REFERENCES public.assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assignments_parent_idx ON public.assignments (parent_assignment_id) WHERE parent_assignment_id IS NOT NULL;
COMMENT ON COLUMN public.assignments.parent_assignment_id IS '이 과제가 어느 과제의 짝인지 (오답유사 학습 → 원 회차 과제).';
