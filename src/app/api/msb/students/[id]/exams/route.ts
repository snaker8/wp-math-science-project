// ============================================================================
// GET /api/msb/students/{id}/exams
//   자사관 플래너의 모의고사 점수 동기화 — 학생 1명의 모의고사 4종 점수.
//
//   응답: { exams: [{ type, score, date, note }] }
//     - type ∈ mockFinal1(미리보는 기말 1회) / mockFinal2 / mock1(모의고사 1회) / mock2
//
//   데이터 소스: public.student_exam_scores (학생×종류 당 1행 upsert).
//     입력: /tutor/students 학생 목록의 모의고사 점수 모달
//           (PUT /api/students/{id}/exam-scores).
//
//   인증: Authorization: Bearer <MSB_API_KEY>
//   격리: 학생이 설정된 학원(MSB_INSTITUTE_ID) 소속인지 확인 후 통과 (가드 #8)
// ============================================================================

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireMsbKey } from '@/lib/security/msb-auth';
import { corsJson, corsPreflight } from '@/lib/http/cors';
import { MOCK_EXAM_TYPES } from '@/lib/students/mock-exam-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = requireMsbKey(req);
  if (!a.ok) return corsJson(req, { error: a.error }, a.status);
  if (!supabaseAdmin) return corsJson(req, { error: 'Supabase not configured' }, 500);
  const sb = supabaseAdmin;
  const { id } = await params;

  // ★ 격리: 이 학생이 설정된 학원 소속인지 확인 (다른 학원 학생 조회 차단)
  const { data: student } = await sb
    .from('users')
    .select('id, institute_id')
    .eq('id', id)
    .maybeSingle();
  if (!student || (student as { institute_id: string | null }).institute_id !== a.auth.instituteId) {
    return corsJson(req, { error: '학생을 찾을 수 없습니다' }, 404);
  }

  // 모의고사 점수 — institute_id 이중 필터 (벨트+서스펜더)
  const { data, error } = await sb
    .from('student_exam_scores')
    .select('exam_type, score, exam_date, note')
    .eq('student_id', id)
    .eq('institute_id', a.auth.instituteId);
  if (error) return corsJson(req, { error: error.message }, 500);

  // 고정 순서 (mockFinal1 → mockFinal2 → mock1 → mock2) 로 정렬해 반환
  const rows = (data || []) as Array<{
    exam_type: string; score: number; exam_date: string | null; note: string | null;
  }>;
  const orderOf = (t: string) => {
    const i = (MOCK_EXAM_TYPES as readonly string[]).indexOf(t);
    return i === -1 ? MOCK_EXAM_TYPES.length : i;
  };
  const exams = rows
    .sort((x, y) => orderOf(x.exam_type) - orderOf(y.exam_type))
    .map((r) => ({
      type: r.exam_type,
      score: Number(r.score),
      date: (r.exam_date || '').slice(0, 10),
      note: r.note || '',
    }));

  return corsJson(req, { exams });
}
