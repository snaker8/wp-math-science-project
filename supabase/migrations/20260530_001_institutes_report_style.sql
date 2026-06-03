-- 센터별 학생 리포트 스타일 설정
-- legacy  = 기존 인디고 A4 리포트 (동부산 등 — 현행 유지)
-- unified = 학부모 공유 리포트(share/exam) 톤으로 통일한 warm 스타일
--
-- 기본값 legacy → 기존 동작 그대로. 센터별로 어드민에서 'unified' 로 전환.
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS report_style TEXT NOT NULL DEFAULT 'legacy'
  CHECK (report_style IN ('legacy', 'unified'));

COMMENT ON COLUMN public.institutes.report_style IS
  '학생 성취도 리포트 스타일. legacy=기존 인디고(동부산 등), unified=share/exam warm 톤 통일.';

-- 운영 시드: 동부산만 현행(legacy) 유지, 그 외 센터는 통일(unified).
-- 신규 센터는 기본 legacy → 어드민에서 센터별로 전환.
UPDATE public.institutes SET report_style = 'unified' WHERE name <> '동부산';
