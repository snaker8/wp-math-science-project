-- 교재 자료실 (2026-11-11 대표: "수학교재 파일 사이트 — 권한 있는 사람만 다운받아지게, 다운로드 권한은 관리자가 설정")
--
-- ★ prod 적용 완료 (2026-11-11, MCP apply_migration). 재적용 금지.
-- 시중교재 PDF(G드라이브 수학 자료/01_정리자료/과정별자료)를 비공개 보관함 `textbooks` 에 올려 두고,
-- 관리자가 선생님마다 중등/고등 권한을 준다. 내려받기는 서버가 권한을 확인한 뒤 5분짜리 서명 주소를 준다.
--
-- ★ 세 표 모두 RLS 켜고 정책 없음 = 브라우저(anon/authenticated)로는 아무것도 못 읽는다.
--   읽기·쓰기는 /api/textbooks/* 의 supabaseAdmin 만. (권한 판단은 src/lib/textbooks/access.ts 한 곳)
-- ★ 학원(institute) 격리 대상이 아니다 — 교재는 플랫폼 공용 자원이고 권한은 사람 단위.
-- ★ 목록은 G드라이브 쪽 동기화 스크립트(textbook_sync.py)가 source_rel_path 를 열쇠로 채운다.

CREATE TABLE IF NOT EXISTS public.textbook_files (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level            text NOT NULL CHECK (level IN ('중등', '고등')),
  course           text NOT NULL,                 -- 중2-1, 공통수학1 … (G드라이브 폴더 이름 그대로)
  book             text NOT NULL,                 -- 교재(+편): 개념원리, 쎈, 개념플러스유형 유형편 파워 …
  kind             text NOT NULL,                 -- 본문/해설/정답/빠른정답/교사용/워크북/정오표/전체 …
  edition          text,                          -- 22개정 / 15개정 / 2024 …
  file_name        text NOT NULL,                 -- 내려받을 때 붙는 이름
  source_rel_path  text NOT NULL UNIQUE,          -- 과정별자료 기준 상대경로 (동기화 열쇠)
  storage_path     text NOT NULL,                 -- textbooks 보관함 안 경로 {middle|high}/{sha256}.{ext}
  size_bytes       bigint NOT NULL,
  sha256           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz                    -- 원본에서 사라지면 찍힘 (화면에서 숨김)
);
CREATE INDEX IF NOT EXISTS textbook_files_level_course_idx
  ON public.textbook_files (level, course) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.textbook_access (
  user_id     uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  can_middle  boolean NOT NULL DEFAULT false,
  can_high    boolean NOT NULL DEFAULT false,
  expires_at  date,                                -- 이 날짜까지 (포함). NULL = 기한 없음
  granted_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 누가 무엇을 받았는지 (관리 화면의 「최근 내려받기」)
CREATE TABLE IF NOT EXISTS public.textbook_downloads (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  file_id     uuid REFERENCES public.textbook_files(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS textbook_downloads_user_idx ON public.textbook_downloads (user_id, created_at DESC);

ALTER TABLE public.textbook_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textbook_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textbook_downloads ENABLE ROW LEVEL SECURITY;

-- 비공개 보관함. 파일 하나 최대 1GB (현재 최대 765MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('textbooks', 'textbooks', false, 1073741824)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;
