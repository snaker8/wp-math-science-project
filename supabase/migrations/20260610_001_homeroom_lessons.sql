-- ============================================================================
-- 개별수업(homeroom/rcc) 흡수 — 반·등록·수업회차·학생별 기입·주간플랜·단원점수
--
-- 원본: C:\과사람 프로젝트\개별수업\homeroom migrations/002_v2_coaching_slots.sql
--       (v2 동시입장 + 1:1 코칭 슬롯 모델)
-- 본 프로젝트 적응:
--   - student_id/homeroom_id TEXT → UUID (public.users 연결)
--   - institute_id 멀티테넌시 컬럼 + 트리거 자동 복사 (기존 diagnostics 패턴)
--   - RLS: can_access_institute(institute_id) — 학원 2개 운영 중이므로 필수
--   - diag_teacher_profiles / diag_parent_tokens 는 이식 제외
--     (본 프로젝트 users / 학부모 공유 라인이 이미 대체)
--   - 기존 public.classes(정규 반)와 별개 도메인 — diag_ prefix 유지
-- ============================================================================

-- ─────────────────────────────────────────────────────
-- 1) 테이블
-- ─────────────────────────────────────────────────────
CREATE TABLE public.diag_classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  UUID NOT NULL REFERENCES public.institutes(id),
  name          TEXT NOT NULL,
  campus        TEXT,                                -- 표시용 센터명 (자동 채움 가능)
  weekdays      SMALLINT[] NOT NULL,
  start_time    TIME NOT NULL DEFAULT '20:35',
  duration_min  SMALLINT NOT NULL DEFAULT 80,
  capacity      SMALLINT NOT NULL DEFAULT 7
                  CHECK (capacity BETWEEN 1 AND 10),
  stage_min     SMALLINT NOT NULL DEFAULT 1 CHECK (stage_min BETWEEN 1 AND 5),
  stage_max     SMALLINT NOT NULL DEFAULT 5 CHECK (stage_max BETWEEN 1 AND 5),
  homeroom_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CHECK (stage_min <= stage_max)
);
CREATE INDEX idx_diag_classes_active ON public.diag_classes(active, start_time);
CREATE INDEX idx_diag_classes_homeroom ON public.diag_classes(homeroom_id);
CREATE INDEX idx_diag_classes_institute ON public.diag_classes(institute_id);

CREATE TABLE public.diag_enrollments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id           UUID,                       -- 트리거 자동 복사 (class 기준)
  student_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_id               UUID NOT NULL REFERENCES public.diag_classes(id) ON DELETE CASCADE,
  -- 모두 같은 시각 입장 — 1:1 코칭 슬롯만 분배 (v2 모델)
  coaching_start_min     SMALLINT NOT NULL DEFAULT 0
                           CHECK (coaching_start_min >= 0
                                  AND coaching_start_min < 90
                                  AND coaching_start_min % 5 = 0),
  coaching_duration_min  SMALLINT NOT NULL DEFAULT 5
                           CHECK (coaching_duration_min IN (5, 10)),
  stage                  SMALLINT NOT NULL DEFAULT 2 CHECK (stage BETWEEN 1 AND 5),
  care_weight            NUMERIC(3,1) NOT NULL DEFAULT 1.0
                           CHECK (care_weight BETWEEN 0.5 AND 2.0),
  enrolled_at            DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_at               DATE,
  note                   TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (class_id, coaching_start_min, ended_at),
  UNIQUE (student_id, class_id, ended_at)
);
CREATE INDEX idx_diag_enroll_class ON public.diag_enrollments(class_id) WHERE ended_at IS NULL;
CREATE INDEX idx_diag_enroll_student ON public.diag_enrollments(student_id) WHERE ended_at IS NULL;

CREATE TABLE public.diag_class_meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id  UUID,                                -- 트리거 자동 복사 (class 기준)
  class_id      UUID NOT NULL REFERENCES public.diag_classes(id) ON DELETE CASCADE,
  meet_date     DATE NOT NULL,
  meet_status   TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (meet_status IN ('scheduled','done','cancelled')),
  homeroom_note TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (class_id, meet_date)
);
CREATE INDEX idx_diag_meetings_date ON public.diag_class_meetings(meet_date);

CREATE TABLE public.diag_meeting_attendances (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id         UUID,                         -- 트리거 자동 복사 (meeting 기준)
  meeting_id           UUID NOT NULL REFERENCES public.diag_class_meetings(id) ON DELETE CASCADE,
  student_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  attendance           TEXT NOT NULL DEFAULT 'present'
                         CHECK (attendance IN ('present','late','absent','makeup')),
  target_units         TEXT[] DEFAULT '{}',
  mathflat_sheet_ids   TEXT[] DEFAULT '{}',
  mini_lecture_key     TEXT,
  homeroom_note        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (meeting_id, student_id)
);
CREATE INDEX idx_diag_att_meeting ON public.diag_meeting_attendances(meeting_id);
CREATE INDEX idx_diag_att_student ON public.diag_meeting_attendances(student_id);

