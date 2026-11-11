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
// --allow-partial: 수학비서 목록이 한 난이도에 200문항까지만 내줘 끝까지 못 받는 교재(2026-11-11 실측 18권)를 받은 만큼 넣는다.
//   빠진 문항 수는 리포트(부족)와 시험지 설명에 남긴다.
const ALLOW_PARTIAL = args['allow-partial'] === 'true';
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
  if (args.append === 'true') return appendMain(mydbs);
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
    // 수학비서가 목록에 안 내주는 문항(난이도 없음 등)이 교재당 몇 개 있다 — 2% 이내 부족은 넣고 리포트에 남긴다
    const shortBy = info.questionCount - cellCount;
    if ((!ALLOW_PARTIAL && shortBy > Math.max(2, Math.ceil(info.questionCount * 0.02))) || metas.some((m, i) => m.k !== i)) {
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
    // 조각은 받은 순서(보충분이 뒤)라 원래 번호 순으로 다시 세운다
    problems.sort((x, y) => x.number - y.number);
    if (shortBy > 0) report.push(`부족  ${info.title} — ${cellCount}/${info.questionCount} (수학비서 목록에 없는 ${shortBy}문항 제외하고 넣음)`);

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
    await sb.from('exams').update({
      exam_type: '시중교재',
      ...(shortBy > 0
        ? { description: `수학비서 출제본 적재 — 원본 ${info.questionCount}문항 중 ${cellCount}문항 (수학비서 목록 200문항 제한으로 ${shortBy}문항 미수집)` }
        : {}),
    }).eq('id', res.examId);
    stat.books++; stat.problems += res.savedProblems ?? 0; stat.withSolution += sol;
    console.log(`  ✓ ${title} ${res.savedProblems}문항 (해설 ${sol})`);
  }
  console.log(JSON.stringify(stat, null, 2));
  if (report.length) console.log(report.join('\n'));
}

/**
 * --append: 보충분(tbx_{id}_{k}) 을 이미 들여온 교재 시험지 뒤에 이어 붙인다 (2026-11-11).
 *   나만의DB 목록은 한 난이도 200문항까지라 못 받은 문항을 question-cells(cursor 페이지)로 찾아 따로 출제해 받았다.
 *   - 번호: 출처 줄이 이 교재면 그 번호, 아니면(다른 출처가 찍힌 공유 문항) 기존 최대 번호 뒤로
 *   - 이미 같은 번호가 시험지에 있으면 건너뜀(재실행 안전)
 *   - 적재는 createExamFromHml 로 임시 시험지에 넣고 exam_problems 를 원래 시험지로 옮긴다(그림 업로드·검증 로직 재사용)
 *   - 분류용 행(db, 번호, cellId, 난이도, 유형) 을 <dir>/tbx_cells.tsv 에 쓴다 → apply-mathsecr-classifications --cells
 */
