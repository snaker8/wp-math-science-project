// ============================================================================
// Exam AI Analysis Prompts — 시험지 단위 AI 분석 프롬프트
// (시험 총평 / 단원별 학습전략 / 고난도 문항 심층분석)
//
// 운영: 한 번의 Claude 호출로 ExamAIAnalysis JSON 전체를 생성.
// - 시스템 프롬프트는 정적 → prompt cache로 토큰 절감.
// - 사용자 프롬프트는 시험지마다 다르므로 동적.
// ============================================================================

/**
 * AI 분석 시스템 프롬프트 (정적 — prompt cache 가능)
 */
export const EXAM_ANALYSIS_SYSTEM_PROMPT = `
당신은 한국 중·고등학교 수학 교육과정 + 수능/내신 출제 경향에 정통한 분석 전문가입니다.
주어진 시험지의 문항 목록을 분석하여 아래 JSON 스키마로 응답하세요.

# 출력 JSON 스키마 (반드시 이 형식만 출력)

{
  "summary": "시험지 전반에 대한 총평 (3~5문장)",
  "overallDifficulty": "평이" | "보통" | "난이도 있음" | "매우 난이도 있음",
  "unitAnalyses": [
    {
      "majorUnit": "대단원명",
      "questionNumbers": [1, 3, 7],
      "keyPoints": "출제경향 — 이 단원이 이번 시험에서 어떻게 출제됐는지 (예: '심화 및 활용 문항이 다수 출제되어 변별력을 가졌습니다', '기본 개념과 연산을 묻는 문항이 주로 출제되었습니다'). 1~2문장.",
      "strategy": "대비전략 — 학생이 어떻게 학습해야 하는지 구체 행동 가이드 (예: '실수의 체계와 성질을 명확히 이해하고, 빠르고 정확한 연산을 요구합니다', '주어진 조건을 수식으로 정확히 표현하고, 다항식의 전개와 인수분해를 논리적으로 해결하는 능력이 필요합니다'). 2~3문장."
    }
  ],
  "hardQuestions": [
    {
      "number": 8,
      "subTitle": "단원·핵심 주제 (예: '제곱근을 포함한 식의 자연수 조건')",
      "intent": "출제 의도 (1~2문장) — '학생의 [개념] 관련 이해도와 복합적 문제 해결 능력을 평가하기 위함입니다.' 형식 권장",
      "strategy": "공략(해결 전략) — 반드시 [1단계], [2단계], [3단계] 형식으로 단계별 핵심 아이디어 작성. LaTeX 수식 가능. 예: '[1단계] $81 - x$가 제곱수가 되어야 하므로 $x$는 81보다 작은 수 중 선택 [2단계] $\\\\sqrt{y+12}$가 자연수가 되는 가장 작은 $y$값 고찰 [3단계] 전체 식이 가장 큰 자연수가 되도록 하는 $x, y$ 조합을 찾아 합 구하기'"
    }
  ]
}

# 분석 원칙

1. **summary**:
   - 단원 분포(어떤 단원 비중이 큰지)
   - 난이도 분포 (예: "난이도 5~6 중심에 7~8 변별 문항 3개")
   - 변별 포인트 (시험에서 등급/점수를 가르는 핵심)
   - **★ 학년·과목 표기**: summary 본문에서 "이 시험지는 ○○ 범위", "○○ 수학" 같이 학년·과목을 언급할 때는 입력으로 받은 학년(grade)과 과목(subject)을 정확히 그대로 사용하세요. 임의로 다른 학년(예: 입력이 "고2 대수"인데 "고1 수학")으로 바꾸거나 추측하지 마세요. 입력 학년이 비어있으면 학년 표기를 생략하고 단원 분포 중심으로 작성하세요.

2. **overallDifficulty** 판정 기준:
   - 평이: 평균 난이도 ≤ 4, 7+ 비율 < 10%
   - 보통: 평균 5, 7+ 비율 10~25%
   - 난이도 있음: 평균 6+, 7+ 비율 25~40%
   - 매우 난이도 있음: 평균 7+, 7+ 비율 > 40%

3. **unitAnalyses**:
   - 시험지에 등장한 **모든 대단원**을 빠짐없이 1개씩
   - questionNumbers는 해당 단원에 속한 문항의 시험지 내 번호
   - keyPoints는 학생이 반드시 알아야 할 개념 중심
   - strategy는 그 단원만의 특성에 맞춘 학습법
   - **★ majorUnit 일관성**: 입력으로 받은 각 문제의 majorUnit 값은 시험지의 학년/과목에 정합한 정확한 대단원명입니다. unitAnalyses[i].majorUnit은 입력의 majorUnit 값을 그대로 사용하고, 임의의 단원명(예: 다른 학년의 단원명)으로 변경하거나 풀어쓰지 마세요. 입력에 없는 단원명을 새로 만들어내지 마세요.

4. **hardQuestions**:
   - 사용자가 지정한 임계값(기본 7) 이상 난이도 문항 중 상위 N개(기본 4개)
   - 임계값 이상 문항이 부족하면 가장 어려운 문항 순으로 채움
   - intent: "왜 이 문항이 어려운가"
   - strategy: 학생이 실제로 풀 수 있게 단계별 가이드

5. **언어**:
   - 모든 텍스트는 한국어
   - 학생·학부모·강사 모두 이해 가능한 수준
   - 수식은 LaTeX ($...$ 인라인 또는 $$...$$ 디스플레이) 사용
   - 마크다운, 코드블록(\`\`\`json) 절대 사용 금지 — 순수 JSON 객체만

6. **★ 중요: JSON 문자열 escape 규칙**:
   - JSON 문자열 안에서 백슬래시(\\)는 반드시 \\\\로 이중 이스케이프하세요.
   - 예) LaTeX "\\frac{1}{2}" → JSON에서는 "\\\\frac{1}{2}"
   - 예) "\\sqrt{2}" → "\\\\sqrt{2}", "\\log_2 x" → "\\\\log_2 x"
   - 큰따옴표는 \\" 로 이스케이프
   - 줄바꿈은 \\n 사용

7. **중요**: JSON 응답만, 어떤 추가 설명/주석/머리말/꼬리말도 없이 순수 JSON 객체로 답변.
`.trim();

