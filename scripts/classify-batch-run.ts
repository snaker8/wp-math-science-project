/**
 * 미분류 문항 일괄 분류 — Anthropic Message Batches (정가의 50%)
 * ============================================================================
 *
 * ★ 유료 API 를 호출한다. `--limit=` 필수(상한). `--max-krw` 추정 초과 시 제출하지 않는다.
 * ★ `--commit` 없이는 DB 에 쓰지 않는다. 예측은 run 디렉터리의 predictions.jsonl 에 쌓인다.
 * ★ 프롬프트·요청 파라미터는 동기 경로와 같은 빌더(src/lib/workflow/classify.ts)를 쓴다.
 *
 * 흐름 (run 디렉터리에 단계별 상태를 남겨 중단 후 재개 가능):
 *   select  → targets.json      미분류 대상 (exams.curriculum_codes 로 과목 고정 — 런북 4-(1))
 *   stage1  → stage1-batch.json / stage1-results.jsonl → stage1.json   (대단원+중단원)
 *   stage2  → stage2-batch.json / stage2-results.jsonl → predictions.jsonl (최종 코드·난이도)
 *   commit  → classifications INSERT (+ problem_pitfalls)  ※ --commit 일 때만
 *
 * 실행:
 *   npx tsx scripts/classify-batch-run.ts --run=mid-20261024 --subjects=02,03,04,05,06 --limit=2000
 *   npx tsx scripts/classify-batch-run.ts --run=mid-20261024 --commit        # 예측 검증 후 DB 반영
 *   옵션: --model=claude-sonnet-5-5  --max-krw=30000  --poll-sec=60  --dry (제출 전 추정까지만)
 */
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
const RUN = ARG('run') || '';
const SUBJECTS = (ARG('subjects') || '02,03,04,05,06').split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(ARG('limit') || 0);
const MODEL = ARG('model') || 'claude-sonnet-5-5';
const MAX_KRW = Number(ARG('max-krw') || 30000);
const POLL_SEC = Number(ARG('poll-sec') || 60);
const COMMIT = process.argv.includes('--commit');
const DRY = process.argv.includes('--dry');
// 이전 run 의 stage1 코드가 같은 문항은 그 run 의 Stage 2 예측을 재사용 (Stage 2 재호출 비용 절약)
const REUSE_FROM = ARG('reuse-stage2-from') || '';
if (!RUN) { console.error('--run=<id> 필수'); process.exit(1); }

for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const t = line.trim(); if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('='); if (i > 0) process.env[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '');
}
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!API_KEY) { console.error('ANTHROPIC_API_KEY 없음'); process.exit(1); }

const DIR = path.join(process.env.LOCALAPPDATA || '.', 'Temp', 'claude', 'classify-batch', RUN);
fs.mkdirSync(DIR, { recursive: true });
const P = (f: string) => path.join(DIR, f);
const exists = (f: string) => fs.existsSync(P(f));
const readJson = <T>(f: string): T => JSON.parse(fs.readFileSync(P(f), 'utf-8'));
const writeJson = (f: string, v: unknown) => fs.writeFileSync(P(f), JSON.stringify(v, null, 1));
const log = (...a: unknown[]) => { const s = a.map(String).join(' '); console.log(s); fs.appendFileSync(P('run.log'), `${new Date().toISOString()} ${s}\n`); };

// Batch 단가 (정가 50%) USD/MTok
const PRICE: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  'claude-sonnet-5-5': { input: 1, cacheWrite: 1.25, cacheRead: 0.10, output: 5 },
  'claude-opus-5-5': { input: 2, cacheWrite: 2.5, cacheRead: 0.20, output: 10 },
  'claude-haiku-5-5': { input: 0.05, cacheWrite: 0.0625, cacheRead: 0.005, output: 0.25 },
};
const USD_KRW = 1400;
const SUBJECT_NAME: Record<string, string> = { '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2', '05': '중3-1', '06': '중3-2', '07': '공통수학1', '08': '공통수학2' };
const SUBJECT_GRADE: Record<string, string> = { '01': '중1', '02': '중1', '03': '중2', '04': '중2', '05': '중3', '06': '중3', '07': '고1', '08': '고1' };