async function appendMain(mydbs: Map<number, { title: string; paperType: string; questionCount: number }>) {
  const byId = new Map<number, Meta[]>();
  for (const f of fs.readdirSync(args.dir)) {
    const m = f.match(/^tbx_(\d+)_(\d+)\.json$/);
    if (!m) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(args.dir, f), 'utf-8')) as Meta;
    if (meta.hml !== 'done' || meta.saved !== 200) continue;
    byId.set(meta.id, [...(byId.get(meta.id) || []), meta]);
  }
  // 이미 붙인 조각은 다시 안 붙인다 (번호를 새로 매긴 문항은 번호 중복 검사로 못 거른다)
  const doneFile = path.join(args.dir, 'tbx_done.txt');
  const doneSet = new Set(fs.existsSync(doneFile) ? fs.readFileSync(doneFile, 'utf-8').split(/\r?\n/).filter(Boolean) : []);
  for (const [id, ms] of byId) byId.set(id, ms.filter((m) => !doneSet.has(`tbx_${id}_${String(m.k).padStart(2, '0')}`)));
  const tsv: string[] = [];
  const stat = { books: 0, appended: 0, skippedSameNo: 0, noExam: 0, mismatch: 0, failed: 0, renumbered: 0 };
  for (const [id, metas] of [...byId.entries()].sort((a, b) => a[0] - b[0])) {
    if (ONLY.size && !ONLY.has(id)) continue;
    const info = mydbs.get(id);
    if (!info) continue;
    const title = info.title.trim();
    const { data: ex } = await sb.from('exams').select('id, description').eq('title', title).is('deleted_at', null).limit(1);
    const examId = ex?.[0]?.id as string | undefined;
    if (!examId) { stat.noExam++; console.log(`  시험지 없음 ${title}`); continue; }
    const { data: links } = await sb.from('exam_problems').select('sequence_number, problem_id').eq('exam_id', examId).limit(5000);
    const ids = (links || []).map((l) => l.problem_id as string);
    const have = new Set<number>();
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await sb.from('problems').select('source_number').in('id', ids.slice(i, i + 300));
      (data || []).forEach((r) => r.source_number != null && have.add(r.source_number as number));
    }
    let maxSeq = Math.max(0, ...(links || []).map((l) => l.sequence_number as number));
    let maxNo = Math.max(0, ...have);
    const metaFile = path.join(args.dir, `tbx_meta_${id}.json`);
    const cellInfo = new Map<number, [number, string, string]>();
    if (fs.existsSync(metaFile)) for (const c of (JSON.parse(fs.readFileSync(metaFile, 'utf-8')).cells as Array<[number, string, string]>)) cellInfo.set(c[0], c);

    const problems: HmlProblem[] = [];
    let bad = '';
    for (const m of metas.sort((a, b) => a.k - b.k)) {
      const parsed = parseHml(fs.readFileSync(path.join(args.dir, `tbx_${id}_${String(m.k).padStart(2, '0')}.hml`)));
      if (parsed.problems.length !== m.cells.length) { bad = `조각 ${m.k}: 파싱 ${parsed.problems.length} / 담은 ${m.cells.length}`; break; }
      parsed.problems.forEach((p, i) => {
        const src = sourceLineOf(p.content);
        let no = src && src.title.replace(/\s/g, '') === title.replace(/\s/g, '') ? src.number : 0;
        if (!no || have.has(no)) {
          if (no && have.has(no)) { stat.skippedSameNo++; return; }
          no = ++maxNo; stat.renumbered++;
        }
        have.add(no); maxNo = Math.max(maxNo, no);
        const ci = cellInfo.get(m.cells[i][0]);
        if (ci) tsv.push([id, no, ci[0], ci[1], ci[2]].join('\t'));
        problems.push({ ...p, number: no, content: stripWorksheetHeader(p.content, [title]) });
      });
    }
    if (bad) { stat.mismatch++; console.log(`  불일치 ${title} — ${bad}`); continue; }
    if (!metas.length || !problems.length) continue;
    problems.sort((a, b) => a.number - b.number);
    if (!COMMIT) { console.log(`  [dry] ${title} +${problems.length}`); stat.books++; stat.appended += problems.length; continue; }

    const tmpTitle = `${title} (보충 ${Date.now().toString(36)})`;
    const res = await createExamFromHml(sb, { title: tmpTitle, problems, rawLineCount: 0 }, {
      createdBy: CREATED_BY, instituteId: null, bookGroupId: null, sourceCategory: 'textbook',
      title: tmpTitle, sourceName: `${title}__db-${id}.hml`, curriculumCodes: [],
    });
    if (!res.ok || !res.examId) { stat.failed++; console.log(`  실패 ${title} — ${res.ok ? 'examId 없음' : res.error}`); continue; }
    const { data: moved } = await sb.from('exam_problems').select('id, sequence_number').eq('exam_id', res.examId);
    if ((moved || []).length < problems.length) {
      // 반쪽이면 임시 시험지째 되돌린다
      const { data: l2 } = await sb.from('exam_problems').select('problem_id').eq('exam_id', res.examId);
      const pids = (l2 || []).map((l) => l.problem_id as string);
      if (pids.length) await sb.from('problems').update({ deleted_at: new Date().toISOString() }).in('id', pids);
      await sb.from('exams').update({ deleted_at: new Date().toISOString() }).eq('id', res.examId);
      stat.failed++; console.log(`  실패 ${title} — ${(moved || []).length}/${problems.length} 저장, 되돌림`); continue;
    }
    for (const r of moved || []) {
      await sb.from('exam_problems').update({ exam_id: examId, sequence_number: maxSeq + (r.sequence_number as number) }).eq('id', r.id);
    }
    maxSeq += (moved || []).length;
    await sb.from('exams').delete().eq('id', res.examId);
    const total = maxSeq;
    await sb.from('exams').update({
      description: total >= info.questionCount - 2
        ? `수학비서 출제본 적재 — ${total}문항`
        : `수학비서 출제본 적재 — 원본 ${info.questionCount}문항 중 ${total}문항`,
    }).eq('id', examId);
    stat.books++; stat.appended += problems.length;
    console.log(`  ✓ ${title} +${problems.length} → ${total}/${info.questionCount}`);
    fs.appendFileSync(doneFile, metas.map((m) => `tbx_${id}_${String(m.k).padStart(2, '0')}`).join('\n') + '\n');
  }
  if (tsv.length) fs.appendFileSync(path.join(args.dir, 'tbx_cells.tsv'), tsv.join('\n') + '\n');
  console.log(JSON.stringify(stat, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
