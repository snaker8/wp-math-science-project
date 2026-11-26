/**
 * 해설 줄바꿈 복구 (2026-11-26) — 가져오기 파서가 해설 문단 안의 강제 줄바꿈(<LINEBREAK/>)을 버려
 *   「…이므로$…$」처럼 여러 줄이 한 줄로 붙어 저장됐다. 원본 HML 을 다시 읽어 **줄바꿈만** 넣는다. (AI 비용 0)
 *
 * 안전: 저장된 해설과 원본 해설의 「공백·그림을 뺀 글자」가 완전히 같을 때만 고친다.
 *   한 글자라도 다르면(선생님이 고친 해설·변환기 차이) 건드리지 않는다. 그림 URL 도 그대로.
 *
 *   npx tsx scripts/fix-hml-solution-linebreaks.ts --manifest=<json> --out=<dir>            # 드라이런
 *   npx tsx scripts/fix-hml-solution-linebreaks.ts --manifest=<json> --out=<dir> --apply    # 적용(변경 전 값 백업 JSON)
 */
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/workflow/hml-parser';
import { parseWorksheetHml } from '../src/lib/workflow/hml-worksheet';
import { loadSupabase, parseArgs, fetchByDbId } from './mathsecr-match';

const args = parseArgs();
const APPLY = args.apply === 'true';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const OUT = args.out || '.';

const IMG_RE = /!\[[^\]]*\]\([^)]*\)|\[도형\]/g;
const keyOf = (s: string) => s.replace(IMG_RE, '').replace(/\s+/g, '');

/** 원본(줄바꿈 살아 있음)의 줄바꿈 자리를 저장본에 옮긴다. 글자 대조가 다르면 null */
export function transplantBreaks(stored: string, fresh: string): string | null {
  if (keyOf(stored) !== keyOf(fresh)) return null;
  // fresh 에서 '\n' 직후에 오는 key 글자 번호들
  const breaks = new Set<number>();
  const f = fresh.replace(IMG_RE, ' ');
  let k = 0; let pending = false;
  for (const ch of f) {
    if (ch === '\n') { pending = true; continue; }
    if (/\s/.test(ch)) continue;
    if (pending && k > 0) breaks.add(k);
    pending = false; k++;
  }
  // stored 를 토큰(그림 마크다운 통째 / 글자)으로 걸으며 해당 글자 앞에 줄바꿈 보장
  const toks = stored.match(/!\[[^\]]*\]\([^)]*\)|[\s\S]/gu) || [];
  let out = ''; k = 0;
  for (const t of toks) {
    if (t.length > 1 || /\s/.test(t)) { out += t; continue; }
    if (breaks.has(k)) {
      const trimmed = out.replace(/[ \t]+$/, '');
      if (!trimmed.endsWith('\n')) out = trimmed + '\n';
      else out = trimmed;
    }
    out += t; k++;
  }
  return out;
}

