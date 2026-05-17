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

  // ★ 본부 institute 목록 — 카운트 분류 (2026-05-17)
  //   사용자 정책: "동래 본부 소속만 제외하고 ORG_ADMIN 도 강사로 인식"
  //   - 강사 카운트 = TEACHER + ORG_ADMIN(비본부)
  //   - 학원 운영자 카운트 = ORG_ADMIN(본부)
  const { data: orgsWithHq } = await admin
    .from('organizations')
    .select('headquarter_institute_id')
    .not('headquarter_institute_id', 'is', null);
  const hqIds = ((orgsWithHq || []) as Array<{ headquarter_institute_id: string | null }>)
    .map((o) => o.headquarter_institute_id)
    .filter((v): v is string => !!v);

  const [
    totalRes, teachersRes, studentsRes, parentsRes,
    newWeekRes, activeDayRes, problemsRes, examsRes,
    orgAdminAllRes, orgAdminAtHqRes,
  ] = await Promise.all([
    usersQ(),
    usersQ().eq('role', 'TEACHER'),
    usersQ().eq('role', 'STUDENT'),
    usersQ().eq('role', 'PARENT'),
    usersQ().gte('created_at', weekAgo),
    usersQ().gte('last_login_at', dayAgo),
    tableQ('problems'),
    tableQ('exams'),
    usersQ().eq('role', 'ORG_ADMIN'),
    // ORG_ADMIN 중 본부 institute 소속 (본부 미지정 organization 의 ORG_ADMIN 은 강사로 카운트됨)
    hqIds.length > 0
      ? usersQ().eq('role', 'ORG_ADMIN').in('institute_id', hqIds)
      : Promise.resolve({ count: 0 }),
  ]);

  // 강사 = TEACHER + ORG_ADMIN(비본부)
  const orgAdminAtHqCount = orgAdminAtHqRes.count ?? 0;
  const orgAdminNonHqCount = (orgAdminAllRes.count ?? 0) - orgAdminAtHqCount;
  const teachersTotal = (teachersRes.count ?? 0) + orgAdminNonHqCount;

  return NextResponse.json({
    scope: 'platform',
    instituteId: scopeInstituteId,
    users: {
      total: totalRes.count ?? 0,
      teachers: teachersTotal,
      teachersBreakdown: {
        pureTeacher: teachersRes.count ?? 0,
        orgAdminAsTeacher: orgAdminNonHqCount,
      },
      academyOperators: orgAdminAtHqCount,
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
