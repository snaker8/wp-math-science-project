'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';
// Note: supabaseBrowser는 useCreateExam, useExamList에서 여전히 사용

// ============================================================================
// Types - 시험지에 연결된 문제 데이터
// ============================================================================

export interface ExamProblemData {
  id: string;
  number: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  content: string;
  choices: string[];
  answer: number | string;
  solution: string;
  year: string;
  typeCode: string;
  typeName: string;
  source: string;
  images?: Array<{ url: string; type: string; label: string }>;
}

export interface ExamInfo {
  id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  status: string;
  problemCount: number;
  createdAt: string;
}

// ============================================================================
// Type Code 표시용 변환
// MA-HS0-POL-01-003 → POL-01-003 (영역-성취기준-순번)
// ============================================================================

function formatDisplayTypeCode(rawCode: string): string {
  if (!rawCode) return '';
  // 이미 짧은 형식이면 그대로 (A001, POL-01-003 등)
  if (!rawCode.startsWith('MA-')) return rawCode;
  // MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ} → {DOMAIN}-{STD}-{SEQ}
  const parts = rawCode.split('-');
  if (parts.length >= 5) {
    return parts.slice(2).join('-'); // POL-01-003
  }
  return rawCode;
}

// ============================================================================
// source_name에서 학교명/연도 파싱
// "2025학년 경남고1 공통수학1 1학기 중간.pdf" → { school: "경남고", year: "2025" }
// ============================================================================

function parseSourceName(sourceName: string): { school: string; year: string } {
  if (!sourceName) return { school: '', year: '' };

  // 연도 추출: "2025학년" 또는 "2025" 패턴
  const yearMatch = sourceName.match(/(20\d{2})/);
  const year = yearMatch ? yearMatch[1] : '';

  // 학교명 추출: "경남고1", "용인고", "서울고2" 등 → 학교명만
  // 패턴: 2~4글자 한글 + "고" 또는 "중" 또는 "초"
  const schoolMatch = sourceName.match(/([가-힣]{1,6}(?:고|중|초))\d*/);
  const school = schoolMatch ? schoolMatch[1] : '';

  // 학교명을 못 찾으면 .pdf 확장자와 연도 제거 후 첫 토큰 사용
  if (!school) {
    const cleaned = sourceName.replace(/\.pdf$/i, '').replace(/20\d{2}학년?\s*/, '').trim();
    const firstToken = cleaned.split(/\s+/)[0];
    return { school: firstToken || sourceName.replace(/\.pdf$/i, ''), year };
  }

  return { school, year };
}

// ============================================================================
// LaTeX에서 선택지 추출
// ============================================================================

function extractChoicesFromLatex(latex: string): { content: string; choices: string[] } {
  let mainContent = latex;
  const choices: string[] = [];

  // 1차: ①~⑤ 패턴 시도
  const circledMarkers = ['①', '②', '③', '④', '⑤'];
  const firstCircledIdx = latex.indexOf('①');
  if (firstCircledIdx !== -1) {
    mainContent = latex.substring(0, firstCircledIdx).trim();
    const remaining = latex.substring(firstCircledIdx);

    for (let i = 0; i < circledMarkers.length; i++) {
      const marker = circledMarkers[i];
      const nextMarker = circledMarkers[i + 1];
      const startIdx = remaining.indexOf(marker);
      if (startIdx === -1) continue;

      let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
      if (endIdx === -1) endIdx = remaining.length;

      const choiceText = remaining.substring(startIdx, endIdx).trim();
      if (choiceText) choices.push(choiceText);
    }

    mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
    return { content: mainContent, choices };
  }

  // 2차: (1)~(5) 패턴 시도 → 소문제인지 선택지인지 판별
  const firstNumberedIdx = latex.indexOf('(1)');
  if (firstNumberedIdx !== -1) {
    const remaining = latex.substring(firstNumberedIdx);

    // ★ 소문제 판별: "구하시오", "구하여라", "[N점]" 등이 있으면 소문제 → 분리하지 않음
    const subProblemPatterns = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이과정|\[\s*\d+\s*점\s*\]/;
    if (!subProblemPatterns.test(remaining)) {
      const numberedMarkers = ['(1)', '(2)', '(3)', '(4)', '(5)'];
      mainContent = latex.substring(0, firstNumberedIdx).trim();

      for (let i = 0; i < numberedMarkers.length; i++) {
        const marker = numberedMarkers[i];
        const nextMarker = numberedMarkers[i + 1];
        const startIdx = remaining.indexOf(marker);
        if (startIdx === -1) continue;

        let endIdx = nextMarker ? remaining.indexOf(nextMarker) : remaining.length;
        if (endIdx === -1) endIdx = remaining.length;

        let choiceText = remaining.substring(startIdx, endIdx).trim();
        // (1) → ① 변환
        choiceText = choiceText.replace(/^\((\d)\)/, (_, num) => circledMarkers[parseInt(num) - 1] || `(${num})`);
        if (choiceText) choices.push(choiceText);
      }

      mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
      return { content: mainContent, choices };
    }
  }

  // $ 기호로 감싸진 수학식 정리
  mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();

  return { content: mainContent, choices };
}

