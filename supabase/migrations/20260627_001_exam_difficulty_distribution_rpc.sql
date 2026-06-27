-- 시험지별 난이도 분포 집계 RPC (하 1~3 / 중 4~6 / 상 7~10).
-- 배경: /api/exams (클라우드 목록) 가 난이도 분포 바를 위해 매 로드마다 classifications
--   전체(약 5천행)를 페이지네이션 스캔 + JS 집계 → 문제 수 증가에 따라 전체 페이지 로딩이
--   느려지던 병목(2026-06-27). problem_id 인덱스 조인으로 DB 가 집계 → exam 당 1행만 반환.
create or replace function exam_difficulty_distribution(p_exam_ids uuid[])
returns table(exam_id uuid, low integer, mid integer, high integer, total integer)
language sql
stable
as $$
  with diff as (
    -- difficulty 는 enum(difficulty_level) — text 경유 캐스팅. 문제당 1개로 정규화.
    select problem_id, max((difficulty::text)::int) as d
    from classifications
    where difficulty::text ~ '^[0-9]+$'
    group by problem_id
  )
  select ep.exam_id,
    count(*) filter (where d.d <= 3)::int as low,
    count(*) filter (where d.d between 4 and 6)::int as mid,
    count(*) filter (where d.d >= 7)::int as high,
    count(*)::int as total
  from exam_problems ep
  join diff d on d.problem_id = ep.problem_id
  where ep.exam_id = any(p_exam_ids)
  group by ep.exam_id;
$$;

grant execute on function exam_difficulty_distribution(uuid[]) to service_role, authenticated;
