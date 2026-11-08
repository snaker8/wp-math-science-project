// ============================================================================
// 학교 기출 분석 → 옵시디언 「과사람 지식창고 / 기출 분석」 내보내기 (DB → 마크다운, 단방향)
//
// 목적: 어느 학교든 「뽑아 달라」 하면 바로 보고서·문제집·분석 자료로 쓸 수 있게,
//       DB 의 분류(단원·유형·난이도)·AI 분석·문항 전문을 학교 단위로 쌓아 둔다. AI 호출 없음(비용 0).
//
// 구조:
//   {볼트}/기출 분석/_기출 지도.md                    학교급별 한눈표 + 최근 갱신
//   {볼트}/기출 분석/학교/{학교}.md                    보고서(연도별 난이도·단원 출제 표·핵심 단원·고난도 모음·함정·인사이트) + ✍️ 메모 보존
//   {볼트}/기출 분석/시험지/{제목}.md                  요약·단원별 전략·문항 분류표·고난도 공략·문항 전문(문제집)
//   {볼트}/기출 분석/단원/{과목} · {대단원}.md          학교↔단원 역색인 + 빈출 세부유형
//
// 원칙:
//   - 진실의 원천은 Supabase. 노트는 읽기 전용 뷰 + 선생님 수동 메모(`<!-- ✍️ MANUAL -->` 아래)만 보존.
//   - Supabase .select() 1000행 한계 → 전 쿼리 페이지네이션 + .in() chunk.
//   - 내용이 같으면 파일을 다시 쓰지 않는다(갱신일만 달라지는 것은 무시) — 옵시디언 동기화 소음 방지.
//
// 실행:  npx tsx scripts/export-obsidian-exams.ts [--school=해운대고,김천고] [--dry]
// 볼트 경로 변경:  OBSIDIAN_GWASARAM_VAULT (기본 C:\옵시디언\과사람지식창고\과사람_지식창고)
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { parseExamTitleMeta } from '../src/lib/workflow/exam-title-meta';
import { DIFFICULTY_BANDS, difficultyToBand } from '../src/lib/utils/difficulty-label';

// ─── env ───
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)'); process.exit(1); }

const ARG = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
// 학교 지정: --school=A,B 또는 환경변수 OBSIDIAN_EXPORT_SCHOOLS (분류 배치가 셸을 거치지 않고 한글 이름을 넘길 때 씀)
const ONLY_SCHOOLS = (ARG('school') || process.env.OBSIDIAN_EXPORT_SCHOOLS || '').split(',').map((s) => s.trim()).filter(Boolean);
const DRY = process.argv.includes('--dry');
const VAULT = process.env.OBSIDIAN_GWASARAM_VAULT || 'C:/옵시디언/과사람지식창고/과사람_지식창고';
const ROOT = path.join(VAULT, '기출 분석');
const SITE = process.env.GWASARAM_SITE_URL || 'https://wp-math-science-project.vercel.app';
const TODAY = new Date().toISOString().slice(0, 10);
const MANUAL_MARK = '<!-- ✍️ MANUAL -->';

const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// ─── 타입 ───
interface ExamRow {
  id: string; title: string; school_name: string | null; exam_year: number | null; semester: number | null;
  exam_round: string | null; grade: string | null; subject: string | null; ai_analysis: AiAnalysis | null;
  share_token: string | null; created_at: string;
}
interface AiAnalysis {
  summary?: string; overallDifficulty?: string; generatedAt?: string;
  unitAnalyses?: Array<{ majorUnit?: string; keyPoints?: string; strategy?: string; questionNumbers?: number[] }>;
  hardQuestions?: Array<{ number?: number; subTitle?: string; intent?: string; strategy?: string; problemId?: string }>;
}
interface ProblemRow {
  id: string; content_latex: string | null; answer_json: Record<string, unknown> | null;
  images: Array<{ url?: string; type?: string; label?: string }> | null; answer_type: string | null; deleted_at: string | null;
}
interface ClsRow { problem_id: string; type_code: string | null; difficulty: string | null; cognitive_domain: string | null }
interface TypeRow { code: string; full_path: string | null; level1_name: string | null; subject_name: string | null }

interface Problem {
  id: string; seq: number; points: number | null; content: string; choices: string[]; answer: string;
  images: Array<{ url: string; type: string; label: string }>; answerType: string;
  typeCode: string | null; difficulty: number | null; cognitive: string | null;
  subject: string; level1: string; leafPath: string; pitfalls: string[];
}
interface Exam {
  id: string; title: string; school: string; year: number; gradeNum: number; schoolLevel: '중' | '고' | '';
  gradeLabel: string; semester: number; round: '중간' | '기말'; subject: string; shareToken: string | null;
  ai: AiAnalysis | null; problems: Problem[]; avg: number | null; hardCount: number; classified: number;
  unitCounts: Map<string, number>; createdAt: string; feel: Feel;
  /** 노트 파일명(기본 = 제목, 제목 중복 시 id 꼬리) */ noteName?: string;
  /** 같은 제목의 다른 시험지 id — 비어 있으면 중복 없음 */ dupOf?: string[];
}
const noteName = (e: Exam) => e.noteName ?? e.title;

