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

export async function getStudentSessions(studentId: string): Promise<DiagnosisSession[]> {
  const { data, error } = await diag()
    .from('sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('conducted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DiagnosisSession[];
}

export async function getStudentNodeStatus(studentId: string): Promise<StudentNodeStatus[]> {
  const { data, error } = await diag()
    .from('student_node_status')
    .select('*')
    .eq('student_id', studentId);
  if (error) throw error;
  return (data ?? []) as unknown as StudentNodeStatus[];
}

export async function getStudentHeatmap(studentId: string): Promise<MathsecrHeatmapRow[]> {
  const { data, error } = await diag()
    .from('v_student_mathsecr_heatmap')
    .select('*')
    .eq('student_id', studentId)
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
  const { data, error } = await diag()
    .from('v_student_error_profile')
    .select('*')
    .eq('student_id', studentId);
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
