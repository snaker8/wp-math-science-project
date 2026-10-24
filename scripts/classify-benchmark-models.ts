/**
 * 분류 모델 벤치마크 — CLAUDE_MAX_VERIFIED 정답 표본으로 모델별 정확도·단가 실측
 * ============================================================================
 *
 * ★ 유료 API 를 호출한다. `--n=` 필수. **DB 에 쓰지 않는다** (측정 전용).
 * ★ Gemini/GPT 폴백 키를 프로세스 안에서 비운다 — 2단계 실패 시 숨은 폴백 비용 0.
 * ★ 폴백(결과 null)이 --max-fallback 을 넘으면 즉시 중단 (비용 폭주 차단).
 *
 * 비교 기준(gold): classifications.classification_source = 'CLAUDE_MAX_VERIFIED'
 *   (구독제 파이프라인이 Stage A/B/C + 검증을 거쳐 커밋한 5,068건. 사람 검수는 아님 —
 *    "검증된 상위 모델 판정과 얼마나 일치하나" 로 읽는다.)
 *
 * 실행:
 *   npx tsx scripts/classify-benchmark-models.ts --n=200 --models=claude-haiku-5-5,claude-sonnet-5-5
 *   npx tsx scripts/classify-benchmark-models.ts --n=200 --sample=<기존 sample.json>   # 같은 표본 재사용
 *   옵션: --concurrency=4  --max-fallback=5  --seed=20261024  --out=<디렉터리>
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const N = Number(ARG('n') || 0);
const MODELS = (ARG('models') || 'claude-haiku-5-5,claude-sonnet-5-5').split(',').map((s) => s.trim()).filter(Boolean);
const CONCURRENCY = Number(ARG('concurrency') || 4);
const MAX_FALLBACK = Number(ARG('max-fallback') || 5);
const SEED = Number(ARG('seed') || 20261024);
const SAMPLE_FILE = ARG('sample') || '';
const OUT_DIR = ARG('out') || path.join(process.env.LOCALAPPDATA || process.env.TMPDIR || '.', 'Temp', 'claude', 'classify-benchmark', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));

if (!N || N < 1) { console.error('개수 필수:  --n=200  (유료 호출이므로 기본값 없음)'); process.exit(1); }

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}
// ★ 폴백 경로(Gemini/GPT) 차단 — 분류 실패는 null 로 드러나야 하고, 다른 공급자 과금이 섞이면 안 된다.
process.env.GOOGLE_AI_KEY = '';
process.env.GOOGLE_GENERATIVE_AI_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.OPENAI_API_KEY = '';
process.env.CLASSIFY_PROVIDER = 'anthropic';

// 단가 (USD / 1M tokens, 2026-10 공식) — 캐시 쓰기 1.25x, 캐시 읽기 0.1x
const PRICE: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  'claude-haiku-5-5': { input: 0.10, cacheWrite: 0.125, cacheRead: 0.01, output: 0.50 },
  'claude-sonnet-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.20, output: 10 },
  'claude-opus-5-5': { input: 4, cacheWrite: 5, cacheRead: 0.40, output: 20 },
  'claude-haiku-4-5': { input: 1, cacheWrite: 1.25, cacheRead: 0.10, output: 5 },
};
const USD_KRW = 1400;
const SUBJECT_NAME: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2', '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2',
};
const SUBJECT_GRADE: Record<string, string> = {
  '01': '중1', '02': '중1', '03': '중2', '04': '중2', '05': '중3', '06': '중3', '07': '고1', '08': '고1',
};

type Sample = { id: string; subj: string; gold: string; goldDiff: number; content: string; choices: string[] };
type Usage = { in: number; cacheRead: number; cacheCreate: number; out: number };
type Pred = { id: string; subj: string; gold: string; goldDiff: number; pred: string | null; diff: number | null; conf: number | null; verified: boolean; ms: number; err?: string };

// 결정적 셔플 (seed 고정 → 모델 간 같은 표본)
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function shuffle<T>(arr: T[], r: () => number) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

async function buildSample(): Promise<Sample[]> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  // 과목별 gold 건수 → 비례 배분하되 과목당 최소 15, 최대 N*0.25 (07 쏠림 완화)
  const counts: Record<string, number> = {};
  const pool: Record<string, Sample[]> = {};
  for (const subj of Object.keys(SUBJECT_NAME)) {
    const { data, error } = await sb
      .from('classifications')
      .select('problem_id, type_code, difficulty, problems!inner(id, content_latex, answer_json, deleted_at)')
      .eq('classification_source', 'CLAUDE_MAX_VERIFIED')
      .like('type_code', `MS${subj}-%`)
      .is('problems.deleted_at', null)
      .limit(1000);
    if (error) throw new Error(`gold 조회 실패(${subj}): ${error.message}`);
    const rows = (data || []) as unknown as Array<{ problem_id: string; type_code: string; difficulty: string | number | null; problems: { content_latex: string | null; answer_json: { choices?: unknown[] } | null } }>;
    pool[subj] = rows
      .filter((r) => (r.problems.content_latex || '').trim().length > 20)
      .map((r) => ({
        id: r.problem_id, subj, gold: r.type_code, goldDiff: Number(r.difficulty ?? 0),
        content: r.problems.content_latex!,
        choices: Array.isArray(r.problems.answer_json?.choices)
          ? (r.problems.answer_json!.choices as unknown[]).map((c) => typeof c === 'string' ? c : (c as { text?: string })?.text || '').filter(Boolean)
          : [],
      }));
    counts[subj] = pool[subj].length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const subjects = Object.keys(counts).filter((s) => counts[s] > 0);
  const quota: Record<string, number> = {};
  const minQ = Math.min(15, Math.max(1, Math.floor(N / 7))), maxQ = Math.max(1, Math.floor(N * 0.25));
  for (const s of subjects) quota[s] = Math.min(counts[s], Math.max(minQ, Math.min(maxQ, Math.round((counts[s] / total) * N))));
  // 합계를 N 에 맞춘다 (남으면 여유 있는 과목에 1씩, 넘치면 큰 과목부터 1씩 뺌)
  let sum = Object.values(quota).reduce((a, b) => a + b, 0);
  const bySize = [...subjects].sort((a, b) => counts[b] - counts[a]);
  let guard = 0;
  while (sum !== N && guard++ < 1000) {
    for (const s of bySize) {
      if (sum < N && quota[s] < counts[s]) { quota[s]++; sum++; }
      else if (sum > N && quota[s] > minQ) { quota[s]--; sum--; }
      if (sum === N) break;
    }
  }
  const r = rng(SEED);
  const out: Sample[] = [];
  for (const s of subjects) out.push(...shuffle(pool[s], r).slice(0, quota[s]));
  console.log(`표본 ${out.length}건 — ` + subjects.map((s) => `${SUBJECT_NAME[s]} ${quota[s]}/${counts[s]}`).join(', '));
  return out;
}

const seg = (code: string | null, n: number) => (code ? code.split('-').slice(0, n).join('-') : null);

function score(preds: Pred[]) {
  const done = preds.filter((p) => p.pred);
  const n = preds.length;
  const eq = (f: (p: Pred) => boolean) => done.filter(f).length;
  const l1 = eq((p) => seg(p.pred, 2) === seg(p.gold, 2));
  const l2 = eq((p) => seg(p.pred, 3) === seg(p.gold, 3));
  const l3 = eq((p) => seg(p.pred, 4) === seg(p.gold, 4));
  const leaf = eq((p) => p.pred === p.gold);
  const compat = eq((p) => p.pred!.startsWith(p.gold) || p.gold.startsWith(p.pred!));
  const dd = done.filter((p) => p.diff != null && p.goldDiff > 0);
  const diffExact = dd.filter((p) => p.diff === p.goldDiff).length;
  const diff1 = dd.filter((p) => Math.abs(p.diff! - p.goldDiff) <= 1).length;
  const mae = dd.length ? dd.reduce((a, p) => a + Math.abs(p.diff! - p.goldDiff), 0) / dd.length : 0;
  const unverified = done.filter((p) => !p.verified).length;
  return { n, done: done.length, failed: n - done.length, l1, l2, l3, leaf, compat, diffN: dd.length, diffExact, diff1, mae, unverified };
}

async function runModel(model: string, samples: Sample[], classifyProblem: (i: unknown) => Promise<unknown>) {
  process.env.CLAUDE_CLASSIFY_MODEL = model;
  const usage: Usage = { in: 0, cacheRead: 0, cacheCreate: 0, out: 0 };
  let calls = 0, maxCallIn = 0;
  // 호출 토큰은 fetch 를 가로채 응답 usage 에서 직접 집계한다 (classify.ts 로그 의존 X)
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await origFetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('api.anthropic.com/v1/messages') && res.ok) {
      try {
        const u = (await res.clone().json()).usage || {};
        calls++;
        usage.in += u.input_tokens || 0; usage.cacheRead += u.cache_read_input_tokens || 0;
        usage.cacheCreate += u.cache_creation_input_tokens || 0; usage.out += u.output_tokens || 0;
        maxCallIn = Math.max(maxCallIn, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0));
      } catch { /* ignore */ }
    }
    return res;
  }) as typeof fetch;
  // 분류 내부 로그는 삼키고 경고만 남긴다
  const origLog = console.log;
  console.log = () => {};

  const preds: Pred[] = [];
  let fallback = 0, aborted = false;
  let idx = 0;
  const t0 = Date.now();
  const worker = async () => {
    while (!aborted) {
      const i = idx++; if (i >= samples.length) return;
      const s = samples[i];
      const ts = Date.now();
      let pred: Pred = { id: s.id, subj: s.subj, gold: s.gold, goldDiff: s.goldDiff, pred: null, diff: null, conf: null, verified: false, ms: 0 };
      try {
        const r = await classifyProblem({
          content: s.content, choices: s.choices,
          examSubject: SUBJECT_NAME[s.subj], examGrade: SUBJECT_GRADE[s.subj], curriculumCodes: [s.subj],
          logLabel: `bench:${model}:${i}`,
        }) as { typeCode?: string; difficulty?: number; confidence?: number; verified?: boolean; provider?: string } | null;
        if (r?.typeCode && r.provider === 'anthropic') {
          pred = { ...pred, pred: r.typeCode, diff: Number(r.difficulty ?? 0) || null, conf: r.confidence ?? null, verified: !!r.verified };
        } else { fallback++; pred.err = r ? `provider=${r.provider}` : 'null'; }
      } catch (e) { fallback++; pred.err = String(e).slice(0, 200); }
      pred.ms = Date.now() - ts;
      preds.push(pred);
      if (fallback > MAX_FALLBACK) { aborted = true; origLog(`\n★ 폴백/실패 ${fallback}건 > ${MAX_FALLBACK} — 중단`); }
      if (maxCallIn > 60_000) { aborted = true; origLog(`\n★ 단일 호출 입력 ${maxCallIn.toLocaleString()} 토큰 — 전체 유형표 경로 의심, 중단`); }
      if (preds.length % 20 === 0) origLog(`  [${model}] ${preds.length}/${samples.length}  ${((Date.now() - t0) / 1000).toFixed(0)}초  실패 ${fallback}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log = origLog;
  globalThis.fetch = origFetch;

  const sec = (Date.now() - t0) / 1000;
  const p = PRICE[model] || PRICE['claude-sonnet-5-5'];
  const usd = (usage.in * p.input + usage.cacheCreate * p.cacheWrite + usage.cacheRead * p.cacheRead + usage.out * p.output) / 1e6;
  return { model, preds, usage, calls, maxCallIn, sec, usd, krw: usd * USD_KRW, aborted, score: score(preds) };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const samples: Sample[] = SAMPLE_FILE ? JSON.parse(fs.readFileSync(SAMPLE_FILE, 'utf-8')) : await buildSample();
  fs.writeFileSync(path.join(OUT_DIR, 'sample.json'), JSON.stringify(samples, null, 1));
  console.log(`모델 ${MODELS.join(', ')} × ${samples.length}건  (동시 ${CONCURRENCY}, DB 미기록)  → ${OUT_DIR}\n`);

  const { classifyProblem } = await import('@/lib/workflow/classify');
  const results = [];
  for (const model of MODELS) {
    console.log(`▶ ${model}`);
    const r = await runModel(model, samples, classifyProblem as (i: unknown) => Promise<unknown>);
    results.push(r);
    fs.writeFileSync(path.join(OUT_DIR, `preds-${model}.json`), JSON.stringify(r.preds, null, 1));
    const s = r.score;
    const pct = (a: number, b = s.done) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
    console.log(`  완료 ${s.done}/${s.n} (실패 ${s.failed})  ${r.sec.toFixed(0)}초  문항당 ${(r.sec / Math.max(s.n, 1)).toFixed(1)}초${r.aborted ? '  ★중단됨' : ''}`);
    console.log(`  일치  L1 ${pct(s.l1)}  L2 ${pct(s.l2)}  L3 ${pct(s.l3)}  leaf ${pct(s.leaf)}  계층호환 ${pct(s.compat)}  미검증코드 ${s.unverified}`);
    console.log(`  난이도 정확 ${pct(s.diffExact, s.diffN)}  ±1 ${pct(s.diff1, s.diffN)}  MAE ${s.mae.toFixed(2)}`);
    console.log(`  토큰  호출 ${r.calls}  in ${r.usage.in.toLocaleString()}  cache_w ${r.usage.cacheCreate.toLocaleString()}  cache_r ${r.usage.cacheRead.toLocaleString()}  out ${r.usage.out.toLocaleString()}  최대입력/호출 ${r.maxCallIn.toLocaleString()}`);
    console.log(`  비용  $${r.usd.toFixed(4)} ≈ ${Math.round(r.krw).toLocaleString()}원  ★ 문항당 ${(r.krw / Math.max(s.n, 1)).toFixed(2)}원\n`);
  }
  // 과목별 leaf·L2 일치 표
  console.log('── 과목별 (L2 일치 / leaf 일치) ──');
  const subjects = [...new Set(samples.map((s) => s.subj))].sort();
  console.log('  과목'.padEnd(12) + results.map((r) => r.model.replace('claude-', '').padEnd(22)).join(''));
  for (const subj of subjects) {
    const line = results.map((r) => {
      const ps = r.preds.filter((p) => p.subj === subj && p.pred);
      const n = r.preds.filter((p) => p.subj === subj).length;
      const l2 = ps.filter((p) => seg(p.pred, 3) === seg(p.gold, 3)).length;
      const leaf = ps.filter((p) => p.pred === p.gold).length;
      return `${l2}/${n} · ${leaf}/${n}`.padEnd(22);
    }).join('');
    console.log(`  ${SUBJECT_NAME[subj].padEnd(10)}${line}`);
  }
  // 두 모델 간 상호 일치
  if (results.length === 2) {
    const [a, b] = results;
    const mb = new Map(b.preds.map((p) => [p.id, p]));
    const both = a.preds.filter((p) => p.pred && mb.get(p.id)?.pred);
    const agreeLeaf = both.filter((p) => p.pred === mb.get(p.id)!.pred).length;
    const agreeL2 = both.filter((p) => seg(p.pred, 3) === seg(mb.get(p.id)!.pred, 3)).length;
    console.log(`\n── 모델 간 상호 일치 (${both.length}건) ──  L2 ${((agreeL2 / both.length) * 100).toFixed(1)}%  leaf ${((agreeLeaf / both.length) * 100).toFixed(1)}%`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(results.map(({ preds: _p, ...rest }) => rest), null, 1));
  console.log(`\n※ DB 에 기록하지 않았습니다. 결과: ${OUT_DIR}`);
  console.log(`※ 과금 확정치는 Anthropic 콘솔 Usage 로 확인 (환율 ${USD_KRW}원 가정).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
