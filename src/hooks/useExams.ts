'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';

export interface Exam {
    id: string;
    title: string;
    description: string | null;
    grade: string | null;
    subject: string | null;
    unit: string | null;
    status: 'DRAFT' | 'COMPLETED' | 'PUBLISHED';
    difficulty: string | null;
    problem_count: number;
    total_points: number;
    time_limit_minutes: number | null;
    created_at: string;
    updated_at: string;
    published_at: string | null;
}

export interface ExamProblem {
    id: string;
    exam_id: string;
    problem_id: string;
    sequence_number: number;
    points: number;
}

// UI용 변환 인터페이스
export interface ExamPaper {
    id: string;
    title: string;
    grade: string;
    course: string;
    unit: string;
    difficulty: 'Lv.1' | 'Lv.2' | 'Lv.3' | 'Lv.4' | 'Lv.5';
    status: 'draft' | 'completed' | 'published';
    problemCount: number;
    thumbnail: string;
    createdAt: string;
}

// Mock 데이터
const mockExamPapers: ExamPaper[] = [
    {
        id: '1',
        title: '2026 고1 1학기 중간고사 대비 모의고사 A형',
        grade: '고등 1학년',
        course: '수학(상)',
        unit: '다항식의 연산',
        difficulty: 'Lv.4',
        status: 'published',
        problemCount: 22,
        thumbnail: 'P(x) = (x-a)Q(x) + R',
        createdAt: '2026.02.05',
    },
    {
        id: '2',
        title: '중3-1 이차함수의 그래프와 활용 기초',
        grade: '중등 3학년',
        course: '수학 3-1',
        unit: '이차함수',
        difficulty: 'Lv.2',
        status: 'completed',
        problemCount: 15,
        thumbnail: 'y = a(x-p)^2 + q',
        createdAt: '2026.02.06',
    },
];

// DB -> UI 변환 함수
function transformExamToExamPaper(exam: Exam): ExamPaper {
    const difficultyMap: Record<string, ExamPaper['difficulty']> = {
        'Lv.1': 'Lv.1', 'Lv.2': 'Lv.2', 'Lv.3': 'Lv.3', 'Lv.4': 'Lv.4', 'Lv.5': 'Lv.5',
    };

    return {
        id: exam.id,
        title: exam.title,
        grade: exam.grade || '',
        course: exam.subject || '',
        unit: exam.unit || '',
        difficulty: difficultyMap[exam.difficulty || 'Lv.3'] || 'Lv.3',
        status: exam.status.toLowerCase() as ExamPaper['status'],
        problemCount: exam.problem_count,
        thumbnail: '', // 첫 문제의 LaTeX에서 가져올 수 있음
        createdAt: new Date(exam.created_at).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).replace(/\. /g, '.').replace('.', ''),
    };
}

