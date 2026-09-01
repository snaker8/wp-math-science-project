/**
 * 수학비서 HML → 클라우드 일괄 적재
 * ============================================================================
 *
 * ★ 기본은 드라이런이다. 실제로 쓰려면 `--commit` 을 명시해야 한다.
 *   수천 문항을 잘못 넣으면 되돌리는 비용이 넣는 비용보다 훨씬 크다.
 *
 * ★ 앱과 **같은 함수**(createExamFromHml)를 쓴다. 별도 적재 경로를 만들지 않는다.
 *   /api/workflow/import-hml 라우트가 부르는 바로 그 함수라, 화면에서 한 장씩
 *   올린 것과 데이터 모양이 100% 같다 (검증 루프·검수 경고 포함).
 *
 * ── 대상 ────────────────────────────────────────────────────────────────
 * 수학비서 자료는 **전부 기출 기반**이다 (대표 확인, 2026-09-01). 파일명이
 * 무엇이든 안에 든 문제는 학교 기출이므로 전량이 대상이다.
 * 다만 **파일의 성격**은 둘로 갈리고, 그에 따라 제목·폴더만 달라진다:
 *
 *   [학교 기출 원본]  한 학교 한 시험 → 제목 규칙 적용, 학교별 폴더
 *     A `…_내신 2025년 부산 해운대구 반여고 고1공통 1학기기말 공통수학1`
 *     B `…_2024년 경일고 1학년 1학기 중간고사`
 *     C `…_[2023기출][1-2-F][혜광고]`
 *
 *   [편집 문제지]    여러 학교 기출을 조합한 수업·과제용 → G드라이브 폴더 그대로
 *     예) `…_[전사고][대수][14.등차수열의합][과제]`
 *   ★ 학교가 하나가 아니므로 학교별 폴더에 못 넣는다. 대표가 쓰던 분류를 유지한다.
 *
 * 어느 쪽이든 **문제는 똑같이 문제은행에 쌓인다.** 폴더는 "시험지 원본을 어디서
 * 다시 꺼내 보는가"의 문제일 뿐이다.
 *
 * ── 중복 차단 ───────────────────────────────────────────────────────────
 * 학교 기출: 접두 키(`25-1-1-F 반여고`). 제목 전체 비교는 과목명 유무 때문에
 *   같은 시험지를 못 걸러 두 벌이 생긴 사고가 있었다 (2026-09-01 반여고).
 * 편집 문제지: 제목 + 폴더 조합.
 *
 * ── 품질 게이트 ─────────────────────────────────────────────────────────
 * 원본(수학비서 파일) 자체가 불완전한 경우가 드물게 있다 — 보기가 2~3개뿐인 문항 등.
 * 우리가 고칠 수 없으므로 **버리지 않고 넣되 리포트에 남긴다.** 조용히 넣는 게 제일 나쁘다.
 *
 * 실행:
 *   npx tsx scripts/import-mathsecr.ts                     드라이런(전체)
 *   npx tsx scripts/import-mathsecr.ts --kind=school        학교 기출만
 *   npx tsx scripts/import-mathsecr.ts --folder=동래자사관    특정 폴더만
 *   npx tsx scripts/import-mathsecr.ts --school=반여고 --commit
 */
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { parseHml, type HmlProblem } from '@/lib/workflow/hml-parser';
import { createExamFromHml } from '@/lib/workflow/hml-save';

const ROOT = process.env.MATHSECR_ROOT || 'G:/내 드라이브/수학 자료';
const CREATED_BY = process.env.IMPORT_USER_ID || 'a629ecb4-965a-43eb-b42e-c0e17c8ff5b9'; // snaker@hanmail.net
const COMMIT = process.argv.includes('--commit');
const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ONLY_SCHOOL = ARG('school');
const ONLY_FOLDER = ARG('folder');
const ONLY_KIND = ARG('kind') as 'school' | 'made' | undefined;
const LIMIT = Number(ARG('limit') || 0);

