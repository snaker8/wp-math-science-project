// ============================================================================
// GET /api/diagnostics/exam-sets
//   진단평가 세트(A/B/C) 목록 + 세트별 채점 학생 목록.
//   /dashboard/prescription/report 의 세트→학생 선택기 + (Phase 2) 진입 허브 공용.
//
// 세트 식별: book_group_id + 정규화 제목(진단평가A/B/C → 진단평가).
//   book_group 만으론 한 그룹에 여러 세트가 섞임(사직여중 vs 중2-1) → 정규화 제목 병행.
//
// 학생 신원 병합: diagnostics.sessions.student_id 는 users.id 또는 roster_students.id.
//   roster_students.promoted_user_id 로 연결된 경우 정식 user 로 병합(동일 학생이
//   user 로 A, 연결 roster 로 B 친 경우 A+B 한 학생으로 집계). analytics route 와 동일.
//
// 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin. 진단 exam 은 공통 풀(institute_id NULL)
//   포함 → applyInstituteFilter(allowCommonPool).
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { applyInstituteFilter } from '@/lib/security/institute-guard';
import {
  groupExamsIntoSets,
  type DiagnosticExamRow,
} from '@/lib/diagnostics/exam-sets';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface SetStudent {
  id: string;                 // 정식(canonical) 식별자 — user 우선
  name: string;
  grade: number | null;
  source: 'user' | 'roster';
  variantsTaken: Array<string | null>;
}

