// ============================================================================
// 개별 문제 AI 해설 생성 API
// POST /api/problems/[problemId]/generate-solution
// - Claude Sonnet으로 풀이 생성 + Gemini Flash 정답 교차검증
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_MODEL = 'claude-sonnet-4-5';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const { problemId } = await params;

  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // 1. 문제 데이터 조회 (이미지, AI 분석 데이터 포함)
    const body = await request.json().catch(() => ({}));
    const frontendChoices: string[] = body.choices || [];

    const { data: problem, error: fetchError } = await supabaseAdmin
      .from('problems')
      .select('id, content_latex, solution_latex, answer_json, images, ai_analysis, source_name')
      .eq('id', problemId)
      .single();

    if (fetchError || !problem) {
      return NextResponse.json({ error: 'Problem not found' }, { status: 404 });
    }

    // 1-b. 분류 정보 조회 (학년/과목/단원)
    const { data: classification } = await supabaseAdmin
      .from('classifications')
      .select('type_code, expanded_type_code, difficulty, cognitive_domain')
      .eq('problem_id', problemId)
      .single();

    // 1-c. 유형명 조회
    let typeName = '';
    const typeCode = classification?.expanded_type_code || classification?.type_code || '';
    if (typeCode) {
      const LEVEL_PREFIXES = ['MA-HS0', 'MA-HS1', 'MA-HS2', 'MA-MS1', 'MA-MS2', 'MA-MS3', 'MA-EL4', 'MA-EL5', 'MA-EL6'];
      const lookupCodes = [typeCode];
      if (!typeCode.startsWith('MA-')) {
        LEVEL_PREFIXES.forEach(prefix => lookupCodes.push(`${prefix}-${typeCode}`));
      }
      const { data: typeData } = await supabaseAdmin
        .from('expanded_math_types')
        .select('type_code, type_name')
        .in('type_code', lookupCodes)
        .limit(1);
      if (typeData?.[0]) typeName = typeData[0].type_name;
    }

    // 1-d. AI 분석에서 과목/단원 정보 추출
    const aiAnalysis = problem.ai_analysis as Record<string, any> | null;
    const aiClassification = aiAnalysis?.classification || {};
    const subject = aiClassification.subject || '';
    const chapter = aiClassification.chapter || '';
    const section = aiClassification.section || '';

    const problemText = problem.content_latex || '';
    if (!problemText.trim()) {
      return NextResponse.json({ error: 'Problem content is empty' }, { status: 400 });
    }

    // 1-e. 이미지/그래프 정보 수집
    const images = (problem.images as Array<{ url: string; type: string; label: string }>) || [];
    const graphData = aiAnalysis?.graphData || aiAnalysis?.figureData || null;
    const hasImages = images.length > 0 || problemText.includes('![');

    // ★ 선택지 구성 (우선순위):
    // 1) 프론트에서 받은 choices (명시적 호출)
    // 2) answer_json.choices (자산화 시 저장된 원본)
    // 3) content_latex에서 ①~⑤ 패턴 추출 (fallback)
    let choicesForPrompt: string[] = frontendChoices.filter(c => c.trim().length > 0);
    const answerJsonObj = (problem.answer_json || {}) as Record<string, unknown>;
    if (choicesForPrompt.length === 0 && Array.isArray(answerJsonObj.choices)) {
      choicesForPrompt = (answerJsonObj.choices as string[]).filter(c => typeof c === 'string' && c.trim().length > 0);
    }
    if (choicesForPrompt.length === 0) {
      choicesForPrompt = extractChoicesFromContent(problemText);
    }

    // ★ 사용자가 미리 입력한 정답 (answer_json.correct_answer / finalAnswer) — 교차 검증 기준점
    const userEnteredAnswer = String(
      answerJsonObj.correct_answer || answerJsonObj.finalAnswer || ''
    ).trim();

    // 선택지가 있으면 프롬프트에 명시적으로 포함
    const choicesSection = choicesForPrompt.length > 0
      ? `\n\n[선택지]\n${choicesForPrompt.map((c, i) => `${['①','②','③','④','⑤'][i] || `(${i+1})`} ${c.replace(/^[①②③④⑤]\s*/, '')}`).join('\n')}`
      : '';

    // ★ 사용자 정답 힌트 (있을 때만) — AI가 이 답으로 가도록 유도
    const userAnswerHint = userEnteredAnswer
      ? `\n\n[확인된 정답] ${userEnteredAnswer}\n(이 답이 나오는 풀이를 작성하세요. 만약 풀이 결과가 이 답과 다르면, 풀이를 재검토하여 이 답이 나오도록 맞추세요.)`
      : '';

    const isObjective = choicesForPrompt.length > 0;

    // ★ 학년/과목 컨텍스트 구성
    const curriculumParts: string[] = [];
    if (subject) curriculumParts.push(`과목: ${subject}`);
    if (chapter) curriculumParts.push(`단원: ${chapter}`);
    if (section) curriculumParts.push(`중단원: ${section}`);
    if (typeName) curriculumParts.push(`유형: ${typeName}`);
    if (typeCode) curriculumParts.push(`유형코드: ${typeCode}`);
    const curriculumContext = curriculumParts.length > 0
      ? `\n\n[교육과정 정보]\n${curriculumParts.join('\n')}`
      : '';

    // ★ 그래프/이미지 컨텍스트 구성
    let imageContext = '';
    if (hasImages && graphData) {
      // Desmos 분석 데이터가 있는 경우 → 수식 정보 전달
      const expressions = graphData.expressions || [];
      const description = graphData.description || '';
      const points = (graphData.points || []).map((p: any) => `${p.label || ''}(${p.x}, ${p.y})`).join(', ');
      imageContext = `\n\n[문제에 포함된 그래프/도형 정보]
${description ? `설명: ${description}` : ''}
${expressions.length > 0 ? `수식: ${expressions.join(', ')}` : ''}
${points ? `주요 점: ${points}` : ''}
${graphData.xRange ? `x축 범위: [${graphData.xRange}]` : ''}
${graphData.yRange ? `y축 범위: [${graphData.yRange}]` : ''}
★ 위 그래프/도형 정보를 반드시 참고하여 풀이하세요. 그래프가 없다고 말하지 마세요.`;
    } else if (hasImages) {
      imageContext = `\n\n[참고] 이 문제에는 그래프/도형 이미지가 포함되어 있습니다. 문제 텍스트에서 함수식, 도형 조건, 좌표 등을 파악하여 풀이하세요. 이미지를 직접 볼 수 없지만, 문제의 수학적 조건만으로 풀이가 가능합니다. "그래프가 없어서 풀 수 없다"고 답하지 마세요.`;
    }

    // ★ 과목별 허용/금지 범위 명시
    const SUBJECT_SCOPE: Record<string, { allowed: string; forbidden: string }> = {
      '공통수학1': { allowed: '다항식, 항등식, 나머지정리, 인수분해, 복소수, 이차방정식, 이차함수, 여러가지방정식/부등식, 경우의수', forbidden: '수열, 지수/로그, 삼각함수, 극한, 미분, 적분, 벡터, 좌표평면(공통수학2 범위)' },
      '공통수학2': { allowed: '직선의 방정식, 원의 방정식, 평행이동, 대칭이동, 집합, 명제, 함수, 유리함수, 무리함수', forbidden: '수열, 지수/로그, 삼각함수, 극한, 미분, 적분' },
      '수학I': { allowed: '지수함수, 로그함수, 삼각함수, 사인법칙, 코사인법칙, 등차수열, 등비수열, 수열의합, 수학적귀납법', forbidden: '극한, 미분, 적분, 벡터' },
      '대수': { allowed: '지수, 로그, 삼각함수, 수열, 수학적귀납법', forbidden: '극한, 미분, 적분, 벡터' },
      '수학II': { allowed: '함수의극한, 연속, 미분계수, 도함수, 접선, 함수의증감, 극대극소, 부정적분, 정적분, 넓이', forbidden: '급수, 매개변수미분, 치환적분, 부분적분' },
      '미적분1': { allowed: '극한, 미분, 적분, 접선, 증감, 극값, 넓이', forbidden: '급수, 매개변수미분, 음함수미분, 치환적분, 부분적분' },
      '확률과 통계': { allowed: '순열, 조합, 이항정리, 확률, 조건부확률, 독립시행, 확률분포, 정규분포, 통계적추정', forbidden: '미분, 적분' },
      '미적분': { allowed: '급수, 여러가지미분법, 여러가지적분법, 매개변수, 음함수', forbidden: '' },
      '미적분2': { allowed: '급수, 삼각함수미분, 매개변수미분, 치환적분, 부분적분', forbidden: '' },
      '기하': { allowed: '이차곡선, 포물선, 타원, 쌍곡선, 평면벡터, 공간도형, 공간좌표', forbidden: '' },
    };
    // 중학교
    ['중1-1', '중1-2', '중2-1', '중2-2', '중3-1', '중3-2'].forEach(s => {
      SUBJECT_SCOPE[s] = { allowed: '중학교 교육과정 범위', forbidden: '고등학교 개념(인수분해 공식 중 고등 범위, 복소수, 이차방정식 근의 공식 판별식, 삼각함수, 미적분, 수열)' };
    });

    const scope = subject ? SUBJECT_SCOPE[subject] || SUBJECT_SCOPE[subject.replace(/ 수학$/, '')] : null;
    const levelInstruction = scope
      ? `\n\n★★★ 교육과정 준수 (절대 위반 금지) ★★★
이 문제는 "${subject}" 과목입니다.
✅ 사용 가능: ${scope.allowed}
❌ 사용 금지: ${scope.forbidden}
- 위 금지 목록의 개념/공식은 절대 풀이에 사용하지 마세요.
- 학생이 이 과목까지만 배운 상태에서 이해할 수 있는 풀이만 작성하세요.`
      : '';

    // ★ 서술형 판별: 선택지 없음(객관식 아님) + 서술형 패턴
    // 객관식이면 절대 서술형으로 분류되지 않음 (답은 ①~⑤)
    const hasSubProblems = /\[\s*\d+\s*[-.]\s*\d+\s*\]/.test(problemText);
    const hasDescriptivePatterns = /서술하시오|설명하시오|증명하시오|풀이과정|보이시오|나타내시오|판단하시오/.test(problemText);
    const isDescriptive = !isObjective && (hasSubProblems || hasDescriptivePatterns);

    // ★ 풀이 전략 가이드 (교과서 표준 방법 — 학생이 학교에서 배우는 방식)
    const STRATEGY_GUIDE = `
★★★ 풀이 전략 — 교과서 표준 방법 (학생이 학교/교재에서 배우는 방식 그대로) ★★★

⚠️ 가장 중요한 원칙: 풀이는 **학생이 교과서에서 배운 표준 방법으로** 작성해야 합니다.
❌ 금지: 학생이 모르는 고급 기법, 우회적인 방법, 불필요하게 복잡한 접근, 학년 수준 넘는 공식 사용
✅ 필수: 학생이 자연스럽게 떠올릴 수 있는 풀이, 교과서/시중 교재(쎈/마플)에서 가르치는 표준 흐름

【연립방정식】 표준 풀이:
- 미지수 계수(a, b 등)가 일부 식에만 있으면 → **미지수 없는 식부터 연립**해서 (x, y) 해를 구한 다음, 그 해를 미지수 있는 식에 **대입**하여 a, b를 구함
- 가감법/대입법 중 식 모양에 맞는 것 선택 (한 변수가 1차이면 대입, 계수 맞추기 쉬우면 가감)
- ❌ 행렬식, 크라메르 공식 같은 고급 기법 사용 금지

【도형/길이/넓이】 표준 풀이:
- 학년 범위 내에서 풀기. 중학생에게 좌표/벡터 X, 고등 도형 X
- 보조선 → 닮음/합동/피타고라스/특수각 활용이 표준
- 같은 거리 조건은 수직이등분선, 같은 각 조건은 원주각 등 교과서 정리를 활용

【식의 값】 표준 풀이:
- 곱셈공식 → 양변 제곱/세제곱하여 차수 맞추기
- 무리수 분모는 유리화 (켤레 곱하기)
- 치환은 식의 패턴이 명확할 때만

【함수/그래프】 표준 풀이:
- 대칭성/주기성 같은 그래프 정성적 특성 먼저 활용
- 미분 가능 함수는 미분으로 극값/접선
- 합성함수는 안에서 바깥으로

【확률/경우의수】 표준 풀이:
- "적어도" → 여사건
- "순서 있음" → 순열, "순서 없음" → 조합
- 케이스 분류는 배타적이고 빠짐없게

→ 첫 번째 step에서 **"이 문제는 ~ 패턴이므로 교과서 표준 방법인 ~로 푼다"**고 명시하고 시작.
→ 학생이 "아, 이렇게 푸는구나" 하고 따라할 수 있는 풀이여야 함.
`;

    // ★ 시중 교재 스타일 모범 해설 예시 (Few-shot) — 학생이 혼자 읽고 이해 가능한 수준
    // 시중 교재(쎈)는 매우 간결하지만, LMS는 학생이 혼자 보므로 개념과 근거 설명을 보강
    const FEW_SHOT_EXAMPLES = `
★★★ 시중 교재 모범 해설 예시 (학원 LMS용 — 학생이 혼자 읽고 완전히 이해할 수 있게) ★★★
시중 교재(쎈/마플)는 수업에서 보충 설명을 전제로 매우 간결하지만, LMS 해설은 학생이 혼자 보기 때문에 **개념적 근거 + 풀이 단계**를 함께 제공합니다. 단, 군더더기는 없게.

──── 예시 1: 연립방정식 (미지수 포함) ────
문제: 두 연립방정식 $\\begin{cases} 2x+y=7 \\\\ x-2y=a \\end{cases}$, $\\begin{cases} 3x-y=8 \\\\ x+by=10 \\end{cases}$의 해가 서로 같을 때, $a, b$의 값을 구하시오.

모범 해설:
- concept: "두 연립방정식의 해가 서로 같다는 것은 네 식이 모두 같은 (x, y)에서 성립한다는 뜻이다. 미지수 a, b가 없는 식을 먼저 골라 연립하여 (x, y)를 구한 후, 미지수가 들어 있는 식에 대입하면 a, b를 차례로 구할 수 있다."
- step 1: "네 식 중 미지수 없는 두 식 $2x+y=7$ ··· ㉠, $3x-y=8$ ··· ㉡을 먼저 연립한다. ㉠+㉡을 하면 $y$가 소거되어 $5x=15$, 따라서 $x=3$. 이를 ㉠에 대입하면 $6+y=7$이므로 $y=1$이다."
- step 2: "구한 해 $x=3, y=1$을 미지수 a가 있는 식 $x-2y=a$에 대입하면 $3-2=a$, 따라서 $a=1$이다."
- step 3: "마찬가지로 $x+by=10$에 대입하면 $3+b=10$, 따라서 $b=7$이다."
- finalAnswer: "$a=1, b=7$"
- tip: "두 연립방정식의 해가 같다고 주어지면 미지수 없는 식부터 연립하는 것이 정석이다."

──── 예시 2: 식의 값 (치환/곱셈공식) ────
문제: $x+\\dfrac{1}{x}=3$일 때, $x^2+\\dfrac{1}{x^2}$의 값은?

모범 해설:
- concept: "주어진 식과 구하려는 식의 차수 관계를 파악한다. $x+\\dfrac{1}{x}$의 양변을 제곱하면 곱셈공식 $(a+b)^2=a^2+2ab+b^2$에 의해 $x^2+\\dfrac{1}{x^2}$이 자연스럽게 나타난다."
- step 1: "$x+\\dfrac{1}{x}=3$의 양변을 제곱하면 $\\left(x+\\dfrac{1}{x}\\right)^2=9$이다."
- step 2: "좌변을 전개하면 $x^2+2 \\cdot x \\cdot \\dfrac{1}{x}+\\dfrac{1}{x^2}=x^2+\\dfrac{1}{x^2}+2$이므로, $x^2+\\dfrac{1}{x^2}+2=9$. 따라서 $x^2+\\dfrac{1}{x^2}=7$이다."
- finalAnswer: "$7$"
- tip: "$x \\pm \\dfrac{1}{x}$ 꼴은 양변을 제곱하면 차수가 2인 식의 값을 바로 구할 수 있다."

──── 예시 3: 도형 (보조선/닮음) ────
문제: 직사각형 $ABCD$에서 $\\overline{AB}=4$, $\\overline{BC}=3$이다. 점 $P$가 변 $BC$ 위에 있고 $\\overline{AP}=\\overline{PD}$일 때, $\\overline{BP}$의 길이는?

모범 해설:
- concept: "$\\overline{AP}=\\overline{PD}$ 조건은 점 P가 두 점 A, D로부터 같은 거리에 있다는 뜻이므로, 선분 AD의 수직이등분선 위에 있다. 변 BC 위에서 그 위치를 직각삼각형 + 피타고라스로 구한다."
- step 1: "$\\overline{BP}=x$라 하면 직각삼각형 $ABP$에서 피타고라스 정리에 의해 $\\overline{AP}^2 = \\overline{AB}^2 + \\overline{BP}^2 = 16+x^2$."
- step 2: "또 $\\overline{PC}=3-x$이므로 직각삼각형 $PCD$에서 $\\overline{PD}^2 = \\overline{PC}^2 + \\overline{CD}^2 = (3-x)^2 + 16$."
- step 3: "$\\overline{AP}=\\overline{PD}$이므로 $\\overline{AP}^2=\\overline{PD}^2$, 즉 $16+x^2=(3-x)^2+16$. 정리하면 $x^2=9-6x+x^2$이므로 $6x=9$, 따라서 $x=\\dfrac{3}{2}$이다."
- finalAnswer: "$\\overline{BP}=\\dfrac{3}{2}$"
- tip: "$\\overline{XA}=\\overline{XB}$는 X가 AB의 수직이등분선 위에 있다는 의미이며, 좌표나 직각삼각형으로 풀면 깔끔하다."

──── 예시 4: 함수의 값 / 그래프 (대칭성) ────
문제: 함수 $f(x)$가 모든 실수 $x$에 대하여 $f(2-x)=f(2+x)$를 만족할 때, 방정식 $f(x)=0$의 모든 실근의 합은? (단, 실근은 4개)

모범 해설:
- concept: "조건 $f(2-x)=f(2+x)$는 그래프가 직선 $x=2$에 대해 대칭임을 의미한다. 대칭축 위 두 점 (2-t, 0)과 (2+t, 0)은 짝을 이루므로, 실근들의 합은 대칭축 × (실근의 개수)로 즉시 구한다."
- step 1: "$f(2-x)=f(2+x)$는 $x=2$를 중심으로 좌우가 같은 함숫값을 갖는다는 뜻이므로, 함수 $y=f(x)$의 그래프는 직선 $x=2$에 대하여 대칭이다."
- step 2: "$f(x)=0$의 실근들도 직선 $x=2$에 대하여 대칭이므로, 두 실근씩 짝을 이루어 $x_1+x_2=4$, $x_3+x_4=4$가 된다."
- step 3: "따라서 모든 실근의 합은 $4+4=8$이다."
- finalAnswer: "$8$"
- tip: "$f(a-x)=f(a+x)$는 대칭축 $x=a$를 의미. 실근의 합 = 대칭축 × 실근의 개수."

──── 예시 5: 확률 (여사건) ────
문제: 1부터 10까지의 자연수 중 서로 다른 3개를 임의로 뽑을 때, 적어도 하나가 짝수일 확률은?

모범 해설:
- concept: "'적어도 하나'는 여사건('하나도 ~ 아님')으로 푸는 것이 정석이다. 여사건은 '뽑은 3개가 모두 홀수'이고, 그 확률을 1에서 빼면 된다."
- step 1: "전체 경우의 수는 $1$~$10$ 중 $3$개를 뽑는 조합으로 \${}_{10}\\mathrm{C}_3 = 120$이다."
- step 2: "여사건은 '3개 모두 홀수'를 뽑는 경우. $1, 3, 5, 7, 9$ 중 $3$개를 뽑는 조합은 \${}_{5}\\mathrm{C}_3 = 10$이므로, 여사건의 확률은 $\\dfrac{10}{120}=\\dfrac{1}{12}$이다."
- step 3: "따라서 구하는 확률은 $1-\\dfrac{1}{12}=\\dfrac{11}{12}$이다."
- finalAnswer: "$\\dfrac{11}{12}$"
- tip: "'적어도 하나'는 여사건 '하나도 ~없음'을 1에서 빼는 것이 빠르다."

위 예시들의 **어투, 설명 깊이, 단계 분해 방식, "··· ㉠/㉡" 식 식 번호 매기기, "따라서/즉/이때" 같은 접속사 사용**을 그대로 따라 작성하세요.
`;

    // 2. Claude Sonnet으로 풀이 생성 (학생용 시중 교재 스타일 해설)
    const solutionPrompt = isDescriptive ? `학생이 혼자 읽고 완벽히 이해할 수 있는 **시중 수학 교재(수학의 정석, 쎈, 마플) 수준의 상세 해설**을 작성하세요. 학생이 풀이 과정의 모든 단계를 따라갈 수 있어야 합니다.
${STRATEGY_GUIDE}
${FEW_SHOT_EXAMPLES}
${curriculumContext}

문제:
${problemText}${choicesSection}${imageContext}${levelInstruction}${userAnswerHint}

★ 작성 규칙 (서술형 — 간결 모드):
1. **소문항별 분리**: 각 소문항([N-1], [N-2], ...)마다 별도의 step으로 작성.
2. **간결한 설명**: 핵심 계산 + 1문장 근거 설명. 장황한 설명 금지.
3. **불필요한 반복 제거**: 계산 과정을 나열하되 같은 말 반복 X. 교재처럼 명료하게.
4. 수식: $...$로 인라인.
5. finalAnswer: 각 소문항의 답을 모두 명시 (예: "[5-1] (x,y)=(2,3) [5-2] a=4, b=-1").

★★★ 렌더링 깨짐 방지 규칙 (엄수) ★★★
- ❌ **\\displaystyle 절대 사용 금지** (자동으로 디스플레이 모드가 됨. 쓰지 마세요.)
- ❌ **$...$ 안에 한글/한국어 단어 넣기 금지** — 한글이 들어가면 KaTeX 렌더링 실패. "이므로", "이다", "그러므로" 같은 한국어는 반드시 $ 밖에 작성.
- ❌ 숫자 나열 "1, 2, 3, 4, 5"를 $...$로 감싸지 말 것. 일반 텍스트로 작성.
- ✅ 수식만 $...$로 감싸기. 예: "$x < 9$이므로 $x$는 1, 2, 3, 4, 5, 6, 7, 8이다"
- ✅ LaTeX 명령어는 반드시 $...$ 안에서만 사용 (\\frac, \\sqrt, \\dfrac 등)

★★★ description과 latex 중복 금지 (엄수) ★★★
- **description에 수식 $...$를 이미 포함했으면 latex 필드는 빈 문자열("")로 둘 것.**
- 같은 수식이 두 필드에 있으면 해설에 두 번 표시됨 (렌더링 깨짐).
${hasImages ? `7. 그래프/도형: 문제 조건에서 수학적 관계 파악하여 풀이. "볼 수 없다" 금지.` : ''}

JSON:
{
  "concept": "이 문제에서 사용하는 핵심 개념 (1~2줄, 간결)",
  "steps": [
    { "stepNumber": 1, "description": "[5-1] 풀이: 핵심 계산 + 간단한 근거 (2~3문장)", "latex": "" },
    { "stepNumber": 2, "description": "[5-2] 풀이: 핵심 계산 + 간단한 근거 (2~3문장)", "latex": "" }
  ],
  "finalAnswer": "각 소문항의 정답을 모두 명시",
  "tip": "이 유형 핵심 포인트 (1줄)"
}` : `학생이 혼자 읽고 완벽히 이해할 수 있는 **시중 수학 교재(수학의 정석, 쎈, 마플) 수준의 해설**을 작성하세요.
${STRATEGY_GUIDE}
${FEW_SHOT_EXAMPLES}
${curriculumContext}

문제:
${problemText}${choicesSection}${imageContext}${levelInstruction}${userAnswerHint}

★ 작성 규칙 (객관식 — 간결 모드):
1. steps는 **2~4단계**로 핵심만. 각 단계는 계산 + 간단한 근거 1문장.
2. 장황한 설명/반복 금지. 교재처럼 명료하게.
3. 첫 단계에서 사용할 개념/공식만 짧게 언급.
4. 수식: $...$로 인라인.
5. ★★★ finalAnswer 규칙 (반드시 준수):
   ${isObjective
     ? '- 객관식 문제이므로 **반드시 ①, ②, ③, ④, ⑤ 중 하나만** 작성.\n   - 선택지 중 정답의 **번호**를 작성 (선택지 값이 아님).\n   - 예: 정답이 3번 선택지 "9"이면 → finalAnswer: "③" (✅) / "9" (❌) / "③ 9" (❌).\n   - 반드시 원형숫자 한 글자만. 부가 설명 금지.\n   - ❌ "(가)", "(나)", "(다)", "1", "2", "가", "나" 등 기타 형식 절대 금지.\n   - 선택지에 (가)(나)(다) 라벨이 있어도 정답은 무조건 ①②③④⑤ 중 하나로 작성.'
     : '- 서술형/단답형이므로 최종 수치/식 정확히 제시.\n   - 예: "3", "\\\\frac{1}{2}", "a=2, b=1", "(-1, 3)" 등'}
   - 빈 문자열 불가.
${hasImages ? `6. 그래프/도형: 문제 조건에서 수학적 관계 파악하여 풀이. "볼 수 없다" 금지.` : ''}

★★★ 렌더링 깨짐 방지 규칙 (엄수) ★★★
- ❌ **\\displaystyle 절대 사용 금지**
- ❌ **$...$ 안에 한글 넣기 금지** — "이므로", "이다" 같은 한국어는 $ 밖에
- ❌ 숫자 나열 "1, 2, 3, 4, 5"를 $...$로 감싸지 말 것. 일반 텍스트로.
- ✅ 수식만 $...$로 감싸기. 예: "$x < 9$이므로 $x$는 1, 2, 3, 4, 5, 6, 7, 8이다"

★★★ description과 latex 중복 금지 (엄수) ★★★
- **description 필드에 수식을 $...$로 이미 포함했으면 latex 필드는 빈 문자열("")로 둘 것.**
- 같은 수식을 두 필드에 쓰면 해설에 두 번 표시됨 (렌더링 깨짐).
- 권장: description에만 수식 $...$ 포함하고 latex는 "" (빈 문자열).

JSON:
{
  "concept": "핵심 개념/공식 (1줄)",
  "steps": [
    { "stepNumber": 1, "description": "간결한 풀이 (1~2문장)", "latex": "" }
  ],
  "finalAnswer": "정답",
  "tip": "핵심 팁 (1줄, 선택)"
}`;

    let solution: any = null;
    let usedModel = '';
    // ★ 검증 루프에서 재사용하기 위해 스코프 외부로 선언
    let userContent: any;
    let systemPrompt: string = '';

    // Sonnet 시도 (이미지 있으면 Vision 모드)
    if (ANTHROPIC_API_KEY) {
      try {
        console.log(`[generate-solution] Calling Claude Sonnet for problem ${problemId} (images: ${images.length})`);

        // ★ 이미지가 있으면 Vision 메시지 구성
        if (images.length > 0) {
          // 이미지 URL → base64 변환 or URL 직접 전달
          const contentParts: any[] = [];
          for (const img of images.slice(0, 3)) { // 최대 3개
            try {
              const imgRes = await fetch(img.url);
              if (imgRes.ok) {
                const arrayBuffer = await imgRes.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                const contentType = imgRes.headers.get('content-type') || 'image/png';
                contentParts.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: contentType,
                    data: base64,
                  },
                });
              }
            } catch (imgErr) {
              console.warn(`[generate-solution] Image fetch failed: ${img.url}`, imgErr);
            }
          }
          contentParts.push({ type: 'text', text: solutionPrompt });
          userContent = contentParts;
        } else {
          userContent = solutionPrompt;
        }

        systemPrompt = subject
          ? `당신은 한국 "${subject}" 과목 시중 교재(수학의 정석, 쎈, 마플, RPM 등)의 해설지를 집필하는 전문가입니다. 반드시 ${subject} 교육과정 범위 내의 개념만 사용하여 풀이하세요. 상위 과정 개념 사용을 금지합니다. 학생이 혼자 읽고 완전히 이해할 수 있도록 교재 해설지처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.`
          : '당신은 한국 수학 시중 교재(수학의 정석, 쎈, 마플, RPM 등)의 해설지를 집필하는 전문가입니다. 학생이 혼자 읽고 완전히 이해할 수 있도록 교재 해설지처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요. LaTeX 수식은 반드시 이중 백슬래시(\\\\)를 사용하세요.';

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 8000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
            temperature: 0.2,
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const textBlock = claudeData.content?.find((c: { type: string }) => c.type === 'text');
          const rawText = textBlock?.text || '';
          solution = parseJsonResponse(rawText);
          if (solution) {
            usedModel = 'claude-sonnet';
          } else {
            console.error('[generate-solution] Claude Sonnet JSON 파싱 실패. rawText:', rawText.substring(0, 500));
          }
        } else {
          const errText = await claudeRes.text().catch(() => '');
          console.error(`[generate-solution] Claude Sonnet API 오류 (${claudeRes.status}):`, errText.substring(0, 500));
        }
      } catch (e) {
        console.error('[generate-solution] Claude Sonnet failed:', e);
      }
    }

    // Sonnet 실패 시 GPT-4o 폴백 (Vision 지원)
    if (!solution && OPENAI_API_KEY) {
      console.log(`[generate-solution] Falling back to GPT-4o for problem ${problemId} (images: ${images.length})`);
      try {
        // GPT-4o Vision 메시지 구성
        let gptUserContent: any;
        if (images.length > 0) {
          const parts: any[] = images.slice(0, 3).map(img => ({
            type: 'image_url',
            image_url: { url: img.url, detail: 'high' },
          }));
          parts.push({ type: 'text', text: solutionPrompt });
          gptUserContent = parts;
        } else {
          gptUserContent = solutionPrompt;
        }

        const gptSystemMsg = subject
          ? `당신은 한국 "${subject}" 과목 시중 교재 해설지를 집필하는 전문가입니다. 반드시 ${subject} 교육과정 범위 내의 개념만 사용하세요. 교재처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요.`
          : '당신은 한국 수학 시중 교재 해설지를 집필하는 전문가입니다. 교재처럼 명확하고 체계적으로 작성합니다. 반드시 유효한 JSON으로만 응답하세요.';

        const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: gptSystemMsg },
              { role: 'user', content: gptUserContent },
            ],
            temperature: 0.2,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
          }),
        });

        if (gptRes.ok) {
          const gptData = await gptRes.json();
          const rawText = gptData.choices?.[0]?.message?.content || '';
          solution = parseJsonResponse(rawText);
          usedModel = 'gpt-4o';
        }
      } catch (e) {
        console.error('[generate-solution] GPT-4o fallback failed:', e);
      }
    }

    if (!solution) {
      return NextResponse.json({ error: 'All AI models failed to generate solution' }, { status: 500 });
    }

    // ★ 객관식 finalAnswer 정규화 — 무조건 ①~⑤ 원형숫자로 변환
    if (isObjective && solution.finalAnswer) {
      const ans = String(solution.finalAnswer).trim();
      const CIRCLED = ['①','②','③','④','⑤'];

      // 이미 원형숫자 한 글자면 OK
      if (CIRCLED.includes(ans)) {
        solution.finalAnswer = ans;
      } else {
        // "① xxx" 형태 → 원형숫자만 추출
        const prefixMatch = ans.match(/^([①②③④⑤])/);
        if (prefixMatch) {
          solution.finalAnswer = prefixMatch[1];
        } else {
          // 순수 숫자 1~5 → 원형숫자
          if (/^[1-5]$/.test(ans)) {
            solution.finalAnswer = CIRCLED[parseInt(ans) - 1];
          } else {
            // "1번" 형식 → 원형숫자
            const numMatch = ans.match(/^([1-5])\s*번?$/);
            if (numMatch) {
              solution.finalAnswer = CIRCLED[parseInt(numMatch[1]) - 1];
            } else {
              // 값만 제공된 경우 → choices와 비교해서 번호 찾기 (강화된 normalize)
              const choicesStripped = choicesForPrompt.map(c =>
                c.replace(/^[①②③④⑤]\s*/, '').replace(/^\(\s*\d+\s*\)\s*/, '').trim()
              );
              // ★ normalizeAnswer 사용 (\frac/\dfrac/공백/중괄호 등 통일)
              const ansNormalized = normalizeAnswer(ans);
              const matchIdx = choicesStripped.findIndex(c => normalizeAnswer(c) === ansNormalized);
              if (matchIdx >= 0) {
                solution.finalAnswer = CIRCLED[matchIdx];
                console.log(`[generate-solution] ★ 객관식 값 → 번호 변환: "${ans}" → "${CIRCLED[matchIdx]}"`);
              } else {
                // 변환 실패 — 사용자 입력 정답이 있으면 그걸 우선 사용
                if (userEnteredAnswer && /^[①②③④⑤]$/.test(userEnteredAnswer)) {
                  console.log(`[generate-solution] ★ 변환 실패 → 사용자 정답 "${userEnteredAnswer}" 사용`);
                  solution.finalAnswer = userEnteredAnswer;
                } else {
                  console.warn(`[generate-solution] ⚠️ 객관식 답 원형숫자 변환 실패: "${ans}" (choices: ${choicesStripped.join(' | ')})`);
                }
              }
            }
          }
        }
      }
    }

    // 3. Sonnet 자체 검산 (독립 재풀이 → 1차 답과 일치 확인)
    // ★ 설계:
    //   - Gemini/GPT-4o 검증자는 정확도 부족으로 오탐 다수 → 불필요한 Sonnet 재시도 유발
    //   - Sonnet이 수학 추론에 가장 강하므로 Sonnet을 '독립 검산자'로 한 번 더 호출
    //   - 일치: verified=true, 불일치: mismatchFlag=true (사람 검토용 플래그만)
    //   - 재시도 루프 없음 — 같은 모델 반복 시도는 오히려 원본 답을 훼손할 수 있음
    let verification = { verified: false, verifyAnswer: '', sonnetAnswer: solution.finalAnswer || '', mismatchFlag: true, attempts: 1 };

    if (solution.finalAnswer) {
      // Sonnet 독립 검산 (다른 프롬프트 스타일 + temperature 다변화)
      const verifyPrompt = `당신은 독립 검산자입니다. 다음 한국 수학 문제를 처음부터 본인의 풀이로 정답을 구하세요.
(다른 사람의 풀이는 참고하지 말고 본인이 직접 풀이 과정을 수립해 답을 도출)

- 객관식이면 finalAnswer는 반드시 ①~⑤ 중 하나
- 서술형/단답형이면 최종 수치/식 (예: "3", "\\\\frac{1}{2}", "a=2, b=1")
- JSON만 응답 (설명 금지)

문제:
${problemText}${choicesSection}

JSON: { "finalAnswer": "최종 정답", "reasoning": "핵심 풀이 2~3줄" }`;

      try {
        const userContentVerify = images.length > 0
          ? [...((userContent as any[]).slice(0, -1)), { type: 'text', text: verifyPrompt }]
          : verifyPrompt;
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 1500,
            system: '당신은 한국 수학 문제의 독립 검산자입니다. 정확한 풀이와 정답만 JSON으로 응답하세요.',
            messages: [{ role: 'user', content: userContentVerify }],
            temperature: 0.3,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '';
          const parsed = parseJsonResponse(text);
          const verifyAnswer = String(parsed?.finalAnswer || '').trim();
          const sonnetAnswer = String(solution.finalAnswer || '').trim();
          const match = !!verifyAnswer && normalizeAnswer(verifyAnswer) === normalizeAnswer(sonnetAnswer);

          console.log(`[generate-solution] Sonnet 자체 검산: ${match ? '✅ MATCH' : '⚠️ MISMATCH'} — Primary: "${sonnetAnswer}" vs Verify: "${verifyAnswer}"`);

          verification = {
            verified: match,
            verifyAnswer,
            sonnetAnswer,
            mismatchFlag: !match,
            attempts: 1,
          };
        } else {
          console.warn(`[generate-solution] Sonnet 검산 HTTP ${r.status}`);
        }
      } catch (e) {
        console.warn('[generate-solution] Sonnet 자체 검산 실패:', e);
      }
    }

    // 4. 해설 텍스트 포매팅
    const solutionText = formatSolutionText(solution);

    // 5. DB 업데이트
    // ★ 사용자가 이미 입력한 정답이 있으면 보존 (덮어쓰지 않음)
    // AI가 다른 답을 내놓으면 AI 답은 verification에만 쓰고 DB의 정답은 유지
    const finalAnswerToSave = userEnteredAnswer && userEnteredAnswer.length > 0
      ? userEnteredAnswer  // 사용자 정답 우선 (신뢰)
      : solution.finalAnswer;

    const updatedAnswerJson = {
      ...(problem.answer_json as Record<string, any> || {}),
      finalAnswer: finalAnswerToSave,
      correct_answer: finalAnswerToSave,
    };

    await supabaseAdmin
      .from('problems')
      .update({
        solution_latex: solutionText,
        answer_json: updatedAnswerJson,
      })
      .eq('id', problemId);

    return NextResponse.json({
      success: true,
      solution: solutionText,
      finalAnswer: solution.finalAnswer,
      approach: solution.approach,
      steps: solution.steps,
      verification,
      usedModel,
    });
  } catch (error) {
    console.error('[generate-solution] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseJsonResponse(text: string): any {
  let jsonStr = text;
  if (text.includes('```json')) {
    jsonStr = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    jsonStr = text.split('```')[1].split('```')[0].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch {
    // aggressive: double all backslashes
    try {
      return JSON.parse(jsonStr.replace(/\\/g, '\\\\'));
    } catch {
      console.error('[generate-solution] JSON parse failed:', jsonStr.substring(0, 200));
      return null;
    }
  }
}

function normalizeAnswer(ans: string): string {
  let s = ans.trim();

  // ★ 원형 숫자가 포함되어 있으면 번호만 추출 (객관식)
  const circledMatch = s.match(/[①②③④⑤]/);
  if (circledMatch) {
    const map: Record<string, string> = { '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5' };
    return map[circledMatch[0]] || circledMatch[0];
  }

  // 숫자 번호 패턴: "5번", "(5)", "5)" 등
  const numMatch = s.match(/^[(\s]*([1-5])\s*[)번]?\s*$/);
  if (numMatch) return numMatch[1];

  return s
    // ★ LaTeX 표현식 정규화 — 같은 수식의 다른 표기 통일
    .replace(/\\dfrac/g, '\\frac')      // \dfrac → \frac
    .replace(/\\cdot/g, '*')             // \cdot → *
    .replace(/\\times/g, '*')            // \times → *
    .replace(/\\text\{[^}]*\}/g, '')    // \text{} 제거
    .replace(/\\quad/g, '')
    .replace(/\\,/g, '')
    .replace(/\\ /g, '')
    // ★ \frac{a}{b} → a/b (분수 표기 통일) — 재귀로 중첩 분수도 처리
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)') // 한 번 더 (중첩)
    // ★ \sqrt{a} → sqrt(a)
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    // ★ 단일 문자 지수/첨자 중괄호 제거: x^{2} → x^2, a_{1} → a_1
    .replace(/\^\{(\w)\}/g, '^$1')
    .replace(/_\{(\w)\}/g, '_$1')
    // 공백/구분자/래퍼 제거
    .replace(/\s+/g, '')
    .replace(/\$/g, '')
    // 단순화: -(a)/(b) → -a/b, (a)/(b) → a/b (숫자일 때만)
    .replace(/\((-?\d+)\)\/\((\d+)\)/g, '$1/$2')
    .replace(/\(\((-?\d+)\)\/\((\d+)\)\)/g, '$1/$2')
    // 외곽 괄호 제거
    .replace(/^\(([^()]+)\)$/, '$1')
    .toLowerCase()
    .trim();
}