/**
 * 체감 난이도 — 평균이 같아도 어려운 문항이 몇 개 섞였는지에 따라 학생이 느끼는 시험은 다르다(대표 지적, 2026-11-08).
 *   avg      평균(1~10)                        — 시험 전체의 기본 수준
 *   hardN    난이도 7 이상 문항 수 / 비율       — 상위권을 가르는 문항이 몇 개인가
 *   killerN  난이도 9 이상 문항 수              — 손도 못 대는 문항
 *   top5     상위 5문항 평균                     — 변별 구간이 얼마나 높은가
 *   sd       표준편차                            — 쉬운 문항과 어려운 문항의 격차
 *   dist     1~2 / 3~4 / 5~6 / 7~8 / 9~10 구간별 개수
 *   label    위를 종합한 한 줄 — 예: 「보통 수준인데 상위권 변별 강함(7+ 6문항·킬러 1)」
 */
interface Feel { hardN: number; hardShare: number; killerN: number; top5: number | null; sd: number | null; dist: number[]; label: string; distText: string; coverage: number }
function feelOf(ds: number[], total = ds.length): Feel {
  const n = ds.length;
  const dist = DIFFICULTY_BANDS.map((b) => ds.filter((d) => d >= b.min && d <= b.max).length);
  const coverage = total ? n / total : 0;
  if (!n) return { hardN: 0, hardShare: 0, killerN: 0, top5: null, sd: null, dist, label: '미분류', distText: '-', coverage };
  const avg = ds.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(ds.reduce((a, d) => a + (d - avg) ** 2, 0) / n);
  const sorted = [...ds].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.min(5, n));
  const top5 = top.reduce((a, b) => a + b, 0) / top.length;
  const hardN = ds.filter((d) => d >= 7).length, killerN = ds.filter((d) => d >= 9).length;
  const hardShare = hardN / n;
  const base = difficultyToBand(Math.round(avg))?.label ?? '-';
  // 몸통 = 문항이 가장 많이 몰린 구간. 평균 4.0 이라도 「몸통 보통 11/23 + 7짜리 2문항」이면 그 2문항이 등급을 가른다(대표 예시).
  const modeIdx = dist.indexOf(Math.max(...dist));
  const mode = DIFFICULTY_BANDS[modeIdx];
  const max = sorted[0];
  let tone: string;
  if (killerN >= 2 || hardShare >= 0.4) tone = '상위권 변별 매우 강함, 시험 전체가 어렵게 느껴짐';
  else if (killerN >= 1 || hardShare >= 0.25 || top5 >= 8) tone = '상위권 변별 강함';
  else if (hardN >= 1) tone = '소수 변별 문항이 등급을 가름';
  else if (sd >= 2) tone = '쉬운 문항과 어려운 문항 격차 큼';
  else tone = '변별 문항 없음, 실수 싸움';
  // 분류가 일부만 된 시험지는 평균·비율이 과장될 수 있다 — 비율을 같이 쓰고 60% 미만이면 참고용으로 낮춘다.
  const partial = coverage < 0.6 ? `분류 ${n}/${total} 참고만 · ` : coverage < 1 ? `분류 ${n}/${total} · ` : '';
  const label = `${partial}평균 ${base}(${avg.toFixed(1)}) · 몸통 ${mode.label} ${dist[modeIdx]}/${n} · 변별 7+ ${hardN}문항${killerN ? `(9+ ${killerN})` : ''}${hardN ? `, 최고 ${max}` : ''} — ${tone}`;
  const distText = DIFFICULTY_BANDS.map((b, i) => `${b.min}~${b.max}: ${dist[i]}`).join(' / ');
  return { hardN, hardShare, killerN, top5, sd, dist, label, distText, coverage };
}

/** 제목에서 과목만 — `25-1-1-M 해운대고 공통수학1` · `[22년][1-1][기말][해운대고][수학상]` · `25-1-1-M 해운대고 [공통수학1]` */
function subjectOf(title: string, fallback: string | null): string {
  const b = title.match(/^\[\d{2}년\]\[\d-\d\]\[(?:중간|기말)\]\[[^\]]+\]\[([^\]]+)\]/);
  if (b) return b[1].trim();
  const s = title.replace(/^\S+\s+\S+\s*/, '').replace(/\s*\(유사\d*\)\s*$/, '').replace(/^\[([^\]]+)\]$/, '$1').trim();
  return s || (fallback ?? '');
}

// ─── 유틸 ───
const chunk = <T,>(arr: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []; const SIZE = 1000;
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await build(from, from + SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as T[]; out.push(...rows);
    if (rows.length < SIZE) break;
  }
  return out;
}
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, '·').replace(/\s+/g, ' ').trim();
const cell = (s: string | number | null | undefined) => String(s ?? '').replace(/\|/g, '∣').replace(/\n+/g, ' ');
const fmt1 = (n: number | null) => (n == null ? '-' : n.toFixed(1));
const bandLabel = (n: number | null) => (n == null ? '-' : (difficultyToBand(Math.round(n))?.label ?? '-'));
const examCode = (e: Exam) => `${String(e.year).slice(2)}-${e.gradeNum}-${e.semester}-${e.round === '중간' ? 'M' : 'F'}`;
const examShort = (e: Exam) => `${String(e.year).slice(2)}년 ${e.gradeLabel} ${e.semester}학기 ${e.round}`;
const sortExams = (a: Exam, b: Exam) => a.year - b.year || a.gradeNum - b.gradeNum || a.semester - b.semester || (a.round === '중간' ? 0 : 1) - (b.round === '중간' ? 0 : 1) || a.subject.localeCompare(b.subject);
const link = (folder: string, name: string, alias?: string) => `[[기출 분석/${folder}/${safeName(name)}${alias ? `|${alias}` : ''}]]`;

