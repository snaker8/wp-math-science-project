// ============================================================================
// AI Functions API Client
// OpenAI GPT-4o 기반 자동 분류 및 유사문제 생성 API
// ============================================================================

// Types
export interface AutoTagRequest {
  problemText: string;
  latex?: string;
  subject?: string;
}

export interface AutoTagResult {
  skillId: string;
  skillName: string;
  skillPath: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  difficultyLabel: '최하' | '하' | '중' | '상' | '최상';
  cognitiveType: 'calculation' | 'understanding' | 'reasoning' | 'problem_solving';
  cognitiveLabel: '계산' | '이해' | '추론' | '해결';
  confidence: number;
  reasoning: string;
}

export interface AutoTagResponse {
  success: boolean;
  data?: AutoTagResult;
  error?: string;
}

export interface TwinProblemRequest {
  originalLatex: string;
  originalText?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  preserveStructure?: boolean;
}

export interface TwinProblemResult {
  problemLatex: string;
  problemText: string;
  answer: string;
  answerLatex?: string;
  solution: string;
  solutionLatex?: string;
  changesApplied: string[];
}

export interface TwinProblemResponse {
  success: boolean;
  data?: TwinProblemResult;
  error?: string;
}

// ============================================================================
// API Configuration
// ============================================================================

const getSupabaseUrl = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }
  return url;
};

const getSupabaseAnonKey = () => {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured');
  }
  return key;
};

// ============================================================================
// Auto-Tagging API
// 자동 유형 분류
// ============================================================================

export async function autoTagProblem(
  request: AutoTagRequest
): Promise<AutoTagResponse> {
  try {
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();

    const response = await fetch(`${supabaseUrl}/functions/v1/ai-auto-tag`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    return response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// ============================================================================
// Twin Problem Generation API
// 유사 문제 생성
// ============================================================================

export async function generateTwinProblem(
  request: TwinProblemRequest
): Promise<TwinProblemResponse> {
  try {
    const supabaseUrl = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();

    const response = await fetch(`${supabaseUrl}/functions/v1/ai-twin-problem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    return response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '최하',
  2: '하',
  3: '중',
  4: '상',
  5: '최상',
};

export const COGNITIVE_LABELS: Record<string, string> = {
  calculation: '계산',
  understanding: '이해',
  reasoning: '추론',
  problem_solving: '해결',
};

export const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#2e2d2d',
  2: '#198cf8',
  3: '#f58c3d',
  4: '#fc1f1f',
  5: '#bb0808',
};

export const COGNITIVE_COLORS: Record<string, string> = {
  calculation: '#bb0808',
  understanding: '#fc1f1f',
  reasoning: '#f58c3d',
  problem_solving: '#198cf8',
};
