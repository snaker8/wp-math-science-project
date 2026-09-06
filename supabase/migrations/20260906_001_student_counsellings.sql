-- ============================================================================
-- 상담 기록 (student_counsellings) — 매쓰홀릭 학생 화면 「상담 기록」 대응
-- ----------------------------------------------------------------------------
-- docs/benchmark/matholic/09-light-account-note.md §5-2: GET/POST/DELETE /teacher/student/{id}/counsellings
--   대상(학부모/학생) · 방법(전화/직접/기타) · 내용 · 일시 · 작성자
-- student_id 는 users.id 또는 roster_students.id — 신원 병합 때문에 FK 를 걸지 않는다 (assignment_students 와 같은 이유).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.student_counsellings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  uuid REFERENCES public.institutes(id) ON DELETE CASCADE,
  class_id      uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  student_id    uuid NOT NULL,
  target        text NOT NULL DEFAULT 'parent' CHECK (target IN ('parent', 'student')),
  method        text NOT NULL DEFAULT 'phone' CHECK (method IN ('phone', 'visit', 'other')),
  content       text NOT NULL,
  counselled_at timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
COMMENT ON TABLE public.student_counsellings IS '상담 기록 — 매쓰홀릭 학생 화면 counsellings 대응. student_id 는 users.id 또는 roster_students.id (FK 없음, 신원 병합).';
CREATE INDEX IF NOT EXISTS student_counsellings_student_idx ON public.student_counsellings (student_id, counselled_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE public.student_counsellings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_counsellings_access ON public.student_counsellings;
CREATE POLICY student_counsellings_access ON public.student_counsellings FOR ALL
  USING (institute_id IS NULL OR public.can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR public.can_access_institute(institute_id));
