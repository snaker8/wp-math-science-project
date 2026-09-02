/**
 * 분류 실단가 측정 — 토큰을 직접 집계해 문항당 원가를 낸다
 * ============================================================================
 *
 * ★ 유료 API 를 호출한다. `--n=` 필수. DB 에 쓰지 않는다(측정 전용).
 *
 * 왜 필요한가:
 *   32,794문항 분류 견적이 39만원으로 나왔다. 그대로 쓰기 전에 실단가를 확인한다.
 *   특히 **같은 과목을 연속 처리할 때 캐시가 얼마나 먹는지** 가 관건이다 —
 *   어제 측정은 과목이 섞여 캐시 적중이 낮았을 수 있다.
 *
 * 실행:
 *   npx tsx scripts/classify-cost-probe.ts --n=20 --subject=07
 */
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const N = Number(ARG('n') || 0);
const SUBJECT = ARG('subject') || '07';
if (!N || N < 1) { console.error('개수 필수:  --n=20  (유료 호출)'); process.exit(1); }

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}

// Sonnet 4.6 단가 (USD / 1M tokens)
const PRICE = { input: 3, cacheWrite: 3.75, cacheRead: 0.30, output: 15 };
const USD_KRW = 1400;

async function main() {
  const { classifyProblem } = await import('@/lib/workflow/classify');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 같은 과목 문항만 — 캐시 적중 조건을 실제 적재와 같게 맞춘다
  const { data } = await sb
    .from('classifications')
    .select('type_code, problems!inner(id, content_latex, deleted_at)')
    .like('type_code', `MS${SUBJECT}%`)
    .is('problems.deleted_at', null)
    .limit(N * 3);
  const rows = ((data || []) as unknown as Array<{ problems: { content_latex: string | null } }>)
    .map((r) => r.problems.content_latex)
    .filter((c): c is string => !!c?.trim())
    .slice(0, N);

  console.log(`측정 ${rows.length}문항 (과목 MS${SUBJECT}, 연속 처리 — DB 미기록)\n`);

  // classify.ts 가 usage 를 console.log 로 남긴다 — 가로채서 집계
  let inTok = 0, cacheRead = 0, cacheCreate = 0, outTok = 0, calls = 0;
  const origLog = console.log;
  console.log = (...a: unknown[]) => {
    const s = a.map(String).join(' ');
    const m = s.match(/usage: in=(\d+), cache_read=(\d+), cache_create=(\d+), out=(\d+)/);
    if (m) {
      inTok += +m[1]; cacheRead += +m[2]; cacheCreate += +m[3]; outTok += +m[4]; calls++;
      return; // 로그는 삼킨다
    }
    if (/Stage [12]|typeName DB|응답:/.test(s)) return;
    origLog(...a);
  };

  const t0 = Date.now();
  let ok = 0;
  for (const content of rows) {
    const r = await classifyProblem({
      content, examSubject: '', examGrade: '',
      curriculumCodes: [SUBJECT], logLabel: '원가측정',
    });
    if (r?.typeCode) ok++;
  }
  console.log = origLog;

  const sec = (Date.now() - t0) / 1000;
  const usd =
    (inTok * PRICE.input + cacheCreate * PRICE.cacheWrite + cacheRead * PRICE.cacheRead + outTok * PRICE.output) / 1_000_000;
  const krw = usd * USD_KRW;
  const per = rows.length ? krw / rows.length : 0;

  console.log('── 토큰 (합계) ──');
  console.log(`  API 호출      ${calls}회 (문항당 ${(calls / Math.max(rows.length, 1)).toFixed(1)})`);
  console.log(`  신규 입력     ${inTok.toLocaleString()}`);
  console.log(`  캐시 생성     ${cacheCreate.toLocaleString()}`);
  console.log(`  캐시 읽기     ${cacheRead.toLocaleString()}  ← 싸다 (1/10)`);
  console.log(`  출력          ${outTok.toLocaleString()}`);
  console.log(`\n── 비용 ──`);
  console.log(`  성공 ${ok}/${rows.length},  ${sec.toFixed(0)}초 (문항당 ${(sec / Math.max(rows.length, 1)).toFixed(1)}초)`);
  console.log(`  합계          $${usd.toFixed(4)}  ≈ ${Math.round(krw).toLocaleString()}원`);
  console.log(`  ★ 문항당      ${per.toFixed(1)}원`);
  console.log(`\n── 전체 환산 ──`);
  for (const n of [6000, 32794]) {
    console.log(`  ${n.toLocaleString()}문항  ≈ ${Math.round(per * n).toLocaleString()}원  (${(sec / Math.max(rows.length, 1) * n / 3600).toFixed(1)}시간)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