// ── 분류 ─────────────────────────────────────────────────────────────────
export interface SchoolExam {
  kind: 'school';
  year: number; school: string; grade: number; semester: number;
  period: '중간' | '기말'; subject: string;
  /** '' | '유사' | '유사1' | '유사2' — 유사문항은 원본과 다른 문제라 번호까지 보존한다 */
  similar: string;
}
export interface MadeSheet { kind: 'made'; name: string }
export type Classified = SchoolExam | MadeSheet;

const P_A = /^(?:\d+_)?내신\s*(\d{4})\s*년\s+(.+?)\s+(중|고)(\d)(\S*)\s+(\d)\s*학기\s*(중간|기말)\s*(.*)$/;
const P_B = /^(?:\d+_)?(\d{4})년\s+(\S+?)\s+(\d)학년\s+(\d)학기\s*(중간|기말)고사\s*(.*)$/;
const P_C = /^(?:\d+_)?\[(\d{4})기출\]\[(\d)-(\d)-([MF])\]\[([^\]]+)\]\s*(.*)$/;
/**
 * D 규격 — 2026-09-01 대량 유입분(786개).
 *   `[24년][1-1][중간][학산여고][수학상]__db-165266`
 *    ↑연도  ↑학년-학기 ↑시기   ↑학교     ↑과목      ↑수학비서ID
 *   변형: 과목 칸이 없는 것(`[22년][2-1][기말][지산고]`), `수학 상` 처럼 공백 있는 것,
 *         접두 ID(`1610056_`)와 접미 ID(`__db-…`) 둘 다 나타남.
 */
const P_D = /^(?:\d+_)?\[(\d{2})년\]\[(\d)-(\d)\]\[(중간|기말)\]\[([^\]]+)\](?:\[([^\]]*)\])?(?:__db-(\d+))?/;

/** 2022 개정 여부로 고1 과목명을 가른다. 2024년 이후 입학생이 공통수학1·2. */
function hs1Subject(year: number, semester: number): string {
  if (year >= 2024) return semester === 2 ? '공통수학2' : '공통수학1';
  return semester === 2 ? '수학(하)' : '수학(상)';
}

/**
 * 수학비서 내려받기 접미사 `__db-234951` 제거.
 *
 * ★ 2026-09-02 사고 — 제목이 `18-1-1-F 중동고 수학상__db-234951` 로 저장됐다(381건).
 *   D 규격만 고쳤다가 **A 규격에서 또 나왔다** — A 는 과목을 줄 끝까지 잡으므로
 *   `수학2__db-234928` 이 통째로 과목명이 된다.
 *   → 규격별로 막지 말고 **파일명 단계에서 한 번에** 걷어낸다. 새 규격이 생겨도 안전하다.
 *   수학비서ID 는 제목에 넣지 않는다(중복 차단은 제목 접두 키로 한다).
 */
function stripDbSuffix(s: string): string {
  // `__db-234951` · `__duplicate-of-db-559920` 등 `__` 로 시작하는 내려받기 꼬리표를 모두 제거.
  // (규격을 좁게 잡았다가 `__duplicate-of-db-` 를 놓친 이력이 있다 — 넓게 잡는다)
  return s.replace(/__[a-z][a-z0-9-]*\d.*$/i, '').trim();
}

