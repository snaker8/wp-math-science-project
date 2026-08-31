/**
 * 수학비서 학교 기출 HML → 클라우드 일괄 적재
 * ============================================================================
 *
 * ★ 기본은 드라이런이다. 실제로 쓰려면 `--commit` 을 명시해야 한다.
 *   수천 문항을 잘못 넣으면 되돌리는 비용이 넣는 비용보다 훨씬 크다.
 *
 * ★ 앱과 **같은 함수**(createExamFromHml)를 쓴다. 별도 적재 경로를 만들지 않는다.
 *   /api/workflow/import-hml 라우트가 부르는 바로 그 함수라, 화면에서 한 장씩
 *   올린 것과 데이터 모양이 100% 같다. (검증 루프·경고 집계도 그대로 동작)
 *
 * 대상: 학교 기출만 (`내신 YYYY년 …`). 수업·과제 자료 제외 — 대표 지시(2026-08-31).
 * 소속: 공통풀(institute_id = NULL) — 학교 기출은 특정 학원 자산이 아니다.
 * 폴더: 학교기출 / {학교} / {과목}  (없으면 만든다)
 * 제목: {YY}-{학년}-{학기}-{M|F} {학교} {과목}   예) 25-1-2-F 동인고 공통수학2
 *
 * 중복 차단 2단:
 *   1) source_name (원본 파일명) — 같은 파일 재실행 시 건너뜀
 *   2) 제목 + book_group — 파일명이 달라도 같은 시험지면 건너뜀
 *   ★ 수학비서ID 접두어는 113건이 비어 있어 단독 키로 못 쓴다(드라이런 실측).
 *
 * 실행:
 *   npx tsx scripts/import-mathsecr.ts                    드라이런(전체)
 *   npx tsx scripts/import-mathsecr.ts --school=반여고      한 학교만
 *   npx tsx scripts/import-mathsecr.ts --school=반여고 --commit
 */
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parseHml } from '@/lib/workflow/hml-parser';
import { createExamFromHml } from '@/lib/workflow/hml-save';

// ── 설정 ─────────────────────────────────────────────────────────────────
const ROOT = process.env.MATHSECR_ROOT || 'G:/내 드라이브/수학 자료';
const CREATED_BY = process.env.IMPORT_USER_ID || 'a629ecb4-965a-43eb-b42e-c0e17c8ff5b9'; // snaker@hanmail.net
const ROOT_FOLDER = '학교기출';
const COMMIT = process.argv.includes('--commit');
const ONLY_SCHOOL = process.argv.find((a) => a.startsWith('--school='))?.split('=')[1];
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);

// ── 파일명 파싱 ───────────────────────────────────────────────────────────
export interface ExamMeta {
  msId: string; year: number; region: string; district: string;
  school: string; grade: string; track: string;
  semester: number; period: '중간' | '기말'; subject: string;
}

/**
 * 파일명 → 메타. 규격 밖이면 null (건너뛴다 — 억지로 넣지 않는다).
 * 실측상 네 갈래 변형이 있어 모두 선택항목으로 푼다:
 *   ID 접두어 없음 / 구·군 없음(특목고) / "1학기 중간" 공백 / 과목명 없음
 */
export function parseExamFileName(fileName: string): ExamMeta | null {
  const name = fileName.replace(/\.hml$/i, '');
  const m = name.match(
    /^(?:(\d+)_)?내신\s*(\d{4})\s*년\s+(.+?)\s+(중\d|고\d)(\S*)\s+(\d)\s*학기\s*(중간|기말)\s*(.*)$/,
  );
  if (!m) return null;
  const loc = m[3].trim().split(/\s+/);
  return {
    msId: m[1] || '',
    year: Number(m[2]),
    region: loc.length >= 2 ? loc[0] : '',
    district: loc.length >= 3 ? loc.slice(1, -1).join(' ') : '',
    school: loc[loc.length - 1],
    grade: m[4],
    track: m[5] || '',
    semester: Number(m[6]),
    period: m[7] as '중간' | '기말',
    subject: m[8].trim(),
  };
}

/**
 * 제목 — 운영 DB 실측 형식.  `25-1-2-F 동인고 공통수학2` = 2025년 고1 2학기 기말
 * ★ 학년이 먼저, 학기가 나중. 뒤집으면 1-1 인 표본에서는 안 드러난다.
 */
export function buildExamTitle(m: ExamMeta): string {
  const yy = String(m.year).slice(2);
  const grade = m.grade.replace(/[^0-9]/g, '');
  const p = m.period === '중간' ? 'M' : 'F';
  return `${yy}-${grade}-${m.semester}-${p} ${m.school}${m.subject ? ` ${m.subject}` : ''}`;
}

/**
 * 학년·학기 → mathsecr 과목코드. 파일명에 학년·학기가 다 있으므로 정확히 특정된다.
 * (resolveCurriculumCodes 는 과목명만 보므로 `중등수학2상`·`수학상` 을 못 잡는다)
 */
