-- 센터 별칭(display_name) + 드롭다운 숨김 플래그(hidden) 추가
-- display_name: 드롭다운·헤더 등에 표시할 별칭. NULL 이면 name 사용.
-- hidden: 활성 센터 스위쳐에서 숨김 (운영 안 하는 더미 institute 격리)
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.institutes.display_name IS
  '드롭다운/표시용 별칭. NULL=name 그대로 사용. 예: "본원"을 "엄궁차수학"으로 표시.';
COMMENT ON COLUMN public.institutes.hidden IS
  '활성 센터 스위쳐(/api/me/active-institute)에서 숨김. 운영 안 하는 더미 institute 격리용.';

-- 운영 시드 (다른 환경 재현 시 동일 결과)
UPDATE public.institutes SET hidden = TRUE WHERE name = '동래 본부';
UPDATE public.institutes SET display_name = '엄궁차수학' WHERE name = '본원';
