/**
 * 수학비서 기출 HML 일괄 적재 — 드라이런(검증 전용)
 * ============================================================================
 *
 * ★ 이 스크립트는 **DB 에 아무것도 쓰지 않는다.** 읽기와 파싱만 한다.
 *   목적: 실제 적재 전에 "몇 건이 제대로 들어갈 수 있는지"를 먼저 재는 것.
 *
 * 대상: 학교 기출만 (`내신 YYYY년 …` 규격). 수업·과제 자료는 제외 — 대표 지시(2026-08-31).
 *
 * 파일명 규격 (수학비서 다운로드 기본형):
 *   {수학비서ID}_내신 {연도}년 {시도} {구} {학교} {학년}{계열} {학기}{중간|기말} {과목}.hml
 *   예) 1656745_내신 2025년 부산 해운대구 반여고 고1공통 1학기기말 공통수학1.hml
 *
 * ★ 수학비서ID 를 중복 차단 키로 쓴다. 같은 파일을 두 번 올려도 시험지가 안 겹친다.
 *   (제목 기반 중복 차단은 학교·학기가 같으면 오탐이 난다 — 자산화 가드 #1 참고)
 *
 * 실행:  npx tsx scripts/import-mathsecr-dryrun.ts
 *        npx tsx scripts/import-mathsecr-dryrun.ts --limit=20   (표본만)
 */
import fs from 'fs';
import path from 'path';
import { parseHml } from '@/lib/workflow/hml-parser';
import { repairLatexRender } from '@/lib/latex/renderRepair';

const ROOT = process.env.MATHSECR_ROOT || 'G:/내 드라이브/수학 자료';
const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 0);

interface ExamMeta {
  msId: string;        // 수학비서 고유 ID — 중복 차단 키
  year: number;
  region: string;      // 시도
  district: string;    // 구/군
  school: string;
  grade: string;       // 고1 / 중3 …
  track: string;       // 공통 / 이과 … (없을 수 있음)
  semester: number;    // 1 | 2
  period: '중간' | '기말';
  subject: string;
}

/**
 * 파일명 → 메타. 규격에서 벗어나면 null (건너뛴다 — 억지로 넣지 않는다).
 *
 * ★ 1차 드라이런에서 35% 만 통과했다. 실패 117건을 실제로 열어보니 규격이
 *   하나가 아니라 네 갈래였다. 억지로 하나로 맞추지 않고 선택항목으로 푼다:
 *     · `내신 2025년 …`                       — 수학비서ID 접두어 없음
 *     · `… 부산외고 고1공통 …`                  — 구/군 없음 (특목고는 구 표기 생략)
 *     · `… 1학기 중간 공통수학1`                — 학기와 중간/기말 사이 공백
 *     · `… 고1공통 1학기중간`                   — 과목명 자체가 없음
 *   지역/구/학교는 개수가 유동적이라 정규식으로 쪼개지 말고 **마지막 토큰을 학교**로 잡는다.
 */
export function parseExamFileName(fileName: string): ExamMeta | null {
  const name = fileName.replace(/\.hml$/i, '');
  const m = name.match(
    /^(?:(\d+)_)?내신\s*(\d{4})\s*년\s+(.+?)\s+(중\d|고\d)(\S*)\s+(\d)\s*학기\s*(중간|기말)\s*(.*)$/,
  );
  if (!m) return null;

  // 위치 토큰: [시도] [구/군] 학교  — 마지막이 항상 학교다
  const loc = m[3].trim().split(/\s+/);
  const school = loc[loc.length - 1];
  const region = loc.length >= 2 ? loc[0] : '';
  const district = loc.length >= 3 ? loc.slice(1, -1).join(' ') : '';

  return {
    msId: m[1] || '',              // 없으면 빈 문자열 — 중복 차단은 제목 폴백
    year: Number(m[2]),
    region,
    district,
    school,
    grade: m[4],
    track: m[5] || '',
    semester: Number(m[6]),
    period: m[7] as '중간' | '기말',
    subject: m[8].trim(),          // 없을 수 있음 — 호출측에서 보완 필요
  };
}

/**
 * 우리 네이밍 규칙으로 시험지 제목 생성.
 *
 *   {YY}-{학년}-{학기}-{M|F} {학교} {과목}        M=중간, F=기말
 *
 * 운영 DB 실측으로 확인한 형식이다:
 *   `25-1-2-F 동인고 공통수학2`  ← 2025년 · 고1 · 2학기 · 기말
 *   `26-2-1-F 서여고 대수`       ← 2026년 · 2학년 · 1학기 · 기말
 *   `25-1-2-M 여명중 수학`       ← 2025년 · 중1 · 2학기 · 중간
 *
 * ★ 학년이 먼저, 학기가 나중이다. 순서를 바꾸면 1학기/1학년처럼 값이 같을 때는
 *   멀쩡해 보이다가 `고1 2학기` 같은 경우에만 어긋난다 — 발견이 늦어지는 종류의 실수.
 *   (첫 구현에서 실제로 뒤집혀 있었고, 표본이 전부 1-1 이라 안 드러났다.)
 */