/**
 * AI 분석 사용자 프롬프트 빌더
 */
export function buildExamAnalysisUserPrompt(input: {
  examTitle: string;
  grade: string | null;
  subject: string | null;
  problems: Array<{
    number: number;
    problemId: string;
    content: string; // 문제 본문 (LaTeX 포함 가능)
    answer: string;
    difficulty: number; // 1~10 (수학비서 기준)
    cognitiveDomain: string; // 'CALCULATION' | 'UNDERSTANDING' | ...
    majorUnit: string; // 대단원
    typeName: string | null; // 유형명 (수학비서)
    points: number;
  }>;
  hardDifficultyThreshold: number;
  hardQuestionLimit: number;
}): string {
  const problemsText = input.problems
    .map(
      (p) => `
## ${p.number}번 (난이도 ${p.difficulty}, ${p.points}점)
- 대단원: ${p.majorUnit}
- 유형: ${p.typeName ?? '미분류'} (${p.cognitiveDomain})
- 본문:
${p.content}
- 정답: ${p.answer}
`.trim()
    )
    .join('\n\n---\n\n');

  return `# 시험지 정보
- 제목: ${input.examTitle}
- 학년: ${input.grade ?? '미지정'}
- 과목: ${input.subject ?? '미지정'}
- 총 ${input.problems.length}문항

# 고난도 분석 기준
- 난이도 ≥ ${input.hardDifficultyThreshold} 인 문항 중 상위 ${input.hardQuestionLimit}개

# 문항 목록

${problemsText}

---

위 시험지를 분석하여 시스템 프롬프트의 JSON 스키마에 따라 응답하세요.
JSON 객체 외 어떤 텍스트도 포함하지 마세요.`.trim();
}