CREATE TABLE public.diag_lesson_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id    UUID,                              -- 트리거 자동 복사 (student 기준)
  student_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start      DATE NOT NULL,
  target_units    TEXT[] NOT NULL DEFAULT '{}',
  goals           TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, week_start)
);
CREATE INDEX idx_diag_plans_student ON public.diag_lesson_plans(student_id, week_start DESC);

-- 단원별 점수 (homeroom 원격 DB에서 ad-hoc 생성됐던 테이블 — 쿼리 코드에서 역추적)
CREATE TABLE public.diag_unit_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id      UUID,                            -- 트리거 자동 복사 (meeting 기준)
  meeting_id        UUID NOT NULL REFERENCES public.diag_class_meetings(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mathsecr_code     TEXT NOT NULL,                   -- public.mathsecr_types.code 소프트 FK
  score             NUMERIC(5,1) NOT NULL CHECK (score >= 0 AND score <= 100),
  problems_total    SMALLINT,
  problems_correct  SMALLINT,
  note              TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (meeting_id, student_id, mathsecr_code)
);
CREATE INDEX idx_diag_unit_scores_student ON public.diag_unit_scores(student_id);
CREATE INDEX idx_diag_unit_scores_meeting ON public.diag_unit_scores(meeting_id);

-- ─────────────────────────────────────────────────────
-- 2) institute_id 자동 복사 트리거 (기존 diagnostics 패턴과 동일 철학)
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diag_set_institute_from_class()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.institute_id IS NULL THEN
    SELECT c.institute_id INTO NEW.institute_id
    FROM public.diag_classes c WHERE c.id = NEW.class_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.diag_set_institute_from_meeting()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.institute_id IS NULL THEN
    SELECT c.institute_id INTO NEW.institute_id
    FROM public.diag_class_meetings m
    JOIN public.diag_classes c ON c.id = m.class_id
    WHERE m.id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.diag_set_institute_from_student()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.institute_id IS NULL THEN
    SELECT u.institute_id INTO NEW.institute_id
    FROM public.users u WHERE u.id = NEW.student_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_diag_enroll_institute
  BEFORE INSERT ON public.diag_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.diag_set_institute_from_class();
CREATE TRIGGER trg_diag_meeting_institute
  BEFORE INSERT ON public.diag_class_meetings
  FOR EACH ROW EXECUTE FUNCTION public.diag_set_institute_from_class();
CREATE TRIGGER trg_diag_att_institute
  BEFORE INSERT ON public.diag_meeting_attendances
  FOR EACH ROW EXECUTE FUNCTION public.diag_set_institute_from_meeting();
CREATE TRIGGER trg_diag_scores_institute
  BEFORE INSERT ON public.diag_unit_scores
  FOR EACH ROW EXECUTE FUNCTION public.diag_set_institute_from_meeting();
CREATE TRIGGER trg_diag_plans_institute
  BEFORE INSERT ON public.diag_lesson_plans
  FOR EACH ROW EXECUTE FUNCTION public.diag_set_institute_from_student();

-- ─────────────────────────────────────────────────────
-- 3) 통합 뷰 — 수업 준비 시트 (security_invoker: 조회자 RLS 적용)
-- ─────────────────────────────────────────────────────
CREATE VIEW public.v_class_prep_brief
WITH (security_invoker = true) AS
SELECT
  c.id AS class_id, c.name AS class_name, c.campus, c.start_time,
  c.duration_min, c.capacity, c.homeroom_id, c.institute_id,
  e.student_id, u.full_name AS student_name,
  e.coaching_start_min, e.coaching_duration_min,
  e.stage, e.care_weight,
  (SELECT row_to_json(lp.*)
   FROM public.diag_lesson_plans lp
   WHERE lp.student_id = e.student_id
   ORDER BY lp.week_start DESC LIMIT 1
  ) AS latest_plan,
  NULL::JSON AS recent_units,
  NULL::JSON AS error_profile
FROM public.diag_classes c
JOIN public.diag_enrollments e ON e.class_id = c.id AND e.ended_at IS NULL
LEFT JOIN public.users u ON u.id = e.student_id
WHERE c.active = true;

