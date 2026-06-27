-- 자산화 시 사용자가 지정한 학년·학기(특이 진도 대비 복수 가능) → mathsecr 과목코드 배열.
-- 분류가 이 값을 우선 사용(제목 추론 대신) → 제목 부정확으로 인한 오분류(공통수학1/중1-1) 차단.
-- 값 예: {'05','06'} = 중3-1 + 중3-2. 비어있으면(NULL) 기존 제목 추론 동작.
alter table exams add column if not exists curriculum_codes text[];
comment on column exams.curriculum_codes is '자산화 시 지정한 mathsecr 과목코드 배열(01~18). 분류 컨텍스트 우선 사용. 비면 제목 추론.';
