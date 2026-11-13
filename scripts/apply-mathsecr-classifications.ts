/**
 * 수학비서 문항 유형·난이도 → 우리 classifications (분류 없는 문항만 채운다. AI 비용 0)
 *
 * 입력
 *   --cells=<tsv>   수학비서 나만의DB 문항 덤프: mydbId \t 번호 \t cellId \t 난이도(a/b) \t 유형경로(07-06-02-05-01|…)
 *                   (브라우저에서 GET /mydbs/{id}/cells 로 모은 것. answers[].difficulty.mathSecr · chapters[].chapter 앞 번호)
 *   --report=<json> backfill-mathsecr-solutions.ts 리포트 — chapters[] 에 {problemId, db, no} (제목으로 짝지은 학교기출 포함)
 *
 * 짝: ① 리포트의 problemId↔(db,no)  ② source_name `…__db-{id}.hml` + source_number
 * 쓰기: 수학비서(MS) 분류가 하나도 없는 문항에만 INSERT. 이미 MS 분류가 있으면 건드리지 않고 일치율만 센다.
 *       옛 AI 코드(CRD-01-001 등)만 있는 문항은 --legacy=update 일 때만 그 행의 type_code 를 MS 로 바꾼다(기본: 건너뜀).
 *       --override=ai : AI 가 매긴 MS 분류도 수학비서 유형·난이도로 덮는다.
 *                       ★ 실행하지 않았다(2026-11-12 대표 결정: 난이도 기준은 「우리 기준」. 수학비서 값이 정답은 아니다).
 *                         비교 분석용으로만 남긴다 — 드라이런 + --dump 로 AI↔수학비서 차이를 뽑는다.
 *                         같은 문항 비교: 난이도 정확 일치 30% · ±1 이내 73% · 유형 leaf 일치 34%.
 *       --dump=<tsv>  : AI 분류 ↔ 수학비서 값을 나란히 적는다(problem_id, ai_source, ai_code, ai_diff, ms_code, ms_diff).
 *       --report      : 쉼표로 여러 개.
 *
 *   npx tsx scripts/apply-mathsecr-classifications.ts --cells=… --report=…            # 드라이런
 *   npx tsx scripts/apply-mathsecr-classifications.ts --cells=… --report=… --apply
 */
import fs from 'fs';
import { loadSupabase, parseArgs } from './mathsecr-match';

const args = parseArgs();
const APPLY = args.apply === 'true';
const LEGACY_UPDATE = args.legacy === 'update';
const OVERRIDE_AI = args.override === 'ai';
const TAB = String.fromCharCode(9);
const NL = String.fromCharCode(10);
const SOURCE = args.source || 'mathsecr-cell-20261111';
if (!args.cells || !args.report) {
  console.error('--cells=<tsv> --report=<json> 필요');
  process.exit(1);
}
const sb = loadSupabase();

type Cell = { code: string; diff: number | null };

async function pageAll<T>(fn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let res: { data: T[] | null; error: { message: string } | null } | null = null;
    for (let t = 0; t < 4; t++) {
      res = await fn(from, from + 999);
      if (!res.error) break;
      await new Promise((r) => setTimeout(r, 1500 * (t + 1)));
    }
    if (res!.error) throw new Error(res!.error.message);
    out.push(...(res!.data || []));
    if ((res!.data || []).length < 1000) break;
  }
  return out;
}

