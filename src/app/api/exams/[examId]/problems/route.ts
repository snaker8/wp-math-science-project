// POST /api/exams/[examId]/problems — 기존 시험지에 문제 추가
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    // 4. exam_problems에 INSERT
    const rows = newIds.map((problemId: string, idx: number) => ({
      exam_id: examId,
      problem_id: problemId,
      sequence_number: startSeq + idx,
      points: 4,
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
