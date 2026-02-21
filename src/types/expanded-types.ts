// ============================================================================
// Expanded Math Types — 505개 성취기준 → 1,139+ 세부유형
// ============================================================================

/** 학교급별 레벨 코드 */
export type LevelCode =
  | 'ES12' | 'ES34' | 'ES56'  // 초등
  | 'MS'                        // 중학교
  | 'HS0' | 'HS1' | 'HS2'     // 고등
  | 'CAL' | 'PRB' | 'GEO';    // 고등 선택

/** 영역 코드 (24개) */
export type DomainCode =
  | 'POL' | 'EQU' | 'INE' | 'SET' | 'FUN' | 'CNT' | 'CRD'
  | 'EXP' | 'TRI' | 'SEQ' | 'LIM' | 'DIF' | 'INT'
  | 'PER' | 'PRB' | 'STA' | 'VEC' | 'CON' | 'SPC'
  | 'NUM' | 'GEO' | 'PAT' | 'DAT';

/** 인지 영역 */
export type CognitiveDomain = 'CALCULATION' | 'UNDERSTANDING' | 'INFERENCE' | 'PROBLEM_SOLVING';

/** 학교급 */
export type SchoolLevel = '초등학교' | '중학교' | '고등학교';

// ============================================================================
// 데이터 인터페이스
// ============================================================================

/** 프론트엔드 확장 유형 (camelCase) */
export interface ExpandedMathType {
  id: string;
  typeCode: string;
  typeName: string;
  description: string | null;
  solutionMethod: string | null;
  subject: string;
  area: string;
  standardCode: string;
  standardContent: string | null;
  cognitive: CognitiveDomain;
  difficultyMin: number;
  difficultyMax: number;
  keywords: string[];
  schoolLevel: string;
  levelCode: string;
  domainCode: string;
  isActive: boolean;
  problemCount: number;
}

/** DB 행 (snake_case — Supabase 매핑) */
export interface ExpandedMathTypeRow {
  id: string;
  type_code: string;
  type_name: string;
  description: string | null;
  solution_method: string | null;
  subject: string;
  area: string;
  standard_code: string;
  standard_content: string | null;
  cognitive: string;
  difficulty_min: number;
  difficulty_max: number;
  keywords: string | string[];
  school_level: string;
  level_code: string;
  domain_code: string;
  is_active: boolean;
  problem_count: number;
  created_at: string;
  updated_at: string;
}

/** DB row → 프론트엔드 변환 */
export function toExpandedMathType(row: ExpandedMathTypeRow): ExpandedMathType {
  const kw = row.keywords;
  const keywords: string[] = Array.isArray(kw) ? kw : typeof kw === 'string' ? JSON.parse(kw) : [];

  return {
    id: row.id,
    typeCode: row.type_code,
    typeName: row.type_name,
    description: row.description,
    solutionMethod: row.solution_method,
    subject: row.subject,
    area: row.area,
    standardCode: row.standard_code,
    standardContent: row.standard_content,
    cognitive: row.cognitive as CognitiveDomain,
    difficultyMin: row.difficulty_min,
    difficultyMax: row.difficulty_max,
    keywords,
    schoolLevel: row.school_level,
    levelCode: row.level_code,
    domainCode: row.domain_code,
    isActive: row.is_active,
    problemCount: row.problem_count,
  };
}

// ============================================================================
// 트리 구조 타입 (Skills 페이지 네비게이션)
// ============================================================================

/** Level → Domain → Standard → Type 4단 계층 */
export interface LevelNode {
  levelCode: string;
  label: string;
  schoolLevel: string;
  domainCount: number;
  typeCount: number;
  domains: DomainNode[];
}

export interface DomainNode {
  domainCode: string;
  label: string;
  standardCount: number;
  typeCount: number;
  standards: StandardNode[];
}

export interface StandardNode {
  standardCode: string;
  standardContent: string;
  typeCount: number;
  types: ExpandedMathType[];
}

// ============================================================================
// 라벨 매핑
// ============================================================================

