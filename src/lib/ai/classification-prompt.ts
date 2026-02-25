/**
 * GPT-4o 문제 분류 프롬프트 빌더
 *
 * expanded_math_types 데이터를 기반으로 시스템 프롬프트를 생성합니다.
 * - light 모드: 해당 레벨의 유형 테이블만 (~2K 토큰)
 * - full 모드: 전체 성취기준 + 난이도 루브릭 포함 (~8K 토큰)
 */

import { supabaseAdmin } from '@/lib/supabase/server';

interface BuildPromptOptions {
  mode: 'light' | 'full';
  levelCode?: string; // 특정 레벨로 필터 (HS0, MS 등)
}

/**
 * GPT-4o 분류용 시스템 프롬프트 빌드
 */
export async function buildClassificationPrompt(options: BuildPromptOptions): Promise<string> {
  const { mode, levelCode } = options;

  if (mode === 'light') {
    return buildLightPrompt(levelCode);
  }
  return buildFullPrompt(levelCode);
}

/**
 * Light 모드: 해당 레벨의 유형 코드 + 이름 테이블만
 */
async function buildLightPrompt(levelCode?: string): Promise<string> {
  const typeLookup = await getCompactTypeLookup(levelCode);

  return `당신은 한국 수학 교육 전문가입니다. 주어진 수학 문제를 분석하여 아래 유형 테이블에서 가장 적합한 유형을 선택하세요.

═══════════════════════════════════════
■ 유형 분류 테이블
═══════════════════════════════════════

${typeLookup}

═══════════════════════════════════════
■ 응답 형식 (반드시 JSON)
═══════════════════════════════════════

{
  "classification": {
    "expandedTypeCode": "MA-HS0-POL-01-003",
    "typeName": "곱셈 공식 활용",
    "standardCode": "[10수학01-01]",
    "subject": "수학",
    "area": "다항식",
    "difficulty": 3,
    "cognitiveDomain": "CALCULATION|UNDERSTANDING|INFERENCE|PROBLEM_SOLVING",
    "confidence": 0.92
  },
  "solution": {
    "approach": "풀이 접근법",
    "steps": [{"stepNumber": 1, "description": "단계 설명", "latex": "수식"}],
    "finalAnswer": "최종 답"
  },
  "correctedContent": null
}

규칙:
1. expandedTypeCode는 반드시 위 테이블에 있는 코드 중 하나를 선택하세요.
2. difficulty는 1(최하)~5(최상) 정수입니다.
3. cognitiveDomain은 CALCULATION, UNDERSTANDING, INFERENCE, PROBLEM_SOLVING 중 하나입니다.
4. confidence는 0.0~1.0 사이의 분류 확신도입니다.
5. 수식은 LaTeX 형식($...$)으로 표기하세요.`;
}

/**
 * Full 모드: 성취기준 + 난이도 루브릭 포함
 */
async function buildFullPrompt(levelCode?: string): Promise<string> {
  const typeLookup = await getCompactTypeLookup(levelCode);

  return `당신은 "다사람수학"의 AI 수학 교육 전문가입니다.
한국 교육과정(2015 개정, 2022 개정)에 기반하여 수학 문제를 분석합니다.

═══════════════════════════════════════
■ 유형 분류 테이블
═══════════════════════════════════════

${typeLookup}

═══════════════════════════════════════
■ 난이도 채점 기준 (6항목)
═══════════════════════════════════════

| 항목 | 1점 | 2점 | 3점 |
|------|-----|-----|-----|
| 필요 개념 수 | 1개 | 2개 | 3개+ |
| 풀이 단계 수 | 1~2단계 | 3~4단계 | 5단계+ |
| 계산 복잡도 | 단순 | 중간 | 복잡 |
| 사고력 요구 | 단순 적용 | 응용/변형 | 추론/증명 |

| 항목 | 0점 | 1점 | 2점 |
|------|-----|-----|-----|
| 자료 해석 | 불필요 | 단순 | 복합 |
| 함정/오개념 | 없음 | - | 있음 |

난이도 등급: 하(3~5점), 중하(6~7점), 중(8~9점), 중상(10~11점), 상(12+점)

═══════════════════════════════════════
■ 응답 형식 (반드시 JSON)
═══════════════════════════════════════

{
  "classification": {
    "expandedTypeCode": "MA-HS0-POL-01-003",
    "typeName": "곱셈 공식 활용",
    "standardCode": "[10수학01-01]",
    "subject": "수학",
    "area": "다항식",
    "difficulty": 3,
    "difficultyScoring": {
      "conceptCount": 2,
      "stepCount": 2,
      "calcComplexity": 1,
      "thinkingLevel": 2,
      "dataInterpretation": 0,
      "trapMisconception": 0,
      "total": 7,
      "grade": "중하"
    },
    "cognitiveDomain": "CALCULATION",
    "confidence": 0.92
  },
  "solution": {
    "approach": "풀이 접근법",
    "steps": [{"stepNumber": 1, "description": "단계 설명", "latex": "수식"}],
    "finalAnswer": "최종 답"
  },
  "correctedContent": null
}

규칙:
1. expandedTypeCode는 반드시 위 테이블의 코드 중 하나를 선택하세요.
2. 난이도 6항목을 모두 채점하고 총점과 등급을 포함하세요.
3. 인지영역은 CALCULATION, UNDERSTANDING, INFERENCE, PROBLEM_SOLVING 중 선택하세요.
4. 수식은 LaTeX 형식($...$)으로 표기하세요.
5. 오류가 있으면 correctedContent에 수정본을 넣으세요.`;
}

/**
 * DB에서 유형 데이터를 조회하여 compact 테이블 형식으로 반환
 */
async function getCompactTypeLookup(levelCode?: string): Promise<string> {
  if (!supabaseAdmin) {
    return getFallbackTypeLookup();
  }

  let query = supabaseAdmin
    .from('expanded_math_types')
    .select('type_code, type_name, standard_code, cognitive, difficulty_min, difficulty_max, area')
    .eq('is_active', true)
    .order('type_code');

  if (levelCode) {
    query = query.eq('level_code', levelCode);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return getFallbackTypeLookup();
  }

  const lines = [
    '| type_code | type_name | standard | cognitive | diff |',
    '|-----------|-----------|----------|-----------|------|',
  ];

  for (const row of data) {
    lines.push(
      `| ${row.type_code} | ${row.type_name} | ${row.standard_code} | ${row.cognitive} | ${row.difficulty_min}-${row.difficulty_max} |`
    );
  }

  return lines.join('\n');
}

/**
 * DB 사용 불가 시 기본 프롬프트
 */
function getFallbackTypeLookup(): string {
  return `유형 코드 형식: MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ}

LEVEL: ES12(초1-2), ES34(초3-4), ES56(초5-6), MS(중), HS0(고공통), HS1(수I), HS2(수II), CAL(미적분), PRB(확통), GEO(기하)
DOMAIN: POL(다항식), EQU(방정식), INE(부등식), SET(집합), FUN(함수), CNT(경우의수), CRD(좌표도형),
        EXP(지수로그), TRI(삼각함수), SEQ(수열), LIM(극한), DIF(미분), INT(적분),
        PER(순열조합), PRB(확률), STA(통계), VEC(벡터), CON(이차곡선), SPC(공간도형),
        NUM(수연산), GEO(도형측정), PAT(변화관계), DAT(자료가능성)

유형 코드 DB 데이터를 사용할 수 없어 자유 분류합니다. 위 코드 체계에 맞는 typeCode를 생성하세요.`;
}
