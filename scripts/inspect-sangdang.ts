/**
 * 25/26 상당중 시험지 깊은 조사 — 클라우드 페이지에서 안 보이는 이유 추적
 *
 * - 모든 상당 키워드 시험지 raw row
 * - exam_problems linkage 정상 여부
 * - status / deleted_at / book_group_id / institute_id
 * - RLS 영향 여부 (anon/auth 차이)
 * - 26 상당중이 정말 없는지 vs 다른 제목으로 저장됐는지
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('env 누락'); process.exit(1); }
const sb = createClient(url, key);

async function main() {
  // 1) 모든 상당 키워드 시험지 (raw, 모든 컬럼)
  const { data: exams, error } = await sb
    .from('exams')
    .select('*')
    .ilike('title', '%상당%')
    .order('created_at', { ascending: false });
  if (error) { console.error(error.message); return; }

  console.log(`상당 키워드 시험지: ${exams?.length || 0}건\n`);
  for (const e of (exams || []) as any[]) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`title: ${e.title}`);
    console.log(`id: ${e.id}`);
    Object.keys(e).sort().forEach(k => {
      if (['title', 'id'].includes(k)) return;
      const v = e[k];
      if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
      const str = typeof v === 'object' ? JSON.stringify(v).slice(0, 100) : String(v).slice(0, 100);
      console.log(`  ${k}: ${str}`);
    });

    const { count: epCount } = await sb
      .from('exam_problems')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', e.id);
    console.log(`  exam_problems linkage: ${epCount}건`);
  }

  // 2) 만약 26 상당중이 다른 제목으로 저장됐는지 — 최근 1주일 어떤 시험지가 있는지
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('최근 1주일 (2026-04-18 이후) 시험지 전체 목록:');
  console.log('═══════════════════════════════════════════════════════════════════');
  const { data: recent } = await sb
    .from('exams')
    .select('id, title, subject, grade, status, created_at, updated_at, book_group_id')
    .gte('created_at', '2026-04-18T00:00:00')
    .order('created_at', { ascending: false })
    .limit(50);
  for (const e of (recent || []) as any[]) {
    const ageHrs = Math.round((Date.now() - new Date(e.created_at).getTime()) / 3600000);
    console.log(`[${ageHrs}h ago] ${e.title}`);
    console.log(`    status=${e.status}  subject=${e.subject || '-'}  grade=${e.grade || '-'}  book=${e.book_group_id || '-'}`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
