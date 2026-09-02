// src/app/dashboard/prescription/lib/queries.ts
// Supabase diagnostics 스키마 + public.mathsecr_types 쿼리 헬퍼

import { supabaseBrowser } from '@/lib/supabase/client';
import type {
  MathsecrNode, DiagnosisSession, DiagnosisItem,
  StudentNodeStatus, MathsecrHeatmapRow,
  SessionType, ErrorCause,
} from './types';

function pub() {
  if (!supabaseBrowser) {
    throw new Error('Supabase 클라이언트가 구성되지 않았습니다. NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 확인 필요.');
  }
  return supabaseBrowser;
}

function diag() {
  return pub().schema('diagnostics' as never);
}

// ───────────────────────────────────────────────────────────────
// 수학비서 분류 트리 조회 (public.mathsecr_types)
// ───────────────────────────────────────────────────────────────

/**
 * 수학비서 단일 depth 노드 조회
 * @param depth 1=과목, 2=대단원, 3=중단원, 4=소단원, 5=세부유형
 * @param parentCode 해당 깊이 노드의 상위 코드 (depth=1이면 null)
 */
export async function listMathsecrChildren(
  depth: number,
  parentCode: string | null
): Promise<MathsecrNode[]> {
  let q = pub()
    .from('mathsecr_types')
    .select('*')
    .eq('depth', depth);
  if (parentCode === null) {
    q = q.is('parent_code', null);
  } else {
    q = q.eq('parent_code', parentCode);
  }
  const { data, error } = await q.order('code');
  if (error) throw error;
  return (data ?? []) as unknown as MathsecrNode[];
}

/** 과목 목록 (depth=1) — 예: 중1-1, 중1-2, 중2-1, ... */
export async function listMathsecrSubjects(): Promise<MathsecrNode[]> {
  return listMathsecrChildren(1, null);
}

/**
 * 여러 코드의 mathsecr_types 행 일괄 조회 (단원별 숙달 드릴다운용).
 * .in() 1000 한도 안전을 위해 800개씩 청크.
 */
export async function getMathsecrNodesByCodes(codes: string[]): Promise<MathsecrNode[]> {
  const unique = Array.from(new Set(codes.filter(Boolean)));
  if (unique.length === 0) return [];
  const out: MathsecrNode[] = [];
  for (let i = 0; i < unique.length; i += 800) {
    const chunk = unique.slice(i, i + 800);
    const { data, error } = await pub().from('mathsecr_types').select('*').in('code', chunk);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as MathsecrNode[]));
  }
  return out;
}

/** 특정 코드의 mathsecr_types 단일 행 조회 */
export async function getMathsecrNode(code: string): Promise<MathsecrNode | null> {
  const { data, error } = await pub()
    .from('mathsecr_types')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as MathsecrNode | null;
}

// ───────────────────────────────────────────────────────────────
// 진단 세션 · 문항 조회 (diagnostics 스키마)
// ───────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────
// ★ 신원 병합 — 한 학생이 id 두 개를 갖는다
// ───────────────────────────────────────────────────────────────
//
// 진단·채점 데이터의 student_id 는 `users.id` 일 수도, `roster_students.id` 일 수도 있다.
// 명단(roster)으로 등록해 채점한 뒤 정식 학생으로 승격하면 두 id 가 생기고,
// **데이터는 옛 roster id 에 남는다.**
//
// 사고 (2026-09-02): 처방 화면이 승격된 user id 로만 조회해서, 실제로 106건이 있는
// 학생인데 "데이터가 아직 없습니다" 로 보였다. 전체 63명·3,950건이 안 보이고 있었다.
// 진단을 아무리 해도 약점 화면이 비어 있던 원인.
//
// 서버 라우트(api/students/[studentId]/analytics)는 이미 같은 병합을 한다 —
// 이 화면만 빠져 있었다. 정책을 맞춘다.

