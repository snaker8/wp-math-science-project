import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { applyInstituteFilter } from '@/lib/security/institute-guard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/fix-exam-titles
 *
 * 제목이 sanitize(한글→_)되어 저장된 기존 exam들을 일괄 복구.
 * exam.description의 "업로드 파일: {원본명}" 패턴에서 한글 원본명을 추출해 title로 덮어씀.
 *
 * 격리: institute-guard 로 자기 institute 만 (super_admin 은 전체).
 *
 * 대상 조건:
 *   - deleted_at IS NULL
 *   - title이 3연속 이상 '_'를 포함 (sanitize된 흔적)
 *   - description에서 추출한 fileName이 한글을 포함
 *   - 추출한 fileName이 현재 title과 다름
 */
export async function POST() {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;

  const { user, scope } = authed.data;
  const isAdmin =
    user.role === 'ADMIN' || user.role === 'TEACHER' || user.role === 'TUTOR' || user.role === 'ORG_ADMIN';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase admin not configured' },
      { status: 500 }
    );
  }

  // 깨진 패턴: 3연속 이상 밑줄. institute-guard 로 격리.
  const baseQuery = supabaseAdmin
    .from('exams')
    .select('id, title, description')
    .is('deleted_at', null)
    .like('title', '%___%');
  const { data: exams, error } = await applyInstituteFilter(baseQuery, scope);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    id: string;
    oldTitle: string;
    newTitle: string | null;
    action: 'updated' | 'skipped' | 'no-description' | 'no-korean';
  }> = [];

  for (const exam of exams || []) {
    const desc = (exam.description as string | null) || '';
    const m = desc.match(/업로드\s*파일:\s*(.+?)(?:\s*\(|$)/);
    const extracted = m?.[1]?.trim() || '';

    if (!extracted) {
      results.push({ id: exam.id, oldTitle: exam.title, newTitle: null, action: 'no-description' });
      continue;
    }

    // 파일 확장자 제거
    const extractedBase = extracted.replace(/\.[^/.]+$/, '');

    // 추출된 이름에 한글이 없거나, 또 다른 sanitize 흔적이면 건너뜀
    if (!/[가-힣]/.test(extractedBase)) {
      results.push({ id: exam.id, oldTitle: exam.title, newTitle: extractedBase, action: 'no-korean' });
      continue;
    }

    if (extractedBase === exam.title) {
      results.push({ id: exam.id, oldTitle: exam.title, newTitle: extractedBase, action: 'skipped' });
      continue;
    }

    const { error: updErr } = await supabaseAdmin
      .from('exams')
      .update({ title: extractedBase })
      .eq('id', exam.id);

    if (updErr) {
      results.push({ id: exam.id, oldTitle: exam.title, newTitle: extractedBase, action: 'skipped' });
      continue;
    }

    results.push({ id: exam.id, oldTitle: exam.title, newTitle: extractedBase, action: 'updated' });
  }

  const updated = results.filter((r) => r.action === 'updated').length;
  return NextResponse.json({
    scanned: exams?.length ?? 0,
    updated,
    results,
  });
}
