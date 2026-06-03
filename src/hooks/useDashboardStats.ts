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

interface StatsResult {
    stats: DashboardStats | null;       // null = 503 (Supabase 미설정 → mock)
    monthlyExams: MonthlyExamCount[];
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

// ★ 2026-06-03 perf: in-flight dedup. 동일 화면에서 useDashboardStats 가 여러 번
//   마운트되면 /api/dashboard/stats 가 각각 fetch (스샷 4s ×2). 진행 중 요청을
//   공유해 1개로 합침. 데이터·신선도 불변 — 동시 중복 네트워크 호출만 제거.
let inflightStats: Promise<StatsResult> | null = null;

function fetchStatsOnce(): Promise<StatsResult> {
    if (inflightStats) return inflightStats;
    inflightStats = (async () => {
        try {
            const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
            if (!res.ok) {
                if (res.status === 503) {
                    // Supabase 미설정 → mock 데이터 사용 (기존 동작 보존)
                    console.log('[Dashboard] Supabase not configured, using mock stats');
                    return { stats: null, monthlyExams: generateMockMonthlyData() };
                }
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            return { stats: data.stats, monthlyExams: data.monthlyExams || [] };
        } finally {
            inflightStats = null; // 다음 마운트는 새로 refresh (기존 동작 유지)
        }
    })();
    return inflightStats;
}

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>(mockStats);
    const [monthlyExams, setMonthlyExams] = useState<MonthlyExamCount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchStatsOnce()
            .then((data) => {
                if (cancelled) return;
                if (data.stats !== null) setStats(data.stats);
                setMonthlyExams(data.monthlyExams);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[Dashboard] Failed to fetch stats:', err);
                setError(err instanceof Error ? err.message : 'Failed to load stats');
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
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