/** content_latex에서 ①~⑤ 선택지 추출 */
function extractChoicesFromContent(latex: string): string[] {
  const choices: string[] = [];
  const circledMarkers = ['①', '②', '③', '④', '⑤'];
  const firstIdx = latex.indexOf('①');
  if (firstIdx === -1) return choices;

  const remaining = latex.substring(firstIdx);
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
  return choices;
}

/** 해설 텍스트에서 렌더링 깨짐 패턴 정리 */
function sanitizeSolutionText(text: string): string {
  if (!text) return text;
  let s = text;
  // 0) ★ 제어 문자 제거 (탭/줄바꿈 제외한 \x00-\x1F, \x7F) — AI JSON 이스케이프 실수 방지
  // \x09(탭), \x0A(줄바꿈), \x0D(캐리지리턴)은 보존
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // 1) \displaystyle 제거 ($ 안/밖 모두)
  s = s.replace(/\\displaystyle\s*/g, '');
  // 2) 단독 $$  $$ 제거
  s = s.replace(/\$\$\s*\$\$/g, '');
  // 3) 빈 $ $ 제거
  s = s.replace(/\$\s+\$/g, '');
  // 4) $...$ 안에 한글만 있는 경우 → $ 제거 (KaTeX 실패 방지)
  s = s.replace(/\$([^$]*?)\$/g, (match, inner) => {
    // 한글이 있고 LaTeX 명령어가 없으면 $ 제거
    const hasKorean = /[가-힣]/.test(inner);
    const hasLatex = /\\[a-zA-Z]+|[\^_{}]/.test(inner);
    if (hasKorean && !hasLatex) return inner; // 한글만 → $ 벗기기
    return match;
  });
  // 5) 연속 공백 정리
  s = s.replace(/ {3,}/g, '  ');
  return s;
}

