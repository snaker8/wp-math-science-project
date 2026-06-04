-- ============================================================================
-- 진단평가 종합 리포트 학부모 공유 (Part A)
--
-- 학부모가 로그인 없이 /share/diagnostic-report/[token] 에서 자녀의
-- 진단평가 세트(A/B/C) 합산 종합 리포트를 본다.
--
-- parent_share_tokens 를 재사용 — 단, 기존 토큰은 학생 단위(함정 리포트)였고
-- 종합 진단 리포트는 (학생 + 세트) 단위라 set_key / report_kind 컬럼 추가.
--   · report_kind = 'pitfall'        → 기존 /parent/[token] (함정 종합)
--   · report_kind = 'diagnostic_set' → /share/diagnostic-report/[token] (세트 종합)
--
-- ※ parent_share_tokens 테이블이 일부 환경에 미적용 상태 → CREATE TABLE IF NOT
--   EXISTS 로 자가 완결. 순수 추가형(데이터 손실/기존 동작 변경 없음).
-- ============================================================================

-- 베이스 테이블 (없으면 생성) — 20260501_004 와 동일 스키마
CREATE TABLE IF NOT EXISTS parent_share_tokens (
  token          VARCHAR(64)  PRIMARY KEY,
  student_id     UUID         NOT NULL,
  label          VARCHAR(100),
  is_active      BOOLEAN      DEFAULT TRUE,
  expires_at     TIMESTAMPTZ,
  created_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pst_student    ON parent_share_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_pst_active     ON parent_share_tokens(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pst_created_by ON parent_share_tokens(created_by);

-- 세트 종합 리포트용 컬럼 (추가형)
ALTER TABLE parent_share_tokens ADD COLUMN IF NOT EXISTS set_key     TEXT;
ALTER TABLE parent_share_tokens ADD COLUMN IF NOT EXISTS report_kind TEXT NOT NULL DEFAULT 'pitfall';

COMMENT ON COLUMN parent_share_tokens.set_key     IS '진단 세트 키(book_group_id::정규화제목). report_kind=diagnostic_set 일 때 필수.';
COMMENT ON COLUMN parent_share_tokens.report_kind IS 'pitfall(함정 종합·기존) | diagnostic_set(세트 A/B/C 종합).';