export function buildExamTitle(m: ExamMeta): string {
  const yy = String(m.year).slice(2);
  const grade = m.grade.replace(/[^0-9]/g, '');
  const p = m.period === '중간' ? 'M' : 'F';
  const subject = m.subject ? ` ${m.subject}` : '';
  return `${yy}-${grade}-${m.semester}-${p} ${m.school}${subject}`;
}

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

// ── 실행 ─────────────────────────────────────────────────────────────────
const all = walk(ROOT);
const candidates = all.filter((f) => /내신\s*\d{4}\s*년/.test(path.basename(f)));
const targets = LIMIT ? candidates.slice(0, LIMIT) : candidates;

console.log(`전체 .hml            ${all.length}`);
console.log(`기출 후보            ${candidates.length}`);
console.log(`이번 검사 대상        ${targets.length}\n`);

let metaOk = 0, noSubject = 0, noMsId = 0;
const metaFail: string[] = [];
let parsed = 0, parseFail = 0, zeroProblem = 0;
let problems = 0, withImg = 0, imgs = 0, withAnswer = 0, withChoices = 0;
let repairable = 0;
const dupIds = new Map<string, string[]>();
const schools = new Map<string, number>();
const bySubject = new Map<string, number>();

for (const f of targets) {
  const base = path.basename(f);
  const meta = parseExamFileName(base);
  if (!meta) { metaFail.push(base); continue; }
  metaOk++;
  if (!meta.subject) noSubject++;
  if (!meta.msId) noMsId++;
  if (!dupIds.has(meta.msId)) dupIds.set(meta.msId, []);
  dupIds.get(meta.msId)!.push(base);
  schools.set(meta.school, (schools.get(meta.school) || 0) + 1);
  bySubject.set(meta.subject, (bySubject.get(meta.subject) || 0) + 1);

  let r;
  try { r = parseHml(fs.readFileSync(f)); }
  catch { parseFail++; continue; }
  if (r.problems.length === 0) { zeroProblem++; continue; }
  parsed++;
  for (const p of r.problems) {
    problems++;
    if (p.imagesBase64.length) { withImg++; imgs += p.imagesBase64.length; }
    if (p.answer) withAnswer++;
    if (p.choices.length) withChoices++;
    if (repairLatexRender(p.content).changes.length > 0) repairable++;
  }
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '-');
console.log('── 파일명 → 메타데이터 ──');
console.log(`  성공              ${metaOk} (${pct(metaOk, targets.length)})`);
console.log(`  규격 불일치        ${metaFail.length}`);
metaFail.slice(0, 5).forEach((f) => console.log(`     · ${f}`));

console.log('\n── HML 파싱 ──');
console.log(`  성공              ${parsed}`);
console.log(`  0문항             ${zeroProblem}`);
console.log(`  예외              ${parseFail}`);

console.log('\n── 적재될 문항 ──');
console.log(`  총 문항           ${problems.toLocaleString()}`);
console.log(`  정답 있음          ${withAnswer} (${pct(withAnswer, problems)})`);
console.log(`  선택지 있음        ${withChoices} (${pct(withChoices, problems)})  ← 나머지는 서답형`);
console.log(`  도형 있음          ${withImg} (${pct(withImg, problems)})  총 ${imgs}장`);
console.log(`  수리기가 고칠 것    ${repairable} (${pct(repairable, problems)})`);

const dups = [...dupIds.entries()].filter(([, v]) => v.length > 1);
console.log(`\n── 중복 (수학비서ID 기준) ──`);
console.log(`  중복 ID           ${dups.length}건`);
dups.slice(0, 3).forEach(([id, v]) => console.log(`     · ${id} × ${v.length}`));

console.log(`\n── 분포 ──`);
console.log(`  학교 수           ${schools.size}`);
console.log(`  과목 상위:`);
[...bySubject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([k, v]) => console.log(`     ${String(v).padStart(4)}  ${k}`));

console.log('\n── 생성될 제목 표본 (학년·학기 조합이 겹치지 않게) ──');
const metas = targets
  .map((f) => parseExamFileName(path.basename(f)))
  .filter((m): m is ExamMeta => !!m);
const seenCombo = new Set<string>();
for (const m of metas) {
  const key = `${m.grade}-${m.semester}-${m.period}`;
  if (seenCombo.has(key)) continue;
  seenCombo.add(key);
  console.log(`  ${buildExamTitle(m).padEnd(32)}  ← ${m.year}년 ${m.grade} ${m.semester}학기 ${m.period}`);
  if (seenCombo.size >= 10) break;
}