// ============================================================================
// answer_json에서 정답 번호 추출
// ============================================================================

function extractAnswerNumber(answerJson: Record<string, unknown>): number | string {
  // 다양한 포맷 지원
  if (answerJson.correct_answer !== undefined) {
    const ans = answerJson.correct_answer;
    if (typeof ans === 'number') return ans;
    if (typeof ans === 'string') {
      const num = parseInt(ans, 10);
      if (!isNaN(num) && num >= 1 && num <= 5) return num;
      return ans;
    }
  }
  if (answerJson.answer !== undefined) {
    const ans = answerJson.answer;
    if (typeof ans === 'number') return ans;
    if (typeof ans === 'string') {
      const num = parseInt(ans, 10);
      if (!isNaN(num)) return num;
      return ans;
    }
  }
  if (answerJson.value !== undefined) return answerJson.value as number;
  if (answerJson.values !== undefined) return String(answerJson.values);

  return '-';
}

// ============================================================================
// DB 행 → ExamProblemData 변환
// ============================================================================

function toExamProblemData(
  row: any,
  index: number,
): ExamProblemData {
  const problem = row.problems || row;
  const classification = Array.isArray(problem.classifications)
    ? problem.classifications[0]
    : problem.classifications;

  // ★ 1순위: answer_json.choices (자산화 시 별도 저장된 선택지)
  const answerJson = problem.answer_json || {};
  const dbChoices: string[] = Array.isArray(answerJson.choices) ? answerJson.choices : [];

  // ★ 2순위: content_latex에서 추출 (fallback)
  const { content, choices: extractedChoices } = extractChoicesFromLatex(problem.content_latex || '');

  // DB에 저장된 선택지가 있으면 우선 사용
  const choices = dbChoices.length > 0 ? dbChoices : extractedChoices;

  // type_code → 표시용 짧은 코드 변환
  // MA-HS0-POL-01-003 → POL-01-003, 이미 짧으면 그대로
  const rawTypeCode = classification?.type_code || '';
  const typeCode = formatDisplayTypeCode(rawTypeCode);

  // typeName: ai_analysis에서 추출 (classifications 테이블에 type_name 컬럼 없음)
  let typeName = '';
  const aiClass = problem.ai_analysis?.classification;
  if (aiClass?.typeName && aiClass.typeName !== rawTypeCode) {
    typeName = aiClass.typeName;
  }
  // 여전히 없으면 typeCode 표시
  if (!typeName) typeName = typeCode;

  // source_name에서 학교명/연도 파싱
  const sourceName = problem.source_name || '';
  const parsed = parseSourceName(sourceName);
  const displayYear = problem.source_year ? String(problem.source_year) : parsed.year;
  const displaySource = parsed.school || sourceName.replace(/\.pdf$/i, '');

  return {
    id: problem.id,
    number: row.sequence_number ?? row.order_index ?? (index + 1),
    difficulty: classification
      ? (parseInt(classification.difficulty, 10) as 1 | 2 | 3 | 4 | 5)
      : 3,
    cognitiveDomain: classification?.cognitive_domain || 'UNDERSTANDING',
    content,
    choices,
    answer: extractAnswerNumber(answerJson),
    solution: problem.solution_latex || '',
    year: displayYear,
    typeCode,
    typeName,
    source: displaySource,
  };
}

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
      // 너무 짧은 콘텐츠 (선택지만 있는 경우) - 별도 처리
      // 이전 문제에 선택지가 없으면 이 항목의 선택지를 병합
      if (problem.choices.length > 0 && result.length > 0) {
        const lastProblem = result[result.length - 1];
        if (lastProblem.choices.length === 0) {
          result[result.length - 1] = {
            ...lastProblem,
            choices: problem.choices,
          };
          continue;
        }
      }
      result.push(problem);
      continue;
    }

    const existing = seen.get(key);
    if (existing) {
      // 중복 발견 - 더 완전한 데이터로 병합
      const existingIdx = result.findIndex(p => p.id === existing.id);
      if (existingIdx !== -1) {
        const merged = { ...existing };
        // 선택지가 없는 기존 항목에 선택지 추가
        if (merged.choices.length === 0 && problem.choices.length > 0) {
          merged.choices = problem.choices;
        }
        // 풀이가 없는 기존 항목에 풀이 추가
        if (!merged.solution && problem.solution) {
          merged.solution = problem.solution;
        }
        result[existingIdx] = merged;
      }
      continue;
    }

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

  const fetchProblems = useCallback(async () => {
    if (!examId) {
      setProblems([]);
      setExamInfo(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
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
        // 번호 재정렬
        const renumbered = deduped.map((p, idx) => ({ ...p, number: idx + 1 }));
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
    }
  }, [examId]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  return {
    problems,
    examInfo,
    isLoading,
    error,
    refetch: fetchProblems,
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
      const { data: { user } } = await supabaseBrowser.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        return null;
      }

      // 1. exams 테이블에 INSERT
      const { data: examData, error: examError } = await supabaseBrowser
        .from('exams')
        .insert({
          title: params.title,
          subject: params.subject || null,
          grade: params.grade || null,
          status: 'DRAFT',
          total_points: params.problemIds.length * 4,
          created_by: user.id,
        })
        .select('id')
        .single();

      if (examError || !examData) {
        throw examError || new Error('Failed to create exam');
      }

      // 2. exam_problems 테이블에 문제 연결
      const examProblems = params.problemIds.map((problemId, idx) => ({
        exam_id: examData.id,
        problem_id: problemId,
        sequence_number: idx + 1,
        points: 4,
      }));

      const { error: linkError } = await supabaseBrowser
        .from('exam_problems')
        .insert(examProblems);

      if (linkError) {
        console.error('[CreateExam] Link problems error:', linkError.message);
        // 시험지는 생성됐으므로 ID는 반환
      }

      console.log(`[CreateExam] Created exam ${examData.id} with ${params.problemIds.length} problems`);
      return examData.id;

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
  grade: string | null;
  status: string;
  problemCount: number;
  createdAt: string;
}

export function useExamList() {
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    if (!isSupabaseConfigured || !supabaseBrowser) {
      console.log('[ExamList] Supabase not configured');
      setExams([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabaseBrowser
        .from('exams')
        .select('id, title, status, total_points, created_at, exam_problems(count)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (fetchError) {
        console.error('[ExamList] Fetch error:', fetchError.message);
        setError(fetchError.message);
        setExams([]);
        return;
      }

      setExams(
        (data || []).map((e: any) => ({
          id: e.id,
          title: e.title,
          subject: null,
          grade: null,
          status: e.status,
          problemCount: e.exam_problems?.[0]?.count ?? 0,
          createdAt: e.created_at,
        }))
      );

      console.log(`[ExamList] Loaded ${data?.length || 0} exams`);
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
