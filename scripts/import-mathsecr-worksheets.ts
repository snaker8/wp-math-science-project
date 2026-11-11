/**
 * 수학비서 출제본(내 문제지로 묶어 출제한 HML) → 문제은행 적재 — 시중교재·논술 등 원본 파일을 못 받는 자료용
 * ============================================================================
 * 시중교재는 나만의DB 에 hmlPath(원본)가 없다. 문항을 200개씩 「내 문제지」에 담아 출제하면 본문·보기·정답·해설·그림이
 * 다 들어 있는 HML 이 나온다 (2026-11-11 실측, 해설 56/56). 이 스크립트는 그 파일을 교재 한 권 = 시험지 한 장으로 넣는다.
 *
 * 입력 (브라우저 잡이 받은 것): <dir>/tb_{mydbId}_{k}.hml + tb_{mydbId}_{k}.json {id,k,cells:[[cellId,번호]],q,e}
 * - 적재는 앱과 같은 createExamFromHml (AI 호출 없음). 본문 앞 「유형 표·출처 줄」은 stripWorksheetHeader 로 걷는다.
 * - 번호는 수학비서 원래 번호(cells 의 questionNumber). 조각 순서 = 담은 순서 = 출제본 순서로 맞춰 본다(개수 다르면 건너뜀).
 * - source_name `제목__db-{id}.hml` → 이후 분류(apply-mathsecr-classifications)·해설 대조가 같은 길로 붙는다.
 * - exam_type = 시중교재. 폴더 = 수학비서 폴더 경로(manifest folderPath, 최대 3단).
 *
 *   npx tsx scripts/import-mathsecr-worksheets.ts --dir=<dir> --mydbs=<json> --manifest=<json>            # 드라이런
 *   npx tsx scripts/import-mathsecr-worksheets.ts --dir=… --mydbs=… --manifest=… --commit [--only=id,id]
 */
import fs from 'fs';
import path from 'path';
import { parseHml, type HmlProblem } from '@/lib/workflow/hml-parser';
import { createExamFromHml } from '@/lib/workflow/hml-save';
import { stripWorksheetHeader, sourceLineOf } from '@/lib/workflow/hml-worksheet';
import { loadSupabase, parseArgs } from './mathsecr-match';

const args = parseArgs();
const COMMIT = args.commit === 'true';
const CREATED_BY = process.env.IMPORT_USER_ID || 'a629ecb4-965a-43eb-b42e-c0e17c8ff5b9';
const ONLY = new Set((args.only || '').split(',').filter(Boolean).map(Number));
if (!args.dir || !args.mydbs || !args.manifest) {
  console.error('--dir --mydbs --manifest 필요');
  process.exit(1);
}
const sb = loadSupabase();

type Meta = { id: number; k: number; cells: Array<[number, number]>; q?: number; e?: number; hml?: string; saved?: number };

const folderCache = new Map<string, string>();
async function ensureFolder(segments: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const key = segments.slice(0, i + 1).join('/');
    const hit = folderCache.get(key);
    if (hit) { parentId = hit; continue; }
    const base = sb.from('book_groups').select('id').eq('name', segments[i]).is('deleted_at', null).is('institute_id', null);
    const { data: found, error } = parentId ? await base.eq('parent_id', parentId) : await base.is('parent_id', null);
    if (error) return null;
    if (found?.length) { parentId = found[0].id as string; folderCache.set(key, parentId); continue; }
    if (!COMMIT) { parentId = `(신규)${key}`; folderCache.set(key, parentId); continue; }
    const { data: made, error: e2 } = await sb.from('book_groups')
      .insert({ name: segments[i], parent_id: parentId, institute_id: null, created_by: CREATED_BY }).select('id').single();
    if (e2 || !made) return null;
    parentId = made.id as string; folderCache.set(key, parentId);
  }
  return parentId;
}

