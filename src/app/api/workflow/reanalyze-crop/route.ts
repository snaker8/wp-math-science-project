// ============================================================================
// 크롭 이미지 기반 재분석 API
// bbox 영역의 크롭 이미지를 Mathpix OCR로 전송하여 텍스트/수식 재추출
// + GPT-4o Vision으로 그래프/도형 해석 → Desmos 수식 추출
// + GPT-4o 문제 분류 (대한민국 교육과정 505개 성취기준 + 5등급 난이도)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getMathpixClient, MathpixError } from '@/lib/ocr/mathpix';
import { readFileSync } from 'fs';
import { join } from 'path';

// 그래프 분석 결과 타입
export interface GraphData {
  type: 'function' | 'geometry' | 'coordinate' | 'none';
  expressions?: string[];     // Desmos 수식 ["y=x^2", "y=2x+1"]
  xRange?: [number, number];
  yRange?: [number, number];
  points?: { x: number; y: number; label?: string }[];
  description?: string;       // 폴백용 텍스트 설명
  // 이미지 내 그래프 영역 위치 (0~1 비율, 크롭용)
  imageBbox?: { top: number; left: number; bottom: number; right: number };
}

// ============================================================================
// 대한민국 교육과정 기반 문제 분류 (505개 성취기준 + 5등급 난이도)
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// ★ 확장 세부유형 데이터 (1,139개 typeCode → 학교급별 필터링)
let _expandedTypesMap: Record<string, string> | null = null;
let _expandedTypesAll: string | null = null;

const LEVEL_GROUPS: Record<string, string[]> = {
  elementary: ['ES12', 'ES34', 'ES56'],
  middle: ['MS'],
  high_core: ['HS0', 'HS1', 'HS2', 'CAL', 'PRB', 'GEO'],
  high_elective: ['ELM', 'EM1', 'ELT', 'ET1', 'ELC', 'ELR', 'ELA', 'ELW', 'ELP'],
};

function initExpandedTypes(): void {
  // 이미 성공적으로 로드된 경우 스킵 (빈 문자열이면 재시도)
  if (_expandedTypesMap && _expandedTypesAll && _expandedTypesAll.length > 0) return;
  try {
    const filePath = join(process.cwd(), 'curriculum_data', 'expanded_math_types_unified.json');
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    _expandedTypesMap = {};
    const allLines: string[] = [];

    for (const subject of data.subjects || []) {
      for (const area of subject.areas || []) {
        for (const std of area.standards || []) {
          for (const t of std.types || []) {
            const line = `${t.typeCode}|${t.typeName}`;
            allLines.push(line);
            // level 코드 추출 (MA-HS1-ALG-01-001 → HS1)
            const parts = (t.typeCode as string).split('-');
            const level = parts[1] || '';
            if (!_expandedTypesMap[level]) _expandedTypesMap[level] = '';
            _expandedTypesMap[level] += line + '\n';
          }
        }
      }
    }
    _expandedTypesAll = allLines.join('\n');
    console.log(`[Classification] Loaded ${allLines.length} expanded types`);
  } catch (err) {
    console.warn('[Classification] Failed to load expanded types:', err);
    _expandedTypesMap = {};
    _expandedTypesAll = '';
  }
}

function detectSchoolLevel(text: string): string[] {
  const levels: string[] = [];

  // 1. 고등학교 전용 키워드 (확실히 고등)
  if (/수능|모의고사|미적분|삼각함수|적분|미분|극한|벡터|행렬|이차곡선|공간좌표|확률변수|통계적추정|수열의극한|로그|지수함수|등차|등비|순열|조합|집합.*명제|항등식|나머지정리|조립제법/.test(text)) {
    levels.push('high_core');
  }

  // 2. 공통수학 (중학교와 겹치지만 고등학교에서도 핵심)
  //    이차방정식, 인수분해, 이차함수, 부등식 등은 고등 공통수학(HS0)에도 포함
  if (/다항식|이차방정식|인수분해|이차함수|부등식|연립방정식|이차부등식|복소수|이차식|절대부등식|산술기하/.test(text)) {
    if (!levels.includes('high_core')) levels.push('high_core');
  }

  // 3. 중학교 전용 키워드
  if (/피타고라스|삼각비|원주각|대푯값|상관관계|일차방정식|일차함수|정비례|반비례/.test(text)) {
    levels.push('middle');
  }

  // 4. 초등 키워드
  if (/곱셈구구|받아올림|분모|통분|직육면체|소수의곱셈|약수와배수/.test(text)) {
    levels.push('elementary');
  }

  // 기본: 고등학교
  if (levels.length === 0) levels.push('high_core');
  return levels;
}