/** 문항 LaTeX → 옵시디언 마크다운. 수식은 $…$ 그대로(MathJax). 표시용 마커·환경만 정리한다. */
function toMd(latex: string): string {
  let s = latex || '';
  s = s.replace(/\\\((.+?)\\\)/gs, (_, m) => `$${m}$`).replace(/\\\[(.+?)\\\]/gs, (_, m) => `$$${m}$$`);
  s = s.replace(/\[도형[^\]]*\]/g, '').replace(/\[그림[^\]]*\]/g, '');
  s = s.replace(/\\\\(?!\w)/g, '\n'); // 줄바꿈 마커
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}
const plain = (s: string, n = 150) => {
  const t = (s || '')
    .replace(/\\(?:begin|end)\{[a-zA-Z*]+\}(\{[^}]*\}|\|[^|\s]*\|)*/g, ' ')
    .replace(/\$[^$]*\$/g, (m) => m.slice(1, -1)).replace(/\\\\/g, ' ').replace(/\\[a-zA-Z]+/g, '').replace(/[{}&]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

function readManual(file: string): string {
  if (!fs.existsSync(file)) return '';
  const cur = fs.readFileSync(file, 'utf-8'); const i = cur.indexOf(MANUAL_MARK);
  return i >= 0 ? cur.slice(i + MANUAL_MARK.length).replace(/^\s*\n/, '') : '';
}
let written = 0, unchanged = 0;
function writeNote(file: string, body: string, keepManual = true) {
  const manual = keepManual ? readManual(file) : '';
  const content = keepManual ? `${body.trimEnd()}\n\n${MANUAL_MARK}\n${manual.trim() ? manual.trimEnd() + '\n' : '여기 아래에 적은 메모는 자동 갱신 때 그대로 남습니다.\n'}` : body.trimEnd() + '\n';
  const strip = (s: string) => s.replace(/^갱신: .*$/m, '');
  if (fs.existsSync(file) && strip(fs.readFileSync(file, 'utf-8')) === strip(content)) { unchanged++; return; }
  written++;
  if (DRY) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf-8');
}

// ─── 적재 ───
async function load(): Promise<Exam[]> {
  const examRows = await pageAll<ExamRow>((f, t) => sb.from('exams')
    .select('id,title,school_name,exam_year,semester,exam_round,grade,subject,ai_analysis,share_token,created_at')
    .is('deleted_at', null).is('institute_id', null).order('created_at', { ascending: true }).range(f, t));
  const exams: Exam[] = [];
  for (const r of examRows) {
    const meta = parseExamTitleMeta(r.title); if (!meta) continue;
    if (ONLY_SCHOOLS.length && !ONLY_SCHOOLS.includes(meta.schoolName)) continue;
    const level: '중' | '고' | '' = meta.grade?.startsWith('중') ? '중' : meta.grade?.startsWith('고') ? '고' : '';
    const subject = subjectOf(r.title, r.subject);
    exams.push({
      id: r.id, title: r.title, school: meta.schoolName, year: meta.examYear, gradeNum: meta.gradeNum, schoolLevel: level,
      gradeLabel: meta.grade ?? `${meta.gradeNum}학년`, semester: meta.semester, round: meta.examRound, subject,
      shareToken: r.share_token, ai: r.ai_analysis, problems: [], avg: null, hardCount: 0, classified: 0, unitCounts: new Map(), createdAt: r.created_at,
      feel: feelOf([]),
    });
  }
  console.log(`시험지 ${exams.length}장 (학교 ${new Set(exams.map((e) => e.school)).size}곳)`);
  const byExam = new Map(exams.map((e) => [e.id, e]));

  const links: Array<{ exam_id: string; problem_id: string; sequence_number: number | null; points: string | number | null }> = [];
  for (const ids of chunk(exams.map((e) => e.id), 100)) {
    links.push(...await pageAll<typeof links[number]>((f, t) => sb.from('exam_problems').select('exam_id,problem_id,sequence_number,points').in('exam_id', ids).range(f, t)));
  }
  const pids = Array.from(new Set(links.map((l) => l.problem_id)));
  const problems = new Map<string, ProblemRow>(); const cls = new Map<string, ClsRow>(); const pit = new Map<string, string[]>();
  for (const ids of chunk(pids, 100)) {
    const [p, c, f] = await Promise.all([
      pageAll<ProblemRow>((a, b) => sb.from('problems').select('id,content_latex,answer_json,images,answer_type,deleted_at').in('id', ids).range(a, b)),
      pageAll<ClsRow>((a, b) => sb.from('classifications').select('problem_id,type_code,difficulty,cognitive_domain').in('problem_id', ids).order('created_at', { ascending: false }).range(a, b)),
      pageAll<{ problem_id: string; pitfall_code: string | null }>((a, b) => sb.from('problem_pitfalls').select('problem_id,pitfall_code').in('problem_id', ids).range(a, b)),
    ]);
    p.forEach((r) => problems.set(r.id, r));
    c.forEach((r) => { if (!cls.has(r.problem_id)) cls.set(r.problem_id, r); });
    f.forEach((r) => { if (r.pitfall_code) pit.set(r.problem_id, [...(pit.get(r.problem_id) || []), r.pitfall_code]); });
  }
  const { data: pitTypes } = await sb.from('pitfall_types').select('code,label_ko');
  const pitLabel = new Map(((pitTypes || []) as Array<{ code: string; label_ko: string }>).map((r) => [r.code, r.label_ko]));
  const codes = Array.from(new Set(Array.from(cls.values()).map((c) => c.type_code).filter((x): x is string => !!x)));
  const types = new Map<string, TypeRow>();
  for (const ids of chunk(codes, 200)) {
    const { data, error } = await sb.from('mathsecr_types').select('code,full_path,level1_name,subject_name').in('code', ids);
    if (error) throw new Error(error.message);
    ((data || []) as TypeRow[]).forEach((r) => types.set(r.code, r));
  }
  console.log(`문항 ${pids.length}개 · 분류 ${cls.size}개 · 유형코드 ${types.size}개`);

  for (const l of links) {
    const e = byExam.get(l.exam_id); const p = problems.get(l.problem_id);
    if (!e || !p || p.deleted_at) continue;
    const c = cls.get(p.id); const t = c?.type_code ? types.get(c.type_code) : undefined;
    const segs = (t?.full_path || '').split(' > ').map((s) => s.trim()).filter(Boolean);
    const aj = (p.answer_json || {}) as { choices?: unknown; finalAnswer?: unknown; correct_answer?: unknown };
    const choices = Array.isArray(aj.choices) ? (aj.choices as unknown[]).map(String) : [];
    const d = c?.difficulty != null ? parseInt(String(c.difficulty), 10) : NaN;
    e.problems.push({
      id: p.id, seq: Number(l.sequence_number ?? 0), points: l.points != null ? Number(l.points) : null,
      content: p.content_latex || '', choices, answer: String(aj.finalAnswer ?? aj.correct_answer ?? '').trim(),
      images: ((p.images || []) as Array<{ url?: string; type?: string; label?: string }>).filter((i) => i.url).map((i) => ({ url: i.url!, type: i.type || '', label: i.label || '' })),
      answerType: p.answer_type || String((aj as { type?: unknown }).type ?? ''),
      typeCode: c?.type_code ?? null, difficulty: Number.isFinite(d) ? d : null, cognitive: c?.cognitive_domain ?? null,
      subject: t?.subject_name || segs[0] || '', level1: t?.level1_name || segs[1] || '', leafPath: segs.slice(2).join(' > '),
      pitfalls: (pit.get(p.id) || []).map((code) => pitLabel.get(code) || code),
    });
  }
  for (const e of exams) {
    e.problems.sort((a, b) => a.seq - b.seq);
    const ds = e.problems.map((p) => p.difficulty).filter((x): x is number => x != null);
    e.classified = ds.length; e.avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    e.hardCount = ds.filter((d) => d >= 7).length;
    e.feel = feelOf(ds, e.problems.length);
    for (const p of e.problems) if (p.level1) e.unitCounts.set(p.level1, (e.unitCounts.get(p.level1) || 0) + 1);
  }
  const kept = exams.filter((e) => e.problems.length > 0);
  // 같은 제목이 둘 이상이면(수동 업로드 + 일괄 적재 중복 등) 노트 이름을 id 로 구분하고 중복 표시를 남긴다.
  const byTitle = new Map<string, Exam[]>();
  for (const e of kept) byTitle.set(e.title, [...(byTitle.get(e.title) || []), e]);
  for (const [, g] of byTitle) if (g.length > 1) for (const e of g) { e.dupOf = g.filter((x) => x !== e).map((x) => x.id); e.noteName = `${e.title} (${e.id.slice(0, 6)})`; }
  return kept;
}

// ─── 노트: 시험지 ───
function examNote(e: Exam): string {
  const L: string[] = [];
  const report = e.shareToken ? `${SITE}/share/exam/${e.shareToken}` : '';
  L.push('---', 'tags: [기출분석, 시험지]', '사업: 과사람', '종류: 기출분석', '생성: 자동', `갱신: ${TODAY}`,
    `학교: "${e.school}"`, `연도: ${e.year}`, `학년: "${e.gradeLabel}"`, `학기: ${e.semester}`, `회차: ${e.round}`, `과목: "${e.subject}"`,
    `문항: ${e.problems.length}`, `평균난이도: ${e.avg == null ? 'null' : e.avg.toFixed(2)}`, `밴드: "${bandLabel(e.avg)}"`, `고난도문항: ${e.hardCount}`,
    `킬러문항: ${e.feel.killerN}`, `상위5평균: ${e.feel.top5 == null ? 'null' : e.feel.top5.toFixed(1)}`, `체감: "${e.feel.label}"`,
    `시험지id: ${e.id}`, ...(report ? [`리포트: ${report}`] : []), '---', '');
  L.push(`# ${e.title}`, '');
  L.push(`> ${link('학교', e.school)} · ${e.year}년 ${e.gradeLabel} ${e.semester}학기 ${e.round} · ${e.subject || '과목 미상'} · ${e.problems.length}문항 · 평균 난이도 **${fmt1(e.avg)}**/10 (${bandLabel(e.avg)})`);
  L.push(`> **체감** ${e.feel.label} · 분포 ${e.feel.distText}`);
  if (e.dupOf?.length) L.push('', `> [!warning] 같은 제목의 시험지가 DB 에 ${e.dupOf.length + 1}건 있습니다 (이 노트 ${e.id.slice(0, 8)}, 그 외 ${e.dupOf.map((x) => x.slice(0, 8)).join(', ')}). 중복 업로드인지 확인이 필요합니다.`, '');
  L.push(`> 바로가기: ${report ? `[학부모 공유 리포트](${report}) · ` : ''}[문항·인쇄·HWP](${SITE}/dashboard/cloud/${e.id})`, '');

  if (e.ai?.summary) L.push('## 한눈에', '', e.ai.summary.trim(), '');

  // 단원 분포
  if (e.unitCounts.size) {
    L.push('## 단원 분포', '', '| 대단원 | 문항 | 번호 | 평균 난이도 |', '|---|---:|---|---:|');
    const rows = Array.from(e.unitCounts.entries()).sort((a, b) => b[1] - a[1]);
    for (const [u, n] of rows) {
      const ps = e.problems.filter((p) => p.level1 === u);
      const ds = ps.map((p) => p.difficulty).filter((x): x is number => x != null);
      L.push(`| ${link('단원', `${ps[0].subject} · ${u}`, cell(u))} | ${n} | ${ps.map((p) => p.seq).join(', ')} | ${ds.length ? fmt1(ds.reduce((a, b) => a + b, 0) / ds.length) : '-'} |`);
    }
    L.push('');
  }

  // AI 단원별 전략
  if (e.ai?.unitAnalyses?.length) {
    L.push('## 단원별 출제 포인트와 대비 전략', '');
    for (const u of e.ai.unitAnalyses) {
      L.push(`### ${u.majorUnit || '단원'}${u.questionNumbers?.length ? ` (${u.questionNumbers.join('·')}번)` : ''}`, '');
      if (u.keyPoints) L.push(`- **출제 포인트** — ${u.keyPoints.trim()}`);
      if (u.strategy) L.push(`- **대비 전략** — ${u.strategy.trim()}`);
      L.push('');
    }
  }

  // 분류표
  L.push('## 문항 분류표', '', '| 번호 | 배점 | 대단원 | 세부 유형 | 난이도 | 인지 | 정답 | 함정 |', '|---:|---:|---|---|---:|---|---|---|');
  for (const p of e.problems) {
    L.push(`| [[#${p.seq}번|${p.seq}]] | ${p.points ?? ''} | ${cell(p.level1)} | ${cell(p.leafPath)} | ${p.difficulty ?? ''} | ${cell(p.cognitive)} | ${cell(p.answer)} | ${cell(p.pitfalls.join(', '))} |`);
  }
  L.push('');

  // 고난도 공략
  if (e.ai?.hardQuestions?.length) {
    L.push('## 고난도 문항 공략', '');
    for (const h of e.ai.hardQuestions) {
      L.push(`### ${h.number != null ? `${h.number}번 — ` : ''}${h.subTitle || ''}`.trim(), '');
      if (h.intent) L.push(`- **출제 의도** — ${h.intent.trim()}`);
      if (h.strategy) L.push('- **풀이 전략**', ...h.strategy.trim().split(/\n+/).map((s) => `  - ${s.trim()}`));
      if (h.number != null) L.push(`- 문항 전문 → [[#${h.number}번]]`);
      L.push('');
    }
  }

  // 문항 전문
  L.push('## 문항 전문', '', '> 수식은 그대로 렌더됩니다. 인쇄용 시험지·HWP 는 위 「문항·인쇄·HWP」 링크에서 만듭니다.', '');
  for (const p of e.problems) {
    const meta = [p.points != null ? `${p.points}점` : null, p.difficulty != null ? `난이도 ${p.difficulty} (${bandLabel(p.difficulty)})` : '미분류',
      p.level1 || null, p.leafPath || null, p.cognitive || null].filter(Boolean).join(' · ');
    L.push(`### ${p.seq}번`, '', `*${meta}*`, '', toMd(p.content), '');
    if (p.choices.length) { L.push(...p.choices.map((c) => `- ${toMd(c)}`), ''); }
    for (const img of p.images.filter((i) => i.type !== 'crop')) L.push(`![${img.label || '그림'}](${img.url})`);
    const crop = p.images.find((i) => i.type === 'crop');
    L.push(`**정답** ${p.answer || '-'}${crop ? ` · [원본 이미지](${crop.url})` : ''}`);
    if (p.pitfalls.length) L.push(`함정: ${p.pitfalls.join(', ')}`);
    L.push('');
  }
  return L.join('\n');
}

// ─── 노트: 학교 ───
function schoolNote(school: string, exams: Exam[]): string {
  exams = [...exams].sort(sortExams);
  const level = exams[0].schoolLevel;
  const allP = exams.flatMap((e) => e.problems);
  const ds = allP.map((p) => p.difficulty).filter((x): x is number => x != null);
  const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
  const years = Array.from(new Set(exams.map((e) => e.year))).sort();
  const latest = exams[exams.length - 1];
  const L: string[] = [];
  L.push('---', 'tags: [기출분석, 학교]', '사업: 과사람', '종류: 기출분석', '생성: 자동', '상태: 활성', `갱신: ${TODAY}`,
    `학교: "${school}"`, `학교급: "${level ? (level === '중' ? '중학교' : '고등학교') : '미상'}"`, `시험지: ${exams.length}`, `문항: ${allP.length}`,
    `연도: "${years[0]}~${years[years.length - 1]}"`, `평균난이도: ${avg == null ? 'null' : avg.toFixed(2)}`, `최근시험: "${latest.title}"`, '---', '');
  L.push(`# ${school} 기출 분석`, '');

  // 한 줄 요약
  const withAvg = exams.filter((e) => e.avg != null);
  const first = withAvg[0], last = withAvg[withAvg.length - 1];
  let thesis = `${school} 내신 수학 시험지 ${exams.length}장(${years[0]}~${years[years.length - 1]}년, 총 ${allP.length}문항)을 단원·난이도로 분류해 모았습니다.`;
  if (first && last && first !== last) {
    const delta = last.avg! - first.avg!;
    const trend = Math.abs(delta) < 0.3 ? '비슷한 수준을 유지하고' : delta > 0 ? `${delta.toFixed(1)}만큼 어려워졌고` : `${(-delta).toFixed(1)}만큼 쉬워졌고`;
    thesis += ` 평균 난이도는 ${first.year}년 ${fmt1(first.avg)} → ${last.year}년 ${fmt1(last.avg)}로 ${trend}, 전체 평균은 ${fmt1(avg)}/10 (${bandLabel(avg)})입니다.`;
  } else if (avg != null) thesis += ` 전체 평균 난이도는 ${fmt1(avg)}/10 (${bandLabel(avg)})입니다.`;
  if (latest.feel.top5 != null) thesis += ` 가장 최근 시험(${examShort(latest)})의 체감은 「${latest.feel.label}」입니다.`;
  L.push(`> [!summary] 한 줄 요약`, `> ${thesis}`, '');

  // 바로가기
  L.push('## 바로가기', '');
  const groups = new Map<string, Exam[]>();
  for (const e of exams) { const k = `${e.gradeLabel} ${e.semester}학기 ${e.round}`; groups.set(k, [...(groups.get(k) || []), e]); }
  for (const [k, g] of groups) {
    const url = `${SITE}/share/aggregate?examIds=${g.map((e) => e.id).join(',')}`;
    L.push(`- ${k} (${g.length}장) — [학부모 공유 리포트](${url}) · ${g.map((e) => link('시험지', noteName(e), `${String(e.year).slice(2)}년${e.subject ? ' ' + e.subject : ''}`)).join(' · ')}`);
  }
  L.push(`- 허브 학교 노트 → [[과사람 허브/학교/${school}]]`, '');

  // 연도별 난이도 — 평균 + 체감(어려운 문항 수·상위 구간)
  L.push('## 연도별 난이도', '', '평균이 같아도 어려운 문항이 몇 개 섞였는지에 따라 체감이 다릅니다. 「7+」는 난이도 7 이상 문항 수, 「상위5」는 가장 어려운 5문항의 평균입니다.', '',
    '| 시험 | 과목 | 문항 | 분류 | 평균 | 7+ | 9+ | 상위5 | 체감 | 많이 나온 단원 | 시험지 |', '|---|---|---:|---:|---:|---:|---:|---:|---|---|---|');
  for (const e of exams) {
    const top = Array.from(e.unitCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u, n]) => `${u} ${n}`).join(', ');
    let tone = e.feel.label.split(' — ')[1] ?? '';
    if (e.classified === 0) tone = '미분류';
    else if (e.feel.coverage < 0.6) tone = `(참고만) ${tone}`;
    L.push(`| ${examShort(e)} | ${cell(e.subject)} | ${e.problems.length} | ${e.classified}/${e.problems.length} | ${fmt1(e.avg)} | ${e.feel.hardN} | ${e.feel.killerN || '·'} | ${e.feel.top5 == null ? '-' : e.feel.top5.toFixed(1)} | ${cell(tone)} | ${cell(top)} | ${link('시험지', noteName(e), '열기')} |`);
  }
  L.push('');
  L.push('### 난이도 분포', '', '| 시험 | 1~2 평이 | 3~4 보통 | 5~6 난이도 있음 | 7~8 매우 | 9~10 최고 |', '|---|---:|---:|---:|---:|---:|');
  for (const e of exams) L.push(`| ${examShort(e)}${e.subject ? ` ${e.subject}` : ''} | ${e.feel.dist.map((n) => n || '·').join(' | ')} |`);
  L.push('');

  // 단원 출제 표 — 학년·학기 그룹별 (열 = 시험지)
  L.push('## 단원 출제 표', '', '숫자는 그 시험지에서 그 대단원이 나온 문항 수입니다. 매 시험 빠지지 않은 단원은 **굵게** 표시했습니다.', '');
  const semGroups = new Map<string, Exam[]>();
  for (const e of exams) { const k = `${e.gradeLabel} ${e.semester}학기`; semGroups.set(k, [...(semGroups.get(k) || []), e]); }
  for (const [k, g] of semGroups) {
    const cols = g.slice(-10);
    const units = new Map<string, number>();
    for (const e of cols) for (const [u, n] of e.unitCounts) units.set(u, (units.get(u) || 0) + n);
    if (!units.size) continue;
    L.push(`### ${k}`, '', `| 대단원 | ${cols.map((e) => `${String(e.year).slice(2)} ${e.round}${g.filter((x) => x.year === e.year && x.round === e.round).length > 1 ? ' ' + e.subject : ''}`).join(' | ')} | 합계 | 출제 |`, `|---|${cols.map(() => '---:').join('|')}|---:|---|`);
    for (const [u, total] of Array.from(units.entries()).sort((a, b) => b[1] - a[1])) {
      const hits = cols.filter((e) => e.unitCounts.get(u)).length;
      const every = cols.length >= 2 && hits === cols.length;
      const name = every ? `**${u}**` : u;
      L.push(`| ${cell(name)} | ${cols.map((e) => e.unitCounts.get(u) || '·').join(' | ')} | ${total} | ${hits}/${cols.length} |`);
    }
    L.push('');
  }

  // 고난도 모음
  const hard = allP.filter((p) => p.difficulty != null && p.difficulty >= 7).map((p) => ({ p, e: exams.find((e) => e.problems.includes(p))! }))
    .sort((a, b) => b.p.difficulty! - a.p.difficulty! || b.e.year - a.e.year).slice(0, 15);
  if (hard.length) {
    L.push('## 고난도 문항 모음', '', `난이도 7 이상 ${allP.filter((p) => (p.difficulty ?? 0) >= 7).length}문항 중 상위 ${hard.length}개. 전문은 시험지 노트의 번호 링크에서 봅니다.`, '');
    for (const { p, e } of hard) {
      L.push(`- **난이도 ${p.difficulty}** · ${examShort(e)} ${p.seq}번 · ${p.level1}${p.leafPath ? ` › ${p.leafPath.split(' > ').pop()}` : ''} — ${plain(p.content, 120)} → ${`[[기출 분석/시험지/${safeName(noteName(e))}#${p.seq}번|${p.seq}번 보기]]`}`);
    }
    L.push('');
  }

  // 함정
  const pitCount = new Map<string, number>();
  for (const p of allP) for (const f of p.pitfalls) pitCount.set(f, (pitCount.get(f) || 0) + 1);
  if (pitCount.size) {
    L.push('## 자주 걸리는 함정', '', '| 함정 | 문항 수 |', '|---|---:|');
    for (const [f, n] of Array.from(pitCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)) L.push(`| ${cell(f)} | ${n} |`);
    L.push('');
  }

  // 강사 인사이트 (AI 요약)
  const withAi = exams.filter((e) => e.ai?.summary).slice(-6).reverse();
  if (withAi.length) {
    L.push('## 시험지별 분석 요약', '');
    for (const e of withAi) L.push(`### ${examShort(e)}${e.subject ? ` · ${e.subject}` : ''}`, '', e.ai!.summary!.trim(), '', `→ ${link('시험지', noteName(e), '단원별 전략·고난도 공략·문항 전문')}`, '');
  }
  L.push('## 메모', '', '아래 ✍️ 표시 밑에 적은 내용(출제 선생님 성향, 서술형 채점 특징, 수업에서 확인한 것)은 자동 갱신 때 그대로 남습니다.');
  return L.join('\n');
}

// ─── 노트: 단원 ───
function unitNote(subject: string, unit: string, rows: Array<{ e: Exam; ps: Problem[] }>): string {
  const L: string[] = [];
  const all = rows.flatMap((r) => r.ps);
  const schools = new Set(rows.map((r) => r.e.school));
  L.push('---', 'tags: [기출분석, 단원]', '사업: 과사람', '종류: 기출분석', '생성: 자동', `갱신: ${TODAY}`, `과목: "${subject}"`, `대단원: "${unit}"`, `학교수: ${schools.size}`, `시험지: ${rows.length}`, `문항: ${all.length}`, '---', '');
  L.push(`# ${subject} · ${unit}`, '', `> ${schools.size}개교 ${rows.length}장의 시험지에서 ${all.length}문항. 학교가 이 단원을 어떻게 내는지 가로로 비교합니다.`, '');
  const leaf = new Map<string, { n: number; ds: number[] }>();
  for (const p of all) { const k = p.leafPath || '(세부 유형 없음)'; const v = leaf.get(k) || { n: 0, ds: [] }; v.n++; if (p.difficulty != null) v.ds.push(p.difficulty); leaf.set(k, v); }
  L.push('## 빈출 세부 유형', '', '| 세부 유형 | 문항 | 평균 난이도 |', '|---|---:|---:|');
  for (const [k, v] of Array.from(leaf.entries()).sort((a, b) => b[1].n - a[1].n).slice(0, 20)) L.push(`| ${cell(k)} | ${v.n} | ${v.ds.length ? fmt1(v.ds.reduce((a, b) => a + b, 0) / v.ds.length) : '-'} |`);
  L.push('', '## 학교별 출제', '', '| 학교 | 시험 | 문항 수 | 번호 | 평균 난이도 |', '|---|---|---:|---|---:|');
  for (const { e, ps } of rows.sort((a, b) => a.e.school.localeCompare(b.e.school) || sortExams(b.e, a.e))) {
    const ds = ps.map((p) => p.difficulty).filter((x): x is number => x != null);
    L.push(`| ${link('학교', e.school, e.school)} | ${link('시험지', noteName(e), examShort(e))} | ${ps.length} | ${ps.map((p) => p.seq).join(', ')} | ${ds.length ? fmt1(ds.reduce((a, b) => a + b, 0) / ds.length) : '-'} |`);
  }
  L.push('');
  const hard = all.filter((p) => (p.difficulty ?? 0) >= 7).sort((a, b) => b.difficulty! - a.difficulty!).slice(0, 10);
  if (hard.length) {
    L.push('## 이 단원 고난도 문항', '');
    for (const p of hard) { const r = rows.find((x) => x.ps.includes(p))!; L.push(`- **난이도 ${p.difficulty}** · ${r.e.school} ${examShort(r.e)} ${p.seq}번 — ${plain(p.content, 110)} → ${`[[기출 분석/시험지/${safeName(noteName(r.e))}#${p.seq}번|보기]]`}`); }
    L.push('');
  }
  return L.join('\n');
}

// ─── 노트: 지도 ───
function indexNote(bySchool: Map<string, Exam[]>): string {
  const L: string[] = [];
  const all = Array.from(bySchool.values()).flat();
  L.push('---', 'tags: [기출분석, 지도]', '사업: 과사람', '종류: 기출분석', '생성: 자동', `갱신: ${TODAY}`, `학교수: ${bySchool.size}`, `시험지: ${all.length}`, `문항: ${all.reduce((a, e) => a + e.problems.length, 0)}`, '---', '');
  L.push('# 기출 지도', '', `> ${bySchool.size}개교 · 시험지 ${all.length}장 · 문항 ${all.reduce((a, e) => a + e.problems.length, 0)}개. 학교 노트는 보고서로, 시험지 노트는 문제집으로, 단원 노트는 교차 분석으로 바로 씁니다. 매일 DB 에서 다시 생성됩니다.`, '');
  L.push('## 최근 들어온 시험지', '', '```dataview', 'TABLE 학교, 연도, 학년, 회차, 과목, 문항, 평균난이도', 'FROM "기출 분석/시험지"', 'SORT file.ctime DESC', 'LIMIT 15', '```', '');
  for (const [title, lv] of [['고등학교', '고'], ['중학교', '중'], ['학교급 미상', '']] as const) {
    const rows = Array.from(bySchool.entries()).filter(([, ex]) => ex[0].schoolLevel === lv).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    if (!rows.length) continue;
    L.push(`## ${title} (${rows.length}개교)`, '', '| 학교 | 시험지 | 문항 | 연도 | 평균 난이도 | 최근 시험 |', '|---|---:|---:|---|---:|---|');
    for (const [s, ex] of rows) {
      const sorted = [...ex].sort(sortExams); const ys = sorted.map((e) => e.year);
      const ds = ex.flatMap((e) => e.problems).map((p) => p.difficulty).filter((x): x is number => x != null);
      L.push(`| ${link('학교', s, s)} | ${ex.length} | ${ex.reduce((a, e) => a + e.problems.length, 0)} | ${Math.min(...ys)}~${Math.max(...ys)} | ${ds.length ? fmt1(ds.reduce((a, b) => a + b, 0) / ds.length) : '-'} | ${examShort(sorted[sorted.length - 1])} |`);
    }
    L.push('');
  }
  L.push('## 단원 노트', '', '```dataview', 'TABLE 과목, 학교수, 시험지, 문항', 'FROM "기출 분석/단원"', 'SORT 문항 DESC', '```', '');
  return L.join('\n');
}

// ─── main ───
async function main() {
  const t0 = Date.now();
  const exams = await load();
  const bySchool = new Map<string, Exam[]>();
  for (const e of exams) bySchool.set(e.school, [...(bySchool.get(e.school) || []), e]);

  for (const e of exams) writeNote(path.join(ROOT, '시험지', `${safeName(noteName(e))}.md`), examNote(e));
  for (const [s, ex] of bySchool) writeNote(path.join(ROOT, '학교', `${safeName(s)}.md`), schoolNote(s, ex));

  const unitRows = new Map<string, Array<{ e: Exam; ps: Problem[] }>>();
  for (const e of exams) {
    const byUnit = new Map<string, Problem[]>();
    for (const p of e.problems) if (p.level1) { const k = `${p.subject || '과목미상'} · ${p.level1}`; byUnit.set(k, [...(byUnit.get(k) || []), p]); }
    for (const [k, ps] of byUnit) unitRows.set(k, [...(unitRows.get(k) || []), { e, ps }]);
  }
  if (!ONLY_SCHOOLS.length) for (const [k, rows] of unitRows) writeNote(path.join(ROOT, '단원', `${safeName(k)}.md`), unitNote(k.split(' · ')[0], k.split(' · ').slice(1).join(' · '), rows), false);
  if (!ONLY_SCHOOLS.length) writeNote(path.join(ROOT, '_기출 지도.md'), indexNote(bySchool), false);

  console.log(`${DRY ? '[dry] ' : ''}학교 ${bySchool.size} · 시험지 ${exams.length} · 단원 ${ONLY_SCHOOLS.length ? '(학교 지정 시 생략)' : unitRows.size} — 새로 씀 ${written} · 변화 없음 ${unchanged} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`→ ${ROOT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