/** studentId 와 같은 사람을 가리키는 모든 id (자기 자신 + 연결된 roster + 승격된 user). */
async function resolveStudentIds(studentId: string): Promise<string[]> {
  const ids = new Set<string>([studentId]);
  // (1) 이 user 로 승격된 roster 들 — 데이터가 여기 남아 있다
  const { data: rosters } = await pub()
    .from('roster_students')
    .select('id')
    .eq('promoted_user_id', studentId);
  for (const r of (rosters ?? []) as Array<{ id: string }>) ids.add(r.id);
  // (2) 반대로 studentId 자체가 roster id 인 경우 → 승격된 user id 도 포함
  const { data: self } = await pub()
    .from('roster_students')
    .select('promoted_user_id')
    .eq('id', studentId)
    .maybeSingle();
  const promoted = (self as { promoted_user_id: string | null } | null)?.promoted_user_id;
  if (promoted) ids.add(promoted);
  return Array.from(ids);
}

/**
 * ★ 2026-09-02 — 여기만 옛 A라인(diagnostics.sessions/items)에 남아 있다. 일부러 남겼다.
 *   이 모듈은 **담임 수동 진단 입력**(/dashboard/prescription/entry) 전용 읽기·쓰기다.
 *   시험 채점(EX)은 전부 B(print_sessions/session_results)로 옮겼지만, 수동 진단은
 *   문제(problem_id) 없이 단원코드+정오만 넣는 구조라 B 스키마에 그대로 안 들어간다.
 *
 *   실측(2026-09-02): A 세션 111개가 **전부 EX** — 이 폼으로 만들어진 세션은 0건이다.
 *   즉 지금 이 경로는 죽어 있다. 진단 이력 화면은 print_sessions 를 따로 합쳐 보여준다.
 *   ⚠ 이 폼을 실제로 쓰기 시작하면, 그 기록은 리포트·분석 화면에 **안 나온다**(B 만 읽음).
 *     쓸 거면 B 스키마로 옮기는 작업이 먼저다.
 */
