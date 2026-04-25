/**
 * 26 상당중 자산화 도중 끊긴 1문항 orphan 정리
 *
 * source_name="26-3-1-M-상당중 수학.pdf" 인 problems + 관련 classifications 삭제.
 * 사용자가 PDF 재업로드 시 깔끔한 상태에서 시작하도록.
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('env 누락'); process.exit(1); }
const sb = createClient(url, key);

const SOURCE_NAME = '26-3-1-M-상당중 수학.pdf';
const args = process.argv.slice(2);
const DRY = !args.includes('--execute');

async function main() {
  console.log(`모드: ${DRY ? 'DRY-RUN' : '실제 삭제'}\n`);

  const { data: problems } = await sb
    .from('problems')
    .select('id, source_number, content_latex')
    .eq('source_name', SOURCE_NAME);

  console.log(`source_name="${SOURCE_NAME}" 매칭: ${(problems || []).length}건`);
  if (!problems || problems.length === 0) {
    console.log('대상 없음 — 종료');
    return;
  }

  const probIds = problems.map((p: any) => p.id);

  // exam_problems 연결 여부 확인
  const { data: linked } = await sb.from('exam_problems').select('problem_id, exam_id').in('problem_id', probIds);
  const linkedSet = new Set((linked || []).map((r: any) => r.problem_id));
  const orphans = (problems as any[]).filter(p => !linkedSet.has(p.id));

  console.log(`orphan: ${orphans.length}건, 시험지에 연결됨: ${linkedSet.size}건`);
  if (linkedSet.size > 0) {
    console.log('⚠️  일부가 이미 시험지에 연결돼있어 안전을 위해 종료. 수동 확인 필요.');
    return;
  }

  console.log('\n삭제 대상:');
  for (const p of orphans) {
    console.log(`  src#${p.source_number}  id=${p.id}  content_len=${(p.content_latex || '').length}`);
  }

  if (DRY) {
    console.log('\n[DRY-RUN] 종료. 실제 삭제하려면 --execute 추가');
    return;
  }

  // classifications 먼저 삭제 (FK 문제 회피)
  await sb.from('classifications').delete().in('problem_id', probIds);
  // problems 삭제
  const { error } = await sb.from('problems').delete().in('id', probIds);
  if (error) {
    console.error('삭제 실패:', error.message);
    return;
  }
  console.log(`\n✓ ${orphans.length}건 정리 완료`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
