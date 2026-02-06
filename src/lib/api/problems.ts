// ============================================================================
// Problems API Service
// 문제 관리 CRUD
// ============================================================================

import { supabaseBrowser } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/client';

type ProblemRow = Database['public']['Tables']['problems']['Row'];
type ClassificationRow = Database['public']['Tables']['classifications']['Row'];

export interface Problem {
  id: string;
  contentLatex: string;
  contentHtml: string | null;
  solutionLatex: string | null;
  solutionHtml: string | null;
  answer: Record<string, unknown>;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'ARCHIVED';
  sourceName: string | null;
  sourceYear: number | null;
  tags: string[] | null;
  classification?: {
    typeCode: string;
    difficulty: string;
    cognitiveDomain: string;
    aiConfidence: number | null;
  };
  viewCount: number;
  usageCount: number;
  createdAt: string;
}

function toProblem(row: ProblemRow, classification?: ClassificationRow): Problem {
  return {
    id: row.id,
    contentLatex: row.content_latex,
    contentHtml: row.content_html,
    solutionLatex: row.solution_latex,
    solutionHtml: row.solution_html,
    answer: row.answer_json,
    status: row.status,
    sourceName: row.source_name,
    sourceYear: row.source_year,
    tags: row.tags,
    classification: classification ? {
      typeCode: classification.type_code,
      difficulty: classification.difficulty,
      cognitiveDomain: classification.cognitive_domain,
      aiConfidence: classification.ai_confidence,
    } : undefined,
    viewCount: row.view_count,
    usageCount: row.usage_count,
    createdAt: row.created_at,
  };
}

/**
 * 문제 목록 조회
 */
export async function getProblems(options?: {
  instituteId?: string;
  typeCode?: string;
  difficulty?: string;
  status?: ProblemRow['status'];
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Problem[]; count: number }> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured, returning mock data');
    return { data: getMockProblems(), count: 20 };
  }

  let query = supabaseBrowser
    .from('problems')
    .select(`
      *,
      classifications (*)
    `, { count: 'exact' })
    .is('deleted_at', null);

  if (options?.instituteId) {
    query = query.eq('institute_id', options.instituteId);
  }
  if (options?.status) {
    query = query.eq('status', options.status);
  }
  if (options?.search) {
    query = query.or(`content_latex.ilike.%${options.search}%,source_name.ilike.%${options.search}%`);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('[API] getProblems error:', error);
    return { data: getMockProblems(), count: 20 };
  }

  return {
    data: (data || []).map((row) => {
      const classifications = row.classifications as ClassificationRow[] | null;
      return toProblem(row, classifications?.[0]);
    }),
    count: count || 0,
  };
}

/**
 * 문제 상세 조회
 */
