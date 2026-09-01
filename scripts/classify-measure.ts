/**
 * 유형 분류 실측 — 문항당 실제 토큰·비용 측정
 * ============================================================================
 *
 * ★ 유료 API 를 호출한다. 반드시 `--n=` 으로 개수를 지정해야 돌아간다.
 *   지정 안 하면 아무것도 안 한다 (실수로 수천 건이 도는 사고 방지).
 *
 * ★ 기본은 측정만 하고 **DB 에 쓰지 않는다.** 저장하려면 `--save` 를 준다.
 *
 * 목적:
 *   1) 문항당 실제 토큰 (2단계 분류가 정상 동작하는지)
 *   2) 폴백 비율 — 2단계 실패 시 전체 유형표(8만 토큰) 경로로 떨어진다.
 *      여기가 새면 30배가 되므로 전체 적재 전에 반드시 확인해야 한다.
 *
 * 실행:
 *   npx tsx scripts/classify-measure.ts --exam=25-1-1-F --n=5
 *   npx tsx scripts/classify-measure.ts --exam=반여고 --n=66 --save
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const N = Number(ARG('n') || 0);
const EXAM = ARG('exam') || '';
const SAVE = process.argv.includes('--save');

if (!N || N < 1) {
  console.error('개수를 지정해야 합니다:  --n=5   (유료 API 호출이므로 기본값 없음)');
  process.exit(1);
}

// .env.local 로드 — classifyProblem 이 process.env 를 읽는다
for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}

async function main() {
  const { classifyProblem } = await import('@/lib/workflow/classify');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: exams } = await sb.from('exams')
    .select('id, title, curriculum_codes, subject, grade')
    .like('title', `%${EXAM}%`).is('deleted_at', null);
  if (!exams?.length) { console.error('시험지를 못 찾음'); process.exit(1); }

  // 아직 분류 안 된 문항만
  const targets: Array<{ id: string; content: string; exam: typeof exams[number]; num: number }> = [];
  for (const e of exams) {
    const { data: eps } = await sb.from('exam_problems')
      .select('sequence_number, problem_id').eq('exam_id', e.id).order('sequence_number');
    for (const ep of eps || []) {
      if (targets.length >= N) break;
      const { data: c } = await sb.from('classifications').select('id').eq('problem_id', ep.problem_id).limit(1);
      if (c?.length) continue;
      const { data: p } = await sb.from('problems').select('content_latex').eq('id', ep.problem_id).single();
      if (!p?.content_latex?.trim()) continue;
      targets.push({ id: ep.problem_id, content: p.content_latex, exam: e, num: ep.sequence_number });
    }
    if (targets.length >= N) break;
  }

  console.log(`${SAVE ? '★ 측정 + 저장' : '측정만 (DB 미기록)'}`);
  console.log(`대상 ${targets.length}문항\n`);

  // 폴백 감지 — classify.ts 가 남기는 경고를 가로챈다
  let fallback = 0;
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => {
    const s = a.map(String).join(' ');
    if (/2단계 분류 불가|L1L2 테이블이 비어|폴백/.test(s)) fallback++;
    origWarn(...a);
  };

  const t0 = Date.now();
  let ok = 0, fail = 0;
  const byProvider = new Map<string, number>();
  for (const t of targets) {
    const r = await classifyProblem({
      content: t.content,
      examSubject: (t.exam as { subject?: string }).subject || '',
      examGrade: (t.exam as { grade?: string }).grade || '',
      curriculumCodes: (t.exam as { curriculum_codes?: string[] }).curriculum_codes || undefined,
      logLabel: `측정 ${t.exam.title} #${t.num}`,
    });
    if (!r) { fail++; continue; }
    ok++;
    byProvider.set(r.provider, (byProvider.get(r.provider) || 0) + 1);
    console.log(`  #${String(t.num).padStart(2)}  ${r.typeCode?.padEnd(18) || '(코드없음)'.padEnd(18)} 난이도 ${r.difficulty}  ${r.model}${r.verified ? '' : '  ★코드 미검증'}`);
    if (SAVE) {
      const { error } = await sb.from('classifications').insert({
        problem_id: t.id, type_code: r.typeCode, difficulty: r.difficulty,
        cognitive_domain: r.cognitiveDomain, ai_confidence: r.confidence,
        classification_source: r.model,
      });
      if (error) console.error(`      저장 실패: ${error.message}`);
    }
  }
  console.warn = origWarn;

  const sec = (Date.now() - t0) / 1000;
  console.log(`\n── 결과 ──`);
  console.log(`  성공 ${ok} / 실패 ${fail}`);
  console.log(`  폴백(전체 유형표 경로) ${fallback}   ${fallback === 0 ? '✅ 2단계 정상' : '★ 비용 30배 구간 — 원인 확인 필요'}`);
  console.log(`  소요 ${sec.toFixed(1)}초  (문항당 ${(sec / Math.max(ok, 1)).toFixed(1)}초)`);
  console.log(`  provider: ${[...byProvider.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`\n  ※ 정확한 과금액은 Anthropic 콘솔 Usage 에서 이 시각 구간으로 확인하세요.`);
  if (!SAVE) console.log(`  ※ DB 에 기록하지 않았습니다. 저장하려면 --save`);
}

main().catch((e) => { console.error(e); process.exit(1); });
