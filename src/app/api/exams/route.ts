// ============================================================================
// GET /api/exams - 시험지 목록 조회
// supabaseAdmin으로 RLS 바이패스
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    // 시험지 목록 조회 (문제 수 포함)
    const { data: exams, error: examsError } = await supabaseAdmin
      .from('exams')
      .select(`
        id,
        title,
        description,
        status,
        total_points,
        created_at,
        exam_problems(count)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (examsError) {
      console.error('[API/exams] List error:', examsError.message);
      return NextResponse.json(
        { error: 'Failed to fetch exams', detail: examsError.message },
        { status: 500 }
      );
    }

    // 데이터 변환
    const result = (exams || []).map((exam: any) => {
      // description에서 메타 정보 추출
      const desc = exam.description || '';
      const fileNameMatch = desc.match(/업로드.*?파일:\s*(.+?)(?:\s*\(|$)/);
      const fileName = fileNameMatch?.[1]?.trim() || '';

      // 파일명에서 학교명/연도/과목 추출
      const schoolMatch = fileName.match(/([가-힣]+(?:고등학교|고|중학교|중|대학교|대))/);
      const yearMatch = fileName.match(/(\d{4})/);
      const hasImage = desc.includes('이미지') || desc.includes('image');

      return {
        id: exam.id,
        title: exam.title,
        fileName: fileName || exam.title,
        status: exam.status,
        problemCount: exam.exam_problems?.[0]?.count ?? 0,
        hasImage,
        school: schoolMatch?.[1] || '',
        year: yearMatch?.[1] || '',
        createdAt: exam.created_at,
      };
    });

    return NextResponse.json({
      exams: result,
      total: result.length,
    });
  } catch (err) {
    console.error('[API/exams] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
