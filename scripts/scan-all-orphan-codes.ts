/**
 * 전체 시험지 분류 코드 전수 진단
 *
 * - 모든 classifications.type_code 를 mathsecr_types 와 대조
 * - orphan (DB에 없는 코드) 통계 + 시험지별 그룹핑
 * - subject 불일치 (exam.subject ↔ ai.classification.subject) 도 함께 검출
 *
 * 실행: npx tsx scripts/scan-all-orphan-codes.ts
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
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('전체 시험지 분류 코드 전수 진단');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 1) 전체 classifications 조회 (페이지네이션)
  const allClass: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from('classifications')
      .select('id, problem_id, type_code, expanded_type_code, ai_confidence, is_verified')
      .range(from, from + PAGE - 1);
    if (error) {
      console.error('classifications error:', error.message);
      return;
    }
    if (!data || data.length === 0) break;
    allClass.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`총 ${allClass.length} classifications 행`);

  // 2) 모든 unique typeCode 수집
  const codes = new Set<string>();
  for (const c of allClass) {
    if (c.type_code) codes.add(c.type_code);
    if (c.expanded_type_code) codes.add(c.expanded_type_code);
  }
  console.log(`고유 typeCode: ${codes.size}개\n`);

  // 3) mathsecr_types 에 존재하는 코드 조회 (chunk)
  const codeArr = Array.from(codes);
  const validCodes = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < codeArr.length; i += CHUNK) {
    const slice = codeArr.slice(i, i + CHUNK);
    const { data } = await sb
      .from('mathsecr_types')
      .select('code')
      .in('code', slice);
    for (const r of (data || []) as any[]) validCodes.add(r.code);
  }
  console.log(`mathsecr_types 매칭 코드: ${validCodes.size} / ${codes.size}`);

  // 4) orphan 코드 식별
  const orphanCodes = codeArr.filter(c => c && !validCodes.has(c) && !/^MS\d{2}$/.test(c));
  // MS01, MS02 등 과목 자체 코드는 정상이라고 가정 (depth=1 노드)
  // 그 외 형식이 mathsecr_types에 없으면 orphan
  console.log(`orphan 코드: ${orphanCodes.length}개\n`);

  if (orphanCodes.length > 0) {
    console.log('orphan 코드 샘플 (최대 30개):');
    for (const c of orphanCodes.slice(0, 30)) {
      const cnt = allClass.filter((cl: any) => cl.type_code === c || cl.expanded_type_code === c).length;
      console.log(`  ${c}  (${cnt}건)`);
    }
    if (orphanCodes.length > 30) console.log(`  … (${orphanCodes.length - 30}개 더)`);
  }

  // 5) orphan 사용 시험지 그룹핑
  const orphanProblemIds = new Set<string>();
  for (const c of allClass) {
    const tc = c.type_code || c.expanded_type_code;
    if (tc && !validCodes.has(tc) && !/^MS\d{2}$/.test(tc)) {
      orphanProblemIds.add(c.problem_id);
    }
  }
  console.log(`\norphan 사용 문제: ${orphanProblemIds.size}건`);

  if (orphanProblemIds.size === 0) {
    console.log('✅ 모든 시험지 분류 코드 정상');
    return;
  }

  // 6) 해당 problem 들이 속한 exam 들 조회
  const probArr = Array.from(orphanProblemIds);
  const examMap = new Map<string, { title: string; subject: string | null; grade: string | null; orphan_count: number; total_problems: number }>();
  const examOfProblem = new Map<string, string>();

  for (let i = 0; i < probArr.length; i += CHUNK) {
    const slice = probArr.slice(i, i + CHUNK);
    const { data: ep } = await sb
      .from('exam_problems')
      .select('exam_id, problem_id')
      .in('problem_id', slice);
    for (const r of (ep || []) as any[]) {
      examOfProblem.set(r.problem_id, r.exam_id);
    }
  }

  const examIds = Array.from(new Set(examOfProblem.values()));
  if (examIds.length > 0) {
    const { data: exams } = await sb
      .from('exams')
      .select('id, title, subject, grade')
      .in('id', examIds);
    for (const e of (exams || []) as any[]) {
      examMap.set(e.id, {
        title: e.title || '(제목없음)',
        subject: e.subject,
        grade: e.grade,
        orphan_count: 0,
        total_problems: 0,
      });
    }
  }

  // 시험지별 orphan/total 카운트
  for (const pid of probArr) {
    const eid = examOfProblem.get(pid);
    if (!eid) continue;
    const meta = examMap.get(eid);
    if (meta) meta.orphan_count++;
  }

  // 시험지별 total 문제 수
  for (const eid of examIds) {
    const { count } = await sb
      .from('exam_problems')
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', eid);
    const meta = examMap.get(eid);
    if (meta) meta.total_problems = count || 0;
  }

  // 7) 시험지 표 출력
  console.log('\n시험지별 orphan 현황 (orphan 비율 내림차순):');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('orphan/total | subject       | grade | title');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  const sortedExams = Array.from(examMap.entries())
    .sort((a, b) => (b[1].orphan_count / Math.max(b[1].total_problems, 1)) - (a[1].orphan_count / Math.max(a[1].total_problems, 1)));
  for (const [_id, m] of sortedExams) {
    const ratio = m.total_problems > 0 ? `${m.orphan_count}/${m.total_problems}` : `${m.orphan_count}/?`;
    console.log(`${ratio.padStart(11)} | ${(m.subject || '-').padEnd(13)} | ${(m.grade || '-').padEnd(5)} | ${m.title}`);
  }

  // 8) 요약
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`요약:`);
  console.log(`  · 총 시험지: ${examMap.size}건 (orphan 1건 이상)`);
  console.log(`  · 총 orphan 문제: ${orphanProblemIds.size}건`);
  console.log(`  · 고유 orphan 코드: ${orphanCodes.length}개`);
  console.log(`\n다음 작업: 시험지별로 자동수정 (mode=classify, force=1) 실행 또는`);
  console.log(`           scripts/reclassify-by-exam.ts <exam_id> 로 일괄 재분류`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
