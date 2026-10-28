'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';
// ★ 매핑은 순수 모듈로 분리 (2026-10-12) — 서버(공유 리포트)와 공용. 기존 import 경로 호환을 위해 재export.
import { toExamProblemData, type ExamProblemData, type ExamInfo } from '@/lib/exam/exam-problem-mapper';
export { toExamProblemData };
export type { ExamProblemData, ExamInfo };
// Note: supabaseBrowser는 useCreateExam, useExamList에서 여전히 사용

// ============================================================================
// 중복 문제 감지 및 제거 (OCR 문제/보기 분리 스캔 대응)
// ============================================================================

function deduplicateProblems(problems: ExamProblemData[]): ExamProblemData[] {
  if (problems.length === 0) return problems;

  // content에서 비교용 정규화 문자열 생성 (공백/줄바꿈/특수문자 제거)
  const normalize = (text: string): string =>
    text.replace(/\s+/g, '').replace(/[①②③④⑤\(\)\[\]]/g, '').substring(0, 100);

  const seen = new Map<string, ExamProblemData>();
  const result: ExamProblemData[] = [];

  for (const problem of problems) {
    const key = normalize(problem.content);
    if (key.length < 10) {
      // ★ 짧은 콘텐츠 흡수 로직 제거 (2026-04-15)
      //   이전 문제로 흡수하면 서술형 (1)(2)가 객관식 선택지로 잘못 합쳐지는 사고가 발생.
      //   짧은 content 라도 항상 별도 카드로 푸시.
      result.push(problem);
      continue;
    }

    // ★ 중복 흡수 로직 제거 (2026-04-15)
    //   normalize 의 substring(0,100) 이 같은 도입어로 시작하는 다른 문제들의 key 를 같게 만들어
    //   34/35 번처럼 다른 문제가 흡수돼서 카드가 안 보이는 사고가 발생함.
    //   시중교재 자산화에서는 비슷한 도입어로 시작하는 문제가 흔하므로 흡수 자체가 위험.
    //   key 충돌이 있어도 항상 별도 카드로 push.
    seen.set(key, problem);
    result.push(problem);
  }

  return result;
}

// ============================================================================
// Hook: 시험지 ID로 문제 목록 조회
// ============================================================================

