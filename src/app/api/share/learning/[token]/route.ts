// ============================================================================
// GET /api/share/learning/[token] — 학부모 학습 리포트 (로그인 불필요)
// ----------------------------------------------------------------------------
// parent_share_tokens(report_kind='learning', set_key='days:N', exam_ids=반 id) 검증 →
// 그 시점 기준 최근 N일 학습 이력 + 요약. 열 때마다 다시 계산하는 「살아 있는 리포트」.
// 학생 신원: token.student_id 가 user 면 승격 전 roster id 도 같은 학생.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { buildStudentHistory } from '@/lib/class/student-history';

export const dynamic = 'force-dynamic';

interface RouteParams { params: Promise<{ token: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { token } = await params;
  if (!supabaseAdmin || !token) return NextResponse.json({ error: '준비되지 않았습니다' }, { status: 503 });
  const sb = supabaseAdmin;
  const { data: row } = await sb.from('parent_share_tokens')
    .select('token, student_id, set_key, exam_ids, report_kind, is_active, expires_at, label, note')
    .eq('token', token).maybeSingle();
  if (!row) return NextResponse.json({ error: '링크를 찾을 수 없습니다' }, { status: 404 });
  const t = row as { student_id: string; set_key: string | null; exam_ids: string | null; report_kind: string; is_active: boolean; expires_at: string | null; label: string | null; note: string | null };
  if (t.report_kind !== 'learning') return NextResponse.json({ error: '학습 리포트 링크가 아닙니다' }, { status: 400 });
  if (!t.is_active) return NextResponse.json({ error: '비활성화된 링크입니다' }, { status: 403 });
  if (t.expires_at && new Date(t.expires_at).getTime() < Date.now()) return NextResponse.json({ error: '만료된 링크입니다' }, { status: 403 });
  const days = Math.min(365, Math.max(1, Number((t.set_key ?? '').replace('days:', '')) || 7));
  const classId = t.exam_ids ?? '';

  // 학생 이름 + 신원 클러스터
  const refs = [t.student_id];
  let name = '학생'; let grade: number | null = null;
  const { data: u } = await sb.from('users').select('full_name, grade').eq('id', t.student_id).maybeSingle();
  if (u) {
    name = (u as { full_name: string | null }).full_name || '학생';
    grade = (u as { grade: number | null }).grade;
    const { data: rs } = await sb.from('roster_students').select('id').eq('promoted_user_id', t.student_id);
    for (const r of (rs ?? []) as Array<{ id: string }>) refs.push(r.id);
  } else {
    const { data: r } = await sb.from('roster_students').select('full_name, grade').eq('id', t.student_id).maybeSingle();
    if (r) { name = (r as { full_name: string | null }).full_name || '학생'; grade = (r as { grade: number | null }).grade; }
  }
  let className: string | null = null;
  if (classId) {
    const { data: c } = await sb.from('classes').select('name').eq('id', classId).maybeSingle();
    className = (c as { name: string } | null)?.name ?? null;
  }

  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { items, summary } = await buildStudentHistory(sb, classId, refs, { since, limit: 200 });

  sb.from('parent_share_tokens').update({ last_viewed_at: new Date().toISOString() }).eq('token', token)
    .then(({ error }) => { if (error) console.warn('[share/learning] last_viewed_at 실패:', error.message); });

  return NextResponse.json({
    report: {
      label: t.label, note: t.note, days, since, generatedAt: new Date().toISOString(),
      student: { name, grade }, className,
      summary,
      items: items.map((it) => ({ at: it.at, kindLabel: it.kindLabel, sub: it.sub, title: it.title, total: it.total, graded: it.graded, correct: it.correct, pct: it.pct, comment: it.comment })),
    },
  });
}
