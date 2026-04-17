'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/client';
import { cleanLatexContent, cleanChoiceText } from '@/lib/utils/clean-latex';
// Note: supabaseBrowser는 useCreateExam, useExamList에서 여전히 사용

// ============================================================================
// Types - 시험지에 연결된 문제 데이터
// ============================================================================

export interface ExamProblemData {
  id: string;
  number: number;
  difficulty: number; // 수학비서 기준 1~10
  cognitiveDomain: 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';
  content: string;
  choices: string[];
  /** ★ 표 형식 선택지 열 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"]) */
  choiceHeaders?: string[];
  /** ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로) */
  choiceLayout?: number;
  answer: number | string;
  /** ★ 원본 answer_json 전체 (수정 모달에서 보존용) */
  answerJson?: Record<string, unknown>;
  solution: string;
  year: string;
  typeCode: string;
  typeName: string;
  source: string;
  images?: Array<{ url: string; type: string; label: string }>;
  hasFigure?: boolean;
  figureSvg?: string;
  figureData?: import('@/types/ocr').InterpretedFigure;
  /** ★ 업스케일된 크롭 이미지 URL */
  upscaledCropUrl?: string;
  /** 도형 소스: 'upscaled_crop' = 업스케일 원본 사용, 'ai_generated' 등 */
  figureSource?: 'upscaled_crop' | 'ai_generated';
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

  // 2차: (1)~(5) 패턴은 ★ 항상 서술형 소문제로 간주한다 ★
  //   - 객관식 보기는 반드시 ①②③④⑤ 원문자로만 표기되도록 OCR/정규화 단계에서 처리됨
  //   - (1)(2)... 는 본문에 그대로 두고 분리하지 않음 → 모달/화면 모두 서술형으로 인식
  //   - 흡수/객관식오인식 사고를 원천 차단
  if (latex.indexOf('(1)') !== -1) {
    mainContent = mainContent.replace(/\n{3,}/g, '\n\n').trim();
    return { content: mainContent, choices: [] };
  }

  // (객관식 (1)(2)... 분리 로직은 더 이상 사용하지 않음 — 위 if문이 모든 (1) 케이스를 잡음)
  const firstNumberedIdx = -1; // 도달 불가, 아래 블록 dead code
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

/** ①~⑤ → 1~5 매핑 */
const CIRCLED_TO_NUM: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };

