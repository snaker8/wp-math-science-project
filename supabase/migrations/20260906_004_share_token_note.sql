-- 학부모 학습 리포트 「선생님 총평」 — AI 초안(Opus 5) 후 교사가 확정해 저장. 리포트 상단에 보인다.
ALTER TABLE public.parent_share_tokens ADD COLUMN IF NOT EXISTS note text;
COMMENT ON COLUMN public.parent_share_tokens.note IS '학부모 리포트 선생님 총평 (learning 리포트). AI 초안 후 교사가 확정한 문장.';
