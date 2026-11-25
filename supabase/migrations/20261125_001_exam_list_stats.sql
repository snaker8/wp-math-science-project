-- 클라우드 시험지 목록용: 시험지별 문항 수 + 난이도 분포를 한 번에 (2026-11-25, prod 적용 완료)
-- 종전: exam_problems 8.5만 행을 1,000행씩 내려받아 세고(약 90왕복), 난이도는 classifications 전체를 묶음마다 다시 훑음 → 목록 4초+
create or replace function public.exam_list_stats(p_exam_ids uuid[])
returns table(exam_id uuid, problem_count integer, low integer, mid integer, high integer, total integer)
language sql
stable
as $$
  with ep as (
    select e.exam_id, e.problem_id from exam_problems e where e.exam_id = any(p_exam_ids)
  ),
  d as (
    select c.problem_id, max((c.difficulty::text)::int) as d
    from classifications c
    where c.problem_id in (select problem_id from ep) and c.difficulty::text ~ '^[0-9]+$'
    group by c.problem_id
  )
  select ep.exam_id,
    count(*)::int as problem_count,
    count(*) filter (where d.d <= 3)::int as low,
    count(*) filter (where d.d between 4 and 6)::int as mid,
    count(*) filter (where d.d >= 7)::int as high,
    count(d.d)::int as total
  from ep left join d on d.problem_id = ep.problem_id
  group by ep.exam_id;
$$;
grant execute on function public.exam_list_stats(uuid[]) to service_role;
