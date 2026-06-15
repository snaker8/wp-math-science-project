// ============================================================================
// POST /api/workflow/import-hml
//   한글 .hml(HWP ML, 수학비서 내보내기) 파일 → 직접 파싱 → 클라우드 시험지 저장.
//   LibreOffice/OCR/AI 분류 없음(비용 0). 검수·수정은 클라우드 펼쳐보기에서.
//
//   form-data: file(.hml), bookGroupId?(저장 폴더), sourceCategory?
//   반환: { examId, savedProblems } 또는 { error }
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { isSharedLibraryMode, isOrgIsolatedAssets } from '@/lib/security/institute-guard';
import { parseHml } from '@/lib/workflow/hml-parser';
import { createExamFromHml } from '@/lib/workflow/hml-save';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const ALLOWED_ROLES = ['ADMIN', 'TEACHER', 'TUTOR', 'ORG_ADMIN'];

export async function POST(request: NextRequest) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  const { user, scope } = authed.data;
  if (!user.role || (!ALLOWED_ROLES.includes(user.role) && !scope.isSuperAdmin)) {
    return NextResponse.json({ error: 'Forbidden — 권한 없음' }, { status: 403 });
  }
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  if (!user.id) {
    return NextResponse.json({ error: '로그인이 필요합니다 (created_by 없음)' }, { status: 401 });
  }

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'form-data 필요' }, { status: 400 }); }
  const file = form.get('file') as File | null;
  if (!file || !file.name) return NextResponse.json({ error: '파일이 필요합니다' }, { status: 400 });
  if (!/\.hml$/i.test(file.name)) {
    return NextResponse.json({ error: '.hml 파일만 지원합니다 (.hwp/.hwpx 는 한글에서 .hml 또는 PDF 로 저장)' }, { status: 400 });
  }
  const bookGroupId = (form.get('bookGroupId') as string) || null;
  const sourceCategory = ((form.get('sourceCategory') as string) || 'auto') as 'auto' | 'school' | 'diagnostic' | 'achievement' | 'textbook' | 'mock';

  // 파싱
  let parsed;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    parsed = parseHml(buf);
  } catch (e) {
    return NextResponse.json({ error: `HML 파싱 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 400 });
  }
  if (!parsed.problems.length) {
    return NextResponse.json({ error: 'HML 에서 문제를 추출하지 못했습니다.' }, { status: 422 });
  }

  // institute 결정 — 자산화와 동일 정책 (공유 라이브러리 / 조직 격리)
  const isolated = await isOrgIsolatedAssets(supabaseAdmin, user.id);
  const instituteId = (isSharedLibraryMode() && !isolated) ? null : (scope.instituteId ?? null);

  // 파일명 → 제목 (확장자 제거)
  const title = file.name.replace(/\.hml$/i, '').trim() || 'HML 시험지';

  const result = await createExamFromHml(supabaseAdmin, parsed, {
    createdBy: user.id,
    instituteId,
    bookGroupId,
    sourceCategory,
    title,
    sourceName: file.name,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    examId: result.examId,
    savedProblems: result.savedProblems,
    totalProblems: parsed.problems.length,
    alreadyExisted: result.alreadyExisted || false,
  });
}
