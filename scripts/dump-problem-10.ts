/**
 * 특정 시험지의 문제 10번 content_latex 원문 덤프.
 * 실행: npx tsx scripts/dump-problem-10.ts
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL 또는 SERVICE_ROLE_KEY 없음 (.env.local 확인)');
  process.exit(1);
}

const sb = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  // 경남고 수2 1학기 중간 시험지 찾기
  const { data: exams, error: exErr } = await sb
    .from('exams')
    .select('id, title')
    .ilike('title', '%경남고%')
    .order('created_at', { ascending: false })
    .limit(5);

  if (exErr) {
    console.error('exams query error:', exErr.message);
    return;
  }
  console.log('경남고 시험지 후보:');
  for (const e of exams || []) console.log(`  ${e.id}  ${e.title}`);

  if (!exams || exams.length === 0) return;
  const examId = exams[0].id;
  console.log(`\n→ examId=${examId} 사용\n`);

  const { data: epData } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', examId)
    .order('sequence_number');

  const target = (epData || []).find((ep: any) => ep.sequence_number === 10);
  if (!target) {
    console.log('#10 없음. sequence_number 전체:');
    console.log((epData || []).map((ep: any) => ep.sequence_number).join(', '));
    return;
  }

  const { data: p } = await sb
    .from('problems')
    .select('id, source_number, content_latex, solution_latex')
    .eq('id', target.problem_id)
    .single();

  console.log('=== #10 content_latex ===');
  console.log(p?.content_latex || '(없음)');
  console.log('\n=== 길이 ===');
  console.log(`content_latex: ${(p?.content_latex || '').length}자`);
  console.log(`solution_latex: ${(p?.solution_latex || '').length}자`);

  if (p?.content_latex) {
    console.log('\n=== 패턴 감지 ===');
    const content = p.content_latex;
    console.log('\\displaystyle 포함:', /\\displaystyle/.test(content));
    console.log('\\left\\{ 포함:', /\\left\s*\\?\{/.test(content));
    console.log('\\right. 포함:', /\\right\s*\./.test(content));
    console.log('\\begin{array} 포함:', /\\begin\{array\}/.test(content));
    console.log('\\begin{cases} 포함:', /\\begin\{cases\}/.test(content));
  }
}

main().catch(console.error);