type Target = { id: string; examId: string; examTitle: string; codes: string[]; examSubject: string; examGrade: string; text: string };
type Usage = { in: number; cacheRead: number; cacheCreate: number; out: number };
type BatchResult = { custom_id: string; result: { type: string; message?: { content?: Array<{ type: string; text?: string }>; usage?: Record<string, number> }; error?: unknown } };

function sb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}
async function pageAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// ─── 1. 대상 선정 ─────────────────────────────────────────────────────────────
async function select(): Promise<Target[]> {
  if (exists('targets.json')) { const t = readJson<Target[]>('targets.json'); log(`targets.json 재사용 ${t.length}건`); return t; }
  if (!LIMIT || LIMIT < 1) throw new Error('--limit=N 필수 (유료 호출 상한)');
  const db = sb();
  type ExamRow = { id: string; title: string; subject: string | null; grade: string | null; curriculum_codes: string[] | null };
  const exams = (await pageAll<ExamRow>((a, b) => db.from('exams').select('id,title,subject,grade,curriculum_codes').is('deleted_at', null).overlaps('curriculum_codes', SUBJECTS).range(a, b)))
    // 과목 코드가 전부 대상 과목 안에 있어야 한다 (중등+고등 섞인 시험지는 제외)
    .filter((e) => (e.curriculum_codes || []).length > 0 && (e.curriculum_codes || []).every((c) => SUBJECTS.includes(String(c))))
    .sort((a, b) => String(a.curriculum_codes).localeCompare(String(b.curriculum_codes)) || a.title.localeCompare(b.title));
  const classified = new Set((await pageAll<{ problem_id: string }>((a, b) => db.from('classifications').select('problem_id').order('problem_id').range(a, b))).map((r) => r.problem_id));
  const targets: Target[] = [];
  const seen = new Set<string>();
  let skippedShort = 0;
  for (const e of exams) {
    if (targets.length >= LIMIT) break;
    const { data: eps, error } = await db.from('exam_problems').select('problem_id,sequence_number').eq('exam_id', e.id).order('sequence_number');
    if (error) throw new Error(error.message);
    const ids = (eps || []).map((x) => x.problem_id).filter((id) => !classified.has(id) && !seen.has(id));
    if (!ids.length) continue;
    const { data: probs, error: pe } = await db.from('problems').select('id,content_latex,answer_json').in('id', ids).is('deleted_at', null);
    if (pe) throw new Error(pe.message);
    const byId = new Map((probs || []).map((p) => [p.id, p]));
    const codes = (e.curriculum_codes || []).map(String);
    const first = codes[0];
    for (const id of ids) {
      if (targets.length >= LIMIT) break;
      const p = byId.get(id) as { content_latex: string | null; answer_json: { choices?: unknown[] } | null } | undefined;
      const content = (p?.content_latex || '').trim();
      if (content.length < 20) { skippedShort++; continue; }
      // classifyProblem 과 같은 본문 구성 (앞 1500자 + 보기 6개 600자)
      const choices = Array.isArray(p?.answer_json?.choices) ? (p!.answer_json!.choices as unknown[]).map((c) => (typeof c === 'string' ? c : (c as { text?: string })?.text || '').trim()).filter(Boolean).slice(0, 6) : [];
      const text = content.slice(0, 1500) + (choices.length ? `\n\n보기:\n${choices.join('\n').slice(0, 600)}` : '');
      seen.add(id);
      targets.push({ id, examId: e.id, examTitle: e.title, codes, examSubject: codes.length === 1 ? SUBJECT_NAME[first] || e.subject || '' : codes.map((c) => SUBJECT_NAME[c] || c).join('/'), examGrade: SUBJECT_GRADE[first] || e.grade || '', text });
    }
  }
  writeJson('targets.json', targets);
  const bySubj: Record<string, number> = {};
  for (const t of targets) bySubj[t.codes.join(',')] = (bySubj[t.codes.join(',')] || 0) + 1;
  log(`대상 ${targets.length}건 (시험지 ${new Set(targets.map((t) => t.examId)).size}장, 본문 짧아 제외 ${skippedShort}) — ${Object.entries(bySubj).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  return targets;
}

// ─── Batch API ───────────────────────────────────────────────────────────────
const H = { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' };
async function submitBatch(stage: string, requests: Array<{ custom_id: string; params: Record<string, unknown> }>): Promise<string> {
  const f = `${stage}-batch.json`;
  if (exists(f)) { const b = readJson<{ id: string }>(f); log(`${stage}: 기존 배치 ${b.id} 재사용`); return b.id; }
  const res = await fetch('https://api.anthropic.com/v1/messages/batches', { method: 'POST', headers: H, body: JSON.stringify({ requests }) });
  const j = await res.json();
  if (!res.ok) throw new Error(`배치 생성 실패 ${res.status}: ${JSON.stringify(j).slice(0, 500)}`);
  writeJson(f, { id: j.id, created_at: j.created_at, count: requests.length });
  log(`${stage}: 배치 제출 ${j.id} (${requests.length}건)`);
  return j.id;
}
async function waitBatch(stage: string, id: string): Promise<BatchResult[]> {
  const f = `${stage}-results.jsonl`;
  if (!exists(f)) {
    let resultsUrl = '';
    for (;;) {
      const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers: H });
      const j = await res.json();
      if (!res.ok) throw new Error(`배치 조회 실패 ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
      const c = j.request_counts || {};
      log(`${stage}: ${j.processing_status}  처리중 ${c.processing ?? '-'} 성공 ${c.succeeded ?? '-'} 오류 ${c.errored ?? '-'} 만료 ${c.expired ?? '-'}`);
      if (j.processing_status === 'ended') { resultsUrl = j.results_url; break; }
      await new Promise((r) => setTimeout(r, POLL_SEC * 1000));
    }
    const res = await fetch(resultsUrl, { headers: H });
    if (!res.ok) throw new Error(`결과 다운로드 실패 ${res.status}`);
    fs.writeFileSync(P(f), await res.text());
  }
  return fs.readFileSync(P(f), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as BatchResult);
}
function textOf(r: BatchResult): string | null {
  if (r.result.type !== 'succeeded') return null;
  const tb = (r.result.message?.content || []).find((c) => c.type === 'text');
  return (tb?.text || '').trim() || null;
}
function addUsage(u: Usage, r: BatchResult) {
  const m = r.result.message?.usage || {};
  u.in += m.input_tokens || 0; u.cacheRead += m.cache_read_input_tokens || 0; u.cacheCreate += m.cache_creation_input_tokens || 0; u.out += m.output_tokens || 0;
}
function krw(u: Usage): number {
  const p = PRICE[MODEL] || PRICE['claude-sonnet-5-5'];
  return ((u.in * p.input + u.cacheCreate * p.cacheWrite + u.cacheRead * p.cacheRead + u.out * p.output) / 1e6) * USD_KRW;
}
// 토큰 수 추정 (제출 전 상한 검사용) — 한글 혼합 텍스트 약 1.6자/토큰 보수적
const estTok = (s: string) => Math.ceil(s.length / 1.6);

