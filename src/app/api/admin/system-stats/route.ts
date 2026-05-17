import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // ★ super_admin only (2026-05-17) — 시스템 통계는 플랫폼 관리자 전용
  const authed = await requireSuperAdmin();
  if (!authed.ok) return authed.response;

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase admin client unavailable' },
      { status: 500 }
    );
  }

  const admin = supabaseAdmin;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  // super_admin 은 전체 — scope 한정 없음
  const scopeInstituteId: string | null = null;

  const usersQ = () => {
    let q = admin.from('users').select('*', { count: 'exact', head: true }).is('deleted_at', null);
    if (scopeInstituteId) q = q.eq('institute_id', scopeInstituteId);
    return q;
  };

  const tableQ = (table: 'problems' | 'exams') => {
    let q = admin.from(table).select('*', { count: 'exact', head: true }).is('deleted_at', null);
    if (scopeInstituteId) q = q.eq('institute_id', scopeInstituteId);
    return q;
  };

  const [
    totalRes, teachersRes, studentsRes, parentsRes,
    newWeekRes, activeDayRes, problemsRes, examsRes,
  ] = await Promise.all([
    usersQ(),
    usersQ().eq('role', 'TEACHER'),
    usersQ().eq('role', 'STUDENT'),
    usersQ().eq('role', 'PARENT'),
    usersQ().gte('created_at', weekAgo),
    usersQ().gte('last_login_at', dayAgo),
    tableQ('problems'),
    tableQ('exams'),
  ]);

  return NextResponse.json({
    scope: 'platform',
    instituteId: scopeInstituteId,
    users: {
      total: totalRes.count ?? 0,
      teachers: teachersRes.count ?? 0,
      students: studentsRes.count ?? 0,
      parents: parentsRes.count ?? 0,
      newThisWeek: newWeekRes.count ?? 0,
      activeLast24h: activeDayRes.count ?? 0,
    },
    content: {
      problems: problemsRes.count ?? 0,
      exams: examsRes.count ?? 0,
    },
    generatedAt: now.toISOString(),
  });
}
