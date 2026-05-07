// ============================================================================
// /api/users/me/track — 현재 user 의 활성 트랙 조회·변경
//
// GET   → { subject_tracks, active_subject_track }
// PATCH → body { track: 'math' | 'science' } → users.active_subject_track UPDATE
//
// 가드:
//   - 비로그인 → 401
//   - PATCH 의 track 이 subject_tracks 배열에 없으면 → 403
//   - feature flag false 여도 동작은 함 (DB 가드는 항상 유효). 다만 클라이언트는
//     SubjectTrackContext 가 flag 검사로 호출 자체를 막음.
// ============================================================================

import { NextResponse } from 'next/server';
import { createSupabaseServerClient, supabaseAdmin } from '@/lib/supabase/server';
import { isSubjectTrack, type SubjectTrack } from '@/types/track';

export const dynamic = 'force-dynamic';

async function getAuthedUserId(): Promise<{ userId: string } | { error: NextResponse }> {
  const supa = await createSupabaseServerClient();
  if (!supa) {
    return {
      error: NextResponse.json({ error: 'Supabase not configured' }, { status: 500 }),
    };
  }
  const { data: { user }, error } = await supa.auth.getUser();
  if (error || !user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { userId: user.id };
}

export async function GET() {
  const auth = await getAuthedUserId();
  if ('error' in auth) return auth.error;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('subject_tracks, active_subject_track')
    .eq('id', auth.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'User row not found' }, { status: 404 });
  }

  const rawTracks = (data as { subject_tracks: unknown }).subject_tracks;
  const subject_tracks = Array.isArray(rawTracks) ? rawTracks.filter(isSubjectTrack) : ['math'];
  const rawActive = (data as { active_subject_track: unknown }).active_subject_track;
  const active_subject_track: SubjectTrack = isSubjectTrack(rawActive) ? rawActive : 'math';

  return NextResponse.json({ subject_tracks, active_subject_track });
}

export async function PATCH(request: Request) {
  const auth = await getAuthedUserId();
  if ('error' in auth) return auth.error;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const track = (body as { track?: unknown } | null)?.track;
  if (!isSubjectTrack(track)) {
    return NextResponse.json(
      { error: "Invalid track. Must be 'math' or 'science'." },
      { status: 400 }
    );
  }

  // 사용자가 해당 트랙에 접근 권한이 있는지 검증 (subject_tracks 에 포함되어야 함)
  const { data: row, error: readErr } = await supabaseAdmin
    .from('users')
    .select('subject_tracks')
    .eq('id', auth.userId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: 'User row not found' }, { status: 404 });
  }
  const tracks = Array.isArray((row as { subject_tracks: unknown }).subject_tracks)
    ? ((row as { subject_tracks: unknown[] }).subject_tracks).filter(isSubjectTrack)
    : [];

  if (!tracks.includes(track)) {
    return NextResponse.json(
      { error: `Forbidden: '${track}' not in user's subject_tracks` },
      { status: 403 }
    );
  }

  const { error: updateErr } = await supabaseAdmin
    .from('users')
    .update({ active_subject_track: track })
    .eq('id', auth.userId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, active_subject_track: track });
}