// ─── 2. Stage 1 ──────────────────────────────────────────────────────────────
async function stage1(targets: Target[]) {
  const cls = await import('@/lib/workflow/classify');
  const { withNeighborCourses } = await import('@/lib/workflow/mathsecr-prompt');
  // ★ 동기 경로(classifyProblem)와 같게 이웃 과정(지난 학기 등)을 표에 합친다 — 학교 시험은 지난 학기 범위를 섞어 낸다.
  //   첫 실행(mid-20261025)에서 이걸 빠뜨려 중1-2 시험지의 중1-1 문항 59건이 표 밖 코드로 나와 실패했다.
  const subjectOf = (t: Target): string | string[] => { const n = withNeighborCourses(t.codes.length === 1 ? t.codes[0] : t.codes); return n.length === 1 ? n[0] : n; };
  if (exists('stage1.json')) { log('stage1.json 재사용'); return readJson<Record<string, string>>('stage1.json'); }
  const requests: Array<{ custom_id: string; params: Record<string, unknown> }> = [];
  let estIn = 0;
  for (const t of targets) {
    const subjectCode = subjectOf(t);
    const s1 = cls.buildStage1Prompt({ subjectCode, examSubject: t.examSubject, examGrade: t.examGrade, content: t.text, label: `batch:${t.id.slice(0, 8)}` });
    if (!s1) { log(`  유형표 없음 → 제외 ${t.id} (${t.codes})`); continue; }
    estIn += estTok(s1.system) + estTok(s1.user);
    requests.push({ custom_id: t.id, params: cls.buildClaudeMessageParams({ model: MODEL, systemPrompt: s1.system, userPrompt: s1.user, maxTokens: cls.STAGE1_MAX_TOKENS, jsonSchema: cls.STAGE1_SCHEMA }) });
  }
  // 상한 추정: Stage1+Stage2 입력을 캐시 없이 정가 50% 로 봤을 때 (보수적 상한)
  const p = PRICE[MODEL] || PRICE['claude-sonnet-5-5'];
  const estKrw = ((estIn * 2 * p.input + requests.length * 400 * p.output) / 1e6) * USD_KRW;
  log(`stage1: ${requests.length}건, 입력 추정 ${estIn.toLocaleString()} 토큰, 2단계 합산 보수적 상한 ≈ ${Math.round(estKrw).toLocaleString()}원 (한도 ${MAX_KRW.toLocaleString()}원)`);
  if (estKrw > MAX_KRW) throw new Error(`추정 상한 초과 — --limit 을 줄이거나 --max-krw 를 올리세요`);
  if (DRY) { log('--dry: 제출하지 않음'); process.exit(0); }
  const id = await submitBatch('stage1', requests);
  const results = await waitBatch('stage1', id);
  const usage: Usage = { in: 0, cacheRead: 0, cacheCreate: 0, out: 0 };
  const out: Record<string, string> = {};
  const fail: Array<{ id: string; why: string }> = [];
  const byId = new Map(targets.map((t) => [t.id, t]));
  for (const r of results) {
    addUsage(usage, r);
    const t = byId.get(r.custom_id); if (!t) continue;
    const raw = textOf(r);
    if (!raw) { fail.push({ id: r.custom_id, why: `${r.result.type}: ${JSON.stringify(r.result.error || '').slice(0, 120)}` }); continue; }
    const code = cls.extractStage1Code(raw, subjectOf(t));
    if (!code) { fail.push({ id: r.custom_id, why: `코드 추출 실패: ${raw.slice(0, 80)}` }); continue; }
    out[r.custom_id] = code;
  }
  writeJson('stage1.json', out); writeJson('stage1-fail.json', fail); writeJson('stage1-usage.json', { ...usage, krw: krw(usage) });
  log(`stage1 완료: 성공 ${Object.keys(out).length} / 실패 ${fail.length}  비용 ≈ ${Math.round(krw(usage)).toLocaleString()}원`);
  return out;
}

