// POST /api/exams/[examId]/upload — PDF 업로드 → OCR → 기존 시험지에 문제 추가
// 기존 /api/workflow/upload 로직을 재사용하되, 새 시험지 생성 대신 기존 시험지에 병합

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    // 1. 시험지 존재 확인
    const { data: exam, error: examErr } = await supabaseAdmin
      .from('exams')
      .select('id, title')
      .eq('id', examId)
      .single();

    if (examErr || !exam) {
      return NextResponse.json({ error: '시험지를 찾을 수 없습니다' }, { status: 404 });
    }

    // 2. FormData에서 파일 읽기
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });
    }

    // 3. 기존 워크플로우 API로 전달 (내부 호출)
    // 새 FormData로 기존 업로드 API에 전송
    const internalFormData = new FormData();
    internalFormData.append('file', file);
    internalFormData.append('title', `${exam.title}_추가`);

    const baseUrl = request.nextUrl.origin;
    const uploadRes = await fetch(`${baseUrl}/api/workflow/upload`, {
      method: 'POST',
      body: internalFormData,
    });

    const uploadData = await uploadRes.json();

    if (!uploadData.jobId) {
      return NextResponse.json({ error: '업로드 처리 실패', detail: uploadData }, { status: 500 });
    }

    const jobId = uploadData.jobId;

    // 4. 폴링: 작업 완료 대기 (최대 4분)
    let attempts = 0;
    const maxAttempts = 48; // 48 * 5초 = 240초 = 4분
    let jobComplete = false;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;

      const statusRes = await fetch(`${baseUrl}/api/workflow/upload?jobId=${jobId}`);
      const statusData = await statusRes.json();

      if (statusData.status === 'COMPLETED' || statusData.status === 'SAVED') {
        jobComplete = true;
        break;
      }

      if (statusData.status === 'ERROR') {
        return NextResponse.json({ error: 'OCR 처리 중 오류 발생', detail: statusData.errorMessage }, { status: 500 });
      }
    }

    if (!jobComplete) {
      return NextResponse.json({ error: 'OCR 처리 시간 초과' }, { status: 504 });
    }

    // 5. 자동 저장된 시험지의 문제들을 가져와서 기존 시험지에 연결
    // 자동 저장 시 생성된 exam의 문제들 조회
    const statusRes = await fetch(`${baseUrl}/api/workflow/upload?jobId=${jobId}`);
    const statusData = await statusRes.json();
    const autoExamId = statusData.autoSavedExamId;

    if (!autoExamId) {
      return NextResponse.json({ error: '자동 저장된 시험지를 찾을 수 없습니다' }, { status: 500 });
    }

    // 자동 생성된 시험지의 문제 ID들 조회
    const { data: autoProblems } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id')
      .eq('exam_id', autoExamId)
      .order('sequence_number', { ascending: true });

    const newProblemIds = (autoProblems || []).map((r: any) => r.problem_id);

    if (newProblemIds.length === 0) {
      return NextResponse.json({ error: '추출된 문제가 없습니다' }, { status: 400 });
    }

    // 6. 기존 시험지에 문제 추가
    const { data: lastSeq } = await supabaseAdmin
      .from('exam_problems')
      .select('sequence_number')
      .eq('exam_id', examId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    const startSeq = (lastSeq?.sequence_number || 0) + 1;

    // 이미 추가된 문제 제외
    const { data: existing } = await supabaseAdmin
      .from('exam_problems')
      .select('problem_id')
      .eq('exam_id', examId)
      .in('problem_id', newProblemIds);

    const existingSet = new Set((existing || []).map((r: any) => r.problem_id));
    const toAdd = newProblemIds.filter((id: string) => !existingSet.has(id));

    if (toAdd.length > 0) {
      const rows = toAdd.map((problemId: string, idx: number) => ({
        exam_id: examId,
        problem_id: problemId,
        sequence_number: startSeq + idx,
        points: 4,
      }));

      await supabaseAdmin.from('exam_problems').insert(rows);
    }

    // 7. 자동 생성된 임시 시험지 삭제 (선택적)
    // await supabaseAdmin.from('exams').delete().eq('id', autoExamId);

    return NextResponse.json({ success: true, added: toAdd.length, jobId });
  } catch (err: any) {
    console.error('[API/exams/upload] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
