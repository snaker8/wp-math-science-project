-- ============================================================================
-- 출제 공통 라인 (Phase 1) — session_type 에 일반 출제값 추가
--   진단 회차값(BS/DD/PT/SC)은 그대로 두고 일반 출제용 'WS'(학습지)·'EX'(시험지)만 가산.
--   IN 목록 확장만 — 기존 행 위반 0, 트리거/뷰 무영향(진행률은 results 기반, type 비의존).
--   진단 화면(처방)은 diagnostics.sessions 를 읽고, 일반 출제는 diagnostics.print_sessions 에
--   기록되어 테이블 단에서 이미 격리됨(처방에 일반 출제 안 나타남).
-- ============================================================================

-- print_sessions: 일반 출제(QR/인쇄) 라인 — WS/EX 추가 (현재 BS/DD/PT/SC)
ALTER TABLE diagnostics.print_sessions DROP CONSTRAINT IF EXISTS print_sessions_session_type_check;
ALTER TABLE diagnostics.print_sessions
  ADD CONSTRAINT print_sessions_session_type_check
  CHECK (session_type IN ('BS', 'DD', 'PT', 'SC', 'WS', 'EX'));

-- sessions: 진단(엑셀) 라인 — 일관성 위해 동일 목록 (운영엔 이미 EX 존재, WS 가산)
ALTER TABLE diagnostics.sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;
ALTER TABLE diagnostics.sessions
  ADD CONSTRAINT sessions_session_type_check
  CHECK (session_type IN ('BS', 'DD', 'PT', 'SC', 'WS', 'EX'));
