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
interface Sess {
  id: string; student_id: string; session_type: string; round_no: number | null;
  mathflat_sheet_name: string | null; conducted_at: string | null;
  conducted_by: string | null; note: string | null;
}
interface Item { session_id: string; mathsecr_code: string; is_correct: boolean; error_cause: string | null }
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

  // 2) 진단 세션 (수동입력/엑셀 라인)
  const sessions = await fetchAll<Sess>(
    (f, t) => diag().from('sessions')
      .select('id, student_id, session_type, round_no, mathflat_sheet_name, conducted_at, conducted_by, note')
      .order('conducted_at', { ascending: false }).range(f, t),
    'diag.sessions',
  );

  // 3) 세션 문항 → 세션별 점수 + 학생별 오답 원인
  const items: Item[] = [];
  for (const ids of chunk(sessions.map((s) => s.id), 100)) {
    items.push(...await fetchAll<Item>(
      (f, t) => diag().from('items').select('session_id, mathsecr_code, is_correct, error_cause')
        .in('session_id', ids).range(f, t),
      'diag.items',
    ));
  }
  const sessScore = new Map<string, { c: number; t: number }>();
  for (const it of items) {
    const s = sessScore.get(it.session_id) || { c: 0, t: 0 };
    s.t += 1; if (it.is_correct) s.c += 1;
    sessScore.set(it.session_id, s);
  }

  // 4) QR/인쇄 채점 세션 + 결과 + 시험지 제목
  const printSessions = await fetchAll<PrintSess>(
    (f, t) => diag().from('print_sessions')
      .select('id, student_id, exam_id, session_type, round_number, issued_at, completed_at')
      .order('issued_at', { ascending: false }).range(f, t),
    'diag.print_sessions',
  );
  const printScore = new Map<string, { c: number; t: number }>();
  for (const ids of chunk(printSessions.map((p) => p.id), 100)) {
    const rows = await fetchAll<{ session_id: string; is_correct: boolean }>(
      (f, t) => diag().from('session_results').select('session_id, is_correct').in('session_id', ids).range(f, t),
      'diag.session_results',
    );
    for (const r of rows) {
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

  // 5) 단원 상태 (α/β/γ)
  const nodeStats = await fetchAll<NodeStat>(
    (f, t) => diag().from('student_node_status')
      .select('student_id, mathsecr_code, status, last_score, items_total, items_correct, dominant_error_cause, last_tested_at')
      .range(f, t),
    'diag.student_node_status',
  );

  // 6) 등장하는 mathsecr 코드의 이름 조회
  const codes = Array.from(new Set([
    ...nodeStats.map((n) => n.mathsecr_code),
    ...items.map((i) => i.mathsecr_code),
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
    sessions: new Map<string, Sess[]>(),
    prints: new Map<string, PrintSess[]>(),
    nodes: new Map<string, NodeStat[]>(),
    errors: new Map<string, Map<string, number>>(),
  };
  for (const s of sessions) {
    (byStudent.sessions.get(s.student_id) ?? byStudent.sessions.set(s.student_id, []).get(s.student_id)!).push(s);
  }
  for (const p of printSessions) {
    (byStudent.prints.get(p.student_id) ?? byStudent.prints.set(p.student_id, []).get(p.student_id)!).push(p);
  }
  for (const n of nodeStats) {
    (byStudent.nodes.get(n.student_id) ?? byStudent.nodes.set(n.student_id, []).get(n.student_id)!).push(n);
  }
  const sessOwner = new Map(sessions.map((s) => [s.id, s.student_id]));
  for (const it of items) {
    if (it.is_correct || !it.error_cause) continue;
    const sid = sessOwner.get(it.session_id);
    if (!sid) continue;
    const m = byStudent.errors.get(sid) || new Map<string, number>();
    m.set(it.error_cause, (m.get(it.error_cause) || 0) + 1);
    byStudent.errors.set(sid, m);
  }

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

    const sess = byStudent.sessions.get(st.id) || [];
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

    // 이력
    lines.push('## 진단·시험 이력');
    if (sess.length + prints.length === 0) {
      lines.push('_이력 없음_');
    } else {
      lines.push('| 일자 | 유형 | 이름 | 점수 |');
      lines.push('|------|------|------|------|');
      const merged: Array<{ d: string | null; type: string; name: string; score: string }> = [];
      for (const s of sess) {
        const sc = sessScore.get(s.id);
        merged.push({
          d: s.conducted_at, type: s.session_type + (s.round_no ? ` R${s.round_no}` : ''),
          name: s.mathflat_sheet_name || '-',
          score: sc ? `${sc.c}/${sc.t} (${Math.round((sc.c / Math.max(sc.t, 1)) * 100)}%)` : '-',
        });
      }
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
  const home = [
    '---', 'tags: [홈]', `갱신일: ${today}`, '---', '',
    '# 과사람 학생 위키', '',
    `- 학생 ${written}명 · 단원 노트 ${unitCount}개 · 갱신 ${today}`,
    '- 데이터 수정은 웹 대시보드에서. 이 볼트는 읽기 전용 + ✍️ 수동 메모.',
    '',
    '## 센터',
    ...Array.from(centerStudents.keys()).sort().map((k) => {
      const [o, i] = k.split('/');
      return `- ${o} / [[${o}/${i}/_센터요약\\|${i}]] (${centerStudents.get(k)!.length}명)`;
    }),
    '',
  ];
  fs.writeFileSync(path.join(VAULT, 'HOME.md'), home.join('\n'), 'utf-8');

  console.log(`[export] 완료 — 학생 ${written}명, 단원 ${unitCount}개, 센터 ${centerStudents.size}곳`);
  console.log(`[export] 볼트: ${VAULT}`);
}

main().catch((e) => {
  console.error('[export] 실패:', e);
  process.exit(1);
});
