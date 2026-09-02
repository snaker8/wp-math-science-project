// ============================================================================
// GET    /api/diagnostics/report-tokens?studentId=
//   학생 1명의 학부모 공유링크 발급 내역 (수업>보고서 탭 허브용). 2개 소스 합산:
//     1) parent_share_tokens — report_kind='diagnostic_set'(세트 종합) / 'pitfall'(함정)
//     2) diagnostics.sessions.share_token — 개별 시험지 리포트 (/share/student-report)
//   학생 신원 병합: studentId(canon, user 우선) + promoted_user_id 로 연결된 roster id 들.
//
// DELETE /api/diagnostics/report-tokens
//   body: { kind: 'parent_token', ref: token } → is_active=false
//         { kind: 'exam_session', ref: sessionId } → share_token=NULL
//
// 권한: ADMIN/TEACHER/TUTOR/ORG_ADMIN/super_admin + 학생 institute 격리.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { assertInstituteAccess, type InstituteAccessScope } from '@/lib/security/institute-guard';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];

export interface ShareTokenItem {
  kind: 'diagnostic_set' | 'pitfall' | 'exam';
  /** 공유 URL 경로 (origin 제외) */
  path: string;
  /** 표시 제목 — 세트명 / 시험지명 / 라벨 */
  title: string;
  label: string | null;
  createdAt: string | null;   // exam kind 는 응시일(conducted_at)
  expiresAt: string | null;
  isActive: boolean;
  lastViewedAt: string | null; // exam kind 는 추적 없음 → null
  /** 회수용 참조 — parent_token: token / exam_session: session id */
  revokeKind: 'parent_token' | 'exam_session';
  revokeRef: string;
}

/** 학생 institute 격리 + 신원 클러스터(user + 연결 roster id) 해석 */
async function resolveStudentCluster(
  sb: SupabaseClient,
  scope: InstituteAccessScope,
  studentId: string,
): Promise<{ ids: string[] } | { error: NextResponse }> {
  let instituteId: string | null = null;
  const ids = [studentId];

  const { data: u } = await sb.from('users').select('institute_id').eq('id', studentId).maybeSingle();
  if (u) {
    instituteId = (u as { institute_id: string | null }).institute_id;
    // 이 user 로 promoted 된 roster id 들도 같은 학생 (엑셀 채점 세션이 roster id 로 박힘)
    const { data: rosters } = await sb
      .from('roster_students').select('id').eq('promoted_user_id', studentId);
    for (const r of (rosters || []) as Array<{ id: string }>) ids.push(r.id);
  } else {
    const { data: r } = await sb.from('roster_students').select('institute_id').eq('id', studentId).maybeSingle();
    if (!r) return { error: NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 }) };
    instituteId = (r as { institute_id: string | null }).institute_id;
  }
  try {
    assertInstituteAccess(scope, instituteId);
  } catch {
    if (!scope.isSuperAdmin) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ids };
}