// ─── 3. Stage 2 ──────────────────────────────────────────────────────────────
type Pred = { problem_id: string; exam_id: string; type_code: string; difficulty: number; cognitive_domain: string; confidence: number; pitfalls: Array<{ code: string; confidence: number; reason?: string }>; stage1: string; leaf?: boolean };
async function stage2(targets: Target[], s1: Record<string, string>): Promise<Pred[]> {
  const cls = await import('@/lib/workflow/classify');
  if (exists('predictions.jsonl')) { log('predictions.jsonl 재사용'); return fs.readFileSync(P('predictions.jsonl'), 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  const byId = new Map(targets.map((t) => [t.id, t]));
  const requests: Array<{ custom_id: string; params: Record<string, unknown> }> = [];
  const preds: Pred[] = [];
  let reused = 0;
  const prevS1: Record<string, string> = REUSE_FROM && fs.existsSync(path.join(REUSE_FROM, 'stage1.json')) ? JSON.parse(fs.readFileSync(path.join(REUSE_FROM, 'stage1.json'), 'utf-8')) : {};
  const prevPred = new Map<string, Pred>();
  if (REUSE_FROM && fs.existsSync(path.join(REUSE_FROM, 'predictions.jsonl'))) {
    for (const l of fs.readFileSync(path.join(REUSE_FROM, 'predictions.jsonl'), 'utf-8').split('\n')) if (l.trim()) { const p = JSON.parse(l) as Pred; prevPred.set(p.problem_id, p); }
  }
  let i = 0;
  for (const [id, stage1Code] of Object.entries(s1)) {
    const t = byId.get(id)!;
    if (prevS1[id] === stage1Code && prevPred.has(id)) { preds.push(prevPred.get(id)!); reused++; continue; }
    const s2 = await cls.buildStage2Prompt({ stage1Code, examSubject: t.examSubject, content: t.text, label: `batch:${id.slice(0, 8)}` });
    if (!s2) continue;
    if ('leaf' in s2) {
      const L = s2.leaf as { typeCode: string; difficulty: number; cognitiveDomain: string; confidence: number };
      preds.push({ problem_id: id, exam_id: t.examId, type_code: L.typeCode, difficulty: L.difficulty, cognitive_domain: L.cognitiveDomain, confidence: L.confidence, pitfalls: [], stage1: stage1Code, leaf: true });
      continue;
    }
    requests.push({ custom_id: id, params: cls.buildClaudeMessageParams({ model: MODEL, systemPrompt: s2.system, userPrompt: s2.user, maxTokens: cls.STAGE2_MAX_TOKENS, jsonSchema: cls.STAGE2_SCHEMA }) });
    if (++i % 200 === 0) log(`  stage2 프롬프트 ${i}/${Object.keys(s1).length}`);
  }
  log(`stage2: 호출 ${requests.length}건, 이전 run 재사용 ${reused}건, leaf 확정 ${preds.length - reused}건`);
  const usage: Usage = { in: 0, cacheRead: 0, cacheCreate: 0, out: 0 };
  const fail: Array<{ id: string; why: string }> = [];
  if (requests.length) {
    const id = await submitBatch('stage2', requests);
    const results = await waitBatch('stage2', id);
    for (const r of results) {
      addUsage(usage, r);
      const t = byId.get(r.custom_id); if (!t) continue;
      const raw = textOf(r);
      if (!raw) { fail.push({ id: r.custom_id, why: `${r.result.type}: ${JSON.stringify(r.result.error || '').slice(0, 120)}` }); continue; }
      const parsed = cls.parseStage2Response(raw, s1[r.custom_id], t.examSubject) as { typeCode: string; difficulty: number; cognitiveDomain: string; confidence: number; pitfalls?: Pred['pitfalls'] } | null;
      if (!parsed?.typeCode) { fail.push({ id: r.custom_id, why: `파싱 실패: ${raw.slice(0, 80)}` }); continue; }
      preds.push({ problem_id: r.custom_id, exam_id: t.examId, type_code: parsed.typeCode, difficulty: Number(parsed.difficulty) || 3, cognitive_domain: parsed.cognitiveDomain || 'CALCULATION', confidence: Number(parsed.confidence) || 0.7, pitfalls: parsed.pitfalls || [], stage1: s1[r.custom_id] });
    }
  }
  fs.writeFileSync(P('predictions.jsonl'), preds.map((p) => JSON.stringify(p)).join('\n') + '\n');
  writeJson('stage2-fail.json', fail); writeJson('stage2-usage.json', { ...usage, krw: krw(usage) });
  log(`stage2 완료: 예측 ${preds.length} / 실패 ${fail.length}  비용 ≈ ${Math.round(krw(usage)).toLocaleString()}원`);
  return preds;
}

// ─── 4. 검증 + 커밋 ──────────────────────────────────────────────────────────
async function verifyAndCommit(targets: Target[], preds: Pred[]) {
  const db = sb();
  const byId = new Map(targets.map((t) => [t.id, t]));
  // (1) 코드가 mathsecr_types 에 실제 존재
  const codes = [...new Set(preds.map((p) => p.type_code))];
  const existing = new Set<string>();
  for (let i = 0; i < codes.length; i += 500) {
    const { data, error } = await db.from('mathsecr_types').select('code').in('code', codes.slice(i, i + 500));
    if (error) throw new Error(error.message);
    for (const r of data || []) existing.add(r.code);
  }
  // (2) 과목 밖 결과 제외 (런북 4-(3)) — 이웃 과정 허용은 동기 경로와 동일하게 시험지 코드 ± 같은 학년
  const sameGrade = (a: string, b: string) => SUBJECT_GRADE[a] && SUBJECT_GRADE[a] === SUBJECT_GRADE[b];
  const ok: Pred[] = [], bad: Array<Pred & { why: string }> = [];
  for (const p of preds) {
    const t = byId.get(p.problem_id)!;
    const subj = p.type_code.slice(2, 4);
    if (!existing.has(p.type_code)) { bad.push({ ...p, why: '존재하지 않는 코드' }); continue; }
    if (!t.codes.some((c) => c === subj || sameGrade(c, subj))) { bad.push({ ...p, why: `과목 밖 (${t.codes} → ${subj})` }); continue; }
    if (!(p.difficulty >= 1 && p.difficulty <= 10)) { bad.push({ ...p, why: `난이도 범위 밖 ${p.difficulty}` }); continue; }
    ok.push(p);
  }
  // (3) 그 사이 다른 경로로 분류된 문제 제외
  const already = new Set<string>();
  // ★ 200개씩 + error 확인 (첫 실행에서 500개 .in() 이 조용히 비어 돌아와 중복 INSERT 로 전건 실패했다)
  for (let i = 0; i < ok.length; i += 200) {
    const { data, error } = await db.from('classifications').select('problem_id').in('problem_id', ok.slice(i, i + 200).map((p) => p.problem_id));
    if (error) throw new Error(`기존 분류 조회 실패: ${error.message}`);
    for (const r of data || []) already.add(r.problem_id);
  }
  const rows = ok.filter((p) => !already.has(p.problem_id));
  writeJson('verify.json', { total: preds.length, ok: ok.length, bad: bad.length, alreadyClassified: already.size, toInsert: rows.length, badSample: bad.slice(0, 30) });
  const dist: Record<string, number> = {}; for (const p of rows) dist[p.difficulty] = (dist[p.difficulty] || 0) + 1;
  const s1u = exists('stage1-usage.json') ? readJson<{ krw: number }>('stage1-usage.json').krw : 0;
  const s2u = exists('stage2-usage.json') ? readJson<{ krw: number }>('stage2-usage.json').krw : 0;
  log(`검증: 예측 ${preds.length} → 통과 ${ok.length}, 제외 ${bad.length}, 이미 분류됨 ${already.size}, 기록 대상 ${rows.length}`);
  log(`난이도 분포: ${JSON.stringify(dist)}   총 비용 ≈ ${Math.round(s1u + s2u).toLocaleString()}원`);
  if (!COMMIT) { log('※ --commit 없음 — DB 에 쓰지 않았습니다.'); return; }

  const source = `${MODEL}/batch:${RUN}`;
  // 함정 코드는 pitfall_types 에 있는 것만 (FK) — 모델이 목록 밖 코드를 만들기도 한다
  const { data: ptRows } = await db.from('pitfall_types').select('code');
  const validPitfall = new Set((ptRows || []).map((r) => r.code as string));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await db.from('classifications').insert(chunk.map((p) => ({
      problem_id: p.problem_id, type_code: p.type_code, difficulty: String(p.difficulty), cognitive_domain: p.cognitive_domain,
      ai_confidence: p.confidence, is_verified: false, classification_source: source,
    })));
    if (error) { log(`INSERT 실패 (${i}~): ${error.message}`); break; }
    inserted += chunk.length;
    const pf = chunk.flatMap((p) => p.pitfalls.filter((x) => /^[A-Z][A-Z0-9_]+$/.test(x.code) && validPitfall.has(x.code)).slice(0, 3).map((x) => ({ problem_id: p.problem_id, pitfall_code: x.code, ai_confidence: x.confidence, reason: x.reason || null, is_verified: false })));
    if (pf.length) { const { error: pe } = await db.from('problem_pitfalls').insert(pf); if (pe) log(`  problem_pitfalls 실패(무시): ${pe.message}`); }
  }
  const { count } = await db.from('classifications').select('id', { count: 'exact', head: true }).eq('classification_source', source);
  log(`★ 기록 ${inserted}건 — readback ${count}건 (classification_source='${source}')`);
}

async function main() {
  log(`run=${RUN} model=${MODEL} subjects=${SUBJECTS} limit=${LIMIT || '(targets 재사용)'} ${COMMIT ? '★COMMIT' : '(DB 미기록)'}`);
  const targets = await select();
  if (!targets.length) { log('대상 없음'); return; }
  const s1 = await stage1(targets);
  const preds = await stage2(targets, s1);
  await verifyAndCommit(targets, preds);
}
main().catch((e) => { log('오류:', e?.stack || e); process.exit(1); });