export async function GET() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || (!allowedRoles.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const sb = supabaseAdmin;

  // 1) 진단 exam 목록 (공통 풀 포함 격리 필터)
  const examQuery = sb
    .from('exams')
    .select('id, title, book_group_id, institute_id')
    .eq('is_diagnostic', true);
  const { data: examRows, error: examErr } = await applyInstituteFilter(
    examQuery,
    scope,
    { allowCommonPool: true },
  );
  if (examErr) {
    return NextResponse.json({ error: examErr.message }, { status: 500 });
  }
  const exams = (examRows ?? []) as DiagnosticExamRow[];
  if (exams.length === 0) {
    return NextResponse.json({ sets: [] });
  }

  // 2) book_group 이름
  const bookGroupIds = Array.from(
    new Set(exams.map((e) => e.book_group_id).filter((id): id is string => !!id)),
  );
  const bookGroupNameById = new Map<string, string>();
  if (bookGroupIds.length > 0) {
    const { data: bgRows } = await sb
      .from('book_groups')
      .select('id, name')
      .in('id', bookGroupIds);
    for (const bg of (bgRows ?? []) as Array<{ id: string; name: string }>) {
      bookGroupNameById.set(bg.id, bg.name);
    }
  }

  // 3) 세트 그룹화
  const sets = groupExamsIntoSets(exams, bookGroupNameById);

  // 4) 모든 변형 exam 의 채점 세션 → 세트별 학생 집계
  const examIdToVariant = new Map<string, string | null>();
  const examIdToSetKey = new Map<string, string>();
  for (const set of sets) {
    for (const v of set.variants) {
      examIdToVariant.set(v.examId, v.variant);
      examIdToSetKey.set(v.examId, set.setKey);
    }
  }
  const allExamIds = Array.from(examIdToVariant.keys());

  // diagnostics.sessions (EX 채점) — student_id(text) + exam_id
  const { data: sessRows } = await sb
    .schema('diagnostics' as never)
    .from('sessions')
    .select('id, student_id, exam_id')
    .in('exam_id', allExamIds);
  const sessions = (sessRows ?? []) as Array<{ id: string; student_id: string; exam_id: string | null }>;

  // 채점된(items 있는) 세션만 인정 — 생성만 되고 미채점인 세션 제외
  const sessionIds = sessions.map((s) => s.id);
  const gradedSessionIds = new Set<string>();
  if (sessionIds.length > 0) {
    // chunk 로 안전하게 (in 1000 제한 회피)
    for (let i = 0; i < sessionIds.length; i += 500) {
      const chunk = sessionIds.slice(i, i + 500);
      const { data: itemRows } = await sb
        .schema('diagnostics' as never)
        .from('items')
        .select('session_id')
        .in('session_id', chunk);
      for (const it of (itemRows ?? []) as Array<{ session_id: string }>) {
        gradedSessionIds.add(it.session_id);
      }
    }
  }

  // 5) 학생 신원 해석 (users / roster_students)
  const studentIds = Array.from(new Set(sessions.map((s) => s.student_id)));
  const userById = new Map<string, { name: string; grade: number | null }>();
  const rosterById = new Map<string, { name: string; grade: number | null; promotedTo: string | null }>();
  if (studentIds.length > 0) {
    const { data: userRows } = await sb
      .from('users')
      .select('id, full_name, email, grade')
      .in('id', studentIds);
    for (const u of (userRows ?? []) as Array<{ id: string; full_name: string | null; email: string | null; grade: number | null }>) {
      userById.set(u.id, { name: u.full_name || u.email?.split('@')[0] || '(이름 없음)', grade: u.grade ?? null });
    }
    const { data: rosterRows } = await sb
      .from('roster_students')
      .select('id, full_name, grade, promoted_user_id')
      .in('id', studentIds);
    for (const r of (rosterRows ?? []) as Array<{ id: string; full_name: string | null; grade: number | null; promoted_user_id: string | null }>) {
      rosterById.set(r.id, { name: r.full_name || '(이름 없음)', grade: r.grade ?? null, promotedTo: r.promoted_user_id ?? null });
    }
    // promoted 대상 user 가 sessions 에 안 끼어 있을 수도 → 추가 조회
    const promotedTargets = Array.from(rosterById.values())
      .map((r) => r.promotedTo)
      .filter((id): id is string => !!id && !userById.has(id));
    if (promotedTargets.length > 0) {
      const { data: extraUsers } = await sb
        .from('users')
        .select('id, full_name, email, grade')
        .in('id', Array.from(new Set(promotedTargets)));
      for (const u of (extraUsers ?? []) as Array<{ id: string; full_name: string | null; email: string | null; grade: number | null }>) {
        userById.set(u.id, { name: u.full_name || u.email?.split('@')[0] || '(이름 없음)', grade: u.grade ?? null });
      }
    }
  }

  // 식별자 → 정식(canonical) 매핑 + 메타
  function resolveCanonical(studentId: string): { id: string; name: string; grade: number | null; source: 'user' | 'roster' } | null {
    const u = userById.get(studentId);
    if (u) return { id: studentId, name: u.name, grade: u.grade, source: 'user' };
    const r = rosterById.get(studentId);
    if (r) {
      if (r.promotedTo && userById.has(r.promotedTo)) {
        const pu = userById.get(r.promotedTo)!;
        return { id: r.promotedTo, name: pu.name, grade: pu.grade, source: 'user' };
      }
      return { id: studentId, name: r.name, grade: r.grade, source: 'roster' };
    }
    return null;
  }

  // 세트별 학생 집계
  const setStudents = new Map<string, Map<string, SetStudent>>(); // setKey → canonicalId → student
  for (const s of sessions) {
    if (!gradedSessionIds.has(s.id) || !s.exam_id) continue;
    const setKey = examIdToSetKey.get(s.exam_id);
    if (!setKey) continue;
    const canon = resolveCanonical(s.student_id);
    if (!canon) continue;
    const variant = examIdToVariant.get(s.exam_id) ?? null;
    let perSet = setStudents.get(setKey);
    if (!perSet) { perSet = new Map(); setStudents.set(setKey, perSet); }
    let stu = perSet.get(canon.id);
    if (!stu) {
      stu = { id: canon.id, name: canon.name, grade: canon.grade, source: canon.source, variantsTaken: [] };
      perSet.set(canon.id, stu);
    }
    if (!stu.variantsTaken.includes(variant)) stu.variantsTaken.push(variant);
  }

  const variantRank: Record<string, number> = { A: 0, B: 1, C: 2 };
  const payloadSets = sets.map((set) => {
    const students = Array.from(setStudents.get(set.setKey)?.values() ?? []);
    for (const stu of students) {
      stu.variantsTaken.sort((a, b) => (variantRank[a ?? 'Z'] ?? 9) - (variantRank[b ?? 'Z'] ?? 9));
    }
    students.sort((a, b) => b.variantsTaken.length - a.variantsTaken.length || a.name.localeCompare(b.name));
    return {
      setKey: set.setKey,
      bookGroupId: set.bookGroupId,
      bookGroupName: set.bookGroupName,
      setTitle: set.setTitle,
      variants: set.variants,
      gradedStudentCount: students.length,
      students,
    };
  })
  // 채점 학생이 있는 세트 먼저, 그 안에서 변형 많은 순
  .sort((a, b) => b.gradedStudentCount - a.gradedStudentCount || a.setTitle.localeCompare(b.setTitle));

  return NextResponse.json({ sets: payloadSets });
}
