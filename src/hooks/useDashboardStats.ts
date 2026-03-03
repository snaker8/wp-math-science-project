'use client';

import { useState, useEffect } from 'react';

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
    totalStudents: 0,
    totalProblems: 0,
    totalExams: 0,
    totalTeachers: 0,
    averageAccuracy: 0,
    studentsThisWeek: 0,
    problemsThisWeek: 0,
    examsThisMonth: 0,
};

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>(mockStats);
    const [monthlyExams, setMonthlyExams] = useState<MonthlyExamCount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchStats() {
            try {
                // ★ API 라우트(supabaseAdmin) 사용 → RLS 우회
                const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });

                if (!res.ok) {
                    // API 503 (Supabase 미설정) → mock 데이터 사용
                    if (res.status === 503) {
                        console.log('[Dashboard] Supabase not configured, using mock stats');
                        setMonthlyExams(generateMockMonthlyData());
                        setIsLoading(false);
                        return;
                    }
                    throw new Error(`HTTP ${res.status}`);
                }

                const data = await res.json();

                setStats(data.stats);
                setMonthlyExams(data.monthlyExams || []);

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
