// ============================================================================
// 반 학생 해석 — 등록 학생 + 신원 병합 (반 허브 탭들이 같은 학생 집합을 보게)
// ----------------------------------------------------------------------------
// 명단(roster)으로 채점한 뒤 정식 학생으로 승격하면 채점 기록은 옛 roster id 에 남는다.
// 학생 탭·숙달 탭·과제가 각자 이 병합을 따로 짜면 언젠가 한 곳만 고쳐져 숫자가 어긋난다
// (채점 라인이 둘로 갈린 사고와 같은 종류). 한 곳에서만 푼다.
// ============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';

type Admin = NonNullable<typeof supabaseAdmin>;

export interface ClassStudentsResolved {
  /** users.id — 반 등록 기준, 이름순 */
  studentIds: string[];
  /** 기록이 붙어 있을 수 있는 모든 id (users.id + 승격 전 roster id) */
  allRefs: string[];
  /** ref id → users.id */
  ownerByRef: Map<string, string>;
  /** users.id → [users.id, roster ids…] */
  refsByStudent: Map<string, string[]>;
  userById: Map<string, { id: string; full_name: string | null; email: string | null; grade: number | null }>;
}

export function displayName(u: { full_name: string | null; email: string | null } | undefined): string {
  return u?.full_name || u?.email?.split('@')[0] || '(이름 없음)';
}

/** users.grade(1~12) → 초1 / 중1 / 고1 */
export function gradeLabel(g: unknown): string {
  const n = typeof g === 'number' ? g : parseInt(String(g ?? ''), 10);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n <= 6) return `초${n}`;
  if (n <= 9) return `중${n - 6}`;
  if (n <= 12) return `고${n - 9}`;
  return String(n);
}

export async function resolveClassStudents(sb: Admin, classId: string): Promise<ClassStudentsResolved> {
  const { data: enrolls } = await sb
    .from('class_enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('status', 'ACCEPTED');
  const studentIds = Array.from(
    new Set(((enrolls ?? []) as Array<{ student_id: string }>).map((e) => e.student_id))
  );

  const userById = new Map<string, { id: string; full_name: string | null; email: string | null; grade: number | null }>();
  const refsByStudent = new Map<string, string[]>(studentIds.map((id) => [id, [id]]));
  const ownerByRef = new Map<string, string>(studentIds.map((id) => [id, id]));

  if (studentIds.length === 0) {
    return { studentIds, allRefs: [], ownerByRef, refsByStudent, userById };
  }

  const [{ data: userRows }, { data: rosters }] = await Promise.all([
    sb.from('users').select('id, full_name, email, grade').in('id', studentIds),
    sb.from('roster_students').select('id, promoted_user_id').in('promoted_user_id', studentIds),
  ]);

  for (const u of (userRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null; grade: number | null }>) {
    userById.set(u.id, u);
  }
  for (const r of (rosters ?? []) as Array<{ id: string; promoted_user_id: string }>) {
    refsByStudent.get(r.promoted_user_id)?.push(r.id);
    ownerByRef.set(r.id, r.promoted_user_id);
  }

  // 이름순 — 학원에서 부르는 순서
  studentIds.sort((a, b) => displayName(userById.get(a)).localeCompare(displayName(userById.get(b)), 'ko'));

  return { studentIds, allRefs: Array.from(ownerByRef.keys()), ownerByRef, refsByStudent, userById };
}
