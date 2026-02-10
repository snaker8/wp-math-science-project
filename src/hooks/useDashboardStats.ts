'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

export interface DashboardStats {
    totalStudents: number;
    totalProblems: number;
    totalExams: number;
    totalTeachers: number;
    averageAccuracy: number;
    studentsThisWeek: number;
    problemsThisWeek: number;
    examsThisMonth: number;
}

export interface MonthlyExamCount {
    date: string; // YYYY-MM-DD
    count: number;
}

// Mock 데이터 (Supabase 미연결 시)
const mockStats: DashboardStats = {
    totalStudents: 1,
    totalProblems: 154,
    totalExams: 4,
    totalTeachers: 1,
    averageAccuracy: 78.4,
    studentsThisWeek: 0,
    problemsThisWeek: 12,
    examsThisMonth: 2,
};

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>(mockStats);
    const [monthlyExams, setMonthlyExams] = useState<MonthlyExamCount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchStats() {
            if (!isSupabaseConfigured || !supabaseBrowser) {
                console.log('[Dashboard] Supabase not configured, using mock stats');
                // Mock 월별 데이터 생성
                setMonthlyExams(generateMockMonthlyData());
                setIsLoading(false);
                return;
            }

            try {
                // 병렬로 모든 통계 조회
                const [
                    studentsResult,
                    problemsResult,
                    examsResult,
                    teachersResult,
                ] = await Promise.all([
                    supabaseBrowser.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
                    supabaseBrowser.from('problems').select('*', { count: 'exact', head: true }).is('deleted_at', null),
                    supabaseBrowser.from('exams').select('*', { count: 'exact', head: true }).is('deleted_at', null),
                    supabaseBrowser.from('users').select('*', { count: 'exact', head: true }).in('role', ['teacher', 'admin']),
                ]);

                // 이번 주/월 통계
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                const monthStart = new Date();
                monthStart.setDate(1);
                monthStart.setHours(0, 0, 0, 0);

                const [newStudentsResult, newProblemsResult, monthExamsResult] = await Promise.all([
                    supabaseBrowser.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student').gte('created_at', weekAgo.toISOString()),
                    supabaseBrowser.from('problems').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
                    supabaseBrowser.from('exams').select('*', { count: 'exact', head: true }).is('deleted_at', null).gte('created_at', monthStart.toISOString()),
                ]);

                // 월별 시험지 출제 데이터 (현재 월)
                const { data: monthlyData } = await supabaseBrowser
                    .from('exams')
                    .select('created_at')
                    .is('deleted_at', null)
                    .gte('created_at', monthStart.toISOString())
                    .order('created_at', { ascending: true });

                if (monthlyData) {
                    const dailyCounts = new Map<string, number>();
                    monthlyData.forEach((exam: { created_at: string }) => {
                        const date = exam.created_at.split('T')[0];
                        dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
                    });
                    setMonthlyExams(Array.from(dailyCounts.entries()).map(([date, count]) => ({ date, count })));
                }

                setStats({
                    totalStudents: studentsResult.count || 0,
                    totalProblems: problemsResult.count || 0,
                    totalExams: examsResult.count || 0,
                    totalTeachers: teachersResult.count || 0,
                    averageAccuracy: 78.4,
                    studentsThisWeek: newStudentsResult.count || 0,
                    problemsThisWeek: newProblemsResult.count || 0,
                    examsThisMonth: monthExamsResult.count || 0,
                });

            } catch (err) {
                console.error('[Dashboard] Failed to fetch stats:', err);
                setError(err instanceof Error ? err.message : 'Failed to load stats');
            } finally {
                setIsLoading(false);
            }
        }

        fetchStats();
    }, []);

    return { stats, monthlyExams, isLoading, error };
}

function generateMockMonthlyData(): MonthlyExamCount[] {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return [
        { date: `${year}-${String(month + 1).padStart(2, '0')}-02`, count: 2 },
        { date: `${year}-${String(month + 1).padStart(2, '0')}-05`, count: 1 },
    ];
}