export function useExams() {
    const [exams, setExams] = useState<ExamPaper[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchExams = useCallback(async () => {
        if (!isSupabaseConfigured || !supabaseBrowser) {
            console.log('[Exams] Supabase not configured, using mock data');
            setExams(mockExamPapers);
            setIsLoading(false);
            return;
        }

        try {
            const { data: { user } } = await supabaseBrowser.auth.getUser();

            if (!user) {
                console.log('[Exams] No authenticated user, showing empty');
                setExams([]);
                setIsLoading(false);
                return;
            }

            // RLS가 자동으로 필터링하므로, 모든 접근 가능한 시험지를 조회
            // 003_exams.sql RLS: created_by = auth.uid()
            // schema.sql RLS: institute_id = user's institute_id
            const { data, error: fetchError } = await supabaseBrowser
                .from('exams')
                .select('*, exam_problems(count)')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(100);

            if (fetchError) {
                console.error('[Exams] Fetch error:', fetchError.message);
                // RLS 에러 등으로 실패 시 빈 배열
                setExams([]);
                setError(fetchError.message);
                setIsLoading(false);
                return;
            }

            if (data && data.length > 0) {
                setExams(data.map((exam: any) => {
                    // exam_problems의 실제 카운트를 사용
                    const actualCount = exam.exam_problems?.[0]?.count ?? 0;
                    return transformExamToExamPaper({
                        ...exam,
                        problem_count: actualCount,
                    });
                }));
            } else {
                setExams([]);
            }

            console.log('[Exams] Loaded', data?.length || 0, 'exams from DB');

        } catch (err) {
            console.error('[Exams] Failed to fetch:', err);
            setError(err instanceof Error ? err.message : 'Failed to load exams');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExams();
    }, [fetchExams]);

    const createExam = async (exam: Partial<Exam>): Promise<string | null> => {
        if (!isSupabaseConfigured || !supabaseBrowser) {
            console.log('[Exams] Mock mode - exam not created');
            return null;
        }

        try {
            const { data: { user } } = await supabaseBrowser.auth.getUser();
            if (!user) return null;

            const { data, error } = await supabaseBrowser
                .from('exams')
                .insert({
                    ...exam,
                    created_by: user.id,
                })
                .select('id')
                .single();

            if (error) throw error;

            await fetchExams();
            return data.id;

        } catch (err) {
            console.error('[Exams] Failed to create:', err);
            return null;
        }
    };

    const deleteExam = async (id: string): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabaseBrowser) {
            setExams((prev) => prev.filter((e) => e.id !== id));
            return true;
        }

        try {
            const { error } = await supabaseBrowser
                .from('exams')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', id);

            if (error) throw error;

            setExams((prev) => prev.filter((e) => e.id !== id));
            return true;

        } catch (err) {
            console.error('[Exams] Failed to delete:', err);
            return false;
        }
    };

    const updateExamStatus = async (id: string, status: Exam['status']): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabaseBrowser) {
            setExams((prev) =>
                prev.map((e) =>
                    e.id === id ? { ...e, status: status.toLowerCase() as ExamPaper['status'] } : e
                )
            );
            return true;
        }

        try {
            const updateData: Partial<Exam> = { status };
            if (status === 'PUBLISHED') {
                updateData.published_at = new Date().toISOString();
            }

            const { error } = await supabaseBrowser
                .from('exams')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            await fetchExams();
            return true;

        } catch (err) {
            console.error('[Exams] Failed to update status:', err);
            return false;
        }
    };

    const duplicateExam = async (examId: string, newTitle: string): Promise<string | null> => {
        if (!isSupabaseConfigured || !supabaseBrowser) {
            console.log('[Exams] Mock mode - exam not duplicated');
            // Mock: 간단히 복제
            const source = exams.find((e) => e.id === examId);
            if (source) {
                const newExam: ExamPaper = {
                    ...source,
                    id: `mock-${Date.now()}`,
                    title: newTitle,
                    status: 'draft',
                    createdAt: new Date().toLocaleDateString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                    }).replace(/\. /g, '.').replace('.', ''),
                };
                setExams((prev) => [newExam, ...prev]);
            }
            return null;
        }

        try {
            const { data: { user } } = await supabaseBrowser.auth.getUser();
            if (!user) return null;

            // 1. 원본 시험지 정보 가져오기
            const { data: sourceExam, error: sourceError } = await supabaseBrowser
                .from('exams')
                .select('*')
                .eq('id', examId)
                .single();

            if (sourceError || !sourceExam) throw sourceError || new Error('Source exam not found');

            // 2. 새 시험지 생성
            const { data: newExam, error: createError } = await supabaseBrowser
                .from('exams')
                .insert({
                    title: newTitle,
                    description: sourceExam.description,
                    status: 'DRAFT',
                    total_points: sourceExam.total_points,
                    time_limit_minutes: sourceExam.time_limit_minutes,
                    created_by: user.id,
                    institute_id: sourceExam.institute_id,
                })
                .select('id')
                .single();

            if (createError || !newExam) throw createError || new Error('Failed to create exam copy');

            // 3. 원본 시험지의 문제 연결 복사
            const { data: sourceProblems } = await supabaseBrowser
                .from('exam_problems')
                .select('problem_id, sequence_number, points')
                .eq('exam_id', examId)
                .order('sequence_number', { ascending: true });

            if (sourceProblems && sourceProblems.length > 0) {
                const newProblems = sourceProblems.map((p: any) => ({
                    exam_id: newExam.id,
                    problem_id: p.problem_id,
                    sequence_number: p.sequence_number,
                    points: p.points,
                }));

                await supabaseBrowser.from('exam_problems').insert(newProblems);
            }

            await fetchExams();
            return newExam.id;

        } catch (err) {
            console.error('[Exams] Failed to duplicate:', err);
            return null;
        }
    };

    return {
        exams,
        isLoading,
        error,
        fetchExams,
        createExam,
        deleteExam,
        updateExamStatus,
        duplicateExam,
    };
}