export async function GET(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  if (!user.role || (!ALLOWED_ROLES.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  const studentId = request.nextUrl.searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId 필수' }, { status: 400 });

  const cluster = await resolveStudentCluster(sb, scope, studentId);
  if ('error' in cluster) return cluster.error;
  const idSet = cluster.ids;

  const tokens: ShareTokenItem[] = [];

  // ── 1) parent_share_tokens (세트 종합 / 함정 / 개별 시험[라인B]) ──
  const { data: pstRows, error: pstErr } = await sb
    .from('parent_share_tokens')
    .select('token, student_id, label, is_active, expires_at, created_at, last_viewed_at, set_key, report_kind, exam_id')
    .in('student_id', idSet)
    .order('created_at', { ascending: false });
  if (pstErr) return NextResponse.json({ error: pstErr.message }, { status: 500 });
  const pst = (pstRows || []) as Array<{
    token: string; label: string | null; is_active: boolean | null; expires_at: string | null;
    created_at: string | null; last_viewed_at: string | null; set_key: string | null;
    report_kind: string | null; exam_id: string | null;
  }>;

  // ── 2) diagnostics.sessions.share_token (개별 시험지 리포트 — 라인A 레거시) ──
  const { data: sessRows, error: sessErr } = await sb
    .schema('diagnostics' as never)
    .from('sessions')
    .select('id, exam_id, share_token, conducted_at')
    .in('student_id', idSet)
    .not('share_token', 'is', null);
  if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });
  const sessions = (sessRows || []) as Array<{ id: string; exam_id: string | null; share_token: string; conducted_at: string | null }>;

  // 시험 제목 일괄 (라인A 세션 + 라인B exam 토큰)
  const examIds = Array.from(new Set([
    ...sessions.map(s => s.exam_id),
    ...pst.filter(t => t.report_kind === 'exam').map(t => t.exam_id),
  ].filter((x): x is string => !!x)));
  const examTitle = new Map<string, string>();
  if (examIds.length > 0) {
    const { data: exams } = await sb.from('exams').select('id, title').in('id', examIds);
    for (const e of (exams || []) as Array<{ id: string; title: string }>) examTitle.set(e.id, e.title || '');
  }

  for (const t of pst) {
    const kind = t.report_kind === 'diagnostic_set' ? 'diagnostic_set' as const
      : t.report_kind === 'exam' ? 'exam' as const
      : 'pitfall' as const;
    // setKey = bookGroupId::정규화제목 → 표시용은 제목 부분
    const setTitle = t.set_key ? (t.set_key.split('::')[1] || t.set_key) : '';
    const expired = !!t.expires_at && new Date(t.expires_at).getTime() < Date.now();
    tokens.push({
      kind,
      path: kind === 'diagnostic_set' ? `/share/diagnostic-report/${t.token}`
        : kind === 'exam' ? `/share/student-report/${t.token}`
        : `/parent/${t.token}`,
      title: kind === 'diagnostic_set' ? (setTitle || '진단 세트 종합 리포트')
        : kind === 'exam' ? ((t.exam_id ? examTitle.get(t.exam_id) : '') || '개별 시험 리포트')
        : '함정 종합 리포트',
      label: t.label,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      isActive: (t.is_active ?? false) && !expired,
      lastViewedAt: t.last_viewed_at,
      revokeKind: 'parent_token',
      revokeRef: t.token,
    });
  }

  for (const s of sessions) {
    tokens.push({
      kind: 'exam',
      path: `/share/student-report/${s.share_token}`,
      title: (s.exam_id ? examTitle.get(s.exam_id) : '') || '개별 시험 리포트',
      label: null,
      createdAt: s.conducted_at,
      expiresAt: null,
      isActive: true,
      lastViewedAt: null,
      revokeKind: 'exam_session',
      revokeRef: s.id,
    });
  }

  tokens.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return NextResponse.json({ tokens });
}

export async function DELETE(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  if (!user.role || (!ALLOWED_ROLES.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const sb = supabaseAdmin;

  let body: { kind?: string; ref?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { kind, ref } = body;
  if (!ref || (kind !== 'parent_token' && kind !== 'exam_session')) {
    return NextResponse.json({ error: 'kind(parent_token|exam_session), ref 필수' }, { status: 400 });
  }

  // 대상 행의 학생 → institute 격리 검사 후 회수
  if (kind === 'parent_token') {
    const { data: row } = await sb.from('parent_share_tokens').select('token, student_id').eq('token', ref).maybeSingle();
    if (!row) return NextResponse.json({ error: '토큰을 찾을 수 없습니다' }, { status: 404 });
    const cluster = await resolveStudentCluster(sb, scope, (row as { student_id: string }).student_id);
    if ('error' in cluster) return cluster.error;
    const { error } = await sb.from('parent_share_tokens').update({ is_active: false }).eq('token', ref);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: row } = await sb
      .schema('diagnostics' as never)
      .from('sessions').select('id, student_id, share_token').eq('id', ref).maybeSingle();
    if (!row) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 });
    const cluster = await resolveStudentCluster(sb, scope, (row as { student_id: string }).student_id);
    if ('error' in cluster) return cluster.error;
    const oldToken = (row as { share_token?: string | null }).share_token ?? null;
    const { error } = await sb
      .schema('diagnostics' as never)
      .from('sessions').update({ share_token: null }).eq('id', ref);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // ★ 마이그레이션이 같은 토큰을 print_sessions 에도 복사해 뒀다(실측 11건).
    //   A 만 지우면 복사본이 남는다 — 지금은 아무도 안 읽지만, 남겨두면 언젠가 살아난다.
    if (oldToken) {
      await sb.schema('diagnostics' as never)
        .from('print_sessions').update({ share_token: null }).eq('share_token', oldToken);
    }
  }
  return NextResponse.json({ ok: true });
}
