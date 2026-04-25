/**
 * 시험지 분류 정확도 진단 스크립트
 *
 * 실행 (main 디렉토리, .env.local 있어야 함):
 *   npx tsx scripts/check-exam-classification.ts "해강중" "3-1" "26"
 *   npx tsx scripts/check-exam-classification.ts "<제목 부분 매칭>"
 *
 * 출력:
 *   - 시험지 메타 (제목, subject, grade, 문제 수)
 *   - 문제별 표:
 *     · seq# / source_number / 분류자 (provider) / typeCode / full_path
 *     · classifications.expanded_type_code 값
 *     · ai_analysis.classification.subject / chapter
 *     · is_verified / ai_confidence
 *   - 불일치/오류 패턴 요약:
 *     · MS 코드인데 mathsecr_types 에 없는 orphan
 *     · subject 와 시험지 subject 불일치
 *     · confidence < 0.5 / verified=false
 *     · typeCode 비어있음
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음');
  process.exit(1);
}
const sb = createClient(url, key);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('사용법: npx tsx scripts/check-exam-classification.ts "<제목 키워드>" ["<추가>"...]');
  process.exit(1);
}

async function main() {
  // 1) 시험지 검색 — 모든 키워드 AND
  let q = sb.from('exams').select('id, title, subject, grade, status, created_at').order('created_at', { ascending: false }).limit(20);
  for (const kw of args) q = q.ilike('title', `%${kw}%`);
  const { data: exams, error: examErr } = await q;
  if (examErr) {
    console.error('exam query error:', examErr.message);
    return;
  }
  if (!exams || exams.length === 0) {
    console.log('일치 시험지 없음');
    return;
  }
  if (exams.length > 1) {
    console.log(`다수 매칭 (${exams.length}건):`);
    for (const e of exams) console.log(`  ${e.id}  ${e.title}`);
    console.log('첫 번째 사용:\n');
  }
  const exam = exams[0];
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`시험지: ${exam.title}`);
  console.log(`  id=${exam.id}  subject="${exam.subject || '-'}"  grade="${exam.grade || '-'}"  status="${exam.status}"`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // 2) exam_problems 순서대로
  const { data: ep } = await sb
    .from('exam_problems')
    .select('problem_id, sequence_number')
    .eq('exam_id', exam.id)
    .order('sequence_number');
  if (!ep || ep.length === 0) {
    console.log('문제 없음');
    return;
  }
  const problemIds = ep.map((r: any) => r.problem_id);

  // 3) problems
  const { data: problems } = await sb
    .from('problems')
    .select('id, source_number, content_latex, ai_analysis')
    .in('id', problemIds);
  const pMap = new Map((problems || []).map((p: any) => [p.id, p]));

  // 4) classifications
  const { data: cls } = await sb
    .from('classifications')
    .select('id, problem_id, type_code, expanded_type_code, difficulty, cognitive_domain, ai_confidence, is_verified')
    .in('problem_id', problemIds);
  const cMap = new Map<string, any>();
  for (const c of (cls || []) as any[]) {
    // 같은 문제에 여러 행 있을 수 있음 — 첫 번째만
    if (!cMap.has(c.problem_id)) cMap.set(c.problem_id, c);
  }

  // 5) typeCode 들이 mathsecr_types 에 실제 존재하는지 확인
  const allCodes = new Set<string>();
  for (const c of (cls || []) as any[]) {
    if (c.type_code) allCodes.add(c.type_code);
    if (c.expanded_type_code) allCodes.add(c.expanded_type_code);
  }
  const codeList = Array.from(allCodes);
  const { data: msTypes } = codeList.length > 0
    ? await sb.from('mathsecr_types').select('code, full_path, depth').in('code', codeList)
    : { data: [] as any[] };
  const msMap = new Map((msTypes || []).map((m: any) => [m.code, m]));

  // 6) 문항별 출력
  console.log('seq# | source# | typeCode             | depth | full_path');
  console.log('─────────────────────────────────────────────────────────────────────────────────────');
  const issues: string[] = [];
  for (const row of ep as any[]) {
    const p = pMap.get(row.problem_id) as any;
    const c = cMap.get(row.problem_id) as any;
    const tc = c?.type_code || c?.expanded_type_code || '';
    const ms = tc ? msMap.get(tc) : null;
    const fullPath = ms?.full_path || (tc ? '⚠️  mathsecr_types 에 없음 (orphan)' : '⚠️  typeCode 비어있음');
    const depth = ms?.depth ?? '-';
    const ai = (p?.ai_analysis || {}) as Record<string, any>;
    const aiCls = (ai.classification || {}) as Record<string, any>;

    const seq = row.sequence_number;
    const src = p?.source_number ?? '-';
    console.log(
      `${String(seq).padStart(3)} | ${String(src).padStart(7)} | ${(tc || '(없음)').padEnd(20)} | ${String(depth).padEnd(5)} | ${fullPath}`,
    );

    // 진단
    if (!tc) issues.push(`#${seq}: typeCode 비어있음`);
    else if (!ms) issues.push(`#${seq}: typeCode "${tc}" 가 mathsecr_types 에 없음 (orphan)`);

    if (c && c.is_verified === false && (c.ai_confidence == null || c.ai_confidence < 0.5)) {
      issues.push(`#${seq}: 낮은 confidence (${c.ai_confidence ?? 'null'}) + 미검증`);
    }

    // 시험지 subject 와 분류 subject 불일치
    if (exam.subject && aiCls.subject && exam.subject !== aiCls.subject) {
      issues.push(`#${seq}: exam.subject="${exam.subject}" ↔ ai.subject="${aiCls.subject}" 불일치`);
    }
  }

  console.log('─────────────────────────────────────────────────────────────────────────────────────\n');

  // 7) 진단 요약
  if (issues.length === 0) {
    console.log('✅ 모든 문항 분류 코드 정상 (mathsecr_types 일치, subject 일치)');
  } else {
    console.log(`⚠️  ${issues.length}건 이슈:`);
    for (const i of issues) console.log(`  - ${i}`);
  }

  // 8) 분류 provider 통계 (어떤 모델이 분류했는지)
  console.log('\n분류자(provider) 분포:');
  const providerCnt = new Map<string, number>();
  for (const p of (problems || []) as any[]) {
    const prov = (p.ai_analysis as any)?.classifyProvider
      || (p.ai_analysis as any)?.classification?.provider
      || (p.ai_analysis as any)?.provider
      || '(unknown)';
    providerCnt.set(prov, (providerCnt.get(prov) || 0) + 1);
  }
  for (const [k, v] of providerCnt) console.log(`  ${k}: ${v}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
