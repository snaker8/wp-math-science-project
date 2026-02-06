-- ============================================================================
-- Migration: RBAC (역할 기반 접근 제어) 및 Class 시스템
-- Version: 1.1.0
-- Description: user_role에 TUTOR 추가, classes 및 class_enrollments 테이블 생성
-- ============================================================================

-- ============================================================================
-- SECTION 1: user_role ENUM 수정
-- ============================================================================

-- PostgreSQL에서는 ENUM에 새 값을 추가할 수 있음
-- 기존: 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT'
-- 추가: 'TUTOR' (TEACHER와 유사하지만 별도 역할로 관리)

-- TUTOR 역할 추가 (이미 존재하면 무시)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'TUTOR'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'TUTOR' AFTER 'TEACHER';
    END IF;
END$$;

-- ============================================================================
-- SECTION 2: classes 테이블 (강사의 반/클래스)
-- ============================================================================

CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institute_id UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    tutor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 반 정보
    name VARCHAR(100) NOT NULL,                       -- 반 이름 (예: "수학1 A반", "미적분 심화반")
    description TEXT,                                 -- 반 설명
    subject VARCHAR(50),                              -- 과목
    grade INTEGER CHECK (grade >= 1 AND grade <= 12), -- 대상 학년

    -- 수업 일정
    schedule JSONB DEFAULT '{}',                      -- 수업 일정 정보
    /*
        schedule 구조 예시:
        {
            "days": ["MON", "WED", "FRI"],
            "time": "16:00",
            "duration_minutes": 90
        }
    */

    -- 설정
    max_students INTEGER DEFAULT 30,                  -- 최대 학생 수
    is_active BOOLEAN DEFAULT TRUE,                   -- 활성화 상태

    -- 메타데이터
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    -- 제약조건: 같은 학원 내 같은 강사의 반 이름 중복 방지
    UNIQUE(institute_id, tutor_id, name)
);

COMMENT ON TABLE classes IS '강사(튜터)의 반/클래스 정보';
COMMENT ON COLUMN classes.tutor_id IS '담당 강사 ID (TUTOR 또는 TEACHER 역할)';

-- ============================================================================
-- SECTION 3: class_enrollments 테이블 (반-학생 등록)
-- ============================================================================

-- 등록 상태 ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_status') THEN
        CREATE TYPE enrollment_status AS ENUM (
            'PENDING',      -- 초대 대기 중
            'ACCEPTED',     -- 수락됨 (등록 완료)
            'REJECTED',     -- 거절됨
            'WITHDRAWN'     -- 탈퇴함
        );
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS class_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 등록 정보
    status enrollment_status DEFAULT 'PENDING',
    enrolled_at TIMESTAMPTZ,                          -- 실제 등록 시점 (ACCEPTED 시)

    -- 초대 정보
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 초대한 사람 (강사)
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    invitation_message TEXT,                          -- 초대 메시지
    invitation_code VARCHAR(20),                      -- 초대 코드 (선택적)

    -- 응답 정보
    responded_at TIMESTAMPTZ,                         -- 응답 시점
    rejection_reason TEXT,                            -- 거절 사유

    -- 메타데이터
    notes TEXT,                                       -- 강사 메모
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 같은 반에 같은 학생 중복 등록 방지
    UNIQUE(class_id, student_id)
);

COMMENT ON TABLE class_enrollments IS '반-학생 등록/초대 관리';
COMMENT ON COLUMN class_enrollments.status IS 'PENDING(초대대기), ACCEPTED(등록완료), REJECTED(거절), WITHDRAWN(탈퇴)';

-- ============================================================================
-- SECTION 4: INDEXES
-- ============================================================================