function getExpandedTypes(ocrText?: string): string {
  initExpandedTypes();
  if (!_expandedTypesAll) return '';

  if (!ocrText) return _expandedTypesAll.substring(0, 25000);

  const levels = detectSchoolLevel(ocrText);
  let result = '';

  for (const group of levels) {
    const levelCodes = LEVEL_GROUPS[group] || [];
    for (const code of levelCodes) {
      if (_expandedTypesMap && _expandedTypesMap[code]) {
        result += _expandedTypesMap[code];
      }
    }
  }

  // 용량 여유가 있으면 선택과목도 추가
  if (result.length < 20000 && levels.includes('high_core')) {
    for (const code of LEVEL_GROUPS.high_elective) {
      if (_expandedTypesMap && _expandedTypesMap[code]) {
        result += _expandedTypesMap[code];
      }
      if (result.length > 25000) break;
    }
  }

  return result.substring(0, 30000);
}

function buildClassificationPrompt(ocrText: string, problemNumber?: number): string {
  const expandedTypes = getExpandedTypes(ocrText);
  const problemLabel = problemNumber ? `${problemNumber}번 ` : '';

  return `당신은 "다사람수학"의 AI 수학 교육 전문가입니다.
한국 교육과정(2015 개정, 2022 개정)에 기반하여 수학 문제를 분석합니다.

아래 ${problemLabel}문제를 분석하여 **반드시 아래 JSON 형식으로만** 응답하세요.

■ 분류 기준
- 아래 1,139개 세부유형(typeCode|typeName) 목록에서 가장 적합한 유형을 선택하세요.
- typeCode 형식: MA-{LEVEL}-{DOMAIN}-{STD}-{SEQ}

■ 난이도 채점 (6항목 → 5등급)
필요개념(1~3점), 풀이단계(1~3), 계산복잡도(1~3), 사고력(1~3), 자료해석(0~2), 함정(0~2)
등급: 하(3~5)=1, 중하(6~7)=2, 중(8~9)=3, 중상(10~11)=4, 상(12+)=5

■ 응답 JSON
{
  "classification": {
    "typeCode": "MA-HS0-ALG-01-001",
    "typeName": "유형명",
    "achievementCode": "[12수학01-02]",
    "subject": "과목명",
    "chapter": "대단원",
    "section": "중단원",
    "difficulty": 3,
    "difficultyLabel": "중",
    "cognitiveDomain": "CALCULATION",
    "confidence": 0.85
  },
  "solution": {
    "approach": "풀이법 (한글로 간단히)",
    "steps": [{"stepNumber":1,"description":"한글 설명만 (수식 제외)","latex":"수식만 (예: x^2-5x+6=0)"}],
    "finalAnswer": "최종 답 (숫자 또는 수식만)"
  }
}

■ solution.steps 작성 규칙
- description: 반드시 한글로만 작성. 수식 포함 금지. (예: "복소수의 곱셈을 전개한다")
- latex: LaTeX 수식만 작성. \rightarrow 등 화살표 사용 가능. 빈 문자열 허용
- finalAnswer: 선택지 번호(1~5) 또는 계산 결과만

■ 세부유형 목록 (typeCode|typeName)
${expandedTypes || '(유형 데이터 로드 실패)'}

■ 분석 대상 문제
${ocrText}

JSON만 응답하세요.`;
}