export function useExamProblems(examId: string | null) {
  const [problems, setProblems] = useState<ExamProblemData[]>([]);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ★ 초기 로드 시에만 스피너 표시. refetch 는 백그라운드에서 조용히 갱신되어
  //   카드 리스트가 사라졌다 다시 나타나는 "새로고침" 느낌을 없앤다.
  const hasLoadedOnceRef = useRef(false);

  // examId 바뀌면 초기 로드 상태로 리셋 (다른 시험지 열 때 스피너 정상 표시)
  useEffect(() => {
    hasLoadedOnceRef.current = false;
  }, [examId]);

  const fetchProblems = useCallback(async () => {
    if (!examId) {
      setProblems([]);
      setExamInfo(null);
      setIsLoading(false);
      return;
    }

    // 최초 1회만 로딩 스피너. 이후 refetch 는 silent.
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      // API route로 조회 (supabaseAdmin으로 RLS 바이패스)
      const res = await fetch(`/api/exams/${examId}`);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[ExamProblems] API error:', res.status, errData);
        setError(errData.error || `HTTP ${res.status}`);
        setIsLoading(false);
        return;
      }

      const data = await res.json();

      if (data.exam) {
        setExamInfo({
          id: data.exam.id,
          title: data.exam.title,
          subject: data.exam.subject || null,
          grade: data.exam.grade || null,
          examType: data.exam.exam_type || null,
          status: data.exam.status,
          problemCount: data.problemCount || data.problems?.length || 0,
          createdAt: data.exam.created_at,
        });
      }

      if (data.problems && data.problems.length > 0) {
        const mapped = data.problems.map((row: any, idx: number) =>
          toExamProblemData(row, idx)
        );
        // 중복 문제 감지 및 제거 (OCR이 문제와 보기를 따로 스캔하는 경우)
        const deduped = deduplicateProblems(mapped);
        // source_number가 설정된 문제는 번호 유지, 없는 경우만 순서대로 매김
        const hasSourceNumbers = deduped.some((p) => {
          const row = data.problems.find((r: any) => (r.problems?.id || r.id) === p.id);
          return row?.problems?.source_number != null || row?.source_number != null;
        });
        const renumbered = hasSourceNumbers
          ? deduped // source_number 기반 번호 유지
          : deduped.map((p, idx) => ({ ...p, number: idx + 1 })); // 순서대로
        setProblems(renumbered);
        console.log(`[ExamProblems] Loaded ${mapped.length} problems, deduped to ${renumbered.length} for exam ${examId}`);
      } else {
        setProblems([]);
        console.log(`[ExamProblems] No problems found for exam ${examId}`);
      }
    } catch (err) {
      console.error('[ExamProblems] Unexpected error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load problems');
    } finally {
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }, [examId]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  // 기존 시험지에 문제 추가
  const addProblems = useCallback(async (problemIds: string[]) => {
    if (!examId || problemIds.length === 0) return { success: false, added: 0 };
    try {
      const res = await fetch(`/api/exams/${examId}/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemIds }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchProblems(); // 목록 새로고침
      }
      return data;
    } catch (err: any) {
      console.error('[useExamProblems] addProblems error:', err.message);
      return { success: false, error: err.message };
    }
  }, [examId, fetchProblems]);

  return {
    problems,
    examInfo,
    isLoading,
    error,
    refetch: fetchProblems,
    addProblems,
  };
}

// ============================================================================
// Hook: 시험지 생성 (exams + exam_problems INSERT)
// ============================================================================

export function useCreateExam() {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createExam = async (params: {
    title: string;
    subject?: string;
    grade?: string;
    problemIds: string[];
    groupId?: string;
  }): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabaseBrowser) {
      console.log('[CreateExam] Supabase not configured, mock mode');
      // Mock: 가짜 ID 반환
      return `mock-exam-${Date.now()}`;
    }

    setIsCreating(true);
    setError(null);

    try {
      // ★ 서버 경유 — supabaseAdmin 으로 institute_id(격리 org=자기 institute) 박고 RLS 우회.
      //   클라 직접 INSERT 는 institute_id 누락→NULL→exam_problems RLS 거부로 0문항 사고
      //   (엄궁차수학 김도연 '문제 선택해 시험지 만들기'). /api/exams/generate 수동 모드 재사용.
      const res = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: params.title,
          problemIds: params.problemIds,
          bookGroupId: params.groupId || null,
          criteria: { subject: params.subject || '수학' },
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(d.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log(`[CreateExam] Created exam ${data.examId} with ${params.problemIds.length} problems`);
      return data.examId || null;

    } catch (err) {
      console.error('[CreateExam] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create exam');
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  return { createExam, isCreating, error };
}

// ============================================================================
// Hook: 시험지 목록 조회 (시험지관리용)
// ============================================================================

export interface ExamListItem {
  id: string;
  title: string;
  subject: string | null;
  examType: string | null;
  grade: string | null;
  status: string;
  problemCount: number;
  createdAt: string;
  bookGroupId: string | null;
}

export function useExamList() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    try {
      // ★ API route 사용 (supabaseAdmin으로 RLS 바이패스)
      // ★ 전체 목록 — 기본 200건이면 그보다 오래된 시험지가 시험지 관리·채점·리포트 고르기에서 사라진다
      //   (2026-10-25 HML 686건 적재로 최근 200건이 전부 새 자료가 되며 드러남).
      const res = await fetch('/api/exams?limit=5000');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[ExamList] API error:', res.status, errData);
        setError(errData.error || `HTTP ${res.status}`);
        setExams([]);
        return;
      }

      const data = await res.json();
      setExams(
        (data.exams || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          subject: e.subject || '공통수학1',
          examType: e.examType || '학교기출',
          grade: e.grade || '',
          status: e.status,
          problemCount: e.problemCount ?? 0,
          createdAt: e.createdAt,
          bookGroupId: e.bookGroupId || null,
        }))
      );

      console.log(`[ExamList] Loaded ${data.exams?.length || 0} exams via API`);
    } catch (err) {
      console.error('[ExamList] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load exams');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  return { exams, isLoading, error, refetch: fetchExams };
}