async function main() {
  // 1. 수학비서 문항
  const cells = new Map<string, Cell>();
  for (const line of fs.readFileSync(args.cells, 'utf-8').split('\n')) {
    const [db, no, , d, ch] = line.split('\t');
    if (!db || !ch) continue;
    const first = ch.split('|')[0];
    const diff = Number((d || '').split('/').find((x) => /^\d+$/.test(x)));
    cells.set(`${db}:${no}`, { code: 'MS' + first, diff: diff >= 1 && diff <= 10 ? diff : null });
  }

  // 2. 문항 짝
  const pair = new Map<string, string>(); // problemId → db:no
  let fromReport = 0;
  for (const rp of String(args.report).split(',')) {
    const rep = JSON.parse(fs.readFileSync(rp, 'utf-8')) as { chapters: Array<{ problemId: string; db?: number; no?: number }> };
    for (const c of rep.chapters || []) if (c.db && c.no && !pair.has(c.problemId)) { pair.set(c.problemId, `${c.db}:${c.no}`); fromReport++; }
  }
  const dbRows = await pageAll<{ id: string; source_name: string; source_number: number | null }>((a, b) =>
    sb.from('problems').select('id, source_name, source_number').is('deleted_at', null).like('source_name', '%\\_\\_db-%.hml').order('id').range(a, b));
  let fromName = 0;
  for (const r of dbRows) {
    const m = r.source_name.match(/__db-(\d+)\.hml$/);
    if (!m || r.source_number == null || pair.has(r.id)) continue;
    pair.set(r.id, `${m[1]}:${r.source_number}`);
    fromName++;
  }

  // 3. 유형 코드 검증 (없으면 한 단계 위)
  const codes = new Set((await pageAll<{ code: string }>((a, b) => sb.from('mathsecr_types').select('code').order('code').range(a, b))).map((r) => r.code));

  // 4. 기존 분류
  const ids = [...pair.keys()];
  const existing = new Map<string, Array<{ id: string; type_code: string; src: string; difficulty: string }>>();
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data, error } = await sb.from('classifications').select('id, problem_id, type_code, classification_source, difficulty').in('problem_id', chunk).limit(5000);
    if (error) throw new Error(error.message);
    for (const r of (data || []) as Array<{ id: string; problem_id: string; type_code: string; classification_source: string | null; difficulty: string }>) {
      const a = existing.get(r.problem_id) || [];
      a.push({ id: r.id, type_code: r.type_code, src: r.classification_source || '', difficulty: String(r.difficulty) });
      existing.set(r.problem_id, a);
    }
  }

  const stat = {
    cells: cells.size, paired: pair.size, fromReport, fromName,
    noCell: 0, badCode: 0, parentCode: 0, noDiff: 0,
    hasMs: 0, agreeLeaf: 0, agreeSmall: 0, agreeMid: 0, agreeBig: 0, agreeSubject: 0,
    legacyOnly: 0, legacyUpdated: 0, inserted: 0, toInsert: 0, errors: 0,
    aiOverride: 0, aiOverridden: 0, aiDiffChanged: 0, aiExtraMsRows: 0, aiDeleted: 0,
  };
  const dump: string[] = [];
  const aiDiffShift: Record<string, number> = {}; // 'AI→수학비서' 난이도 이동
  const overrides: Array<{ id: string; type_code: string; difficulty: string; extra: string[] }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const legacyUpdates: Array<{ id: string; type_code: string }> = [];
  const seg = (c: string, n: number) => c.split('-').slice(0, n).join('-');

  for (const [pid, key] of pair) {
    const cell = cells.get(key);
    if (!cell) { stat.noCell++; continue; }
    let code = cell.code;
    if (!codes.has(code)) {
      const up = seg(code, 4);
      if (codes.has(up)) { code = up; stat.parentCode++; } else { stat.badCode++; continue; }
    }
    const ex = existing.get(pid) || [];
    const ms = ex.filter((r) => r.type_code.startsWith('MS'));
    if (ms.length) {
      stat.hasMs++;
      const o = ms[0].type_code;
      if (o === code) stat.agreeLeaf++;
      if (seg(o, 4) === seg(code, 4)) stat.agreeSmall++;
      if (seg(o, 3) === seg(code, 3)) stat.agreeMid++;
      if (seg(o, 2) === seg(code, 2)) stat.agreeBig++;
      if (seg(o, 1) === seg(code, 1)) stat.agreeSubject++;
      // 분석용: AI 가 매긴 분류 ↔ 수학비서 (보정 근거 데이터)
      const aiRow = ms.find((r) => !r.src.startsWith('mathsecr'));
      if (aiRow && !ms.some((r) => r.src.startsWith('mathsecr'))) dump.push([pid, aiRow.src, aiRow.type_code, aiRow.difficulty, code, String(cell.diff ?? '')].join(TAB));
      // AI 가 매긴 MS 분류 덮기 — 수학비서 값으로 이미 들어간 행이 있으면 건드리지 않는다
      if (OVERRIDE_AI && cell.diff != null && !ms.some((r) => r.src.startsWith('mathsecr'))) {
        const keep = ms.find((r) => r.type_code === code) || ms[0];
        if (keep.type_code !== code || keep.difficulty !== String(cell.diff) || ms.length > 1) {
          stat.aiOverride++;
          if (keep.difficulty !== String(cell.diff)) {
            stat.aiDiffChanged++;
            const k = `${keep.difficulty}→${cell.diff}`;
            aiDiffShift[k] = (aiDiffShift[k] || 0) + 1;
          }
          // 같은 문항에 AI MS 행이 여럿이면 하나만 남긴다(출제 조회가 어느 행을 집을지 모호해진다)
          const extra = ms.filter((r) => r.id !== keep.id).map((r) => r.id);
          stat.aiExtraMsRows += extra.length;
          overrides.push({ id: keep.id, type_code: code, difficulty: String(cell.diff), extra });
        }
      }
      continue;
    }
    if (cell.diff == null) { stat.noDiff++; continue; }
    if (ex.length) {
      stat.legacyOnly++;
      if (LEGACY_UPDATE) legacyUpdates.push({ id: ex[0].id, type_code: code });
      continue;
    }
    inserts.push({
      problem_id: pid,
      type_code: code,
      difficulty: String(cell.diff),
      cognitive_domain: 'UNDERSTANDING',
      classification_source: SOURCE,
      ai_confidence: 1,
      is_verified: false,
    });
  }
  stat.toInsert = inserts.length;

  if (APPLY) {
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await sb.from('classifications').upsert(inserts.slice(i, i + 500), { onConflict: 'problem_id,type_code', ignoreDuplicates: true });
      if (error) { stat.errors++; console.error('insert', i, error.message); } else stat.inserted += Math.min(500, inserts.length - i);
    }
    for (const o of overrides) {
      if (o.extra.length) {
        const { error } = await sb.from('classifications').delete().in('id', o.extra);
        if (error) { stat.errors++; console.error('delete extra', error.message); continue; } else stat.aiDeleted += o.extra.length;
      }
      const { error } = await sb.from('classifications').update({ type_code: o.type_code, difficulty: o.difficulty, classification_source: SOURCE }).eq('id', o.id);
      if (error) { stat.errors++; console.error('override', o.id, error.message); } else stat.aiOverridden++;
    }
    for (const u of legacyUpdates) {
      const { error } = await sb.from('classifications').update({ type_code: u.type_code, classification_source: SOURCE }).eq('id', u.id);
      if (error) stat.errors++; else stat.legacyUpdated++;
    }
  }
  console.log(JSON.stringify(stat, null, 2));
  if (args.dump) { fs.writeFileSync(args.dump, ['problem_id','ai_source','ai_code','ai_diff','ms_code','ms_diff'].join(TAB) + NL + dump.join(NL)); console.log('dump', dump.length); }
  if (OVERRIDE_AI) console.log('AI→수학비서 난이도 이동', JSON.stringify(Object.entries(aiDiffShift).sort((a, b) => b[1] - a[1]).slice(0, 30)));
  // 과목별 분포 (넣을 것)
  const bySubject: Record<string, number> = {};
  for (const r of inserts) { const s = seg(String(r.type_code), 1); bySubject[s] = (bySubject[s] || 0) + 1; }
  console.log('insert by subject', JSON.stringify(bySubject));
}

main().catch((e) => { console.error(e); process.exit(1); });
