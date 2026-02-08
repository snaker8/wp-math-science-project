'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

export interface ActivityLog {
    id: string;
    type: 'upload' | 'grading' | 'login' | 'problem_create' | 'clinic';
    title: string;
    description: string;
    time: string;
    user?: string;
}

// Mock 활동 로그
const mockActivityLogs: ActivityLog[] = [
    { id: '1', type: 'grading', title: '채점 완료', description: '3학년 1반 수학 채점 완료', time: '2분 전', user: '김선생' },
    { id: '2', type: 'clinic', title: 'AI 클리닉 생성', description: '미분 약점 보완 클리닉', time: '15분 전', user: '이선생' },
    { id: '3', type: 'upload', title: '문제 업로드', description: '새 문제지 12개 자산화', time: '23분 전', user: '박선생' },
    { id: '4', type: 'problem_create', title: '문제 등록', description: '이차방정식 유형 8문제', time: '1시간 전', user: '김선생' },
];

export function useActivityLogs(limit: number = 10) {
    const [logs, setLogs] = useState<ActivityLog[]>(mockActivityLogs);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchLogs() {
            if (!isSupabaseConfigured || !supabaseBrowser) {
                console.log('[Activity] Supabase not configured, using mock logs');
                setIsLoading(false);
                return;
            }

            try {
                // 최근 문제 생성 이력 조회
                const { data: problems, error: problemError } = await supabaseBrowser
                    .from('problems')
                    .select('id, type_name, created_at, created_by')
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (problemError) throw problemError;

                // 활동 로그로 변환
                const activityLogs: ActivityLog[] = (problems || []).map((p) => ({
                    id: p.id,
                    type: 'problem_create' as const,
                    title: '문제 등록',
                    description: `${p.type_name || '미분류'} 문제`,
                    time: formatRelativeTime(p.created_at),
                    user: '선생님',
                }));


                if (activityLogs.length > 0) {
                    setLogs(activityLogs);
                }

                console.log('[Activity] Loaded', activityLogs.length, 'activity logs');

            } catch (err) {
                console.error('[Activity] Failed to fetch logs:', err);
                setError(err instanceof Error ? err.message : 'Failed to load logs');
            } finally {
                setIsLoading(false);
            }
        }

        fetchLogs();
    }, [limit]);

    return { logs, isLoading, error };
}

// 상대 시간 포맷
function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays < 7) return `${diffDays}일 전`;
    return date.toLocaleDateString('ko-KR');
}
