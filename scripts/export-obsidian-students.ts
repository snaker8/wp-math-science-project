// ============================================================================
// 학생 옵시디언 볼트 내보내기 — Supabase → 마크다운 (단방향, 읽기 전용 뷰)
//
// 구조:
//   {볼트}/{학원}/{센터}/학생/{이름 (id앞8자리)}.md   ← 자동 생성 + 수동 메모 보존
//   {볼트}/단원/{단원명 (코드)}.md                    ← 공용 (mathsecr 마스터)
//   {볼트}/{학원}/{센터}/_센터요약.md
//   {볼트}/HOME.md
//
// 원칙:
//   - 진실의 원천은 Supabase. 볼트는 읽기 전용 뷰 + 선생님 수동 메모만.
//   - 수동 메모: 학생 노트의 `<!-- ✍️ MANUAL -->` 마커 아래는 재생성 시 보존.
//   - Supabase .select() 1000행 한계 → 전 쿼리 페이지네이션 + .in() chunk 필수.
//
// 실행:  npx tsx scripts/export-obsidian-students.ts
// 볼트 경로 변경:  OBSIDIAN_STUDENT_VAULT 환경변수 (기본 ~/Documents/과사람학생볼트)
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── env 로드 (.env.local 우선, .env 폴백 — Next.js 외부 실행이므로 수동) ───
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
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)');
  process.exit(1);
}

const VAULT = process.env.OBSIDIAN_STUDENT_VAULT
  || path.join(os.homedir(), 'Documents', '과사람학생볼트');

const sb: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const diag = () => sb.schema('diagnostics' as never);

// ─── rcc(개별수업, private-manage.vercel.app) Supabase — 읽기 전용 소스 ───
//   본 프로젝트와 별개 DB(qplwkourldbiqnpjesyj). student_id 가 전화번호라
//   본 users.phone 정규화 매칭으로 연결. 키 없으면 개별수업 섹션만 생략.
const RCC_URL = 'https://qplwkourldbiqnpjesyj.supabase.co';
const RCC_KEY = process.env.RCC_SUPABASE_SERVICE_KEY || '';
const rcc: SupabaseClient | null = RCC_KEY
  ? createClient(RCC_URL, RCC_KEY, { auth: { persistSession: false } })
  : null;

/** 전화번호 정규화 — 숫자만 남김 (010-1234-5678 / 01012345678 동일 취급) */
const normPhone = (p: string | null | undefined): string => (p || '').replace(/[^0-9]/g, '');

// ─── 공용 헬퍼: 1000행 한계 페이지네이션 ───
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  label: string,
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// ─── .in() chunk 헬퍼 (URL 길이 + 1000행 한계 동시 대응) ───
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── 파일 유틸 ───
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '·').replace(/\s+/g, ' ').trim() || '무명';
}
function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
const MANUAL_MARKER = '<!-- ✍️ MANUAL — 이 아래는 수동 메모 영역. 자동 갱신 시 보존됩니다. -->';
function preserveManual(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const old = fs.readFileSync(filePath, 'utf-8');
  const idx = old.indexOf(MANUAL_MARKER);
  if (idx < 0) return '';
  return old.slice(idx + MANUAL_MARKER.length).replace(/^\r?\n/, '');
}

// ─── 타입 (필요 필드만) ───
interface Org { id: string; name: string }
interface Inst { id: string; name: string; organization_id: string | null }
interface Student {
  id: string; full_name: string | null; grade: number | null;
  phone: string | null; email: string | null; institute_id: string | null;
}
interface PrintSess {
  id: string; student_id: string; exam_id: string | null; session_type: string | null;
  round_number: number | null; issued_at: string | null; completed_at: string | null;
}
interface NodeStat {
  student_id: string; mathsecr_code: string; status: string;
  last_score: number | null; items_total: number; items_correct: number;
  dominant_error_cause: string | null; last_tested_at: string | null;
}
interface MsNode {
  code: string; subject_name: string | null;
  level1_name: string | null; level2_name: string | null;
  level3_name: string | null; level4_name: string | null;
}

