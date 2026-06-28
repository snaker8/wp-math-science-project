-- 서술형 소문제별 부분점수 채점 저장.
-- sub_scores: [{number, points, awarded}] 소문제별 만점·획득점. awarded_points/max_points = 합계(집계 편의).
-- 기존 is_correct(객관식/단일 정오)는 유지 — 서술형은 awarded>=max 일 때 is_correct=true 로 클라가 채움.
alter table diagnostics.session_results add column if not exists sub_scores jsonb;
alter table diagnostics.session_results add column if not exists awarded_points numeric;
alter table diagnostics.session_results add column if not exists max_points numeric;
comment on column diagnostics.session_results.sub_scores is '서술형 소문제별 부분점수 [{number,points,awarded}]. 객관식/단일은 null.';
comment on column diagnostics.session_results.awarded_points is '획득 점수 합(서술형 부분점수). 점수 기반 집계용.';
comment on column diagnostics.session_results.max_points is '만점 합(소문제 배점 합). 점수 기반 집계용.';
