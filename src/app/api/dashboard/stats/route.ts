// ============================================================================
// GET /api/dashboard/stats — 대시보드 통계 (supabaseAdmin으로 RLS 우회)
// ============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  try {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // 병렬 조회
    const [
      studentsResult,
      problemsResult,
      examsResult,
      teachersResult,
      newStudentsResult,
      newProblemsResult,
      monthExamsResult,
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'STUDENT'),
      supabaseAdmin.from('exam_problems').select('problem_id', { count: 'exact', head: true }),
      supabaseAdmin.from('exams').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).in('role', ['TEACHER', 'ADMIN']),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('role', 'STUDENT').gte('created_at', weekAgo.toISOString()),
      supabaseAdmin.from('problems').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
      supabaseAdmin.from('exams').select('*', { count: 'exact', head: true }).gte('created_at', monthStart.toISOString()),
    ]);

    // 월별 시험지 출제 데이터
    const { data: monthlyData } = await supabaseAdmin
      .from('exams')
      .select('created_at')
      .gte('created_at', monthStart.toISOString())
      .order('created_at', { ascending: true });

    const monthlyExams: { date: string; count: number }[] = [];
    if (monthlyData) {
      const dailyCounts = new Map<string, number>();
      monthlyData.forEach((exam: { created_at: string }) => {
        const date = exam.created_at.split('T')[0];
        dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
      });
      dailyCounts.forEach((count, date) => monthlyExams.push({ date, count }));
    }

    return NextResponse.json({
      stats: {
        totalStudents: studentsResult.count || 0,
        totalProblems: problemsResult.count || 0,
        totalExams: examsResult.count || 0,
        totalTeachers: teachersResult.count || 0,
        averageAccuracy: 78.4,
        studentsThisWeek: newStudentsResult.count || 0,
        problemsThisWeek: newProblemsResult.count || 0,
        examsThisMonth: monthExamsResult.count || 0,
      },
      monthlyExams,
    });
  } catch (err) {
    console.error('[API/dashboard/stats] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