function extractAnswerNumber(answerJson: Record<string, unknown>): number | string {
  // 다양한 포맷 지원 (우선순위 순)
  const candidates = ['correct_answer', 'finalAnswer', 'answer', 'value'];
  for (const key of candidates) {
    if (answerJson[key] !== undefined && answerJson[key] !== null && answerJson[key] !== '') {
      const ans = answerJson[key];
      if (typeof ans === 'number') {
        // 1~5 → 객관식 번호, 그 외 정수는 주관식 정답
        return ans;
      }
      if (typeof ans === 'string' && ans.trim()) {
        const trimmed = ans.trim();
        // ★ ①~⑤로 시작하면 객관식 답번호 추출 (선택지 텍스트 포함 시)
        const firstChar = trimmed.charAt(0);
        if (CIRCLED_TO_NUM[firstChar]) return CIRCLED_TO_NUM[firstChar];
        // 순수 정수 문자열 → 숫자 반환
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && String(num) === trimmed) return num;
        // 그 외 문자열 (수식 등) 그대로 반환
        return trimmed;
      }
    }
  }
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
  // ★ 표 형식 선택지 헤더 (예: ["ㄱ","ㄴ","ㄷ","ㄹ"])
  const choiceHeaders: string[] | undefined = Array.isArray(answerJson.choiceHeaders) ? answerJson.choiceHeaders : undefined;
  // ★ 저장된 선택지 레이아웃 (1=1열, 2=2열, 5=가로)
  const choiceLayout: number | undefined = typeof answerJson.choiceLayout === 'number' ? answerJson.choiceLayout : undefined;

  // ★ 2순위: content_latex에서 추출 (fallback)
  const { content: rawContent, choices: extractedChoices } = extractChoicesFromLatex(problem.content_latex || '');
  // ★ LaTeX 정리 (공통 유틸 — 모든 페이지에 자동 적용)
  const content = cleanLatexContent(rawContent);

  // DB에 저장된 선택지가 있으면 우선 사용 + LaTeX 정리
  const rawChoices = dbChoices.length > 0 ? dbChoices : extractedChoices;
  const choices = rawChoices.map(c => cleanChoiceText(c));

  // type_code → 표시용 짧은 코드 변환
  // MA-HS0-POL-01-003 → POL-01-003, 이미 짧으면 그대로
  const rawTypeCode = classification?.type_code || '';
  const typeCode = formatDisplayTypeCode(rawTypeCode);

  // typeName: 1순위 classifications.type_name (DB 조회), 2순위 ai_analysis
  let typeName = '';
  // ★ 1순위: API에서 expanded_math_types 조인한 type_name
  if (classification?.type_name) {
    typeName = classification.type_name;
  }
  // ★ 2순위: ai_analysis에서 추출
  if (!typeName) {
    const aiClass = problem.ai_analysis?.classification;
    if (aiClass?.typeName && aiClass.typeName !== rawTypeCode) {
      typeName = aiClass.typeName;
    }
  }
  // 3순위: typeName 없으면 빈 문자열 유지 (typeCode와 중복 표시 방지)
  // UI에서 typeCode만 표시, typeName이 있을 때만 ". typeName" 추가

  // source_name에서 학교명/연도 파싱
  const sourceName = problem.source_name || '';
  const parsed = parseSourceName(sourceName);
  const displayYear = problem.source_year ? String(problem.source_year) : parsed.year;
  const displaySource = parsed.school || sourceName.replace(/\.pdf$/i, '');

  // images 배열 (크롭 이미지 등)
  const rawImages = problem.images;
  const images: Array<{ url: string; type: string; label: string }> = Array.isArray(rawImages) ? rawImages : [];

  // 도형 포함 여부 + AI 생성 SVG + 구조화된 도형 데이터 (ai_analysis에서 추출)
  const hasFigure = problem.ai_analysis?.hasFigure || false;
  const figureSvg = problem.ai_analysis?.figureSvg || undefined;
  const figureData = problem.ai_analysis?.figureData || undefined;
  // ★ 업스케일된 크롭 이미지 (원본이 쓸만할 때 AI 없이 사용)
  const upscaledCropUrl = problem.ai_analysis?.upscaledCropUrl || undefined;
  const figureSource = problem.ai_analysis?.figureSource || undefined;

  // DEBUG: figureData 추출 확인
  if (hasFigure) {
    const aiKeys = problem.ai_analysis ? Object.keys(problem.ai_analysis) : [];
    console.log(`[toExamProblemData] #${index + 1} aiKeys=[${aiKeys.join(',')}], hasFigureData=${!!figureData}, hasFigureSvg=${!!figureSvg}${figureData ? `, fdType=${figureData.figureType}, fdHasSvg=${!!figureData.rendering?.svg}` : ''}`);
  }

  return {
    id: problem.id,
    number: problem.source_number ?? row.sequence_number ?? row.order_index ?? (index + 1),
    difficulty: classification
      ? Math.min(10, Math.max(1, parseInt(classification.difficulty, 10) || 3))
      : 3,
    cognitiveDomain: classification?.cognitive_domain || 'UNDERSTANDING',
    content,
    choices,
    choiceHeaders,
    choiceLayout,
    answer: extractAnswerNumber(answerJson),
    answerJson: answerJson as Record<string, unknown>,
    solution: problem.solution_latex || '',
    year: displayYear,
    typeCode,
    typeName,
    source: displaySource,
    images,
    hasFigure,
    figureSvg,
    figureData,
    upscaledCropUrl,
    figureSource,
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
      const res = await fetch('/api/exams');
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