/** 시중 교재 해설지 스타일로 포맷팅 */
function formatSolutionText(solution: any): string {
  const parts: string[] = [];

  // ── 개념 정리 ──
  if (solution.concept) {
    parts.push(`[개념] ${sanitizeSolutionText(solution.concept)}`);
    parts.push('');
  }

  // ── 풀이 ──
  parts.push('[풀이]');
  if (solution.steps && Array.isArray(solution.steps)) {
    for (const step of solution.steps) {
      const desc = sanitizeSolutionText(step.description || '');
      // ★ description에 이미 $...$ 수식이 있으면 latex 필드 무시 (중복 방지)
      const descHasMath = /\$[^$]*\$|\\\\frac|\\\\sqrt/.test(desc);
      const rawLatex = step.latex ? sanitizeSolutionText(step.latex).replace(/^\$+|\$+$/g, '').trim() : '';
      // latex가 description에 이미 포함되어 있는지 체크
      const latexAlreadyInDesc = rawLatex && desc.includes(rawLatex);
      const latex = (rawLatex && !descHasMath && !latexAlreadyInDesc) ? ` $${rawLatex}$` : '';
      parts.push(`${step.stepNumber || ''}. ${desc}${latex}`);
    }
    parts.push('');
  }

  // ── 정답 ──
  if (solution.finalAnswer) {
    parts.push(`∴ 정답: ${sanitizeSolutionText(String(solution.finalAnswer))}`);
  }

  // ── 풀이 팁 ──
  if (solution.tip) {
    parts.push('');
    parts.push(`💡 ${sanitizeSolutionText(solution.tip)}`);
  }

  // ── 레거시 호환: commonMistakes (기존 데이터) ──
  if (!solution.tip && solution.commonMistakes && solution.commonMistakes.length > 0) {
    parts.push('');
    parts.push(`💡 ${sanitizeSolutionText(solution.commonMistakes[0])}`);
  }

  // ── 레거시 호환: approach (기존 데이터) ──
  if (!solution.concept && solution.approach && !solution.steps?.length) {
    return `[풀이 접근] ${sanitizeSolutionText(solution.approach)}\n\n∴ 정답: ${sanitizeSolutionText(String(solution.finalAnswer || ''))}`;
  }

  return parts.join('\n');
}
