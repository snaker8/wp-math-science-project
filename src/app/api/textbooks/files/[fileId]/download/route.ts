// ============================================================================
// POST /api/textbooks/files/[fileId]/download — 권한 확인 후 5분짜리 내려받기 주소
// ============================================================================
//
// 보관함(textbooks)은 비공개. 권한이 있을 때만 서명 주소를 만들고, 누가 받았는지 남긴다.
// 주소가 새도 5분 뒤에는 쓸 수 없다.

import { NextResponse } from 'next/server';
import { requireAuthScope } from '@/lib/auth/guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { allowedLevels, isTextbookManager, type TextbookAccessRow, type TextbookLevel } from '@/lib/textbooks/access';

export const dynamic = 'force-dynamic';

const SIGNED_URL_SECONDS = 300;

export async function POST(_req: Request, { params }: { params: { fileId: string } }) {
  const authed = await requireAuthScope();
  if (!authed.ok) return authed.response;
  if (!supabaseAdmin) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const { user, scope } = authed.data;

  const { data: file, error } = await supabaseAdmin
    .from('textbook_files')
    .select('id, level, file_name, storage_path')
    .eq('id', params.fileId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'DB error', message: error.message }, { status: 500 });
  if (!file) return NextResponse.json({ error: 'Not found', message: '교재 파일을 찾을 수 없습니다.' }, { status: 404 });

  const manager = isTextbookManager(user.role, scope.isSuperAdmin);
  let access: TextbookAccessRow | null = null;
  if (!manager) {
    const { data } = await supabaseAdmin
      .from('textbook_access')
      .select('can_middle, can_high, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    access = data as TextbookAccessRow | null;
  }
  if (!allowedLevels({ manager, access }).includes(file.level as TextbookLevel)) {
    return NextResponse.json(
      { error: 'Forbidden', message: `${file.level} 교재를 받을 권한이 없습니다. 관리자에게 요청해 주세요.` },
      { status: 403 },
    );
  }

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from('textbooks')
    .createSignedUrl(file.storage_path, SIGNED_URL_SECONDS, { download: file.file_name });
  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: 'File not found', message: '보관함에서 파일을 찾지 못했습니다. 관리자에게 알려 주세요.' },
      { status: 404 },
    );
  }

  // 기록 실패가 내려받기를 막지는 않는다
  await supabaseAdmin.from('textbook_downloads').insert({ user_id: user.id, file_id: file.id }).then(
    () => undefined,
    () => undefined,
  );

  return NextResponse.json({ url: signed.signedUrl, fileName: file.file_name, expiresIn: SIGNED_URL_SECONDS });
}
