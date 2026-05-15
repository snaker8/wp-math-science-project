// ============================================================================
// /api/students/[id]
//
// PATCH  — 학생 정보 수정 (이름·학년·전화번호)
// DELETE — 학생 soft delete (deleted_at 박기, 학습 이력 보존)
//
// 권한:
//   ADMIN / TEACHER / TUTOR / ORG_ADMIN / super_admin — 자기 institute 학생만
//   super_admin / ORG_ADMIN — 학원 산하 모든 institute 학생
//
// 전화번호 수정 시:
//   1) phoneToStudentEmail 로 새 이메일 형식 생성
//   2) auth.users.email + public.users.email 양쪽 갱신
//   3) 새 email 이 다른 사용자와 충돌하면 거부
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess } from '@/lib/security/institute-guard';
import { phoneToStudentEmail } from '@/lib/students/phone-id';

export const dynamic = 'force-dynamic';

// 학년 normalize — POST 와 동일 로직 (옛 한글 라벨 호환)
const GRADE_LABEL_TO_INT: Record<string, number> = {
  '초1': 1, '초2': 2, '초3': 3, '초4': 4, '초5': 5, '초6': 6,
  '중1': 7, '중2': 8, '중3': 9,
  '고1': 10, '고2': 11, '고3': 12,
};
function normalizeGrade(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 12 ? raw : null;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) {
      const n = parseInt(s, 10);
      return n >= 1 && n <= 12 ? n : null;
    }
    if (GRADE_LABEL_TO_INT[s] != null) return GRADE_LABEL_TO_INT[s];
  }
  return null;
}

// 자기 institute 의 학생인지 검증 + 학생 행 반환
async function loadStudentWithGuard(studentId: string, scope: import('@/lib/security/institute-guard').InstituteAccessScope) {
  if (!supabaseAdmin) {
    return { ok: false as const, status: 500, error: 'Supabase not configured' };
  }
  const { data: student, error } = await supabaseAdmin
    .from('users')
    .select('id, email, role, institute_id, full_name, phone, grade, deleted_at')
    .eq('id', studentId)
    .maybeSingle();
  if (error) {
    return { ok: false as const, status: 500, error: error.message };
  }
  if (!student) {
    return { ok: false as const, status: 404, error: '학생을 찾을 수 없습니다' };
  }
  if (student.role !== 'STUDENT') {
    return { ok: false as const, status: 400, error: '학생 계정이 아닙니다' };
  }

  try {
    assertInstituteAccess(scope, student.institute_id);
  } catch (e) {
    return { ok: false as const, status: 403, error: (e as Error).message };
  }

  return { ok: true as const, student };
}

// ----------------------------------------------------------------------------
// PATCH — 학생 정보 수정
// ----------------------------------------------------------------------------
interface PatchBody {
  fullName?: string;
  grade?: unknown;
  phone?: string | null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 수정 권한 없음' }, { status: 403 });
  }

  const { studentId } = await params;
  const guard = await loadStudentWithGuard(studentId, scope);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const student = guard.student;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  let newEmail: string | null = null;

  if (body.fullName !== undefined) {
    const v = String(body.fullName).trim();
    if (!v) {
      return NextResponse.json({ error: '이름은 비울 수 없습니다' }, { status: 400 });
    }
    updates.full_name = v;
  }

  if (body.grade !== undefined) {
    updates.grade = normalizeGrade(body.grade);
  }

  if (body.phone !== undefined) {
    const phoneStr = (body.phone ?? '').toString().trim();
    if (phoneStr) {
      const candidateEmail = phoneToStudentEmail(phoneStr);
      if (!candidateEmail) {
        return NextResponse.json({ error: '전화번호 형식이 올바르지 않습니다' }, { status: 400 });
      }
      // 중복 검사 — 다른 user 가 이미 같은 email 사용 중인지
      if (candidateEmail !== student.email && supabaseAdmin) {
        const { data: dup } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', candidateEmail)
          .neq('id', studentId)
          .maybeSingle();
        if (dup) {
          return NextResponse.json({
            error: '이미 등록된 전화번호입니다',
          }, { status: 400 });
        }
        newEmail = candidateEmail;
      }
      updates.phone = phoneStr;
    } else {
      updates.phone = null;
    }
  }

  if (Object.keys(updates).length === 0 && !newEmail) {
    return NextResponse.json({ ok: true, noop: true });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // 전화번호 변경 시 — auth.users.email 도 갱신
  if (newEmail) {
    const { error: authUpdErr } = await supabaseAdmin.auth.admin.updateUserById(studentId, {
      email: newEmail,
      email_confirm: true,
    });
    if (authUpdErr) {
      return NextResponse.json({ error: `auth 갱신 실패: ${authUpdErr.message}` }, { status: 500 });
    }
    updates.email = newEmail;
  }

  // public.users 갱신
  const { error: pubErr } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', studentId);
  if (pubErr) {
    return NextResponse.json({ error: pubErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ----------------------------------------------------------------------------
// DELETE — 학생 soft delete
//   deleted_at 박음 → 학습 이력 보존, 목록에서 자동 숨김 (loadStudents 가
//   deleted_at IS NULL 필터). 복구는 어드민 SQL 또는 추후 별도 UI.
//   auth.users 는 그대로 유지 (학생 로그인은 막혀야 하므로 ban_duration 적용).
// ----------------------------------------------------------------------------
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;

  const allowedRoles = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];
  if (!user.role || !allowedRoles.includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden — 삭제 권한 없음' }, { status: 403 });
  }

  const { studentId } = await params;
  const guard = await loadStudentWithGuard(studentId, scope);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // public.users.deleted_at 박음 (soft delete)
  const { error: pubErr } = await supabaseAdmin
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', studentId);
  if (pubErr) {
    return NextResponse.json({ error: pubErr.message }, { status: 500 });
  }

  // auth.users — 로그인 차단 (banned_until = 100년 후, 효과적으로 무기한)
  const banUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseAdmin.auth.admin.updateUserById(studentId, {
    ban_duration: '876000h', // 100년
  }).catch((e) => {
    // ban 실패해도 deleted_at 으로 목록은 숨겨지므로 치명적이지 않음
    console.warn('[students DELETE] auth ban 실패 (deleted_at 만 적용):', e);
  });

  return NextResponse.json({ ok: true, soft_deleted: true });
}