/**
 * GPT-4o로 문제 분류 + 풀이 생성
 */
async function classifyProblemWithGPT(
  ocrText: string,
  problemNumber?: number
): Promise<Record<string, unknown> | null> {
  if (!OPENAI_API_KEY || !ocrText.trim()) return null;

  const prompt = buildClassificationPrompt(ocrText, problemNumber);

  const classificationModel = 'gpt-4o-mini'; // 429 방지를 위해 mini 사용
  const systemMsg = '당신은 한국 교육과정(2015/2022 개정) 수학 전문가입니다. 1,139개 세부유형과 난이도 기준표에 따라 문제를 분류합니다. 반드시 유효한 JSON으로만 응답하세요.';

  const makeRequest = () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000); // 20초 타임아웃
    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: classificationModel,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  };

  // 최대 2회 시도 (빠른 백오프)
  const delays = [0, 3000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      console.warn(`[Classification] Rate limited, retrying after ${delays[attempt]/1000}s... (attempt ${attempt + 1}/${delays.length})`);
      await new Promise(r => setTimeout(r, delays[attempt]));
    }

    let response: Response;
    try {
      response = await makeRequest();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn(`[Classification] Timeout (20s) on attempt ${attempt + 1}`);
        continue;
      }
      throw err;
    }

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return null;
      try {
        return JSON.parse(content);
      } catch {
        console.warn('[Classification] Failed to parse response:', content.substring(0, 200));
        return null;
      }
    }

    if (response.status !== 429) {
      throw new Error(`Classification API error: ${response.status}`);
    }
  }

  console.warn('[Classification] Exhausted all retries (429)');
  return null; // 실패해도 null 반환 (에러 throw 대신)
}

