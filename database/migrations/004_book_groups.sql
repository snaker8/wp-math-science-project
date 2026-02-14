-- ============================================================================
-- 004_book_groups.sql
-- 북그룹(폴더) 테이블 생성 + exams에 book_group_id FK 추가
--
-- 사용법: Supabase SQL Editor에서 이 파일 내용을 복사하여 실행하세요.
-- ============================================================================

-- 1. book_groups 테이블 생성 (트리 구조)
CREATE TABLE IF NOT EXISTS book_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID REFERENCES institutes(id),
  created_by UUID REFERENCES auth.users(id),
  parent_id UUID REFERENCES book_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject VARCHAR(100),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 2. exams 테이블에 book_group_id 컬럼 추가
ALTER TABLE exams ADD COLUMN IF NOT EXISTS book_group_id UUID REFERENCES book_groups(id) ON DELETE SET NULL;

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_book_groups_parent ON book_groups(parent_id);
CREATE INDEX IF NOT EXISTS idx_book_groups_institute ON book_groups(institute_id);
CREATE INDEX IF NOT EXISTS idx_book_groups_subject ON book_groups(subject);
CREATE INDEX IF NOT EXISTS idx_exams_book_group ON exams(book_group_id);

-- 4. RLS 정책 (book_groups)
ALTER TABLE book_groups ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 자신의 institute 북그룹을 조회할 수 있음
CREATE POLICY "Users can view their institute book groups"
  ON book_groups FOR SELECT
  USING (
    institute_id IN (
      SELECT institute_id FROM users WHERE id = auth.uid()
    )
    OR institute_id IS NULL
  );

-- 인증된 사용자가 자신의 institute에 북그룹 생성 가능
CREATE POLICY "Users can create book groups in their institute"
  ON book_groups FOR INSERT
  WITH CHECK (
    institute_id IN (
      SELECT institute_id FROM users WHERE id = auth.uid()
    )
    OR institute_id IS NULL
  );

-- 인증된 사용자가 자신의 institute 북그룹 수정 가능
CREATE POLICY "Users can update their institute book groups"
  ON book_groups FOR UPDATE
  USING (
    institute_id IN (
      SELECT institute_id FROM users WHERE id = auth.uid()
    )
    OR institute_id IS NULL
  );

-- 인증된 사용자가 자신의 institute 북그룹 삭제 가능
CREATE POLICY "Users can delete their institute book groups"
  ON book_groups FOR DELETE
  USING (
    institute_id IN (
      SELECT institute_id FROM users WHERE id = auth.uid()
    )
    OR institute_id IS NULL
  );
