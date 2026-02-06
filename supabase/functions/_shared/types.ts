// ============================================================================
// AI Function Types - Shared Types for Edge Functions
// ============================================================================

// Auto-Tagging Types
export interface AutoTagRequest {
  problemText: string;
  latex?: string;
  subject?: string;
}

export interface AutoTagResponse {
  success: boolean;
  data?: {
    skillId: string;
    skillName: string;
    skillPath: string[];
    difficulty: 1 | 2 | 3 | 4 | 5;
    difficultyLabel: '최하' | '하' | '중' | '상' | '최상';
    cognitiveType: 'calculation' | 'understanding' | 'reasoning' | 'problem_solving';
    cognitiveLabel: '계산' | '이해' | '추론' | '해결';
    confidence: number;
    reasoning: string;
  };
  error?: string;
}

// Twin Problem Types
export interface TwinProblemRequest {
  originalLatex: string;
  originalText?: string;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  preserveStructure?: boolean;
}

export interface TwinProblemResponse {
  success: boolean;
  data?: {
    problemLatex: string;
    problemText: string;
    answer: string;
    answerLatex?: string;
    solution: string;
    solutionLatex?: string;
    changesApplied: string[];
  };
  error?: string;
}

// OpenAI Types
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIChoice {
  message: {
    content: string;
  };
  finish_reason: string;
}

export interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