-- ─────────────────────────────────────────────────────
-- 4) 다음 빈 1:1 코칭 슬롯 추천
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_coaching_slot(p_class_id UUID)
RETURNS SMALLINT AS $$
  WITH used AS (
    SELECT coaching_start_min, coaching_duration_min
    FROM public.diag_enrollments
    WHERE class_id = p_class_id AND ended_at IS NULL
  ),
  candidates AS (
    SELECT generate_series(0, 85, 5)::SMALLINT AS m
  )
  SELECT m FROM candidates
  WHERE NOT EXISTS (
    SELECT 1 FROM used u
    WHERE candidates.m < u.coaching_start_min + u.coaching_duration_min
      AND candidates.m + 5 > u.coaching_start_min
  )
  ORDER BY m LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ─────────────────────────────────────────────────────
-- 5) RLS — 로그인 + 센터 격리 (anon 접근 없음. homeroom MVP의 anon SELECT 제거)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.diag_classes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_enrollments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_class_meetings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_meeting_attendances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_lesson_plans         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diag_unit_scores          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diag_classes_center" ON public.diag_classes
  FOR ALL TO authenticated
  USING (can_access_institute(institute_id))
  WITH CHECK (can_access_institute(institute_id));
CREATE POLICY "diag_enroll_center" ON public.diag_enrollments
  FOR ALL TO authenticated
  USING (can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR can_access_institute(institute_id));
CREATE POLICY "diag_meetings_center" ON public.diag_class_meetings
  FOR ALL TO authenticated
  USING (can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR can_access_institute(institute_id));
CREATE POLICY "diag_att_center" ON public.diag_meeting_attendances
  FOR ALL TO authenticated
  USING (can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR can_access_institute(institute_id));
CREATE POLICY "diag_plans_center" ON public.diag_lesson_plans
  FOR ALL TO authenticated
  USING (can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR can_access_institute(institute_id));
CREATE POLICY "diag_scores_center" ON public.diag_unit_scores
  FOR ALL TO authenticated
  USING (can_access_institute(institute_id))
  WITH CHECK (institute_id IS NULL OR can_access_institute(institute_id));

GRANT ALL ON public.diag_classes, public.diag_enrollments,
             public.diag_class_meetings, public.diag_meeting_attendances,
             public.diag_lesson_plans, public.diag_unit_scores TO authenticated;
GRANT SELECT ON public.v_class_prep_brief TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_coaching_slot(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────
-- 6) overview 용 반 통계 뷰 (homeroom 원격 DB ad-hoc 뷰 재현)
--    ★ prod 에는 별도 마이그레이션(homeroom_v_class_stats)으로 적용됨
-- ─────────────────────────────────────────────────────
CREATE VIEW public.v_class_stats
WITH (security_invoker = true) AS
SELECT
  c.id AS class_id,
  c.name AS class_name,
  c.campus,
  c.start_time,
  c.weekdays,
  c.capacity,
  c.stage_min,
  c.stage_max,
  c.homeroom_id,
  c.active,
  COALESCE(m.total_meetings, 0)::INT AS total_meetings,
  COALESCE(m.recent_meetings_28d, 0)::INT AS recent_meetings_28d,
  att.attendance_rate_pct,
  m.last_meet_date,
  COALESCE(m.memo_count, 0)::INT AS memo_count,
  COALESCE(e.enrolled_count, 0)::INT AS enrolled_count,
  COALESCE(e.care_total, 0)::NUMERIC AS care_total
FROM public.diag_classes c
LEFT JOIN (
  SELECT class_id,
         COUNT(*) AS total_meetings,
         COUNT(*) FILTER (WHERE meet_date >= CURRENT_DATE - 28) AS recent_meetings_28d,
         MAX(meet_date) AS last_meet_date,
         COUNT(*) FILTER (WHERE homeroom_note IS NOT NULL AND homeroom_note <> '') AS memo_count
  FROM public.diag_class_meetings
  WHERE meet_status <> 'cancelled'
  GROUP BY class_id
) m ON m.class_id = c.id
LEFT JOIN (
  SELECT class_id,
         COUNT(*) AS enrolled_count,
         SUM(care_weight) AS care_total
  FROM public.diag_enrollments
  WHERE ended_at IS NULL
  GROUP BY class_id
) e ON e.class_id = c.id
LEFT JOIN (
  SELECT mt.class_id,
         ROUND(100.0 * COUNT(*) FILTER (WHERE a.attendance IN ('present','late','makeup'))
               / NULLIF(COUNT(*), 0), 0) AS attendance_rate_pct
  FROM public.diag_meeting_attendances a
  JOIN public.diag_class_meetings mt ON mt.id = a.meeting_id
  GROUP BY mt.class_id
) att ON att.class_id = c.id;

GRANT SELECT ON public.v_class_stats TO authenticated;

NOTIFY pgrst, 'reload schema';
