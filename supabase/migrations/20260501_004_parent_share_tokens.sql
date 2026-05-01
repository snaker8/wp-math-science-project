-- ============================================================================
-- 학부모 공유 토큰 (Phase D)
--
-- 학원장이 학생별로 share token을 발급하면 학부모가 로그인 없이
-- /parent/[token] 페이지에서 자녀 함정·약점·진척 종합 조회 가능.
-- 카파시 self-compiling 차별 마케팅 본 무대 — 학부모가 "지식이 자라는 모습"을
-- 직접 본다.
--
-- exams.share_token과 동일 패턴 (학부모용 시험지 공유와 별개의 학생 단위 공유).
-- ============================================================================

CREATE TABLE IF NOT EXISTS parent_share_tokens (
  token         VARCHAR(64)  PRIMARY KEY,           -- crypto.randomUUID() 기반 32~64자
  student_id    UUID         NOT NULL,              -- public.users.id 소프트 참조
  label         VARCHAR(100),                       -- 강사가 메모 (예: "학부모 - 어머니")
  is_active     BOOLEAN      DEFAULT TRUE,
  expires_at    TIMESTAMPTZ,                        -- NULL이면 무기한
  created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ                        -- 학부모가 마지막으로 조회한 시각
);

CREATE INDEX IF NOT EXISTS idx_pst_student     ON parent_share_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_pst_active      ON parent_share_tokens(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pst_created_by  ON parent_share_tokens(created_by);

COMMENT ON TABLE  parent_share_tokens IS '학부모 공유 토큰 — 학원장이 발급, 로그인 없이 /parent/[token] 접근.';
COMMENT ON COLUMN parent_share_tokens.token IS '안전한 random token. 노출되면 즉시 is_active=false.';
COMMENT ON COLUMN parent_share_tokens.expires_at IS 'NULL이면 무기한. 학기 단위 등 유한 발급 권장.';
COMMENT ON COLUMN parent_share_tokens.last_viewed_at IS '학부모가 마지막으로 페이지 본 시각 — 이번 주 새 연결 효과 측정용.';