export function classify(fileName: string): Classified {
  const n = stripDbSuffix(fileName.replace(/\.hml$/i, '').trim());
  // ★ 유사문항은 원본과 **다른 문제**다. `유사1`·`유사2` 는 서로도 다르다.
  //   번호까지 보존해야 제목이 겹치지 않는다 (2026-09-02 사고 — 403개가 사라질 뻔했다).
  const similarMatch = n.match(/유사\s*(\d+)?/);
  const similar = similarMatch ? (similarMatch[1] ? `유사${similarMatch[1]}` : '유사') : '';

  const a = n.match(P_A);
  if (a) {
    const loc = a[2].trim().split(/\s+/);
    return {
      kind: 'school', year: Number(a[1]), school: loc[loc.length - 1],
      grade: Number(a[4]), semester: Number(a[6]),
      period: a[7] as '중간' | '기말', subject: a[8].trim(), similar,
    };
  }
  const b = n.match(P_B);
  if (b) {
    const year = Number(b[1]); const grade = Number(b[3]); const semester = Number(b[4]);
    return {
      kind: 'school', year, school: b[2], grade, semester,
      period: b[5] as '중간' | '기말',
      subject: grade === 1 ? hs1Subject(year, semester) : '', similar,
    };
  }
  const c = n.match(P_C);
  if (c) {
    const year = Number(c[1]); const grade = Number(c[2]); const semester = Number(c[3]);
    return {
      kind: 'school', year, school: c[5], grade, semester,
      period: c[4] === 'M' ? '중간' : '기말',
      subject: grade === 1 ? hs1Subject(year, semester) : '', similar,
    };
  }
  const d = n.match(P_D);
  if (d) {
    const year = 2000 + Number(d[1]);
    const grade = Number(d[2]);
    const semester = Number(d[3]);
    // ★ 2026-09-02 사고 — 과목 칸에 `__db-234951` 접미사가 딸려 들어가
    //   제목이 `18-1-1-F 중동고 수학상__db-234951` 로 저장됐다(381건).
    //   수학비서ID 는 중복 차단 키로만 쓰고 제목에는 절대 넣지 않는다.
    const rawSubject = (d[6] || '')
      .replace(/__db-\d+.*$/, '')   // 접미 ID 제거
      .replace(/\s+/g, '')
      .trim();
    return {
      kind: 'school', year, school: d[5].replace(/__db-\d+.*$/, '').trim(), grade, semester,
      period: d[4] as '중간' | '기말',
      subject: rawSubject || (grade === 1 ? hs1Subject(year, semester) : ''),
      similar,
    };
  }
  return { kind: 'made', name: n.replace(/^\d+_/, '').trim() || n };
}

/** 제목 — 운영 실측 형식. `25-1-2-F 동인고 공통수학2` = 2025년 고1 2학기 기말 */
export function buildTitle(c: Classified): string {
  if (c.kind === 'made') return c.name;
  const yy = String(c.year).slice(2);
  const p = c.period === '중간' ? 'M' : 'F';
  const sub = c.subject ? ` ${c.subject}` : '';
  return `${yy}-${c.grade}-${c.semester}-${p} ${c.school}${sub}${c.similar ? ` (${c.similar})` : ''}`;
}

