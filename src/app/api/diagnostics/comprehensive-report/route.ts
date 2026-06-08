// ============================================================================
// GET /api/diagnostics/comprehensive-report?studentId=&setKey=
//   한 학생의 진단평가 세트(A/B/C) 합산 종합 리포트 데이터 (스태프 인증).
//
//   집계 코어는 lib/diagnostics/compute-report.ts (학부모 공개 라우트와 공용).
//   여기서는 인증 + 학생 institute 격리만 담당.
//
// 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin + 학생 institute 격리.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { computeComprehensiveReport } from '@/lib/diagnostics/compute-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
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

  const studentId = request.nextUrl.searchParams.get('studentId');
  const setKey = request.nextUrl.searchParams.get('setKey') || '';
  // 자유 조합(③) — examIds 콤마구분. 주어지면 세트 대신 그 시험지 조합으로 합산.
  const examIdsParam = request.nextUrl.searchParams.get('examIds') || '';
  const examIds = examIdsParam ? examIdsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (!studentId || (!setKey && examIds.length === 0)) {
    return NextResponse.json({ error: 'studentId + (setKey 또는 examIds) 필수' }, { status: 400 });
  }

  const effectiveSetKey = setKey || 'none::자유 조합';
  const result = await computeComprehensiveReport(
    supabaseAdmin, studentId, effectiveSetKey,
    examIds.length > 0 ? examIds : undefined,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // 학생 institute 격리 — 공통 풀(NULL) 학생은 super_admin 만
  try {
    assertInstituteAccess(scope, result.studentInstituteId);
  } catch {
    if (!scope.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json(result.payload);
}
