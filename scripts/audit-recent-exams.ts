/**
 * 최근 자산화/수정된 시험지 감사 (어제~오늘 변경된 것 중심)
 *
 * - 26 상당중 등 키워드 매칭 시험지 메타
 * - 각 문제의 ai_analysis.reanalyzedAt / classifiedAt / updated_at 시각
 * - classifications 의 ai_confidence / is_verified
 * - 어떤 시점에 무슨 작업이 있었는지 타임라인 추정
 *
 * 실행: npx tsx scripts/audit-recent-exams.ts "상당중" "26"
 */
import 'dotenv/config';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('env 누락'); process.exit(1); }
const sb = createClient(url, key);

const args = process.argv.slice(2);

async function main() {
  let q = sb
    .from('exams')
    .select('id, title, subject, grade, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(20);
  for (const kw of args) q = q.ilike('title', `%${kw}%`);

  const { data: exams, error } = await q;
  if (error) { console.error('exam query error:', error.message); return; }
  if (!exams || exams.length === 0) {
    console.log('일치 시험지 없음');
    return;
  }

  for (const exam of exams as any[]) {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`[${exam.id.slice(0,8)}…] ${exam.title}`);
    console.log(`  subject="${exam.subject || '-'}"  grade="${exam.grade || '-'}"  status="${exam.status}"`);
    console.log(`  created_at: ${exam.created_at}`);
    console.log(`  updated_at: ${exam.updated_at || '(없음)'}`);
    console.log('───────────────────────────────────────────────────────────────────');

    const { data: ep } = await sb
      .from('exam_problems')
      .select('problem_id, sequence_number')
      .eq('exam_id', exam.id)
      .order('sequence_number');
    if (!ep || ep.length === 0) {
      console.log('  문제 없음');
      continue;
    }
    const problemIds = ep.map((r: any) => r.problem_id);
    const { data: problems } = await sb
      .from('problems')
      .select('id, source_number, content_latex, ai_analysis, status, created_at, updated_at')
      .in('id', problemIds);
    const pMap = new Map((problems || []).map((p: any) => [p.id, p]));

    const { data: cls } = await sb
      .from('classifications')
      .select('problem_id, type_code, expanded_type_code, difficulty, ai_confidence, is_verified, updated_at')
      .in('problem_id', problemIds);
    const cMap = new Map<string, any>();
    for (const c of (cls || []) as any[]) if (!cMap.has(c.problem_id)) cMap.set(c.problem_id, c);

    console.log('seq | typeCode             | conf | reanalyzedAt        | provider  | content len');
    console.log('────┼──────────────────────┼──────┼─────────────────────┼───────────┼─────────────');
    let suspicious = 0;
    for (const row of ep as any[]) {
      const p = pMap.get(row.problem_id) as any;
      const c = cMap.get(row.problem_id) as any;
      const ai = (p?.ai_analysis as Record<string, any>) || {};
      const aiCls = (ai.classification || {}) as Record<string, any>;
      const reanalyzedAt = (ai.reanalyzedAt as string) || (aiCls.classifiedAt as string) || '';
      const provider = (aiCls.provider as string) || '?';
      const tc = c?.type_code || '(없음)';
      const conf = c?.ai_confidence != null ? c.ai_confidence.toFixed(2) : '-';
      const contentLen = (p?.content_latex || '').length;
      console.log(
        `${String(row.sequence_number).padStart(3)} | ${tc.padEnd(20)} | ${conf.padEnd(4)} | ${reanalyzedAt.slice(0,19).padEnd(19)} | ${provider.padEnd(9)} | ${contentLen}`,
      );
      if (!c?.type_code || contentLen === 0) suspicious++;
    }
    if (suspicious > 0) console.log(`\n  ⚠️  ${suspicious}건 의심 (typeCode 비어있거나 content 없음)`);
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
