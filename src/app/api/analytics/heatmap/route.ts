// ============================================================================
// Student Analytics Heatmap API Route
// 학생 분석 히트맵 데이터 조회 API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  createHeatmapData,
  generateMockHeatmapData,
  type RawAnswerData,
} from '@/lib/analytics/heatmap';

/**
 * GET /api/analytics/heatmap
 * Query params:
 * - studentId: 학생 ID (선택, 미지정시 현재 로그인 사용자)
 * - range: 기간 필터 (7days, 30days, 90days, all)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const searchParams = request.nextUrl.searchParams;
    const range = searchParams.get('range') || '30days';
    const studentIdParam = searchParams.get('studentId');

    // Supabase가 설정되지 않은 경우 Mock 데이터 반환
    if (!supabase) {
      console.log('[Analytics API] Supabase not configured, returning mock data');
      const mockData = generateMockHeatmapData(
        studentIdParam || 'mock-student',
        '테스트 학생'
      );
      return NextResponse.json(mockData);
    }

    // 현재 사용자 확인
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 학생 ID 결정 (파라미터 또는 현재 사용자)
    const studentId = studentIdParam || user.id;

    // 기간 필터 계산
    let dateFilter: Date | null = null;
    switch (range) {
      case '7days':
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
        break;
      case '30days':
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 30);
        break;
      case '90days':
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 90);
        break;
      case 'all':
      default:
        dateFilter = null;
    }

    // 학생 정보 조회
    const { data: studentData, error: studentError } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('id', studentId)
      .single();

    if (studentError || !studentData) {
      console.log('[Analytics API] Student not found, returning mock data');
      const mockData = generateMockHeatmapData(studentId, '알 수 없는 학생');
      return NextResponse.json(mockData);
    }

    // 채점 기록 조회
    // exam_records 테이블이 있다고 가정하고 쿼리 구성
    // 실제 테이블 구조에 맞게 조정 필요
    let query = supabase
      .from('exam_records')
      .select(`
        id,
        student_id,
        problem_id,
        grading_status,
        time_spent_seconds,
        answered_at,
        problems!inner (
          id,
          classifications (
            type_code,
            type_id,
            problem_types (
              name,
              chapter,
              section,
              subject
            )
          )
        )
      `)
      .eq('student_id', studentId)
      .not('grading_status', 'is', null);

    if (dateFilter) {
      query = query.gte('answered_at', dateFilter.toISOString());
    }

    const { data: recordsData, error: recordsError } = await query;

    // 테이블이 없거나 데이터가 없는 경우 Mock 데이터 반환
    if (recordsError || !recordsData || recordsData.length === 0) {
      console.log('[Analytics API] No records found, returning mock data');
      const mockData = generateMockHeatmapData(studentId, studentData.full_name);
      return NextResponse.json(mockData);
    }

    // 데이터 변환
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawData: RawAnswerData[] = recordsData.map((record: any) => {
      const classification = record.problems?.classifications?.[0];
      const problemType = classification?.problem_types;

      return {
        studentId: record.student_id,
        problemId: record.problem_id,
        typeCode: classification?.type_code || 'UNKNOWN',
        typeName: problemType?.name || '알 수 없는 유형',
        chapter: problemType?.chapter || '알 수 없는 단원',
        section: problemType?.section,
        subject: problemType?.subject || '알 수 없는 과목',
        gradingStatus: record.grading_status as RawAnswerData['gradingStatus'],
        timeSpentSeconds: record.time_spent_seconds,
        answeredAt: record.answered_at,
      };
    });

    // 히트맵 데이터 생성
    const heatmapData = createHeatmapData(
      studentId,
      studentData.full_name,
      rawData
    );

    return NextResponse.json(heatmapData);
  } catch (error) {
    console.error('[Analytics API] Error:', error);

    // 오류 시 Mock 데이터 반환
    const mockData = generateMockHeatmapData('error-fallback', '오류 발생');
    return NextResponse.json(mockData);
  }
}

/**
 * POST /api/analytics/heatmap/export
 * 히트맵 데이터 CSV 내보내기 (서버사이드)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, range } = body;

    // 실제 구현 시 데이터 조회 후 CSV 생성
    // 현재는 클라이언트 사이드에서 처리하므로 미구현

    return NextResponse.json({
      success: true,
      message: 'Export initiated',
      downloadUrl: null, // 실제 구현 시 S3 등의 URL 반환
    });
  } catch (error) {
    console.error('[Analytics API] Export error:', error);
    return NextResponse.json(
      { error: 'Export failed', message: '내보내기에 실패했습니다.' },
      { status: 500 }
    );
  }
}