-- classes 인덱스
CREATE INDEX IF NOT EXISTS idx_classes_institute_id ON classes(institute_id);
CREATE INDEX IF NOT EXISTS idx_classes_tutor_id ON classes(tutor_id);
CREATE INDEX IF NOT EXISTS idx_classes_is_active ON classes(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_classes_deleted_at ON classes(deleted_at) WHERE deleted_at IS NULL;

-- class_enrollments 인덱스
CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON class_enrollments(class_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON class_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status ON class_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_enrollments_invited_by ON class_enrollments(invited_by);
CREATE INDEX IF NOT EXISTS idx_enrollments_invitation_code ON class_enrollments(invitation_code) WHERE invitation_code IS NOT NULL;

-- ============================================================================
-- SECTION 5: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- Classes RLS Policies
-- 강사는 자신의 반만 관리 가능
CREATE POLICY "Tutors can manage their own classes"
    ON classes FOR ALL
    USING (
        tutor_id = auth.uid()
        OR (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
    );

-- 같은 학원 내 사용자는 활성 반 목록 조회 가능
CREATE POLICY "Users can view classes in their institute"
    ON classes FOR SELECT
    USING (
        institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
        AND deleted_at IS NULL
    );

-- Enrollments RLS Policies
-- 강사는 자신의 반 등록 관리 가능
CREATE POLICY "Tutors can manage enrollments in their classes"
    ON class_enrollments FOR ALL
    USING (
        class_id IN (SELECT id FROM classes WHERE tutor_id = auth.uid())
        OR (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
    );

-- 학생은 자신의 등록 정보만 조회/수정 가능
CREATE POLICY "Students can view and respond to their enrollments"
    ON class_enrollments FOR SELECT
    USING (student_id = auth.uid());

CREATE POLICY "Students can update their enrollment status"
    ON class_enrollments FOR UPDATE
    USING (student_id = auth.uid())
    WITH CHECK (
        -- 학생은 PENDING -> ACCEPTED/REJECTED 변경만 가능
        status IN ('ACCEPTED', 'REJECTED', 'WITHDRAWN')
    );

-- ============================================================================
-- SECTION 6: TRIGGERS
-- ============================================================================

-- classes updated_at 자동 갱신
CREATE TRIGGER update_classes_updated_at
    BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- class_enrollments updated_at 자동 갱신
CREATE TRIGGER update_enrollments_updated_at
    BEFORE UPDATE ON class_enrollments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 등록 수락 시 enrolled_at 자동 설정
CREATE OR REPLACE FUNCTION set_enrolled_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'ACCEPTED' AND OLD.status != 'ACCEPTED' THEN
        NEW.enrolled_at = NOW();
        NEW.responded_at = NOW();
    ELSIF NEW.status IN ('REJECTED', 'WITHDRAWN') AND OLD.status NOT IN ('REJECTED', 'WITHDRAWN') THEN
        NEW.responded_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_enrollment_timestamps
    BEFORE UPDATE ON class_enrollments
    FOR EACH ROW EXECUTE FUNCTION set_enrolled_at();

-- ============================================================================
-- SECTION 7: FUNCTIONS
-- ============================================================================

-- 초대 코드 생성 함수
CREATE OR REPLACE FUNCTION generate_invitation_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result VARCHAR(20) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 반 초대 생성 함수
CREATE OR REPLACE FUNCTION invite_student_to_class(
    p_class_id UUID,
    p_student_id UUID,
    p_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_enrollment_id UUID;
    v_tutor_id UUID;
BEGIN
    -- 강사 권한 확인
    SELECT tutor_id INTO v_tutor_id FROM classes WHERE id = p_class_id;
    IF v_tutor_id != auth.uid() AND (SELECT role FROM users WHERE id = auth.uid()) != 'ADMIN' THEN
        RAISE EXCEPTION 'Not authorized to invite students to this class';
    END IF;

    -- 학생 역할 확인
    IF (SELECT role FROM users WHERE id = p_student_id) != 'STUDENT' THEN
        RAISE EXCEPTION 'Can only invite users with STUDENT role';
    END IF;

    -- 초대 생성
    INSERT INTO class_enrollments (class_id, student_id, invited_by, invitation_message, invitation_code)
    VALUES (p_class_id, p_student_id, auth.uid(), p_message, generate_invitation_code())
    ON CONFLICT (class_id, student_id) DO UPDATE SET
        status = 'PENDING',
        invited_by = auth.uid(),
        invited_at = NOW(),
        invitation_message = p_message,
        invitation_code = generate_invitation_code(),
        responded_at = NULL
    RETURNING id INTO v_enrollment_id;

    RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 초대 코드로 반 가입 함수
CREATE OR REPLACE FUNCTION join_class_by_code(p_invitation_code VARCHAR(20))
RETURNS UUID AS $$
DECLARE
    v_enrollment_id UUID;
BEGIN
    -- 초대 코드로 enrollment 찾기
    SELECT id INTO v_enrollment_id
    FROM class_enrollments
    WHERE invitation_code = p_invitation_code
      AND student_id = auth.uid()
      AND status = 'PENDING';

    IF v_enrollment_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation code';
    END IF;

    -- 상태 업데이트
    UPDATE class_enrollments
    SET status = 'ACCEPTED'
    WHERE id = v_enrollment_id;

    RETURN v_enrollment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 8: VIEWS
-- ============================================================================

-- 반 상세 정보 뷰 (등록 학생 수 포함)
CREATE OR REPLACE VIEW v_classes_with_stats AS
SELECT
    c.id,
    c.institute_id,
    c.tutor_id,
    u.full_name AS tutor_name,
    c.name,
    c.description,
    c.subject,
    c.grade,
    c.schedule,
    c.max_students,
    c.is_active,
    c.created_at,
    c.updated_at,
    (
        SELECT COUNT(*) FROM class_enrollments ce
        WHERE ce.class_id = c.id AND ce.status = 'ACCEPTED'
    ) AS enrolled_count,
    (
        SELECT COUNT(*) FROM class_enrollments ce
        WHERE ce.class_id = c.id AND ce.status = 'PENDING'
    ) AS pending_count
FROM classes c
JOIN users u ON c.tutor_id = u.id
WHERE c.deleted_at IS NULL;

-- 학생의 반 목록 뷰
CREATE OR REPLACE VIEW v_student_classes AS
SELECT
    ce.id AS enrollment_id,
    ce.student_id,
    ce.status,
    ce.enrolled_at,
    c.id AS class_id,
    c.name AS class_name,
    c.subject,
    c.grade,
    c.schedule,
    u.full_name AS tutor_name,
    i.name AS institute_name
FROM class_enrollments ce
JOIN classes c ON ce.class_id = c.id
JOIN users u ON c.tutor_id = u.id
JOIN institutes i ON c.institute_id = i.id
WHERE c.deleted_at IS NULL;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