/**
 * POST /api/workflow/reanalyze-crop
 *
 * Body:
 *   imageBase64: string  — bbox 영역의 PNG 크롭 이미지 (data:image/png;base64,...)
 *   customPrompt?: string — 고급 분석 요구사항 (선택)
 *   analyzeGraph?: boolean — 그래프/도형 Vision 분석 여부 (기본 true)
 *   fullAnalysis?: boolean — GPT 분류/풀이 포함 여부 (기본 false)
 *   problemNumber?: number — 문제 번호 (선택)
 *
 * Response:
 *   ocrText: string — Mathpix OCR 변환 텍스트 (수식 $...$ 인라인)
 *   choices: string[] — 감지된 선택지
 *   confidence: number
 *   graphData?: GraphData — 그래프/도형 분석 결과 (있을 때만)
 *   classification?: object — GPT 분류/풀이 결과 (fullAnalysis=true일 때)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageBase64, customPrompt, analyzeGraph = true, fullAnalysis = false, problemNumber } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    // 1. Mathpix OCR + Vision 그래프 분석 병렬 실행
    console.log('[Reanalyze] Sending crop image to Mathpix OCR...');
    const mathpix = getMathpixClient();

    const ocrPromise = mathpix.processImage(imageBase64, {
      formats: ['text', 'latex_styled'],
      data_options: {
        include_latex: true,
        include_asciimath: false,
        include_mathml: false,
        include_svg: false,
        include_table_html: false,
      },
      include_line_data: true,
    });

    // 그래프 분석을 OCR과 병렬 실행 (추가 지연 없음)
    const graphPromise = analyzeGraph
      ? analyzeGraphWithVision(imageBase64).catch(err => {
          console.warn('[Reanalyze] Graph analysis failed:', err);
          return null;
        })
      : Promise.resolve(null);

    const [ocrResult, graphData] = await Promise.all([ocrPromise, graphPromise]);

    // Mathpix Markdown 텍스트 (수식 $...$ 인라인)
    const rawOcrText = ocrResult.latex_styled || ocrResult.text || '';
    const confidence = ocrResult.confidence || 0.8;

    console.log(`[Reanalyze] OCR result: ${rawOcrText.length} chars, confidence=${confidence}`);
    if (graphData && graphData.type !== 'none') {
      console.log(`[Reanalyze] Graph detected: type=${graphData.type}, expressions=${graphData.expressions?.length || 0}`);
    }

    // ★ OCR 한글 오타 자동 교정 (GPT-4o-mini)
    const ocrText = await correctOcrTypos(rawOcrText);

    // 2. 선택지 추출
    const choices = extractChoicesFromOCR(ocrText);
    // ★ 디버그: 실제 OCR 원문과 추출된 선택지 로그
    console.log(`[Reanalyze] OCR 원문(처음 500자):\n${ocrText.substring(0, 500)}`);
    console.log(`[Reanalyze] 추출된 선택지 (${choices.length}개):`, JSON.stringify(choices));

    // 3. 고급 분석: customPrompt가 있으면 GPT-4o로 추가 정제
    let refinedText = ocrText;
    if (customPrompt && customPrompt.trim()) {
      try {
        refinedText = await refineWithGPT(ocrText, customPrompt);
      } catch (err) {
        console.warn('[Reanalyze] GPT refinement failed, using raw OCR:', err);
      }
    }

    // 4. fullAnalysis가 true이면 GPT-4o로 문제 분류 + 풀이 생성
    let classification: Record<string, unknown> | null = null;
    if (fullAnalysis) {
      try {
        console.log(`[Reanalyze] 문제 ${problemNumber || '?'}번 GPT 분류 시작...`);
        classification = await classifyProblemWithGPT(refinedText, problemNumber);
        if (classification) {
          console.log(`[Reanalyze] 분류 완료: ${(classification.classification as Record<string, unknown>)?.typeName || '?'}, 난이도=${(classification.classification as Record<string, unknown>)?.difficulty || '?'}`);
        }
      } catch (err) {
        console.warn('[Reanalyze] Classification failed:', err);
      }
    }

    const responseData: Record<string, unknown> = {
      ocrText: refinedText,
      rawOcrText: ocrText,
      choices,
      confidence,
    };

    // 그래프 데이터가 있고 type이 none이 아닌 경우에만 포함
    if (graphData && graphData.type !== 'none') {
      responseData.graphData = graphData;
    }

    // 분류 결과 포함
    if (classification) {
      responseData.classification = classification;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[Reanalyze] Error:', error);

    if (error instanceof MathpixError) {
      return NextResponse.json(
        { error: 'OCR failed', message: error.message, code: error.code },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Reanalyze failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * OCR 텍스트에서 선택지 추출
 * 정방향 분리: ①②③④⑤ 위치를 모두 찾고 사이 텍스트를 추출
 */
function extractChoicesFromOCR(text: string): string[] {
  // 1. ①②③④⑤ 정방향 분리
  const circledRegex = /[①②③④⑤]/g;
  const positions: { idx: number; len: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = circledRegex.exec(text)) !== null) {
    positions.push({ idx: m.index, len: m[0].length });
  }

  if (positions.length >= 2) {
    const choices: string[] = [];
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].idx + positions[i].len;
      const end = i + 1 < positions.length ? positions[i + 1].idx : text.length;
      const choiceText = text.substring(start, end).trim();
      if (choiceText) choices.push(choiceText);
    }
    if (choices.length >= 2) return choices.map(normalizeChoiceText);
  }

  // 2. (1) (2) (3) (4) (5) 정방향 분리
  // 소문제("구하시오", "[N점]" 등)든 선택지든 모두 분리하여 choices로 반환
  // 프론트에서 소문제 패턴 감지 시 (1)(2)(3) 형태로 렌더링
  {
    const parenRegex = /\(([1-5])\)/g;
    const parenPositions: { idx: number; len: number }[] = [];
    while ((m = parenRegex.exec(text)) !== null) {
      parenPositions.push({ idx: m.index, len: m[0].length });
    }

    if (parenPositions.length >= 2) {
      const choices: string[] = [];
      for (let i = 0; i < parenPositions.length; i++) {
        const start = parenPositions[i].idx + parenPositions[i].len;
        const end = i + 1 < parenPositions.length ? parenPositions[i + 1].idx : text.length;
        const choiceText = text.substring(start, end).trim();
        if (choiceText) choices.push(choiceText);
      }
      if (choices.length >= 2) return choices.map(normalizeChoiceText);
    }
  }

  // 3. 1) 2) 3) ... 정방향 분리
  const numRegex = /(?:^|\s)([1-5])\s*\)/gm;
  const numPositions: { idx: number; len: number }[] = [];
  while ((m = numRegex.exec(text)) !== null) {
    numPositions.push({ idx: m.index, len: m[0].length });
  }

  if (numPositions.length >= 2) {
    const choices: string[] = [];
    for (let i = 0; i < numPositions.length; i++) {
      const start = numPositions[i].idx + numPositions[i].len;
      const end = i + 1 < numPositions.length ? numPositions[i + 1].idx : text.length;
      const choiceText = text.substring(start, end).trim();
      if (choiceText) choices.push(choiceText);
    }
    if (choices.length >= 2) return choices.map(normalizeChoiceText);
  }

  return [];
}