export const LEVEL_CODE_LABELS: Record<string, string> = {
  ES12: '초등 1-2학년',
  ES34: '초등 3-4학년',
  ES56: '초등 5-6학년',
  MS:   '중학교',
  HS0:  '고등 공통(수학)',
  HS1:  '수학Ⅰ / 대수',
  HS2:  '수학Ⅱ',
  CAL:  '미적분',
  PRB:  '확률과 통계',
  GEO:  '기하',
};

export const DOMAIN_CODE_LABELS: Record<string, string> = {
  POL: '다항식',       EQU: '방정식',        INE: '부등식',
  SET: '집합과 명제',  FUN: '함수',          CNT: '경우의 수',
  CRD: '좌표와 도형',  EXP: '지수와 로그',    TRI: '삼각함수',
  SEQ: '수열',         LIM: '극한',          DIF: '미분',
  INT: '적분',         PER: '순열과 조합',    PRB: '확률',
  STA: '통계',         VEC: '벡터',          CON: '이차곡선',
  SPC: '공간도형',     NUM: '수와 연산',      GEO: '도형과 측정',
  PAT: '변화와 관계',  DAT: '자료와 가능성',
};

export const COGNITIVE_LABELS_KR: Record<CognitiveDomain, string> = {
  CALCULATION: '계산',
  UNDERSTANDING: '이해',
  INFERENCE: '추론',
  PROBLEM_SOLVING: '해결',
};

export const COGNITIVE_COLORS: Record<CognitiveDomain, string> = {
  CALCULATION: '#bb0808',
  UNDERSTANDING: '#198cf8',
  INFERENCE: '#f58c3d',
  PROBLEM_SOLVING: '#8b5cf6',
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '최하', 2: '하', 3: '중', 4: '상', 5: '최상',
};

export const DIFFICULTY_COLORS: Record<number, string> = {
  1: '#6b7280', 2: '#198cf8', 3: '#f58c3d', 4: '#fc1f1f', 5: '#bb0808',
};

/** 레벨 코드 정렬 순서 */
export const LEVEL_CODE_ORDER: string[] = [
  'ES12', 'ES34', 'ES56', 'MS', 'HS0', 'HS1', 'HS2', 'CAL', 'PRB', 'GEO',
];

// ============================================================================
// flat → tree 변환 유틸리티
// ============================================================================

export function buildTypeTree(types: ExpandedMathType[]): LevelNode[] {
  const levelMap = new Map<string, LevelNode>();

  for (const t of types) {
    // Level
    if (!levelMap.has(t.levelCode)) {
      levelMap.set(t.levelCode, {
        levelCode: t.levelCode,
        label: LEVEL_CODE_LABELS[t.levelCode] || t.subject,
        schoolLevel: t.schoolLevel,
        domainCount: 0,
        typeCount: 0,
        domains: [],
      });
    }
    const level = levelMap.get(t.levelCode)!;
    level.typeCount++;

    // Domain
    let domain = level.domains.find(d => d.domainCode === t.domainCode);
    if (!domain) {
      domain = {
        domainCode: t.domainCode,
        label: DOMAIN_CODE_LABELS[t.domainCode] || t.area,
        standardCount: 0,
        typeCount: 0,
        standards: [],
      };
      level.domains.push(domain);
      level.domainCount++;
    }
    domain.typeCount++;

    // Standard
    let standard = domain.standards.find(s => s.standardCode === t.standardCode);
    if (!standard) {
      standard = {
        standardCode: t.standardCode,
        standardContent: t.standardContent || '',
        typeCount: 0,
        types: [],
      };
      domain.standards.push(standard);
      domain.standardCount++;
    }
    standard.typeCount++;
    standard.types.push(t);
  }

  // 정렬
  const sorted = Array.from(levelMap.values()).sort(
    (a, b) => LEVEL_CODE_ORDER.indexOf(a.levelCode) - LEVEL_CODE_ORDER.indexOf(b.levelCode)
  );

  return sorted;
}