/** 장식 문자·미러 접두 폴더를 걷어낸 G드라이브 폴더 경로 */
function mirrorFolders(file: string): string[] {
  const rel = path.relative(ROOT, path.dirname(file));
  return rel.split(path.sep)
    .map((s) => s.replace(/^[★◐△■♣＃＆#&\s]+/, '').trim())
    .filter((s) => s && !/미러$/.test(s))
    .slice(0, 3);
}

export function targetFolders(c: Classified, file: string): string[] {
  if (c.kind === 'school') {
    return [c.similar ? '학교기출유사' : '학교기출', c.school, c.subject || '기타'];
  }
  const f = mirrorFolders(file);
  return f.length ? f : ['수학비서 자료'];
}

/** 학년·학기 → mathsecr 과목코드. 파일명에 둘 다 있으므로 정확히 특정된다. */
export function resolveCodes(c: Classified, file: string): string[] {
  if (c.kind !== 'school') return [];
  if (/중\d/.test(file) || (c.grade <= 3 && /중등/.test(c.subject))) {
    const table: Record<number, string[]> = { 1: ['01', '02'], 2: ['03', '04'], 3: ['05', '06'] };
    const pair = table[c.grade];
    if (pair && /중등|중\d/.test(c.subject + file)) return [pair[c.semester === 2 ? 1 : 0]];
  }
  const s = c.subject.replace(/\s/g, '');
  const direct: Record<string, string> = {
    // 2022 개정
    '공통수학1': '07', '공수1': '07', '공통수학2': '08', '공수2': '08',
    '대수': '09', '미적분1': '10', '확률과통계': '11', '확통': '11', '기하': '13',
    // 2015 개정 (D 규격에 많다 — 수학상/수학하/수학1/수학2)
    '수학상': '07', '수학(상)': '07', '수학하': '08', '수학(하)': '08',
    '수학1': '09', '수1': '09', '수학I': '09',
    '수학2': '10', '수2': '10', '수학II': '10',
    '미적분': '12', '미적분2': '12',
    // 심화·기타 — 대수 계열로 본다 (트리에 별도 과목이 없다)
    '고급대수': '09',
  };
  return direct[s] ? [direct[s]] : [];
}

// ── 품질 게이트 ───────────────────────────────────────────────────────────
export interface Defect { number: number; reason: string }

/**
 * 문항 품질 점검. 원본이 불완전한 경우를 **버리지 않고 드러낸다.**
 * (수학비서 파일 자체가 드물게 불완전하다 — 대표 확인, 실측 3,762 객관식 중 2건)
 */
export function inspect(problems: HmlProblem[]): Defect[] {
  const out: Defect[] = [];
  for (const p of problems) {
    if (!p.content.trim()) { out.push({ number: p.number, reason: '본문 없음' }); continue; }
    const marks = (p.content.match(/[①②③④⑤]/g) || []).length;
    if (p.choices.length > 0 && p.choices.length < 5) {
      out.push({ number: p.number, reason: `보기 ${p.choices.length}개${marks ? ' (본문에 마커 잔류 — 쪼개짐 의심)' : ' (원본 결손 의심)'}` });
    }
    const idx = '①②③④⑤'.indexOf(p.answer);
    if (p.choices.length > 0 && idx >= 0 && idx >= p.choices.length) {
      out.push({ number: p.number, reason: `정답 ${p.answer} 인데 보기 ${p.choices.length}개 — 채점 불가` });
    }
  }
  return out;
}

// ── 폴더 ─────────────────────────────────────────────────────────────────
const folderCache = new Map<string, string>();
async function ensureFolder(sb: SupabaseClient, segments: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const key = segments.slice(0, i + 1).join('/');
    const hit = folderCache.get(key);
    if (hit) { parentId = hit; continue; }
    const base = sb.from('book_groups').select('id').eq('name', segments[i])
      .is('deleted_at', null).is('institute_id', null);
    const { data: found } = parentId ? await base.eq('parent_id', parentId) : await base.is('parent_id', null);
    if (found?.length) { parentId = found[0].id as string; folderCache.set(key, parentId); continue; }
    if (!COMMIT) { parentId = `(신규)${key}`; folderCache.set(key, parentId); continue; }
    const { data: made, error } = await sb.from('book_groups')
      .insert({ name: segments[i], parent_id: parentId, institute_id: null, created_by: CREATED_BY })
      .select('id').single();
    if (error || !made) { console.error(`  폴더 생성 실패 "${key}": ${error?.message}`); return null; }
    parentId = made.id as string; folderCache.set(key, parentId);
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

  let items = walk(ROOT).map((file) => ({ file, cls: classify(path.basename(file)) }));
  if (ONLY_KIND) items = items.filter((x) => x.cls.kind === ONLY_KIND);
  if (ONLY_SCHOOL) items = items.filter((x) => x.cls.kind === 'school' && x.cls.school === ONLY_SCHOOL);
  if (ONLY_FOLDER) items = items.filter((x) => x.file.includes(ONLY_FOLDER));
  if (LIMIT) items = items.slice(0, LIMIT);

  console.log(COMMIT ? '★ 실제 적재' : '드라이런 (쓰지 않음)');
  console.log(`대상 ${items.length}건  (학교기출 ${items.filter((x) => x.cls.kind === 'school').length} / 편집본 ${items.filter((x) => x.cls.kind === 'made').length})\n`);

  let done = 0, skipped = 0, failed = 0, problems = 0, defectExams = 0, defectCount = 0;
  /** 이 실행에서 이미 처리한 중복 키 — 같은 실행 안의 중복을 막는다 (DB 조회만으론 못 막음) */
  const seenKeys = new Set<string>();
  const report: string[] = [];

  for (const { file, cls } of items) {
    const title = buildTitle(cls);
    const folders = targetFolders(cls, file);

    // ── 중복 차단 ────────────────────────────────────────────────────────
    // ★ 2026-09-02 사고 — 같은 시험지가 **같은 초에 두 번** 들어갔다(129건).
    //   같은 파일이 폴더 두 곳에 있는데, 두 번째를 검사할 때 첫 번째 INSERT 가
    //   아직 조회에 안 잡혀 DB 검사만으로는 못 막았다.
    //   → 이 실행에서 이미 처리한 키를 메모리에 기억해 같은 실행 안의 중복도 막는다.
    //   ★ 2026-09-02 두 번째 사고 — 키에 유사 여부가 빠져 **유사문항이 원본과 같은 키**가 됐다.
    //     `[2023기출][1-2-F][중앙여고]` / `…[유사1]` / `…[유사2]` 는 **서로 다른 문제**인데
    //     하나만 남고 나머지가 버려졌다(전체 403개 파일이 사라질 뻔했다).
    //     제목에는 ` (유사)` 가 붙는데 키에는 안 들어가 생긴 불일치다.
    //   ★ 그래서 키를 **제목 전체**로 잡는다. 제목이 곧 식별자다.
    //     (과목명 유무 차이는 이제 없다 — 파일명 파서가 과목을 일관되게 뽑는다)
    const dupKey = title;
    if (seenKeys.has(dupKey)) { skipped++; continue; }

    const { data: dup } = await sb.from('exams').select('id')
      .eq('title', title).is('deleted_at', null).limit(1);
    if (dup?.length) { seenKeys.add(dupKey); skipped++; continue; }
    seenKeys.add(dupKey);

    let parsed;
    try { parsed = parseHml(fs.readFileSync(file)); }
    catch (e) { failed++; report.push(`파싱실패  ${title} — ${e instanceof Error ? e.message : e}`); continue; }
    if (!parsed.problems.length) { skipped++; continue; }

    const defects = inspect(parsed.problems);
    if (defects.length) {
      defectExams++; defectCount += defects.length;
      report.push(`검수필요  ${title}\n${defects.map((d) => `            #${d.number} ${d.reason}`).join('\n')}`);
    }

    if (!COMMIT) {
      console.log(`  [dry] ${title.slice(0, 44).padEnd(46)} ${String(parsed.problems.length).padStart(3)}문항  ${folders.join('/')}${defects.length ? `  ⚠${defects.length}` : ''}`);
      problems += parsed.problems.length; done++; continue;
    }

    const bookGroupId = await ensureFolder(sb, folders);
    const res = await createExamFromHml(sb, parsed, {
      createdBy: CREATED_BY,
      instituteId: null,                                   // 공통풀
      bookGroupId: bookGroupId?.startsWith('(신규)') ? null : bookGroupId,
      sourceCategory: cls.kind === 'school' ? 'school' : 'auto',
      title,
      sourceName: path.basename(file),
      curriculumCodes: resolveCodes(cls, file),
    });
    if (!res.ok) { failed++; report.push(`적재실패  ${title} — ${res.error}`); continue; }
    problems += res.savedProblems ?? 0; done++;
    if (done % 25 === 0) console.log(`  … ${done}건 적재 (${problems.toLocaleString()}문항)`);
  }

  console.log(`\n── 결과 ──`);
  console.log(`  처리       ${done}`);
  console.log(`  건너뜀     ${skipped}   (중복·0문항)`);
  console.log(`  실패       ${failed}`);
  console.log(`  문항       ${problems.toLocaleString()}`);
  console.log(`  검수 필요   시험지 ${defectExams} / 문항 ${defectCount}`);

  if (report.length) {
    const out = path.join('scripts', `import-report-${COMMIT ? 'commit' : 'dry'}.txt`);
    fs.writeFileSync(out, report.join('\n'), 'utf-8');
    console.log(`\n  상세 리포트 → ${out}`);
  }
  if (!COMMIT) console.log(`\n실제로 넣으려면 --commit 을 붙이세요.`);
}

// ★ 직접 실행할 때만 돈다.
//   이 파일은 classify()/buildTitle() 같은 순수 함수를 다른 스크립트가 import 해서 쓴다.
//   가드가 없으면 **import 하는 순간 적재 전체가 실행된다** (2026-09-02 실측 — 검증
//   스크립트가 멈춘 것처럼 보였는데 실제로는 1,576건 드라이런이 돌고 있었다).
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('import-mathsecr.ts');
if (isDirectRun) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