export function resolveCodes(m: ExamMeta): string[] {
  const 중 = m.grade.match(/^중(\d)$/);
  if (중) {
    const table: Record<string, string[]> = { '1': ['01', '02'], '2': ['03', '04'], '3': ['05', '06'] };
    const pair = table[중[1]];
    return pair ? [pair[m.semester === 2 ? 1 : 0]] : [];
  }
  const s = m.subject.replace(/\s/g, '');
  const direct: Record<string, string> = {
    '공통수학1': '07', '공수1': '07', '공통수학2': '08', '공수2': '08',
    '대수': '09', '수학1': '09', '수1': '09',
    '수학2': '10', '수2': '10', '미적분1': '10',
    '확률과통계': '11', '확통': '11', '미적분': '12', '미적분2': '12', '기하': '13',
  };
  if (direct[s]) return [direct[s]];
  // 수학(상)/(하) 는 학기로 가른다 — 고1 과정
  if (/^수학[(（]?[상하]/.test(s) || m.grade === '고1') return [m.semester === 2 ? '08' : '07'];
  return [];
}

// ── 폴더 ─────────────────────────────────────────────────────────────────
const folderCache = new Map<string, string>();

/** `학교기출 / {학교} / {과목}` 경로를 보장하고 말단 폴더 id 를 돌려준다. */
async function ensureFolder(sb: SupabaseClient, segments: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const key = segments.slice(0, i + 1).join('/');
    const cached = folderCache.get(key);
    if (cached) { parentId = cached; continue; }

    const q = sb.from('book_groups').select('id').eq('name', segments[i]).is('deleted_at', null)
      .is('institute_id', null);
    const { data: found } = parentId ? await q.eq('parent_id', parentId) : await q.is('parent_id', null);

    if (found && found.length) {
      parentId = found[0].id as string;
      folderCache.set(key, parentId);
      continue;
    }
    if (!COMMIT) { folderCache.set(key, `(신규:${key})`); parentId = `(신규:${key})`; continue; }

    const { data: created, error } = await sb.from('book_groups')
      .insert({ name: segments[i], parent_id: parentId, institute_id: null, created_by: CREATED_BY })
      .select('id').single();
    if (error || !created) { console.error(`  폴더 생성 실패 "${key}": ${error?.message}`); return null; }
    parentId = created.id as string;
    folderCache.set(key, parentId);
  }
  return parentId;
}

// ── 실행 ─────────────────────────────────────────────────────────────────
function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 7) return out;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.name.toLowerCase().endsWith('.hml')) out.push(p);
  }
  return out;
}

async function main() {
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf-8').split('\n')
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')]; }),
  ) as Record<string, string>;
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const all = walk(ROOT).filter((f) => /내신\s*\d{4}\s*년/.test(path.basename(f)));
  let items = all.map((f) => ({ file: f, meta: parseExamFileName(path.basename(f)) }))
    .filter((x): x is { file: string; meta: ExamMeta } => !!x.meta);
  if (ONLY_SCHOOL) items = items.filter((x) => x.meta.school === ONLY_SCHOOL);
  if (LIMIT) items = items.slice(0, LIMIT);

  console.log(`${COMMIT ? '★ 실제 적재' : '드라이런 (쓰지 않음)'}`);
  console.log(`대상 ${items.length}건${ONLY_SCHOOL ? ` — ${ONLY_SCHOOL}` : ''}\n`);

  let done = 0, skipped = 0, failed = 0, problemsTotal = 0;
  for (const { file, meta } of items) {
    const title = buildExamTitle(meta);
    const sourceName = path.basename(file);

    // ── 중복 차단 ────────────────────────────────────────────────────────
    // ★ 제목 비교만으로는 못 잡는다 (2026-09-01 반여고 실사고).
    //   예전에는 과목명 없이 `25-1-1-F 반여고` 로 넣었고, 지금은 고등을 구분하려
    //   `25-1-1-F 반여고 공통수학1` 로 넣는다. 같은 시험지인데 제목이 달라
    //   중복 차단을 그대로 통과해 두 벌이 생겼다.
    //   → **접두 키**(연도-학년-학기-시기 + 학교)로 본다. 과목 유무와 무관하게 걸린다.
    const prefixKey = `${title.split(' ')[0]} ${meta.school}`;   // 예: "25-1-1-F 반여고"
    const { data: dup } = await sb.from('exams').select('id, title')
      .like('title', `${prefixKey}%`).is('deleted_at', null).limit(1);
    if (dup?.length) {
      console.log(`  건너뜀(중복)     ${title}   ← 기존 "${dup[0].title}"`);
      skipped++; continue;
    }

    let parsed;
    try { parsed = parseHml(fs.readFileSync(file)); }
    catch (e) { console.error(`  파싱실패        ${title} — ${e instanceof Error ? e.message : e}`); failed++; continue; }
    if (!parsed.problems.length) { console.log(`  건너뜀(0문항)    ${title}`); skipped++; continue; }

    const folderPath = [ROOT_FOLDER, meta.school, meta.subject || '기타'];
    const bookGroupId = await ensureFolder(sb, folderPath);

    if (!COMMIT) {
      console.log(`  [dry] ${title.padEnd(30)} ${String(parsed.problems.length).padStart(3)}문항  ${folderPath.join('/')}`);
      problemsTotal += parsed.problems.length; done++;
      continue;
    }

    const res = await createExamFromHml(sb, parsed, {
      createdBy: CREATED_BY,
      instituteId: null,                    // 공통풀
      bookGroupId: bookGroupId?.startsWith('(신규') ? null : bookGroupId,
      sourceCategory: 'school',
      title,
      sourceName,
      curriculumCodes: resolveCodes(meta),
    });
    if (!res.ok) { console.error(`  적재실패        ${title} — ${res.error}`); failed++; continue; }
    problemsTotal += res.savedProblems ?? 0;
    done++;
    console.log(`  적재  ${title.padEnd(30)} ${String(res.savedProblems).padStart(3)}문항  검수 ${res.flaggedProblems ?? 0}`);
  }

  console.log(`\n── 결과 ──`);
  console.log(`  처리   ${done}`);
  console.log(`  건너뜀 ${skipped}`);
  console.log(`  실패   ${failed}`);
  console.log(`  문항   ${problemsTotal.toLocaleString()}`);
  if (!COMMIT) console.log(`\n실제로 넣으려면 --commit 을 붙이세요.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
