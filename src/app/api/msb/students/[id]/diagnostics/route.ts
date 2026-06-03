// ============================================================================
// GET /api/msb/students/{id}/diagnostics
//   자사관 플래너의 진단평가 동기화 — 학생 1명의 회차별 상/중/하 점수.
//
//   응답: { diagnostics: [{ date, A, B, C, note }] }
//     - 한 진단 세션 = 한 회차
//     - A(상) = 난이도 4~5 정답률, B(중) = 난이도 3, C(하) = 난이도 1~2
//       (diagnostics.items.difficulty 1~5 버킷별 정답률, 0~100 정수. 빈 버킷은 '')
//     - date = 세션 conducted_at (YYYY-MM-DD), note = 세션 note
//
//   데이터 소스: diagnostics.sessions + items (난이도 보유 라인).
//     - 직접 등록 학생(users.id) 세션 + 그 학생에 promote 된 명단(roster) 세션 합산.
//
//   인증: Authorization: Bearer <MSB_API_KEY>
//   격리: 학생이 설정된 학원(MSB_INSTITUTE_ID) 소속인지 확인 후 통과 (가드 #8)
// ============================================================================

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireMsbKey } from '@/lib/security/msb-auth';
import { corsJson, corsPreflight } from '@/lib/http/cors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Bucket = { total: number; correct: number };
const newBuckets = () => ({
  A: { total: 0, correct: 0 } as Bucket,
  B: { total: 0, correct: 0 } as Bucket,
  C: { total: 0, correct: 0 } as Bucket,
});
const pct = (b: Bucket): number | '' =>
  b.total > 0 ? Math.round((b.correct / b.total) * 100) : '';

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

  // 이 학생(users.id) 에 연결(promote)된 명단(roster) id 도 함께 — 엑셀 채점 이력 포함
  const { data: promoted } = await sb
    .from('roster_students')
    .select('id')
    .eq('promoted_user_id', id);
  const studentRefs = [id, ...((promoted || []).map((r) => (r as { id: string }).id))];

  // 진단 세션 (sessions+items 라인 — difficulty 보유)
  const { data: sessRows } = await sb
    .schema('diagnostics' as never)
    .from('sessions')
    .select('id, conducted_at, note')
    .in('student_id', studentRefs)
    .order('conducted_at', { ascending: true });
  const sessions = (sessRows || []) as Array<{
    id: string; conducted_at: string | null; note: string | null;
  }>;
  if (sessions.length === 0) return corsJson(req, { diagnostics: [] });

  // 문항 — 세션별 난이도 버킷 집계
  const sessionIds = sessions.map((s) => s.id);
  const { data: itemRows } = await sb
    .schema('diagnostics' as never)
    .from('items')
    .select('session_id, difficulty, is_correct')
    .in('session_id', sessionIds);
  const items = (itemRows || []) as Array<{
    session_id: string; difficulty: number | null; is_correct: boolean;
  }>;

  const agg = new Map<string, ReturnType<typeof newBuckets>>();
  for (const it of items) {
    if (it.difficulty == null) continue; // 난이도 없는 문항은 상/중/하 분류 불가 → 제외
    const buckets = agg.get(it.session_id) || newBuckets();
    const key = it.difficulty >= 4 ? 'A' : it.difficulty === 3 ? 'B' : 'C';
    buckets[key].total++;
    if (it.is_correct) buckets[key].correct++;
    agg.set(it.session_id, buckets);
  }

  const diagnostics = sessions.map((s) => {
    const b = agg.get(s.id) || newBuckets();
    return {
      date: (s.conducted_at || '').slice(0, 10),
      A: pct(b.A),
      B: pct(b.B),
      C: pct(b.C),
      note: s.note || '',
    };
  });

  return corsJson(req, { diagnostics });
}