async function main() {
  const mydbs = new Map<number, { title: string; paperType: string; questionCount: number }>(
    (JSON.parse(fs.readFileSync(args.mydbs, 'utf-8')) as Array<{ id: number; title: string; paperType: string; questionCount: number }>).map((x) => [x.id, x]),
  );
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf-8')) as { items: Record<string, { folderPath?: string }> };
  const byId = new Map<number, Meta[]>();
  for (const f of fs.readdirSync(args.dir)) {
    const m = f.match(/^tb_(\d+)_(\d+)\.json$/);
    if (!m) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(args.dir, f), 'utf-8')) as Meta;
    if (meta.hml !== 'done' || meta.saved !== 200) continue;
    const a = byId.get(meta.id) || [];
    a.push(meta);
    byId.set(meta.id, a);
  }

  const stat = { books: 0, problems: 0, skippedDup: 0, skippedIncomplete: 0, mismatch: 0, failed: 0, withSolution: 0, numberDiff: 0 };
  const report: string[] = [];
  for (const [id, metas] of [...byId.entries()].sort((a, b) => a[0] - b[0])) {
    if (ONLY.size && !ONLY.has(id)) continue;
    const info = mydbs.get(id);
    if (!info) { report.push(`${id}: mydbs 에 없음`); continue; }
    metas.sort((a, b) => a.k - b.k);
    const cellCount = metas.reduce((s, m) => s + m.cells.length, 0);
    if (cellCount < info.questionCount || metas.some((m, i) => m.k !== i)) {
      stat.skippedIncomplete++;
      report.push(`미완  ${info.title} — 받은 ${cellCount}/${info.questionCount} (조각 ${metas.map((m) => m.k).join(',')})`);
      continue;
    }

    // 조각별 파싱 → 머리 걷기 → 원래 번호
    const problems: HmlProblem[] = [];
    let bad = '';
    for (const m of metas) {
      const parsed = parseHml(fs.readFileSync(path.join(args.dir, `tb_${id}_${String(m.k).padStart(2, '0')}.hml`)));
      // 같은 문항이 한 조각에 두 번 담기지 않는다(중복은 수학비서가 거른다) → 개수가 같아야 순서로 맞출 수 있다
      if (parsed.problems.length !== m.cells.length) { bad = `조각 ${m.k}: 파싱 ${parsed.problems.length} / 담은 ${m.cells.length}`; break; }
      parsed.problems.forEach((p, i) => {
        const src = sourceLineOf(p.content);
        const no = m.cells[i][1];
        if (src && src.number !== no) stat.numberDiff++;
        problems.push({ ...p, number: no, content: stripWorksheetHeader(p.content) });
      });
    }
    if (bad) { stat.mismatch++; report.push(`불일치 ${info.title} — ${bad}`); continue; }

    const title = info.title.trim();
    const { data: dup, error: dupErr } = await sb.from('exams').select('id').eq('title', title).is('deleted_at', null).limit(1);
    if (dupErr) { stat.failed++; report.push(`실패  ${title} — 중복 조회 ${dupErr.message}`); continue; }
    if (dup?.length) { stat.skippedDup++; continue; }

    const fp = (manifest.items[String(id)]?.folderPath || (info.paperType === 'commercial_textbooks' ? '시중교재' : '수학비서 자료'))
      .split('/').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    const sol = problems.filter((p) => (p.solution || '').trim()).length;
    if (!COMMIT) {
      console.log(`  [dry] ${title.slice(0, 40).padEnd(42)} ${String(problems.length).padStart(5)}문항 해설 ${sol}  ${fp.join('/')}`);
      stat.books++; stat.problems += problems.length; stat.withSolution += sol;
      continue;
    }
    let folderId: string | null = null;
    for (let t = 0; t < 3 && !folderId; t++) { if (t) await new Promise((r) => setTimeout(r, 2000 * t)); folderId = await ensureFolder(fp); }
    if (!folderId) { stat.failed++; report.push(`실패  ${title} — 폴더`); continue; }

    const res = await createExamFromHml(sb, { title, problems, rawLineCount: 0 }, {
      createdBy: CREATED_BY,
      instituteId: null,
      bookGroupId: folderId,
      sourceCategory: 'textbook',
      title,
      sourceName: `${title}__db-${id}.hml`,
      curriculumCodes: [],
    });
    if (!res.ok || !res.examId) { stat.failed++; report.push(`실패  ${title} — ${res.ok ? 'examId 없음' : res.error}`); continue; }
    if (res.alreadyExisted) { stat.skippedDup++; continue; }
    if ((res.savedProblems ?? 0) < problems.length) {
      // 반쪽 시험지는 남기지 않는다 — 되돌리고 재실행 대상으로
      const { data: links } = await sb.from('exam_problems').select('problem_id').eq('exam_id', res.examId);
      const ids = (links || []).map((l) => l.problem_id as string);
      if (ids.length) await sb.from('problems').update({ deleted_at: new Date().toISOString() }).in('id', ids);
      await sb.from('exams').update({ deleted_at: new Date().toISOString() }).eq('id', res.examId);
      stat.failed++; report.push(`실패  ${title} — 문항 ${res.savedProblems}/${problems.length} 만 저장돼 되돌림`);
      continue;
    }
    await sb.from('exams').update({ exam_type: '시중교재' }).eq('id', res.examId);
    stat.books++; stat.problems += res.savedProblems ?? 0; stat.withSolution += sol;
    console.log(`  ✓ ${title} ${res.savedProblems}문항 (해설 ${sol})`);
  }
  console.log(JSON.stringify(stat, null, 2));
  if (report.length) console.log(report.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
