/**
 * 어제(2026-04-24) 자산화 도중 끊긴 데이터 추적
 *
 * 1) workflow_jobs (자산화 작업 큐) — 어제 status=FAILED/PROCESSING 인 것
 * 2) exams.created_at 어제인데 status=DRAFT 인 것 (자산화 끊김)
 * 3) problems.created_at 어제인데 exam_problems 에 연결 안 된 것 (고아 문제)
 * 4) 시험지 제목에 "26 상당", "26 신곡" 등 키워드 매칭
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('env 누락'); process.exit(1); }
const sb = createClient(url, key);

const FROM = '2026-04-24T00:00:00';
const TO = '2026-04-25T23:59:59';

async function main() {
  // 1) workflow_jobs 어제~오늘
  console.log('═══ workflow_jobs (어제~오늘) ═══');
  const { data: jobs, error: jobErr } = await sb
    .from('workflow_jobs')
    .select('*')
    .gte('created_at', FROM)
    .lte('created_at', TO)
    .order('created_at', { ascending: false });
  if (jobErr && !jobErr.message.includes('does not exist')) {
    console.error('workflow_jobs error:', jobErr.message);
  } else if (jobs && jobs.length > 0) {
    for (const j of jobs as any[]) {
      console.log(`[${j.id?.slice(0,8)}] ${j.created_at?.slice(0,16)} status=${j.status} fileName=${j.file_name || j.fileName || '-'}`);
    }
  } else {
    console.log('  workflow_jobs 테이블 비어있음 또는 없음');
  }

  // 2) exams 어제 created
  console.log('\n═══ 어제 created_at exams ═══');
  const { data: exams } = await sb
    .from('exams')
    .select('id, title, status, subject, grade, created_at, total_points, description')
    .gte('created_at', FROM)
    .lte('created_at', TO)
    .order('created_at', { ascending: false });
  for (const e of (exams || []) as any[]) {
    const { count: probCnt } = await sb.from('exam_problems').select('*', { count: 'exact', head: true }).eq('exam_id', e.id);
    console.log(`[${e.id.slice(0,8)}] ${e.created_at.slice(0,19)}  status=${e.status}  ${e.title}`);
    console.log(`    subject=${e.subject || '-'}  grade=${e.grade || '-'}  문항=${probCnt}  total_pts=${e.total_points}`);
    console.log(`    desc: ${(e.description || '').slice(0, 80)}`);
  }

  // 3) problems 어제 created — exam_problems 안 들어간 것
  console.log('\n═══ 어제 created_at problems (orphan: exam_problems 미연결) ═══');
  const { data: problems } = await sb
    .from('problems')
    .select('id, source_number, source_name, created_at, content_latex')
    .gte('created_at', FROM)
    .lte('created_at', TO)
    .order('created_at', { ascending: false })
    .limit(500);
  if (problems && problems.length > 0) {
    const probIds = problems.map((p: any) => p.id);
    const { data: linked } = await sb
      .from('exam_problems')
      .select('problem_id')
      .in('problem_id', probIds);
    const linkedSet = new Set((linked || []).map((r: any) => r.problem_id));
    const orphans = (problems as any[]).filter(p => !linkedSet.has(p.id));
    console.log(`총 ${problems.length}건 중 orphan ${orphans.length}건`);
    if (orphans.length > 0) {
      const bySource = new Map<string, number>();
      for (const o of orphans) {
        const src = o.source_name || '(unknown)';
        bySource.set(src, (bySource.get(src) || 0) + 1);
      }
      console.log('source_name 별 분포:');
      for (const [k, v] of Array.from(bySource.entries()).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${v}건 │ ${k}`);
      }
    }
  }

  // 4) "상당", "신곡" 키워드 problems 직접 (source_name 기준)
  console.log('\n═══ source_name 키워드 매칭 problems (어제) ═══');
  for (const kw of ['상당', '신곡']) {
    const { data: matched } = await sb
      .from('problems')
      .select('id, source_number, source_name, created_at')
      .ilike('source_name', `%${kw}%`)
      .gte('created_at', FROM)
      .lte('created_at', TO);
    console.log(`  "${kw}" 매칭: ${(matched || []).length}건`);
    for (const p of (matched || []).slice(0, 10) as any[]) {
      console.log(`    [${p.id.slice(0,8)}] src#${p.source_number} ${p.source_name} created=${p.created_at.slice(0,19)}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
