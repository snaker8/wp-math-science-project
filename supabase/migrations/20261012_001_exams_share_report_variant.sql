-- 학부모 공유 리포트 버전 선택 (2026-10-12 대표: "자산화하다 보니 구분이 어렵다 — 링크 리포트 버전을 여러 개 선택할 수 있게")
-- NULL 이면 시험지 소속 학원(organization.slug)으로 자동. 값은 src/lib/report/report-brand.ts 의 키.
-- ★ prod 적용 완료 (2026-10-12, MCP apply_migration). 재적용 금지.
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS share_report_variant text;
COMMENT ON COLUMN public.exams.share_report_variant IS '학부모 공유 리포트 버전 키(report-brand.ts). NULL=학원 자동.';