export async function getProblem(id: string): Promise<Problem | null> {
  if (!supabaseBrowser) {
    return getMockProblems().find(p => p.id === id) || null;
  }

  const { data, error } = await supabaseBrowser
    .from('problems')
    .select(`
      *,
      classifications (*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('[API] getProblem error:', error);
    return null;
  }

  if (!data) return null;

  const classifications = data.classifications as ClassificationRow[] | null;
  return toProblem(data, classifications?.[0]);
}

/**
 * 문제 생성
 */
export async function createProblem(problem: {
  contentLatex: string;
  contentHtml?: string;
  solutionLatex?: string;
  answer?: Record<string, unknown>;
  instituteId?: string;
  createdBy?: string;
  typeCode?: string;
  difficulty?: string;
}): Promise<Problem | null> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    return null;
  }

  const problemId = crypto.randomUUID();

  const { data, error } = await supabaseBrowser
    .from('problems')
    .insert({
      id: problemId,
      content_latex: problem.contentLatex,
      content_html: problem.contentHtml || null,
      solution_latex: problem.solutionLatex || null,
      solution_html: null,
      answer_json: problem.answer || {},
      images: [],
      status: 'DRAFT',
      institute_id: problem.instituteId || null,
      created_by: problem.createdBy || null,
      ai_analysis: {},
    })
    .select()
    .single();

  if (error) {
    console.error('[API] createProblem error:', error);
    return null;
  }

  // 분류 정보가 있으면 저장
  if (problem.typeCode && data) {
    await supabaseBrowser
      .from('classifications')
      .insert({
        problem_id: problemId,
        type_code: problem.typeCode,
        difficulty: (problem.difficulty || '3') as '1' | '2' | '3' | '4' | '5',
        cognitive_domain: 'UNDERSTANDING',
        is_verified: false,
        classification_source: 'manual',
      });
  }

  return data ? toProblem(data) : null;
}

/**
 * 문제 수정
 */
export async function updateProblem(
  id: string,
  updates: {
    contentLatex?: string;
    solutionLatex?: string;
    status?: ProblemRow['status'];
    tags?: string[];
  }
): Promise<Problem | null> {
  if (!supabaseBrowser) {
    console.warn('[API] Supabase not configured');
    return null;
  }

  const updateData: Partial<ProblemRow> = {};
  if (updates.contentLatex) updateData.content_latex = updates.contentLatex;
  if (updates.solutionLatex) updateData.solution_latex = updates.solutionLatex;
  if (updates.status) updateData.status = updates.status;
  if (updates.tags) updateData.tags = updates.tags;

  const { data, error } = await supabaseBrowser
    .from('problems')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[API] updateProblem error:', error);
    return null;
  }

  return data ? toProblem(data) : null;
}

/**
 * 유형별 문제 조회
 */
export async function getProblemsByType(typeCode: string, limit = 10): Promise<Problem[]> {
  if (!supabaseBrowser) {
    return getMockProblems().filter(p => p.classification?.typeCode === typeCode).slice(0, limit);
  }

  const { data, error } = await supabaseBrowser
    .from('classifications')
    .select(`
      problems (*)
    `)
    .eq('type_code', typeCode)
    .limit(limit);

  if (error) {
    console.error('[API] getProblemsByType error:', error);
    return [];
  }

  return (data || [])
    .map((row) => {
      const problem = row.problems as unknown as ProblemRow | null;
      return problem ? toProblem(problem) : null;
    })
    .filter((p): p is Problem => p !== null);
}

// ============================================================================
// Mock Data
// ============================================================================

function getMockProblems(): Problem[] {
  return [
    {
      id: '1',
      contentLatex: '\\text{다음 이차방정식의 두 근을 구하시오.} \\\\ x^2 - 5x + 6 = 0',
      contentHtml: null,
      solutionLatex: 'x^2 - 5x + 6 = (x-2)(x-3) = 0 \\\\ \\therefore x = 2 \\text{ 또는 } x = 3',
      solutionHtml: null,
      answer: { values: [2, 3] },
      status: 'APPROVED',
      sourceName: '2024 수능완성',
      sourceYear: 2024,
      tags: ['이차방정식', '인수분해'],
      classification: { typeCode: 'MA-HS1-EQ-01', difficulty: '2', cognitiveDomain: 'CALCULATION', aiConfidence: 0.95 },
      viewCount: 120,
      usageCount: 45,
      createdAt: '2024-01-01',
    },
    {
      id: '2',
      contentLatex: '\\lim_{x \\to 0} \\frac{\\sin 3x}{x} \\text{의 값을 구하시오.}',
      contentHtml: null,
      solutionLatex: '\\lim_{x \\to 0} \\frac{\\sin 3x}{x} = \\lim_{x \\to 0} 3 \\cdot \\frac{\\sin 3x}{3x} = 3 \\cdot 1 = 3',
      solutionHtml: null,
      answer: { value: 3 },
      status: 'APPROVED',
      sourceName: '2024 평가원 모의고사',
      sourceYear: 2024,
      tags: ['극한', '삼각함수'],
      classification: { typeCode: 'MA-CAL-LIM-02', difficulty: '3', cognitiveDomain: 'UNDERSTANDING', aiConfidence: 0.92 },
      viewCount: 89,
      usageCount: 32,
      createdAt: '2024-01-02',
    },
    {
      id: '3',
      contentLatex: '\\int_0^1 (3x^2 + 2x) dx \\text{의 값을 구하시오.}',
      contentHtml: null,
      solutionLatex: '\\int_0^1 (3x^2 + 2x) dx = [x^3 + x^2]_0^1 = (1 + 1) - (0) = 2',
      solutionHtml: null,
      answer: { value: 2 },
      status: 'APPROVED',
      sourceName: '2024 수능특강',
      sourceYear: 2024,
      tags: ['정적분', '다항함수'],
      classification: { typeCode: 'MA-CAL-INT-01', difficulty: '2', cognitiveDomain: 'CALCULATION', aiConfidence: 0.98 },
      viewCount: 156,
      usageCount: 67,
      createdAt: '2024-01-03',
    },
  ];
}