export async function getStudentSessions(studentId: string): Promise<DiagnosisSession[]> {
  const ids = await resolveStudentIds(studentId);   // ★ 신원 병합
  const { data, error } = await diag()
    .from('sessions')
    .select('*')
    .in('student_id', ids)
    .order('conducted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DiagnosisSession[];
}

/**
 * QR/인쇄 채점 세션(diagnostics.print_sessions)을 진단 이력 형태(DiagnosisSession)로 정규화.
 * diagnostics.sessions(수동입력/엑셀 라인)와 별개 라인이라, 진단 페이지 이력에 합쳐 보이기 위함.
 * (시험지 제목은 public.exams 에서 일괄 매핑 → mathflat_sheet_name 자리에 노출)
 */
export async function getStudentPrintSessions(studentId: string): Promise<DiagnosisSession[]> {
  const ids = await resolveStudentIds(studentId);   // ★ 신원 병합
  const { data, error } = await diag()
    .from('print_sessions')
    .select('id, exam_id, session_type, round_number, issued_at, completed_at, duration_minutes')
    .in('student_id', ids)
    .order('issued_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string; exam_id: string | null; session_type: string;
    round_number: number | null; issued_at: string | null;
    completed_at: string | null; duration_minutes: number | null;
  }>;
  const examIds = Array.from(new Set(rows.map((r) => r.exam_id).filter(Boolean))) as string[];
  const titleById = new Map<string, string>();
  if (examIds.length > 0) {
    const { data: exams } = await pub().from('exams').select('id, title').in('id', examIds);
    for (const ex of (exams ?? []) as Array<{ id: string; title: string }>) titleById.set(ex.id, ex.title);
  }
  return rows.map((r) => ({
    id: r.id,
    student_id: studentId,
    session_type: r.session_type,
    round_no: r.round_number,
    target_grade: null,
    exam_id: r.exam_id,
    mathflat_sheet_id: r.exam_id,
    mathflat_sheet_name: r.exam_id ? (titleById.get(r.exam_id) ?? null) : null,
    conducted_at: r.completed_at || r.issued_at,
    conducted_by: null,
    duration_min: r.duration_minutes,
    note: null,
  })) as unknown as DiagnosisSession[];
}

export async function getStudentNodeStatus(studentId: string): Promise<StudentNodeStatus[]> {
  const ids = await resolveStudentIds(studentId);   // ★ 신원 병합 — 위 주석 참고
  const { data, error } = await diag()
    .from('student_node_status')
    .select('*')
    .in('student_id', ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as StudentNodeStatus[];
  if (ids.length === 1) return rows;
  // ★ 두 id 에 같은 유형이 있으면 숙달 막대가 두 번 세어진다 → 최근 것만 남긴다.
  const latest = new Map<string, StudentNodeStatus>();
  for (const r of rows) {
    const prev = latest.get(r.mathsecr_code);
    if (!prev || (r.updated_at ?? '') > (prev.updated_at ?? '')) latest.set(r.mathsecr_code, r);
  }
  return Array.from(latest.values());
}

export async function getStudentHeatmap(studentId: string): Promise<MathsecrHeatmapRow[]> {
  const ids = await resolveStudentIds(studentId);   // ★ 신원 병합
  const { data, error } = await diag()
    .from('v_student_mathsecr_heatmap')
    .select('*')
    .in('student_id', ids)
    .order('subject_code')
    .order('level1_code');
  if (error) throw error;
  return (data ?? []) as unknown as MathsecrHeatmapRow[];
}

export async function getSessionItems(sessionId: string): Promise<DiagnosisItem[]> {
  const { data, error } = await diag()
    .from('items')
    .select('*')
    .eq('session_id', sessionId)
    .order('seq');
  if (error) throw error;
  return (data ?? []) as unknown as DiagnosisItem[];
}

export async function getStudentErrorProfile(studentId: string): Promise<Array<{
  error_cause: ErrorCause;
  cnt: number;
  pct: number;
}>> {
  const ids = await resolveStudentIds(studentId);   // ★ 신원 병합
  const { data, error } = await diag()
    .from('v_student_error_profile')
    .select('*')
    .in('student_id', ids);
  if (error) throw error;
  return (data ?? []) as unknown as Array<{ error_cause: ErrorCause; cnt: number; pct: number }>;
}

// ───────────────────────────────────────────────────────────────
// WRITE
// ───────────────────────────────────────────────────────────────

export async function createSession(input: {
  student_id: string;
  session_type: SessionType;
  round_no?: number | null;
  target_grade?: number | null;
  mathflat_sheet_id?: string | null;
  mathflat_sheet_name?: string | null;
  conducted_at?: string | null;
  conducted_by?: string | null;
  duration_min?: number | null;
  note?: string | null;
}): Promise<DiagnosisSession> {
  const { data, error } = await diag()
    .from('sessions')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as DiagnosisSession;
}

export async function saveSessionItems(sessionId: string, items: Array<{
  mathsecr_code: string;
  seq: number;
  difficulty?: number | null;
  mathflat_item_id?: string | null;
  is_correct: boolean;
  error_cause?: ErrorCause | null;
  time_taken_sec?: number | null;
  note?: string | null;
}>): Promise<void> {
  if (items.length === 0) return;
  const payload = items.map((it) => ({ session_id: sessionId, ...it }));
  const { error } = await diag().from('items').insert(payload);
  if (error) throw error;
}

// ───────────────────────────────────────────────────────────────
// 선수 추적 (PostgreSQL 함수 호출)
// ───────────────────────────────────────────────────────────────

export async function traceWeaknessChain(studentId: string, rootCode: string) {
  const { data, error } = await diag().rpc('trace_weakness_chain', {
    p_student_id: studentId,
    p_root_code:  rootCode,
  });
  if (error) throw error;
  return (data ?? []) as Array<{
    depth: number;
    mathsecr_code: string;
    full_path: string;
    status: string;
    last_score: number | null;
  }>;
}