/** 선택지 텍스트 정규화: Mathpix 수식 포맷 → $...$, 원번호 제거 */
function normalizeChoiceText(text: string): string {
  let result = text
    .replace(/^[①②③④⑤]\s*/, '')   // 원번호 제거
    .trim();

  // 1. 완전한 \( ... \) → $ ... $  (멀티라인 's' 플래그)
  result = result.replace(/\\\((.+?)\\\)/gs, (_, inner) => `$${inner.trim()}$`);

  // 2. 불완전한 \( (닫는 \) 없음) — 선택지 분리 시 끝이 잘린 경우
  //    예: "\( -x^{2}-2x-8"  →  "$ -x^{2}-2x-8$"
  result = result.replace(/\\\((.+)$/s, (_, inner) => `$${inner.trim()}$`);

  // 3. 불완전한 \) (여는 \( 없음) — 앞이 잘린 경우
  //    예: "-x^{2}-2x-8 \)"  →  "$ -x^{2}-2x-8$"
  result = result.replace(/^(.+?)\\\)(\s*)$/s, (_, inner) => `$${inner.trim()}$`);

  // 4. \[ ... \] → $$ ... $$
  result = result.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner.trim()}$$`);

  // 5. 선택지 전체가 bare LaTeX인 경우 ($로 감싸기)
  //    예: "-x^{2}-2x-8" (이미 \(없이 순수 LaTeX만 있는 경우)
  //    조건: $가 없고, \frac \sqrt ^ _ 등 LaTeX 기호가 있고, 한글이 없는 경우
  if (!result.includes('$') && /[\\^_{}]/.test(result) && !/[가-힣]/.test(result)) {
    result = `$${result.trim()}$`;
  }

  return result.trim();
}

/**
 * GPT-4o Vision으로 크롭 이미지의 그래프/도형 분석
 * 함수 그래프, 좌표 평면, 기하 도형 등을 해석하여 Desmos 수식으로 변환
 */
async function analyzeGraphWithVision(imageBase64: string): Promise<GraphData | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return null;

  const visionController = new AbortController();
  const visionTimeout = setTimeout(() => visionController.abort(), 15000); // 15초 타임아웃

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      signal: visionController.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `당신은 수학 시험지의 그래프/도형을 분석하여 Desmos 그래핑 계산기용 수식으로 변환하는 전문가입니다.

이미지에서 그래프를 찾아 Desmos가 렌더링할 수 있는 정확한 수식을 추출하세요.

■ 응답 형식 (JSON만, 다른 텍스트 없이):
{
  "type": "function",
  "expressions": ["y=x^2", "y=2x+1"],
  "xRange": [-5, 5],
  "yRange": [-3, 7],
  "points": [{"x": 1, "y": 1, "label": "A"}],
  "description": "이차함수와 직선의 교점",
  "imageBbox": {"top": 0.3, "left": 0.05, "bottom": 0.75, "right": 0.95}
}

