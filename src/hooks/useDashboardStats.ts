'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

export interface DashboardStats {
    totalStudents: number;
    totalProblems: number;
    averageAccuracy: number;
    studentsThisWeek: number;
    problemsThisWeek: number;
}

// Mock 데이터 (Supabase 미연결 시)
const mockStats: DashboardStats = {
    totalStudents: 147,
    totalProblems: 2847,
    averageAccuracy: 78.4,
    studentsThisWeek: 12,
    problemsThisWeek: 234,
};

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>(mockStats);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchStats() {
            if (!isSupabaseConfigured || !supabaseBrowser) {
                console.log('[Dashboard] Supabase not configured, using mock stats');
                setIsLoading(false);
                return;
            }

            try {
                // 학생 수 조회
                const { count: studentCount, error: studentError } = await supabaseBrowser
                    .from('users')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'student');

                if (studentError) throw studentError;

                // 문제 수 조회
                const { count: problemCount, error: problemError } = await supabaseBrowser
                    .from('problems')
                    .select('*', { count: 'exact', head: true });

                if (problemError) throw problemError;

                // 이번 주 통계 (최근 7일)
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                const weekAgoStr = weekAgo.toISOString();

                const { count: newStudents } = await supabaseBrowser
                    .from('users')
                    .select('*', { count: 'exact', head: true })
                    .eq('role', 'student')
                    .gte('created_at', weekAgoStr);

                const { count: newProblems } = await supabaseBrowser
                    .from('problems')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', weekAgoStr);

                setStats({
                    totalStudents: studentCount || 0,
                    totalProblems: problemCount || 0,
                    averageAccuracy: 78.4, // TODO: 실제 정답률 계산 필요
                    studentsThisWeek: newStudents || 0,
                    problemsThisWeek: newProblems || 0,
                });

                console.log('[Dashboard] Loaded real stats:', {
                    students: studentCount,
                    problems: problemCount,
                });

            } catch (err) {
                console.error('[Dashboard] Failed to fetch stats:', err);
                setError(err instanceof Error ? err.message : 'Failed to load stats');
                // 에러 시 mock 데이터 유지
            } finally {
                setIsLoading(false);
            }
        }

        fetchStats();
    }, []);

    return { stats, isLoading, error };
}
