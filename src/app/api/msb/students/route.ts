// ============================================================================
// GET /api/msb/students
//   자사관 플래너(PLAN.html) "자동 매핑" 이 호출 — 설정된 학원의 학생 목록.
//
//   응답: { students: [{ id, name, school, grade }] }
//     - id     : public.users.id (UUID) — 이후 /students/{id}/diagnostics 경로에 사용
//     - name   : full_name
//     - school : 학생 프로필 학교 (users.school)
//     - grade  : '중2' 등 라벨 (플래너 기대 형식)
//
//   인증: Authorization: Bearer <MSB_API_KEY>  (msb-auth.ts)
//   격리: env MSB_INSTITUTE_ID 단일 학원으로 고정 (가드 #8 — cross-tenant 차단)
// ============================================================================

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireMsbKey, gradeIntToLabel } from '@/lib/security/msb-auth';
import { corsJson, corsPreflight } from '@/lib/http/cors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest) {
  const a = requireMsbKey(req);
  if (!a.ok) return corsJson(req, { error: a.error }, a.status);
  if (!supabaseAdmin) return corsJson(req, { error: 'Supabase not configured' }, 500);

  // ★ 격리: 설정된 학원(instituteId) 의 학생만. 직접 .eq 로 고정 — 가장 안전한 형태.
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, full_name, school, grade')
    .eq('role', 'STUDENT')
    .eq('institute_id', a.auth.instituteId)
    .is('deleted_at', null)
    .order('full_name', { ascending: true });

  if (error) return corsJson(req, { error: error.message }, 500);

  const students = (data || []).map((u) => {
    const row = u as { id: string; full_name: string | null; school: string | null; grade: number | null };
    return {
      id: row.id,
      name: row.full_name || '',
      school: row.school || '',
      grade: gradeIntToLabel(row.grade),
    };
  });

  return corsJson(req, { students });
}