■ imageBbox (매우 중요):
- 이미지 전체 크기 대비 그래프/도형 영역의 위치를 0~1 비율로 반환
- top: 그래프 상단 시작 (0=이미지 맨 위, 1=맨 아래)
- left: 그래프 좌측 시작
- bottom: 그래프 하단 끝
- right: 그래프 우측 끝
- 그래프만 포함하고, 그래프 위아래의 텍스트는 제외하세요
- 그래프가 없으면(type: "none") imageBbox는 생략

■ type 값:
- "function": 함수 그래프 + 도형이 함께 있거나, 직선/곡선 위에 점/꼭지점이 있는 문제
- "geometry": 순수 기하 도형만 (함수 그래프 없이 도형만 있는 경우)
- "coordinate": 좌표 평면에 점/벡터만 있는 경우
- "none": 그래프/도형이 없는 경우

■ 핵심 판단 기준:
- 이차함수 그래프 위에 직사각형 꼭지점 A,B,C,D가 있으면 → type: "function"
- expressions에 함수 수식과 함께 꼭지점 좌표를 points에 넣으세요

■ Desmos 수식 작성 규칙 (매우 중요):
1. expressions 배열의 각 수식은 Desmos가 직접 렌더링하는 수식입니다
2. 변수는 x, y만 사용. a, b, c 같은 매개변수는 구체적 숫자로 대입하세요
   - 잘못된 예: "y=-2ax+4" (a가 정의되지 않음)
   - 올바른 예: "y=-4x+4" (a=2를 대입)
3. 이미지에서 구체적 수치를 읽을 수 없는 매개변수가 있으면, 그래프의 모양을 보고 추정하세요
4. 수식 형식: y=x^2, y=\\sin(x), y=\\frac{1}{x}, x^2+y^2=9
5. 절대값: \\left|x\\right| (|x| 사용 금지)
6. 부등식: y\\ge x^2, y\\le 2x+1
7. 분수: \\frac{a}{b}
8. 제곱근: \\sqrt{x}
9. \\text{}, \\textbf{}, \\displaystyle 등 텍스트 명령 사용 금지
10. \\rightarrow 등 화살표 사용 금지
11. 한글 포함 금지
12. 직사각형/선분은 polygon 또는 선분 수식으로: polygon((x1,y1),(x2,y2),(x3,y3),(x4,y4))
13. 꼭지점 A,B,C,D 등 알파벳 표시는 points 배열에 label과 함께 넣으세요

■ 범위 설정:
- xRange, yRange는 그래프의 주요 특징(교점, 극값, 절편)이 모두 보이도록 설정
- 기본값: [-10, 10] 대신 그래프에 맞는 적절한 범위 사용

■ description:
- 한국어로 그래프 설명 (이 필드만 한국어 허용)