/** --bundles=<dir>: 수학비서 「내 문제지」 묶음(bundle_NNN.hml + .json)으로 받은 해설. 순서 대신 글자 대조로 짝짓는다 */
async function mainBundles(dir: string) {
  const sb = loadSupabase();
  const r = { apply: APPLY, bundles: 0, cands: 0, noMatch: 0, same: 0, changed: 0, updated: 0, errors: [] as string[] };
  fs.mkdirSync(OUT, { recursive: true });
  const backupPath = path.join(OUT, 'solution-linebreak-backup.jsonl');
  const files = fs.readdirSync(dir).filter((f) => /^bundle_\d+\.hml$/.test(f)).slice(0, LIMIT);
  for (const f of files) {
    const metaPath = path.join(dir, f.replace(/\.hml$/, '.json'));
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as { exams: number[] };
    r.bundles++;
    let items;
    try { items = parseWorksheetHml(fs.readFileSync(path.join(dir, f))); } catch (e) { r.errors.push(`${f}: ${String(e).slice(0, 100)}`); continue; }
    const byKey = new Map<string, string>();
    for (const it of items) if (it.solution) byKey.set(keyOf(it.solution), it.solution);
    for (const db of meta.exams || []) {
      for (const p of (await fetchByDbId(sb, db)).filter((x) => (x.solution_latex || '').trim())) {
        r.cands++;
        const fresh = byKey.get(keyOf(p.solution_latex!));
        if (!fresh) { r.noMatch++; continue; }
        const next = transplantBreaks(p.solution_latex!, fresh);
        if (next == null || next === p.solution_latex) { r.same++; continue; }
        r.changed++;
        if (APPLY) {
          fs.appendFileSync(backupPath, JSON.stringify({ id: p.id, old: p.solution_latex }) + '\n', 'utf-8');
          const { error } = await sb.from('problems').update({ solution_latex: next }).eq('id', p.id);
          if (error) r.errors.push(`${p.id}: ${error.message}`); else r.updated++;
        }
      }
    }
    if (r.bundles % 20 === 0) console.log(`${r.bundles} bundles, changed ${r.changed}`);
  }
  fs.writeFileSync(path.join(OUT, `solution-linebreak-bundles${APPLY ? '' : '-dry'}.json`), JSON.stringify(r, null, 1), 'utf-8');
  const { errors, ...sum } = r;
  console.log(JSON.stringify({ ...sum, errors: errors.length }));
}

async function main() {
  if (args.bundles) return mainBundles(args.bundles);
  if (!args.manifest) { console.error('--manifest 필요'); process.exit(1); }
  const sb = loadSupabase();
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf-8')) as { items: Record<string, { id: number; localPath?: string }> };
  const list = Object.values(manifest.items).filter((i) => i.localPath).slice(0, LIMIT);
  const r = { apply: APPLY, files: 0, noFile: 0, cands: 0, noSol: 0, mismatch: 0, same: 0, changed: 0, updated: 0, errors: [] as string[] };
  fs.mkdirSync(OUT, { recursive: true });
  const backupPath = path.join(OUT, 'solution-linebreak-backup.jsonl'); // 바꾸기 직전 값 — 한 줄씩 바로 적는다(중간에 멈춰도 남게)
  const samples: Array<{ id: string; before: string; after: string }> = [];
  for (const item of list) {
    const cands = (await fetchByDbId(sb, item.id)).filter((p) => (p.solution_latex || '').trim());
    if (!cands.length) continue;
    if (!fs.existsSync(item.localPath!)) { r.noFile++; continue; }
    r.files++;
    let parsed;
    try { parsed = parseHml(fs.readFileSync(item.localPath!)); } catch (e) { r.errors.push(`${item.id}: ${String(e).slice(0, 100)}`); continue; }
    const byNo = new Map(parsed.problems.map((p) => [p.number, p]));
    for (const p of cands) {
      r.cands++;
      const src = p.source_number != null ? byNo.get(p.source_number) : undefined;
      if (!src?.solution) { r.noSol++; continue; }
      const next = transplantBreaks(p.solution_latex!, src.solution);
      if (next == null) { r.mismatch++; continue; }
      if (next === p.solution_latex) { r.same++; continue; }
      r.changed++;
      if (samples.length < 30) samples.push({ id: p.id, before: p.solution_latex!.slice(0, 300), after: next.slice(0, 300) });
      if (APPLY) {
        fs.appendFileSync(backupPath, JSON.stringify({ id: p.id, old: p.solution_latex }) + '\n', 'utf-8');
        const { error } = await sb.from('problems').update({ solution_latex: next }).eq('id', p.id);
        if (error) r.errors.push(`${p.id}: ${error.message}`); else r.updated++;
      }
    }
    if (r.files % 100 === 0) console.log(`${r.files} files, changed ${r.changed}`);
  }
  fs.writeFileSync(path.join(OUT, `solution-linebreak${APPLY ? '' : '-dry'}.json`), JSON.stringify({ ...r, samples }, null, 1), 'utf-8');
  const { errors, ...sum } = r;
  console.log(JSON.stringify({ ...sum, errors: errors.length }));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
