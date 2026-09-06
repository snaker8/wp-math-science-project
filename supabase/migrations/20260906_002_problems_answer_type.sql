-- 문제 형식 생성 컬럼 — 매쓰홀릭 반 허브 「서술형」 탭 대응 (유형분석 「서술형만」 필터)
-- answer_json.type: multiple_choice(객관식) / short_answer(서답형·서술형). 실측 24,395 / 10,437 (2026-09-06)
ALTER TABLE public.problems ADD COLUMN IF NOT EXISTS answer_type text GENERATED ALWAYS AS (answer_json->>'type') STORED;
CREATE INDEX IF NOT EXISTS problems_answer_type_idx ON public.problems (answer_type) WHERE deleted_at IS NULL;
COMMENT ON COLUMN public.problems.answer_type IS 'answer_json.type 생성 컬럼 — multiple_choice(객관식) / short_answer(서답형·서술형). 유형분석 「서술형만」 필터용.';