■ 그래프가 없으면: {"type": "none"}`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64,
                  detail: 'high',
                },
              },
              {
                type: 'text',
                text: '이 수학 문제 이미지에서 그래프가 있으면 Desmos 수식으로 변환해주세요. 매개변수(a,b,c)는 반드시 구체적 숫자로 대입하세요. JSON으로만 응답하세요.',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 600,
      }),
    });
  } catch (err: unknown) {
    clearTimeout(visionTimeout);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[GraphVision] Timeout (15s), skipping graph analysis');
      return null;
    }
    throw err;
  } finally {
    clearTimeout(visionTimeout);
  }

  if (!response.ok) {
    // 429는 rate limit — 로그만 남기고 조용히 null 반환
    if (response.status === 429) {
      console.warn('[GraphVision] Rate limited (429), skipping graph analysis');
      return null;
    }
    throw new Error(`GPT-4o Vision API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content?.trim();
  if (!content) return null;

  console.log('[GraphVision] Raw GPT response:', content);

  try {
    // JSON 파싱 (```json ... ``` 래핑 제거)
    const jsonStr = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonStr) as GraphData;

    // 유효성 검증
    if (!parsed.type || !['function', 'geometry', 'coordinate', 'none'].includes(parsed.type)) {
      return { type: 'none' };
    }

    // expressions 후처리 (Desmos 호환성 향상)
    if (parsed.expressions && Array.isArray(parsed.expressions)) {
      parsed.expressions = parsed.expressions
        .map(expr => {
          let cleaned = expr.trim();
          // 이중 백슬래시 수정
          cleaned = cleaned.replace(/\\\\(frac|left|right|sqrt|sin|cos|tan|log|ln|ge|le|ne|cdot|times|div|pi|theta)/g, '\\$1');
          // \text{} 제거
          cleaned = cleaned.replace(/\\text\{([^}]*)\}/g, '$1');
          // $ 래핑 제거
          cleaned = cleaned.replace(/^\$+|\$+$/g, '');
          return cleaned;
        })
        .filter(expr => {
          // 한글 포함 수식 제거
          if (/[가-힣]/.test(expr)) {
            console.warn('[GraphVision] Removing Korean expression:', expr);
            return false;
          }
          // 빈 수식 제거
          if (!expr || expr.length === 0) return false;
          return true;
        });

      console.log('[GraphVision] Cleaned expressions:', parsed.expressions);
    }

    return parsed;
  } catch {
    console.warn('[GraphVision] Failed to parse GPT response:', content);
    return null;
  }
}

/**
 * OCR 한글 오타 자동 교정 (gpt-4o-mini, 8초 타임아웃)
 * Mathpix가 한글을 잘못 인식하는 경우(블→를, 브→를 등)를 수정
 */
async function correctOcrTypos(ocrText: string): Promise<string> {
  // 한글이 없으면 교정 불필요 (수식만 있는 경우)
  if (!OPENAI_API_KEY || !/[가-힣]/.test(ocrText) || ocrText.length > 3000) return ocrText;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `한국어 수학 시험지 OCR 결과의 오타를 교정하세요.
규칙:
- 수식($...$, $$...$$, \\(...\\), \\[...\\]) 내부는 절대 수정하지 마세요
- 한글 오타만 교정하세요 (예: "블" → "를", "브" → "를", "하자." → "하자.")
- 수학 용어는 그대로 유지하세요
- 문장 구조/내용은 변경하지 마세요
- 교정된 텍스트만 반환하고 설명은 하지 마세요`,
          },
          { role: 'user', content: ocrText },
        ],
        temperature: 0,
        max_tokens: Math.min(ocrText.length * 2, 2000),
      }),
    });

    clearTimeout(timeout);
    if (!response.ok) return ocrText; // 실패 시 원본 반환

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content?.trim();
    if (corrected && corrected.length > 0) {
      console.log(`[OcrCorrect] 교정 완료: ${ocrText.length} → ${corrected.length}자`);
      return corrected;
    }
    return ocrText;
  } catch {
    clearTimeout(timeout);
    return ocrText; // 타임아웃/에러 시 원본 반환
  }
}

/**
 * GPT로 OCR 결과 정제 (고급 분석)
 */
async function refineWithGPT(ocrText: string, customPrompt: string): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn('[Reanalyze] No OpenAI API key, skipping GPT refinement');
    return ocrText;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `당신은 수학 문제 OCR 결과를 정제하는 전문가입니다.
주어진 OCR 텍스트를 사용자 요구사항에 맞게 수정해주세요.
수식은 반드시 $...$ (인라인) 또는 $$...$$ (디스플레이) 형식으로 유지하세요.
수정된 텍스트만 반환하세요. 설명 없이 텍스트만 출력하세요.`,
        },
        {
          role: 'user',
          content: `OCR 원본 텍스트:
${ocrText}

수정 요구사항:
${customPrompt}

위 요구사항에 맞게 OCR 텍스트를 수정해주세요. 수정된 텍스트만 반환하세요.`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    throw new Error(`GPT API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content?.trim() || ocrText;
}
