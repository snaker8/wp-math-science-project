// ============================================================================
// getActiveTrack — 서버 라우트에서 현재 사용자의 active_subject_track 조회
// ----------------------------------------------------------------------------
// PR-T7: URL 기반 라우팅에서는 middleware 가 'x-user-active-track' 헤더로 주입.
//        서버 라우트는 헤더 우선 → 헤더 없으면 DB fallback.
//
// 안전성:
//   - 어떤 실패 케이스든 fallback 'math' 반환 (수학 라인 보호)
//   - DEFAULT 'math' 컬럼과 의미 일치 → 호출 실패해도 결과 동일
//   - 새 라우트만 import, 기존 라우트엔 영향 X
// ============================================================================

import { headers } from 'next/headers';
import { supabaseAdmin, createSupabaseServerClient } from '@/lib/supabase/server';
import {
  isSubjectTrack,
  DEFAULT_SUBJECT_TRACK,
  type SubjectTrack,
} from '@/lib/subject-track';

/**
 * 명시적으로 user_id 가 있을 때 해당 사용자의 active_subject_track 조회.
 * supabaseAdmin (service role) 으로 RLS 우회 — 어드민 라우트·시스템 작업에 사용.
 */
export async function getActiveTrackForUser(
  userId: string | null | undefined
): Promise<SubjectTrack> {
  if (!userId || !supabaseAdmin) return DEFAULT_SUBJECT_TRACK;
  try {
    const { data } = await supabaseAdmin
      .from('users')
      .select('active_subject_track')
      .eq('id', userId)
      .single();
    return isSubjectTrack(data?.active_subject_track)
      ? (data!.active_subject_track as SubjectTrack)
      : DEFAULT_SUBJECT_TRACK;
  } catch {
    return DEFAULT_SUBJECT_TRACK;
  }
}

/**
 * 미들웨어에서 주입한 'x-user-active-track' 헤더 우선, 없으면 DB fallback.
 * URL 기반 라우팅 (PR-T8 이후) 의 핵심 진입점 — Referer URL [track] 또는
 * URL [track] 이 우선 반영됨.
 */
export async function getActiveTrackFromHeaders(): Promise<SubjectTrack> {
  try {
    const h = await headers();
    const headerTrack = h.get('x-user-active-track');
    if (isSubjectTrack(headerTrack)) return headerTrack;
  } catch {
    // headers() 가 RSC 외부에서 호출될 경우 — fall through
  }
  return getActiveTrackFromSession();
}

/**
 * 현재 세션의 사용자 active_subject_track 조회 (쿠키 기반).
 * 일반 라우트 핸들러에서 가장 흔히 쓰는 패턴 — 헤더 미주입·미들웨어 외 호출 시 fallback.
 */
export async function getActiveTrackFromSession(): Promise<SubjectTrack> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return DEFAULT_SUBJECT_TRACK;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_SUBJECT_TRACK;
    return await getActiveTrackForUser(user.id);
  } catch {
    return DEFAULT_SUBJECT_TRACK;
  }
}
