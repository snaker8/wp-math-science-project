// mathsecr_types + diag_unit_scores 쿼리

import { supabaseBrowser } from '@/lib/supabase/client';
import type { MathsecrNode, UnitScore } from './types-mathsecr';

function db() {
  if (!supabaseBrowser) throw new Error('Supabase 미구성');
  return supabaseBrowser;
}

// ────────────────────────────────────────
// mathsecr 트리 조회 (cascade picker용)
// ────────────────────────────────────────

export async function listMathsecrSubjects(): Promise<MathsecrNode[]> {
  const { data, error } = await db()
    .from('mathsecr_types')
    .select('*')
    .eq('depth', 1)
    .order('subject_code');
  if (error) throw error;
  return (data ?? []) as unknown as MathsecrNode[];
}

export async function listMathsecrChildren(parentCode: string): Promise<MathsecrNode[]> {
  const { data, error } = await db()
    .from('mathsecr_types')
    .select('*')
    .eq('parent_code', parentCode)
    .order('code');
  if (error) throw error;
  return (data ?? []) as unknown as MathsecrNode[];
}

export async function getMathsecrNode(code: string): Promise<MathsecrNode | null> {
  const { data, error } = await db()
    .from('mathsecr_types')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as MathsecrNode | null;
}

export async function getMathsecrNodes(codes: string[]): Promise<MathsecrNode[]> {
  if (codes.length === 0) return [];
  const { data, error } = await db()
    .from('mathsecr_types')
    .select('*')
    .in('code', codes);
  if (error) throw error;
  return (data ?? []) as unknown as MathsecrNode[];
}

// ────────────────────────────────────────
// 단원별 점수 (diag_unit_scores)
// ────────────────────────────────────────

export async function upsertUnitScore(input: {
  meeting_id: string;
  student_id: string;
  mathsecr_code: string;
  score: number;
  problems_total?: number | null;
  problems_correct?: number | null;
  note?: string | null;
}): Promise<UnitScore> {
  const { data, error } = await db()
    .from('diag_unit_scores')
    .upsert(input, { onConflict: 'meeting_id,student_id,mathsecr_code' })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as UnitScore;
}

export async function deleteUnitScore(input: {
  meeting_id: string;
  student_id: string;
  mathsecr_code: string;
}): Promise<void> {
  const { error } = await db()
    .from('diag_unit_scores')
    .delete()
    .eq('meeting_id', input.meeting_id)
    .eq('student_id', input.student_id)
    .eq('mathsecr_code', input.mathsecr_code);
  if (error) throw error;
}

export async function listUnitScoresForMeeting(
  meetingId: string,
  studentId: string,
): Promise<UnitScore[]> {
  const { data, error } = await db()
    .from('diag_unit_scores')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('student_id', studentId);
  if (error) throw error;
  return (data ?? []) as unknown as UnitScore[];
}

// 회차 단위 — 전체 학생 점수를 한 번에 (그리드/칩 공유 데이터 소스)
export async function listUnitScoresForMeetingAll(
  meetingId: string,
): Promise<UnitScore[]> {
  const { data, error } = await db()
    .from('diag_unit_scores')
    .select('*')
    .eq('meeting_id', meetingId);
  if (error) throw error;
  return (data ?? []) as unknown as UnitScore[];
}

export async function listStudentUnitScores(
  studentId: string,
  limit = 200,
): Promise<Array<UnitScore & { meet_date: string }>> {
  const { data, error } = await db()
    .from('diag_unit_scores')
    .select(`
      *,
      diag_class_meetings!inner ( meet_date )
    `)
    .eq('student_id', studentId)
    .limit(limit);
  if (error) throw error;
  // 평탄화: meet_date 를 row 에
  return ((data ?? []) as unknown as Array<UnitScore & {
    diag_class_meetings: { meet_date: string };
  }>).map((r) => ({ ...r, meet_date: r.diag_class_meetings.meet_date }));
}
