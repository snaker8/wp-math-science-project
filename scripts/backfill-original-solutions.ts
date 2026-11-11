/**
 * 나만의DB 원본 HML(모의고사 등 원본에 [해설] 이 있는 것) → 이미 적재된 문제에 해설을 채운다. (AI 비용 0)
 *
 * 배경 (2026-11-11): 모의고사 원본엔 미주에 `[정답] … [해설] …` 이 들어 있는데, 가져오기 파서가
 *   [해설] 이후를 버려(answerFromChannel) 해설 17,976문항이 DB 에 안 들어갔다. 파서가 이제 해설을
 *   보존하므로(HmlProblem.solution), 같은 원본을 다시 읽어 번호로 짝짓고 본문 대조 후 채운다.
 *
 * 짝짓기: manifest(수학비서-나만의DB-manifest.json) items[id].localPath 원본 ↔ problems.source_name `…__db-{id}.hml`
 *         번호(source_number) 같고 본문 유사도 ≥ 0.6 일 때만. 정답은 건드리지 않는다.
 *
 * 사용:
 *   npx tsx scripts/backfill-original-solutions.ts --manifest=<json>                    # 드라이런
 *   npx tsx scripts/backfill-original-solutions.ts --manifest=<json> --apply
 *   옵션: --type=public_mock_exams (paperType 필터) --limit=N --overwrite
 */
import fs from 'fs';
import path from 'path';
import { parseHml } from '../src/lib/workflow/hml-parser';
import { materializeSolution } from '../src/lib/workflow/solution-images';
import { loadSupabase, parseArgs, similarity, SIM_OK, fetchByDbId, solutionUploader } from './mathsecr-match';

const args = parseArgs();
const APPLY = args.apply === 'true';
const OVERWRITE = args.overwrite === 'true';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
if (!args.manifest) { console.error('--manifest=<json> 필요'); process.exit(1); }

interface ManifestItem { id: number; title: string; paperType: string; explanationCount: number; localPath?: string; hasHml?: boolean }

async function main() {
  const sb = loadSupabase();
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf-8')) as { items: Record<string, ManifestItem> };
  let list = Object.values(manifest.items).filter((i) => i.explanationCount > 0 && i.localPath && (!args.type || i.paperType === args.type));
  list = list.slice(0, LIMIT);

  const report = {
    apply: APPLY, files: 0, noFile: 0, notInDb: 0, parsed: 0, matched: 0, filled: 0, alreadyHad: 0,
    noSolution: 0, lowSim: 0, uploadFail: 0, problemsWithoutSource: 0,
    lowSimSamples: [] as Array<{ db: number; no: number; sim: number }>,
    errors: [] as string[],
  };

  for (const item of list) {
    const local = item.localPath!;
    const cands = await fetchByDbId(sb, item.id);
    if (!cands.length) { report.notInDb++; continue; }
    if (!OVERWRITE && cands.every((p) => (p.solution_latex || '').trim())) { report.alreadyHad += cands.length; continue; }
    if (!fs.existsSync(local)) { report.noFile++; continue; }
    report.files++;
    let parsed;
    try { parsed = parseHml(fs.readFileSync(local)); } catch (e) { report.errors.push(`${item.id}: ${String(e).slice(0, 120)}`); continue; }
    report.parsed += parsed.problems.length;
    const byNo = new Map(parsed.problems.map((p) => [p.number, p]));

    for (const p of cands) {
      const src = p.source_number != null ? byNo.get(p.source_number) : undefined;
      if (!src) { report.problemsWithoutSource++; continue; }
      const sim = similarity(p.content_latex || '', src.content);
      if (sim < SIM_OK) {
        report.lowSim++;
        if (report.lowSimSamples.length < 50) report.lowSimSamples.push({ db: item.id, no: p.source_number!, sim: Number(sim.toFixed(2)) });
        continue;
      }
      report.matched++;
      if (!src.solution) { report.noSolution++; continue; }
      if ((p.solution_latex || '').trim() && !OVERWRITE) { report.alreadyHad++; continue; }
      if (!APPLY) { report.filled++; continue; }
      const sol = await materializeSolution(src.solution, src.solutionImagesBase64 || [], solutionUploader(sb, p.id, () => { report.uploadFail++; }));
      const { error } = await sb.from('problems').update({ solution_latex: sol }).eq('id', p.id);
      if (error) throw new Error(`update ${p.id}: ${error.message}`);
      report.filled++;
    }
    if (report.files % 20 === 0) console.log(`${report.files} files, filled ${report.filled}`);
  }

  const out = path.join(path.dirname(args.manifest), `원본해설-backfill${APPLY ? '' : '-dry'}.json`);
  const outPath = args.out || out;
  fs.writeFileSync(outPath, JSON.stringify(report, null, 1), 'utf-8');
  const { lowSimSamples, errors, ...summary } = report;
  console.log(JSON.stringify({ ...summary, lowSimSamples: lowSimSamples.length, errors: errors.length, report: outPath }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });
