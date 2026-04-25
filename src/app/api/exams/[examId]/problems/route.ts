// POST   /api/exams/[examId]/problems — 기존 시험지에 문제 추가
// PATCH  /api/exams/[examId]/problems — 배점 수정 (단건 or restore-from-content)
// GET    /api/exams/[examId]/problems — 문제 목록 + 배점 정보 + content 미리보기 (진단용)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// ============================================================================
// GET — 진단용 간단 조회
// ============================================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data: eps, error: epErr } = await supabaseAdmin
    .from('exam_problems')
    .select('problem_id, sequence_number, points')
    .eq('exam_id', examId)
    .order('sequence_number', { ascending: true });
  if (epErr) return NextResponse.json({ error: epErr.message }, { status: 500 });

  const pIds = (eps || []).map((r: any) => r.problem_id);
  if (pIds.length === 0) return NextResponse.json({ problems: [] });

  const { data: problems } = await supabaseAdmin
    .from('problems')
    .select('id, content_latex')
    .in('id', pIds);

  const byId = new Map((problems || []).map((p: any) => [p.id, p]));
  const rescanRegex = /\[\s*(\d+(?:\.\d+)?)\s*[점졈졍]\s*\]/;
  const plainRegex = /(\d+(?:\.\d+)?)\s*[점졈]/;

  const result = (eps || []).map((r: any) => {
    const p = byId.get(r.problem_id) as any;
    const c = p?.content_latex || '';
    const bracket = c.match(rescanRegex);
    const plain = c.match(plainRegex);
    return {
      number: r.sequence_number,
      problemId: r.problem_id,
      points: r.points,
      bracketMatch: bracket?.[0] || null,
      plainMatch: plain?.[0] || null,
      contentTail: c.slice(-120),
    };
  });

  return NextResponse.json({ examId, total: result.length, problems: result });
}

// ============================================================================
// PATCH — 단건: 특정 문제 배점 수정 / 액션: content_latex에서 [N점] 일괄 복원
//   body: { problemId, points } — 단건 수정
//   body: { action: 'restore-from-content' } — 시험지 전체 content에서 [N점] 재추출
// ============================================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();

    // ---- 액션: 원 배점 복원 ----
    if (body.action === 'restore-from-content') {
      const { data: eps, error: epErr } = await supabaseAdmin
        .from('exam_problems')
        .select('problem_id')
        .eq('exam_id', examId);
      if (epErr) throw epErr;
      const ids = (eps || []).map((r: { problem_id: string }) => r.problem_id);
      if (ids.length === 0) return NextResponse.json({ success: true, updated: 0, total: 0 });

      const { data: problems, error: pErr } = await supabaseAdmin
        .from('problems')
        .select('id, content_latex')
        .in('id', ids);
      if (pErr) throw pErr;

      let updated = 0;
      const rescanRegex = /\[\s*(?:총\s*)?(\d+(?:\.\d+)?)\s*점\s*\]/;
      for (const p of problems || []) {
        const content = (p as any).content_latex || '';
        const m = content.match(rescanRegex);
        if (!m) continue;
        const pts = Math.min(100, Math.max(0, parseFloat(m[1])));
        const { error: updErr } = await supabaseAdmin
          .from('exam_problems')
          .update({ points: pts })
          .eq('exam_id', examId)
          .eq('problem_id', (p as any).id);
        if (!updErr) updated++;
      }
      return NextResponse.json({ success: true, updated, total: ids.length });
    }

    // ---- 단건 수정 ----
    const problemId: string | undefined = body.problemId;
    const points: unknown = body.points;
    // points: number → 저장, null → NULL로 (배점 미지정)
    const isNumber = typeof points === 'number' && Number.isFinite(points);
    const isNullClear = points === null;

    if (!problemId || (!isNumber && !isNullClear)) {
      return NextResponse.json({ error: 'problemId, points(number 또는 null) 필요' }, { status: 400 });
    }

    const value: number | null = isNumber
      ? Math.max(0, Math.min(100, Math.round((points as number) * 10) / 10))
      : null;

    const { error } = await supabaseAdmin
      .from('exam_problems')
      .update({ points: value })
      .eq('exam_id', examId)
      .eq('problem_id', problemId);

    if (error) {
      console.error('[API/exams/problems PATCH] error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, examId, problemId, points: value });
  } catch (err: any) {
    console.error('[API/exams/problems PATCH] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { problemIds } = await request.json();

    if (!Array.isArray(problemIds) || problemIds.length === 0) {
      return NextResponse.json({ error: 'problemIds 배열 필요' }, { status: 400 });
    }

    // 1. 시험지 존재 확인
    const { data: exam, error: examErr } = await supabaseAdmin
      .from('exams')
      .select('id')
      .eq('id', examId)
      .single();

    if (examErr || !exam) {
      return NextResponse.json({ error: '시험지를 찾을 수 없습니다' }, { status: 404 });
    }

    // 2. 현재 마지막 sequence_number 조회
    const { data: lastSeq } = await supabaseAdmin
      .from('exam_problems')
      .select('sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    const startSeq = (lastSeq?.sequence_number || 0) + 1;

    // 3. 이미 연결된 문제 제외
    const { data: existing } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id')
      .eq('exam_id', examId)
      .in('problem_id', problemIds);

    const existingIds = new Set((existing || []).map((r: any) => r.problem_id));
    const newIds = problemIds.filter((id: string) => !existingIds.has(id));

    if (newIds.length === 0) {
      return NextResponse.json({ success: true, added: 0, message: '모든 문제가 이미 추가되어 있습니다' });
    }

    // 4. exam_problems에 INSERT — points는 null로 두고 사용자가 [N점] 추출/수동 입력하게
    const rows = newIds.map((problemId: string, idx: number) => ({
      exam_id: examId,
      problem_id: problemId,
      sequence_number: startSeq + idx,
      points: null,
    }));

    const { error: insertErr } = await supabaseAdmin
      .from('exam_problems')
      .insert(rows);

    if (insertErr) {
      console.error('[API/exams/problems] Insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, added: newIds.length });
  } catch (err: any) {
    console.error('[API/exams/problems] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