const STATUS_KO: Record<string, string> = { alpha: '🟢 우수', beta: '🟡 보통', gamma: '🔴 약점', unknown: '⚪ 미진단' };
const fmtDate = (s: string | null) => (s ? s.slice(0, 10) : '-');

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[export] 볼트: ${VAULT}`);

  // 1) 조직 구조 + 학생
  const orgs = await fetchAll<Org>((f, t) => sb.from('organizations').select('id, name').range(f, t), 'organizations');
  const insts = await fetchAll<Inst>((f, t) => sb.from('institutes').select('id, name, organization_id').range(f, t), 'institutes');
  const students = await fetchAll<Student>(
    (f, t) => sb.from('users').select('id, full_name, grade, phone, email, institute_id')
      .eq('role', 'STUDENT').is('deleted_at', null).order('full_name').range(f, t),
    'students',
  );
  console.log(`[export] 학원 ${orgs.length} · 센터 ${insts.length} · 학생 ${students.length}`);

  // ★ 2026-09-02 — A(diagnostics.sessions/items) 조회 제거.
  //   A 의 채점 기록은 전부 B(print_sessions/session_results)로 옮겨있다.
  //   둘 다 읽고 둘 다 표에 찍고 있어서, 학생 위키 「진단·시험 이력」에
  //   **같은 시험이 두 줄씩** 나오고 있었다(110줄).

  // 4) QR/인쇄 채점 세션 + 결과 + 시험지 제목
  const printSessions = await fetchAll<PrintSess>(
    (f, t) => diag().from('print_sessions')
      .select('id, student_id, exam_id, session_type, round_number, issued_at, completed_at')
      .order('issued_at', { ascending: false }).range(f, t),
    'diag.print_sessions',
  );
  const printScore = new Map<string, { c: number; t: number }>();
  // 오답 원인 프로필용 원본 — 아래 인덱스 빌드에서 쓴다 (옛 A items 자리)
  const errorRows: Array<{ session_id: string; is_correct: boolean; error_cause: string | null }> = [];
  // 등장한 단원 코드 (아래 mathsecr 이름 조회용 — 옛 A items.mathsecr_code 자리)
  const resultCodes = new Set<string>();
  for (const ids of chunk(printSessions.map((p) => p.id), 100)) {
    const rows = await fetchAll<{ session_id: string; is_correct: boolean; error_cause: string | null; teacher_note: string | null; mathsecr_code: string | null }>(
      (f, t) => diag().from('session_results')
        .select('session_id, is_correct, error_cause, teacher_note, mathsecr_code').in('session_id', ids).range(f, t),
      'diag.session_results',
    );
    for (const r of rows) {
      if ((r.teacher_note ?? '').includes('자동채점 보류')) continue;  // 보류 문항 제외
      errorRows.push({ session_id: r.session_id, is_correct: r.is_correct, error_cause: r.error_cause });
      if (r.mathsecr_code) resultCodes.add(r.mathsecr_code);
      const s = printScore.get(r.session_id) || { c: 0, t: 0 };
      s.t += 1; if (r.is_correct) s.c += 1;
      printScore.set(r.session_id, s);
    }
  }
  const examTitle = new Map<string, string>();
  const examIds = Array.from(new Set(printSessions.map((p) => p.exam_id).filter(Boolean))) as string[];
  for (const ids of chunk(examIds, 100)) {
    const rows = await fetchAll<{ id: string; title: string }>(
      (f, t) => sb.from('exams').select('id, title').in('id', ids).range(f, t), 'exams',
    );
    for (const r of rows) examTitle.set(r.id, r.title);
  }

  // 4.5) 개별수업(rcc · private-manage.vercel.app) — 별개 Supabase 읽기 전용 연동.
  //      student_id = 전화번호 → 본 users.phone 정규화 매칭. 키 없으면 섹션 생략.
  //      ※ 인덱싱 키는 항상 normPhone(student_id).
  interface DiagEnroll {
    student_id: string; student_name?: string | null; class_id: string;
    stage: number; care_weight: number; note: string | null;
  }
  interface DiagPlan { student_id: string; week_start: string; target_units: string[]; goals: string | null; notes: string | null }
  interface DiagAtt { student_id: string; meeting_id: string; attendance: string; target_units: string[]; homeroom_note: string | null }
  interface DiagScore { student_id: string; meeting_id: string; mathsecr_code: string; score: number }
  let lessonEnrolls: DiagEnroll[] = [];
  const lessonClassName = new Map<string, string>();
  let lessonPlans: DiagPlan[] = [];
  let lessonAtts: DiagAtt[] = [];
  let lessonScores: DiagScore[] = [];
  const meetingDate = new Map<string, string>();
  if (rcc) {
    try {
      lessonEnrolls = await fetchAll<DiagEnroll>(
        (f, t) => rcc.from('diag_enrollments')
          .select('student_id, student_name, class_id, stage, care_weight, note')
          .is('ended_at', null).range(f, t),
        'rcc.diag_enrollments',
      );
      const lessonClasses = await fetchAll<{ id: string; name: string }>(
        (f, t) => rcc.from('diag_classes').select('id, name').range(f, t), 'rcc.diag_classes',
      );
      for (const r of lessonClasses) lessonClassName.set(r.id, r.name);
      lessonPlans = await fetchAll<DiagPlan>(
        (f, t) => rcc.from('diag_lesson_plans')
          .select('student_id, week_start, target_units, goals, notes')
          .order('week_start', { ascending: false }).range(f, t),
        'rcc.diag_lesson_plans',
      );
      lessonAtts = await fetchAll<DiagAtt>(
        (f, t) => rcc.from('diag_meeting_attendances')
          .select('student_id, meeting_id, attendance, target_units, homeroom_note')
          .range(f, t),
        'rcc.diag_meeting_attendances',
      );
      lessonScores = await fetchAll<DiagScore>(
        (f, t) => rcc.from('diag_unit_scores')
          .select('student_id, meeting_id, mathsecr_code, score').range(f, t),
        'rcc.diag_unit_scores',
      );
      const lessonMeetings = await fetchAll<{ id: string; meet_date: string }>(
        (f, t) => rcc.from('diag_class_meetings').select('id, meet_date').range(f, t), 'rcc.diag_class_meetings',
      );
      for (const r of lessonMeetings) meetingDate.set(r.id, r.meet_date);
      console.log(`[export] rcc 연동: 등록 ${lessonEnrolls.length} · 플랜 ${lessonPlans.length} · 출결 ${lessonAtts.length} · 단원점수 ${lessonScores.length}`);
    } catch (e) {
      console.warn('[export] rcc(개별수업) 조회 실패 — 섹션 생략:', (e as Error).message);
    }
  } else {
    console.log('[export] RCC_SUPABASE_SERVICE_KEY 없음 — 개별수업 섹션 생략');
  }

  // 5) 단원 상태 (α/β/γ)
  const nodeStats = await fetchAll<NodeStat>(
    (f, t) => diag().from('student_node_status')
      .select('student_id, mathsecr_code, status, last_score, items_total, items_correct, dominant_error_cause, last_tested_at')
      .range(f, t),
    'diag.student_node_status',
  );

  // 6) 등장하는 mathsecr 코드의 이름 조회 (rcc 단원점수 코드 포함)
  const codes = Array.from(new Set([
    ...nodeStats.map((n) => n.mathsecr_code),
    ...resultCodes,
    ...lessonScores.map((s) => s.mathsecr_code),
  ].filter(Boolean)));
  const msNodes = new Map<string, MsNode>();
  for (const ids of chunk(codes, 100)) {
    const rows = await fetchAll<MsNode>(
      (f, t) => sb.from('mathsecr_types')
        .select('code, subject_name, level1_name, level2_name, level3_name, level4_name')
        .in('code', ids).range(f, t),
      'mathsecr_types',
    );
    for (const r of rows) msNodes.set(r.code, r);
  }
  const msName = (code: string): string => {
    const n = msNodes.get(code);
    if (!n) return code;
    return n.level4_name || n.level3_name || n.level2_name || n.level1_name || n.subject_name || code;
  };
  const msPath = (code: string): string => {
    const n = msNodes.get(code);
    if (!n) return code;
    return [n.subject_name, n.level1_name, n.level2_name, n.level3_name, n.level4_name]
      .filter(Boolean).join(' > ');
  };
  // 단원 노트 파일명 — 이름 중복 대비 코드 suffix
  const unitFile = (code: string) => safeName(`${msName(code)} (${code})`);

  // ─── 인덱스 빌드 ───
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const instById = new Map(insts.map((i) => [i.id, i]));
  const byStudent = {
    prints: new Map<string, PrintSess[]>(),
    nodes: new Map<string, NodeStat[]>(),
    errors: new Map<string, Map<string, number>>(),
  };
  for (const p of printSessions) {
    (byStudent.prints.get(p.student_id) ?? byStudent.prints.set(p.student_id, []).get(p.student_id)!).push(p);
  }
  for (const n of nodeStats) {
    (byStudent.nodes.get(n.student_id) ?? byStudent.nodes.set(n.student_id, []).get(n.student_id)!).push(n);
  }
  // 오답 원인 프로필 — B 결과에서 (error_cause 는 양쪽 다 같은 이름의 컬럼)
  const sessOwner = new Map(printSessions.map((s) => [s.id, s.student_id]));
  for (const it of errorRows) {
    if (it.is_correct || !it.error_cause) continue;
    const sid = sessOwner.get(it.session_id);
    if (!sid) continue;
    const m = byStudent.errors.get(sid) || new Map<string, number>();
    m.set(it.error_cause, (m.get(it.error_cause) || 0) + 1);
    byStudent.errors.set(sid, m);
  }
  // 개별수업 인덱스 — 키는 정규화 전화번호 (rcc student_id)
  const lessonEnrollBy = new Map<string, DiagEnroll[]>();
  for (const e of lessonEnrolls) {
    const k = normPhone(e.student_id); if (!k) continue;
    (lessonEnrollBy.get(k) ?? lessonEnrollBy.set(k, []).get(k)!).push(e);
  }
  const lessonPlanBy = new Map<string, DiagPlan[]>();
  for (const p of lessonPlans) {
    const k = normPhone(p.student_id); if (!k) continue;  // 데모 시드(STU0xxx)는 숫자 없음 → 자동 제외
    (lessonPlanBy.get(k) ?? lessonPlanBy.set(k, []).get(k)!).push(p);
  }
  const lessonAttBy = new Map<string, DiagAtt[]>();
  for (const a of lessonAtts) {
    const k = normPhone(a.student_id); if (!k) continue;
    (lessonAttBy.get(k) ?? lessonAttBy.set(k, []).get(k)!).push(a);
  }
  const lessonScoreBy = new Map<string, DiagScore[]>();
  for (const s of lessonScores) {
    const k = normPhone(s.student_id); if (!k) continue;
    (lessonScoreBy.get(k) ?? lessonScoreBy.set(k, []).get(k)!).push(s);
  }
  const ATT_KO: Record<string, string> = { present: '출석', late: '지각', absent: '결석', makeup: '보강' };
  // rcc 매칭 추적 — 본 users 전화와 매칭된 전화 집합 (HOME 미매칭 리포트용)
  const matchedRccPhones = new Set<string>();

  // ─── 학생 노트 생성 ───
  ensureDir(VAULT);
  const usedCodes = new Set<string>();
  let written = 0;
  const centerStudents = new Map<string, Array<{ link: string; student: Student; weak: number }>>();

  for (const st of students) {
    const inst = st.institute_id ? instById.get(st.institute_id) : undefined;
    const org = inst?.organization_id ? orgName.get(inst.organization_id) : undefined;
    const orgDir = safeName(org || '미지정학원');
    const instDir = safeName(inst?.name || '미지정센터');
    const dir = path.join(VAULT, orgDir, instDir, '학생');
    ensureDir(dir);

    const fileBase = safeName(`${st.full_name || '무명'} (${st.id.slice(0, 8)})`);
    const filePath = path.join(dir, fileBase + '.md');
    const manual = preserveManual(filePath);

    const nodes = (byStudent.nodes.get(st.id) || []);
    const weak = nodes.filter((n) => n.status === 'gamma');
    const mid = nodes.filter((n) => n.status === 'beta');
    const good = nodes.filter((n) => n.status === 'alpha');
    nodes.forEach((n) => usedCodes.add(n.mathsecr_code));

    const prints = byStudent.prints.get(st.id) || [];
    const errProfile = Array.from((byStudent.errors.get(st.id) || new Map()).entries())
      .sort((a, b) => b[1] - a[1]);

    const lines: string[] = [];
    lines.push('---');
    lines.push(`student_id: ${st.id}`);
    lines.push(`학원: "${org || '미지정'}"`);
    lines.push(`센터: "${inst?.name || '미지정'}"`);
    lines.push(`학년: ${st.grade ?? '미상'}`);
    if (st.phone) lines.push(`연락처: "${st.phone}"`);
    lines.push(`약점단원: ${weak.length}`);
    lines.push(`갱신일: ${today}`);
    lines.push('tags: [학생]');
    lines.push('---');
    lines.push('');
    lines.push(`# ${st.full_name || '무명'}`);
    lines.push('');
    lines.push(`> [!info] 자동 생성 노트 — 데이터 수정은 웹에서. 메모는 맨 아래 ✍️ 영역에.`);
    lines.push('');

    // 단원 상태
    lines.push(`## 단원 상태 (🔴 ${weak.length} · 🟡 ${mid.length} · 🟢 ${good.length})`);
    lines.push('');
    if (weak.length > 0) {
      lines.push('### 🔴 약점 단원');
      lines.push('| 단원 | 정답률 | 문항 | 주 오답원인 | 최근 |');
      lines.push('|------|--------|------|------------|------|');
      for (const n of weak.sort((a, b) => (a.last_score ?? 0) - (b.last_score ?? 0))) {
        lines.push(`| [[${unitFile(n.mathsecr_code)}\\|${msName(n.mathsecr_code)}]] | ${n.last_score ?? '-'}% | ${n.items_correct}/${n.items_total} | ${n.dominant_error_cause ?? '-'} | ${fmtDate(n.last_tested_at)} |`);
      }
      lines.push('');
    }
    if (mid.length > 0) {
      lines.push('### 🟡 보통 단원');
      lines.push(mid.map((n) => `[[${unitFile(n.mathsecr_code)}\\|${msName(n.mathsecr_code)}]]`).join(' · '));
      lines.push('');
    }
    if (good.length > 0) {
      lines.push('### 🟢 우수 단원');
      lines.push(good.map((n) => `[[${unitFile(n.mathsecr_code)}\\|${msName(n.mathsecr_code)}]]`).join(' · '));
      lines.push('');
    }
    if (nodes.length === 0) {
      lines.push('_진단 데이터 없음_');
      lines.push('');
    }

    // 오답 원인
    if (errProfile.length > 0) {
      lines.push('## 오답 원인 프로필');
      lines.push(errProfile.map(([c, n]) => `**${c}** ${n}회`).join(' · '));
      lines.push('');
    }

    // 개별수업 (rcc 연동 — 전화번호 매칭, 데이터 있을 때만)
    const phoneKey = normPhone(st.phone);
    const myEnrolls = phoneKey ? (lessonEnrollBy.get(phoneKey) || []) : [];
    const myPlans = phoneKey ? (lessonPlanBy.get(phoneKey) || []).slice(0, 3) : [];
    const myScores = phoneKey ? (lessonScoreBy.get(phoneKey) || []) : [];
    const myAtts = (phoneKey ? (lessonAttBy.get(phoneKey) || []) : [])
      .map((a) => ({ ...a, d: meetingDate.get(a.meeting_id) || '' }))
      .sort((a, b) => b.d.localeCompare(a.d))
      .slice(0, 6);
    myScores.forEach((s) => usedCodes.add(s.mathsecr_code));
    if (myEnrolls.length + myPlans.length + myAtts.length + myScores.length > 0) {
      if (phoneKey) matchedRccPhones.add(phoneKey);
      lines.push('## 개별수업 (rcc)');
      for (const e of myEnrolls) {
        lines.push(`- **${lessonClassName.get(e.class_id) || '반 미상'}** · 단계 S${e.stage} · 케어 ${e.care_weight}${e.note ? ` · ${e.note}` : ''}`);
      }
      for (const p of myPlans) {
        const units = (p.target_units || []).join(', ');
        lines.push(`- 주간 플랜(${p.week_start}): ${p.goals || '-'}${units ? ` — ${units}` : ''}${p.notes ? ` _(${p.notes})_` : ''}`);
      }
      // 단원별 점수 (rcc diag_unit_scores) — 최근 회차 우선
      if (myScores.length > 0) {
        const scored = myScores
          .map((s) => ({ ...s, d: meetingDate.get(s.meeting_id) || '' }))
          .sort((a, b) => b.d.localeCompare(a.d))
          .slice(0, 12);
        lines.push('');
        lines.push('**단원별 점수**');
        lines.push('| 일자 | 단원 | 점수 |');
        lines.push('|------|------|------|');
        for (const s of scored) {
          lines.push(`| ${s.d || '-'} | [[${unitFile(s.mathsecr_code)}\\|${msName(s.mathsecr_code)}]] | ${s.score}점 |`);
        }
      }
      if (myAtts.length > 0) {
        lines.push('');
        lines.push('**수업 기록**');
        lines.push('| 일자 | 출결 | 단원 | 수업 메모 |');
        lines.push('|------|------|------|----------|');
        for (const a of myAtts) {
          lines.push(`| ${a.d || '-'} | ${ATT_KO[a.attendance] || a.attendance} | ${(a.target_units || []).join(', ') || '-'} | ${(a.homeroom_note || '-').replace(/\|/g, '·').replace(/\n/g, ' ')} |`);
        }
      }
      lines.push('');
    }

    // 이력
    lines.push('## 진단·시험 이력');
    if (prints.length === 0) {
      lines.push('_이력 없음_');
    } else {
      lines.push('| 일자 | 유형 | 이름 | 점수 |');
      lines.push('|------|------|------|------|');
      const merged: Array<{ d: string | null; type: string; name: string; score: string }> = [];
      for (const p of prints) {
        const sc = printScore.get(p.id);
        merged.push({
          d: p.completed_at || p.issued_at, type: (p.session_type || 'QR') + (p.round_number ? ` R${p.round_number}` : ''),
          name: p.exam_id ? (examTitle.get(p.exam_id) || '-') : '-',
          score: sc ? `${sc.c}/${sc.t} (${Math.round((sc.c / Math.max(sc.t, 1)) * 100)}%)` : '-',
        });
      }
      merged.sort((a, b) => (b.d || '').localeCompare(a.d || ''));
      for (const m of merged) {
        lines.push(`| ${fmtDate(m.d)} | ${m.type} | ${safeName(m.name)} | ${m.score} |`);
      }
    }
    lines.push('');
    lines.push('---');
    lines.push(MANUAL_MARKER);
    lines.push(manual || '\n## ✍️ 상담·관찰 메모\n\n- ');

    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    written += 1;

    const key = `${orgDir}/${instDir}`;
    (centerStudents.get(key) ?? centerStudents.set(key, []).get(key)!)
      .push({ link: fileBase, student: st, weak: weak.length });
  }

  // ─── 단원 노트 (등장 코드만) ───
  const unitDir = path.join(VAULT, '단원');
  ensureDir(unitDir);
  let unitCount = 0;
  for (const code of usedCodes) {
    const p = path.join(unitDir, unitFile(code) + '.md');
    const body = [
      '---',
      `code: ${code}`,
      'tags: [단원]',
      '---',
      '',
      `# ${msName(code)}`,
      '',
      `- 경로: ${msPath(code)}`,
      `- 코드: \`${code}\``,
      '',
      '> 이 단원이 약한 학생은 우측 **백링크** 패널에서 확인하세요.',
      '',
    ].join('\n');
    fs.writeFileSync(p, body, 'utf-8');
    unitCount += 1;
  }

  // ─── 센터 요약 + HOME ───
  for (const [key, list] of centerStudents) {
    const [orgDir, instDir] = key.split('/');
    const p = path.join(VAULT, orgDir, instDir, '_센터요약.md');
    const lines = [
      '---', 'tags: [센터]', `갱신일: ${today}`, '---', '',
      `# ${instDir} (${list.length}명)`, '',
      '| 학생 | 학년 | 약점 단원 |', '|------|------|----------|',
      ...list.sort((a, b) => b.weak - a.weak).map((e) =>
        `| [[${e.link}]] | ${e.student.grade ?? '-'} | ${e.weak > 0 ? '🔴 ' + e.weak : '-'} |`),
      '',
    ];
    fs.writeFileSync(p, lines.join('\n'), 'utf-8');
  }
  // rcc 미매칭 학생 — 본 users 에 전화번호 일치가 없어 노트에 못 붙은 등록
  const rccUnmatched: string[] = [];
  if (rcc) {
    const seen = new Set<string>();
    for (const e of lessonEnrolls) {
      const k = normPhone(e.student_id);
      if (!k || matchedRccPhones.has(k) || seen.has(k)) continue;
      seen.add(k);
      const ename = (e as DiagEnroll & { student_name?: string }).student_name;
      rccUnmatched.push(`${ename || '이름?'} (${e.student_id})`);
    }
  }

  const home = [
    '---', 'tags: [홈]', `갱신일: ${today}`, '---', '',
    '# 과사람 학생 위키', '',
    `- 학생 ${written}명 · 단원 노트 ${unitCount}개 · 갱신 ${today}`,
    '- 데이터 수정은 웹 대시보드(또는 rcc 개별수업 앱)에서. 이 볼트는 읽기 전용 + ✍️ 수동 메모.',
    '',
    '## 센터',
    ...Array.from(centerStudents.keys()).sort().map((k) => {
      const [o, i] = k.split('/');
      return `- ${o} / [[${o}/${i}/_센터요약\\|${i}]] (${centerStudents.get(k)!.length}명)`;
    }),
    '',
    ...(rccUnmatched.length > 0 ? [
      '## ⚠️ rcc 개별수업 — 전화번호 미매칭',
      '아래 학생은 rcc(개별수업)에 등록돼 있으나 본 시스템 users 에 같은 전화번호가 없어 노트에 연결되지 못했습니다. 웹에서 해당 학생 연락처를 맞추면 다음 갱신부터 자동 연결됩니다.',
      '',
      ...rccUnmatched.map((s) => `- ${s}`),
      '',
    ] : []),
  ];
  fs.writeFileSync(path.join(VAULT, 'HOME.md'), home.join('\n'), 'utf-8');

  console.log(`[export] 완료 — 학생 ${written}명, 단원 ${unitCount}개, 센터 ${centerStudents.size}곳`);
  console.log(`[export] 볼트: ${VAULT}`);
}

main().catch((e) => {
  console.error('[export] 실패:', e);
  process.exit(1);
});
