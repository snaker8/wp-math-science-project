// ============================================================================
// 크롭 이미지 기반 재분석 API
// bbox 영역의 크롭 이미지를 Mathpix OCR로 전송하여 텍스트/수식 재추출
// + GPT-4o Vision으로 그래프/도형 해석 → Desmos 수식 추출
// + GPT-4o 문제 분류 (대한민국 교육과정 505개 성취기준 + 5등급 난이도)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getMathpixClient, MathpixError } from '@/lib/ocr/mathpix';
import { supabaseAdmin } from '@/lib/supabase/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// 그래프 분석 결과 타입
export interface GraphData {
  type: 'function' | 'geometry' | 'coordinate' | 'sketch' | 'none';
  expressions?: string[];     // Desmos 수식 ["y=x^2", "y=2x+1"]
  xRange?: [number, number];
  yRange?: [number, number];
  points?: { x: number; y: number; label?: string }[];
  description?: string;       // 폴백용 텍스트 설명
  // 이미지 내 그래프 영역 위치 (0~1 비율, 크롭용)
  imageBbox?: { top: number; left: number; bottom: number; right: number };
  // ★ sketch 타입: Gemini가 보이는 대로 생성한 SVG
  svg?: string;
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
 * 박스 단위 문제 분류 + 해설 생성
 * ★ 메인 업로드 경로(cloud-flow.ts)와 동일한 체계로 통일:
 *   - 수학비서 MS 코드 (1,139개가 아닌 22,785개 mathsecr_types)
 *   - 난이도 1~10 스케일 (4등급)
 *   - Sonnet 해설
 * ★ analyzeProblemWithLLM 을 재사용 — 별도 프롬프트/모델 유지 금지
 */
async function classifyProblemWithGPT(
  ocrText: string,
  problemNumber?: number,
  subject?: string,
  gradeHint?: string
): Promise<Record<string, unknown> | null> {
  if (!ocrText.trim()) return null;
  try {
    const { analyzeProblemWithLLM } = await import('@/lib/workflow/cloud-flow');
    const result = await analyzeProblemWithLLM(
      ocrText,
      [],            // mathExpressions (OCR 본문에 포함됨)
      'PROBLEM',
      undefined,     // onProgress
      {},            // referenceTexts
      subject,
      gradeHint,
    );
    if (problemNumber !== undefined) {
      console.log(`[Reanalyze] 문제 ${problemNumber}번: analyzeProblemWithLLM 완료 (수학비서 체계)`);
    }
    return result as unknown as Record<string, unknown>;
  } catch (err) {
    console.error('[Classification] analyzeProblemWithLLM error:', err);
    return null;
  }
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
    const { imageBase64, customPrompt, analyzeGraph = true, fullAnalysis = false, problemNumber, problemId } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    // ★ 낙서 제거 비활성화 (OpenCV 방식이 인쇄체까지 삭제하는 문제)
    const cleanedBase64 = imageBase64;

    // 1. Mathpix OCR + Vision 그래프 분석 병렬 실행
    console.log('[Reanalyze] Sending crop image to Mathpix OCR...');
    const mathpix = getMathpixClient();

    const ocrPromise = mathpix.processImage(cleanedBase64, {
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

    // OCR이 image_no_content로 실패해도 도형 분석은 계속 진행
    let ocrResult: any = null;
    let ocrFailed = false;
    let graphData: any = null;
    try {
      const [ocr, graph] = await Promise.all([ocrPromise, graphPromise]);
      ocrResult = ocr;
      graphData = graph;
    } catch (ocrErr: any) {
      // Mathpix "Content not found" — 도형만 있는 이미지
      if (ocrErr?.details?.error_info?.id === 'image_no_content' || ocrErr?.message?.includes('Content not found')) {
        console.log('[Reanalyze] OCR: 텍스트 없음 (도형만 있는 이미지) — 도형 분석만 진행');
        ocrFailed = true;
        graphData = analyzeGraph ? await analyzeGraphWithVision(imageBase64).catch(() => null) : null;
      } else {
        throw ocrErr;
      }
    }

    // Mathpix Markdown 텍스트 (수식 $...$ 인라인)
    const rawOcrText = ocrFailed ? '' : (ocrResult?.latex_styled || ocrResult?.text || '');
    const confidence = ocrFailed ? 0 : (ocrResult?.confidence || 0.8);

    console.log(`[Reanalyze] OCR result: ${rawOcrText.length} chars, confidence=${confidence}`);
    if (graphData && graphData.type !== 'none') {
      console.log(`[Reanalyze] Graph detected: type=${graphData.type}, expressions=${graphData.expressions?.length || 0}`);
    }

    // ★ OCR 한글 오타 자동 교정 (GPT-4o-mini)
    const correctedText = await correctOcrTypos(rawOcrText);

    // ★ <보기> ㄱ/ㄴ/ㄷ 오인식 교정 (Mathpix/GPT 공통 문제)
    const fixedConsonants = fixKoreanConsonantChoices(correctedText);

    // ★ \displaystyle 제거 (KaTeX 인라인 렌더링 깨짐 방지)
    const noDisplayStyle = fixedConsonants.replace(/\\displaystyle\s*/g, '');
    // ★ \lbrace → \left\{, \rbrace → \right\} (KaTeX 호환)
    const noLbrace = noDisplayStyle
      .replace(/\\lbrace/g, '\\left\\{')
      .replace(/\\rbrace/g, '\\right\\}');
    // ★ \(...\) → $...$ 변환 (렌더링 안정성: \right) 혼동 방지)
    const dollarDelim = noLbrace
      .replace(/\\left\(/g, '\uE001')
      .replace(/\\right\)/g, '\uE002')
      .replace(/\\\((.+?)\\\)/gs, (_, inner) => `$${inner.trim()}$`)
      .replace(/\uE001/g, '\\left(')
      .replace(/\uE002/g, '\\right)');
    // ★ \[...\] → $$...$$ 변환
    const dollarDelim2 = dollarDelim.replace(/\\\[(.+?)\\\]/gs, (_, inner) => `$$${inner.trim()}$$`);
    // ★ 전각 괄호 → 반각 괄호 정규화 (Mathpix/GPT가 （1）형식으로 출력하는 경우)
    const normalizedParens = dollarDelim2.replace(/\uff08/g, '(').replace(/\uff09/g, ')');
    // ★ (1)(2)(3)(4)(5) → ①②③④⑤ 정규화 (Mathpix 원문자 오변환 교정)
    const ocrText = normalizeChoiceParens(normalizedParens);

    // 2. 선택지 추출
    const choices = extractChoicesFromOCR(ocrText);
    // ★ 디버그: 실제 OCR 원문과 추출된 선택지 로그
    console.log(`[Reanalyze] OCR 원문(처음 500자):\n${ocrText.substring(0, 500)}`);
    console.log(`[Reanalyze] 추출된 선택지 (${choices.length}개):`, JSON.stringify(choices));

    // 3. GPT-4o Vision 정제
    //    - customPrompt 있으면: 사용자 요구사항 + 이미지 직접 인식
    //    - confidence < 0.5이면: OCR 결과 불량 → 자동으로 이미지 재인식
    let refinedText = ocrText;
    const needsVisionFix = confidence < 0.5 || ocrText.includes('\\displaystyle');
    if (customPrompt && customPrompt.trim()) {
      try {
        refinedText = await refineWithGPT(ocrText, customPrompt, imageBase64);
      } catch (err) {
        console.warn('[Reanalyze] GPT refinement failed, using raw OCR:', err);
      }
    } else if (needsVisionFix) {
      try {
        console.log(`[Reanalyze] OCR 품질 불량 (confidence=${confidence.toFixed(2)}) → GPT-4o Vision 자동 교정`);
        refinedText = await refineWithGPT(ocrText, '수식을 정확하게 다시 읽어주세요', imageBase64);
      } catch (err) {
        console.warn('[Reanalyze] Vision auto-fix failed, using raw OCR:', err);
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

    // ★ problemId가 있으면 이미지를 Storage에 저장
    if (problemId && supabaseAdmin) {
      try {
        const imgBuffer = Buffer.from(imageBase64, 'base64');
        const cropPath = `problem-crops/${problemId}.png`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from('source-files')
          .upload(cropPath, imgBuffer, {
            contentType: 'image/png',
            upsert: true,
          });

        if (uploadErr) {
          console.warn('[Reanalyze] Storage upload failed:', uploadErr.message);
        } else {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
          const cropUrl = `${supabaseUrl}/storage/v1/object/public/source-files/${cropPath}`;
          responseData.cropUrl = cropUrl;
          responseData.cropPath = cropPath;
          console.log(`[Reanalyze] Crop image saved: ${cropPath}`);
        }
      } catch (err) {
        console.warn('[Reanalyze] Storage upload error:', err);
      }
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
 * (1)(2)(3)(4)(5) → ①②③④⑤ 정규화
 * Mathpix OCR이 원문자를 괄호 숫자로 잘못 변환하는 경우 교정
 *
 * ★ 서술형 소문제 (1)(2)(3) 구별 로직:
 *   - (1)~(5) 5개 모두 존재 → 거의 확실히 선택지 → 변환
 *   - (1)~(4) 4개 존재 + 간격 짧음 → 선택지 가능성 높음 → 변환
 *   - (1)~(3) 3개만 → 서술형 소문제 가능성 → 변환 안 함
 *   - "구하시오", "구하여라", "[N점]", "의 값" 등 포함 → 소문제 → 변환 안 함
 */
function normalizeChoiceParens(text: string): string {
  const NUMBER_TO_CIRCLED: Record<string, string> = {
    '1': '①', '2': '②', '3': '③', '4': '④', '5': '⑤',
  };

  // 이미 ①②③ 가 있으면 변환 불필요
  if (/[①②③④⑤]/.test(text)) return text;

  // (1)~(5) 위치 찾기 (수식 내부 제외)
  const parenRegex = /\(([1-5])\)/g;
  const matches: { index: number; num: string; len: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = parenRegex.exec(text)) !== null) {
    // 수식 내부인지 간단 체크: 앞쪽에 $가 홀수 개면 수식 안
    const before = text.substring(Math.max(0, m.index - 100), m.index);
    const dollarCount = (before.match(/(?<![\\])\$/g) || []).length;
    const isInMath = dollarCount % 2 === 1 || /\\\(\s*$/.test(before);
    if (!isInMath) {
      // ★ 함수 인수 보호: f(1), Q(2), R(1) 등 영문자 바로 뒤 (N)은 제외
      const charBefore = m.index > 0 ? text[m.index - 1] : '';
      if (/[a-zA-Z]/.test(charBefore)) continue;
      matches.push({ index: m.index, num: m[1], len: m[0].length });
    }
  }

  // ★ 최소 4개 이상 필요 (3개면 서술형 소문제일 가능성 높음)
  if (matches.length < 4) return text;

  // 순서 검증: (1)(2)(3)(4) 최소 포함
  const nums = matches.map(m => parseInt(m.num));
  if (!nums.includes(1) || !nums.includes(2) || !nums.includes(3) || !nums.includes(4)) return text;

  // 간격 확인: 평균 간격 150자 이하 (선택지는 보통 짧음)
  const totalSpan = matches[matches.length - 1].index - matches[0].index;
  if (totalSpan / (matches.length - 1) > 150) return text;

  // ★ 소문제 패턴 감지: 내용에 "서술형" 키워드가 있으면 변환 안 함
  const subQuestionKeywords = /구하시오|구하여라|구해라|서술하시오|증명하시오|의\s*값을?\s*구|풀이\s*과정|설명하시오|나타내시오|보이시오|\[\s*\d+\s*점\s*\]/;

  for (let i = 0; i < matches.length - 1; i++) {
    const start = matches[i].index + matches[i].len;
    const end = matches[i + 1].index;
    const content = text.substring(start, end).trim();
    // 내용이 100자 초과이거나 서술형 키워드 포함 → 소문제
    if (content.length > 100 || subQuestionKeywords.test(content)) {
      console.log('[NormalizeChoices] 서술형 소문제 감지 — 변환 건너뜀');
      return text;
    }
  }

  // 5개 모두 있으면 확실한 선택지
  const hasFive = nums.includes(5);
  if (!hasFive) {
    // 4개만 있을 때 추가 검증: 각 내용이 아주 짧아야 함 (선택지 특성)
    for (let i = 0; i < matches.length - 1; i++) {
      const start = matches[i].index + matches[i].len;
      const end = matches[i + 1].index;
      const content = text.substring(start, end).trim();
      if (content.length > 50) return text; // 50자 초과면 소문제
    }
  }

  // 변환 실행 (뒤→앞 순서로 인덱스 유지)
  let result = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, num, len } = matches[i];
    const circled = NUMBER_TO_CIRCLED[num];
    if (circled) {
      result = result.substring(0, index) + circled + result.substring(index + len);
    }
  }

  console.log('[NormalizeChoices] (N) → ⓝ 변환 완료');
  return result;
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
  // ★ 서술형 소문제 감지: "구하시오", "설명하시오" 등이 포함되면 선택지가 아닌 본문으로 유지
  {
    const subProblemKeywords = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오/;
    const parenRegex = /\(([1-5])\)/g;
    const parenPositions: { idx: number; len: number }[] = [];
    while ((m = parenRegex.exec(text)) !== null) {
      parenPositions.push({ idx: m.index, len: m[0].length });
    }

    if (parenPositions.length >= 2) {
      // 각 (N) 뒤 텍스트에서 서술형 키워드 확인
      let hasSubProblem = false;
      for (let i = 0; i < parenPositions.length; i++) {
        const start = parenPositions[i].idx + parenPositions[i].len;
        const end = i + 1 < parenPositions.length ? parenPositions[i + 1].idx : text.length;
        const segment = text.substring(start, end).trim();
        if (subProblemKeywords.test(segment)) {
          hasSubProblem = true;
          break;
        }
      }

      // 서술형 소문제면 choices로 분리하지 않음
      if (hasSubProblem) {
        // choices 빈 배열 반환 → 본문에 (1)(2) 유지
        return [];
      }

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
  // ★ 서술형 감지 동일 적용
  const numRegex = /(?:^|\s)([1-5])\s*\)/gm;
  const numPositions: { idx: number; len: number }[] = [];
  while ((m = numRegex.exec(text)) !== null) {
    numPositions.push({ idx: m.index, len: m[0].length });
  }

  if (numPositions.length >= 2) {
    const subProblemKw2 = /구하시오|구하여라|구해라|서술하시오|설명하시오|증명하시오|나타내시오|보이시오|판단하시오|풀이\s*과정|쓰시오|쓰고|답하시오|완성하시오|그리시오|작도하시오|구하세요|구해\s*보시오/;
    let hasSub2 = false;
    for (let i = 0; i < numPositions.length; i++) {
      const start = numPositions[i].idx + numPositions[i].len;
      const end = i + 1 < numPositions.length ? numPositions[i + 1].idx : text.length;
      if (subProblemKw2.test(text.substring(start, end))) { hasSub2 = true; break; }
    }
    if (hasSub2) return [];

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
  const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[GraphVision] No GOOGLE_AI_KEY or GEMINI_API_KEY');
    return null;
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const geminiModelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

  const imageData = imageBase64.startsWith('data:')
    ? imageBase64.split(',')[1]
    : imageBase64;

  const prompt = `당신은 수학 시험지의 그래프/도형을 분석하는 전문가입니다.

이미지에서 그래프/도형을 찾아 적절한 방식으로 변환하세요.

■ 핵심: type 선택 기준
1. "function": 단순 함수 그래프 (y=x², y=sin(x) 등) → Desmos로 정확히 그릴 수 있는 것
2. "sketch": 개념적 그림 (빗금 영역, 라벨 점, 함수+도형 조합 등) → 수식으로 정확히 그리면 원본과 완전 다른 모양이 되는 것
3. "geometry": 순수 기하 도형 (삼각형, 원 등 함수 그래프 없이)
4. "coordinate": 좌표 평면에 점/벡터만
5. "none": 그래프/도형 없음

★ 판단 핵심: 함수를 수학적으로 정확히 플로팅하면 원본 그림과 비슷한가?
- 비슷하면 → "function" (Desmos 사용)
- 완전 다르면 → "sketch" (SVG로 보이는 대로 그리기)
예: y=2^{x+2}-3 과 y=log_2(x+2)-3 위에 점 A,B,C,D + 빗금 영역 → "sketch"
예: y=x^2-4x+3 포물선 하나 → "function"

■ type="function" 응답:
{
  "type": "function",
  "expressions": ["y=x^2", "y=2x+1"],
  "xRange": [-5, 5], "yRange": [-3, 7],
  "points": [{"x": 1, "y": 1, "label": "A"}],
  "description": "이차함수와 직선의 교점",
  "imageBbox": {"top": 0.3, "left": 0.05, "bottom": 0.75, "right": 0.95}
}

■ type="sketch" 응답 (★ 중요: 보이는 대로 SVG 생성):
{
  "type": "sketch",
  "svg": "<svg viewBox='0 0 300 250' xmlns='http://www.w3.org/2000/svg'>...</svg>",
  "description": "두 곡선 y=2^{x+2}-3, y=log_2(x+2)-3의 교점과 사각형 ADBC",
  "imageBbox": {"top": 0.3, "left": 0.05, "bottom": 0.75, "right": 0.95}
}

■ SVG 작성 규칙 (type="sketch"):
1. viewBox는 300x250 기준
2. 좌표축: 가운데에 x축, y축 그리기 (화살표 포함)
3. 곡선: <path> 베지어 커브로 이미지에 보이는 모양 그대로 그리기
4. 점: <circle r="3"> + <text> 라벨 (A, B, C, D, O 등)
5. 빗금 영역: <pattern>으로 해칭, <path>로 영역 채우기
6. 수식 라벨: <text font-style="italic"> 로 y=f(x) 형태 표기
7. 색상: 검정 선(#000), 얇은 회색 보조선(#ccc)
8. 선 두께: stroke-width="1.5" (곡선), "1" (축)
9. 원본 이미지의 비율과 배치를 최대한 따라 그리기

■ Desmos 수식 규칙 (type="function"):
1. 변수는 x, y만. 매개변수(a,b,c)는 구체적 숫자로 대입
2. 수식 형식: y=x^2, y=\\sin(x), y=\\frac{1}{x}
3. 절대값: \\left|x\\right|
4. polygon: polygon((x1,y1),(x2,y2),...)
5. \\text{}, \\displaystyle, 한글 사용 금지

■ imageBbox: 이미지 내 그래프 영역 위치 (0~1 비율)
■ description: 한국어 설명
■ 그래프 없으면: {"type": "none"}

JSON으로만 응답하세요.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: geminiModelName,
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 },
    });

    console.log(`[GraphVision] Gemini (${geminiModelName}) 그래프 분석 시작...`);

    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/png', data: imageData } },
      { text: prompt },
    ]);

    const content = result.response.text()?.trim();
    if (!content) return null;

    console.log('[GraphVision] Gemini response:', content.substring(0, 200));

  try {
    // JSON 파싱 (```json ... ``` 래핑 제거)
    const jsonStr = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonStr) as GraphData;

    // 유효성 검증
    if (!parsed.type || !['function', 'geometry', 'coordinate', 'sketch', 'none'].includes(parsed.type)) {
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
  } catch (parseErr) {
    console.warn('[GraphVision] Failed to parse response:', parseErr);
    return null;
  }
  } catch (err) {
    console.warn('[GraphVision] Gemini graph analysis error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * <보기> ㄱ/ㄴ/ㄷ 오인식 교정
 * Mathpix/GPT Vision이 한국어 자음(ㄱ,ㄴ,ㄷ)을 다른 문자로 잘못 인식하는 패턴 수정
 * - ¬ → ㄱ (논리 NOT 기호로 오인식)
 * - ⁻¹ → ㄱ (위첨자로 오인식)
 * - C/c → ㄷ (선택지 맥락에서)
 * - D → ㄷ (선택지 맥락에서, 단독)
 * - L → ㄴ (선택지 맥락에서)
 */
function fixKoreanConsonantChoices(text: string): string {
  // <보기> 또는 ㄱ/ㄴ/ㄷ 선택지가 있는 문제인지 감지
  const hasBogiPattern = /보기|<\s*보기\s*>|〈\s*보기\s*〉/.test(text);
  const hasConsonantChoice = /[①②③④⑤(]\s*[ㄱㄴㄷ]/.test(text);
  // ¬ 또는 ⁻¹ 가 선택지 근처에 나타나면 오인식 가능성 높음
  const hasMisrecognized = /[①②③④⑤(]\s*(?:¬|⁻¹|(?:^|\s)D(?:\s|,|$))/.test(text) ||
    /¬\s*[.,]?\s*[ㄱ-ㅎa-zA-Z]/.test(text) ||
    /ㄱ\s*[.,]\s*[CD]/.test(text) ||  // ㄱ, C(=ㄷ) 패턴
    /ㄴ\s*[.,]\s*[CD]/.test(text);    // ㄴ, C(=ㄷ) 패턴

  if (!hasBogiPattern && !hasConsonantChoice && !hasMisrecognized) {
    return text;
  }

  console.log('[FixConsonants] <보기> ㄱ/ㄴ/ㄷ 오인식 교정 시작');

  let result = text;

  // 1. ¬ → ㄱ (수식 내부가 아닌 경우만)
  //    수식($...$) 밖에서 ¬가 나오면 ㄱ으로 교체
  result = result.replace(/(?<!\$[^$]*)¬(?![^$]*\$)/g, 'ㄱ');
  // 간단한 접근: ¬ 뒤에 . 또는 공백+텍스트/ㄴ/ㄷ가 오면 ㄱ
  result = result.replace(/¬(?=\s*[.]\s*)/g, 'ㄱ');
  result = result.replace(/¬(?=\s*[ㄴㄷ,])/g, 'ㄱ');

  // 2. ⁻¹ → ㄱ (선택지 맥락에서)
  //    ⁻¹이 선택지 번호 뒤나 쉼표 앞뒤에 나오면 ㄱ
  result = result.replace(/(?:[①②③④⑤]\s*|[,(]\s*)⁻¹/g, (match) => match.replace('⁻¹', 'ㄱ'));
  result = result.replace(/⁻¹(?=\s*[,]?\s*[ㄴㄷCD])/g, 'ㄱ');

  // 3. 단독 D → ㄷ (선택지 맥락: 줄 시작이나 선택지 번호 뒤)
  //    수식이 아닌 위치에서 D가 단독으로 나오면
  result = result.replace(/(?<=^|\n)\s*D\s*$/gm, (match) => match.replace('D', 'ㄷ'));
  result = result.replace(/(?<=[①②③④⑤]\s*)D(?=\s*$|\s*,)/gm, 'ㄷ');

  // 4. 선택지에서 C → ㄷ (ㄱ/ㄴ과 함께 나올 때)
  //    "ㄱ, C" → "ㄱ, ㄷ" / "ㄴ, C" → "ㄴ, ㄷ"
  result = result.replace(/([ㄱㄴ]\s*,\s*)C(?!\w)/g, '$1ㄷ');
  result = result.replace(/C(?=\s*,\s*[ㄱㄴ])/g, 'ㄷ');

  // 5. 선택지에서 단독 L → ㄴ (ㄱ/ㄷ과 함께 나올 때)
  result = result.replace(/([ㄱㄷ]\s*,\s*)L(?!\w)/g, '$1ㄴ');
  result = result.replace(/L(?=\s*,\s*[ㄱㄷ])/g, 'ㄴ');

  // 6. <보기> 내용에서 "ㄱ." "ㄴ." "ㄷ." 패턴 복원
  //    ¬. → ㄱ. / D. → ㄷ. / L. → ㄴ.
  result = result.replace(/¬\s*\./g, 'ㄱ.');
  result = result.replace(/(?<=\n|^)\s*D\s*\./gm, 'ㄷ.');
  result = result.replace(/(?<=\n|^)\s*L\s*\./gm, 'ㄴ.');

  if (result !== text) {
    console.log('[FixConsonants] 교정 완료');
  }

  return result;
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
async function refineWithGPT(ocrText: string, customPrompt: string, imageBase64?: string): Promise<string> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    console.warn('[Reanalyze] No OpenAI API key, skipping GPT refinement');
    return ocrText;
  }

  // ★ 이미지가 있으면 GPT-4o Vision으로 직접 수식 인식
  const userContent: any[] = [];

  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${imageBase64}`,
        detail: 'high',
      },
    });
  }

  userContent.push({
    type: 'text',
    text: `OCR 원본 텍스트 (참고용):
${ocrText}

${customPrompt ? `수정 요구사항:\n${customPrompt}\n\n` : ''}이미지를 직접 보고 수학 문제의 수식을 정확하게 LaTeX로 변환해주세요.
OCR 원본이 틀렸을 수 있으니 반드시 이미지를 기준으로 판단하세요.
수식은 $...$ (인라인) 또는 $$...$$ (디스플레이) 형식으로 작성하세요.
선택지가 있으면 ①②③④⑤ 형식으로 유지하세요.
수정된 전체 텍스트만 반환하세요. 설명 없이 텍스트만 출력하세요.`,
  });

  console.log(`[RefineGPT] Vision ${imageBase64 ? '활성' : '비활성'}, prompt: ${customPrompt?.substring(0, 50) || '(없음)'}`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',  // ★ Vision 필요하므로 gpt-4o 사용
      messages: [
        {
          role: 'system',
          content: `당신은 한국 수학 시험지 이미지를 읽고 정확한 LaTeX를 생성하는 전문가입니다.
이미지에 보이는 수식을 정확하게 변환하세요. OCR 결과는 참고용이며 틀릴 수 있습니다.
반드시 이미지를 기준으로 판단하세요.

★ 중요 — <보기> 문제 인식 규칙:
- 한국 수학 시험지의 <보기>에는 ㄱ, ㄴ, ㄷ (한국어 자음)이 항목 라벨로 사용됩니다.
- ㄱ을 ¬(논리 NOT)이나 ⁻¹(위첨자)로 잘못 읽지 마세요. 반드시 "ㄱ"으로 표기하세요.
- ㄷ을 C나 D로 잘못 읽지 마세요. 반드시 "ㄷ"으로 표기하세요.
- ㄴ을 L이나 니은 이외의 문자로 잘못 읽지 마세요. 반드시 "ㄴ"으로 표기하세요.
- 선택지: ① ㄴ  ② ㄷ  ③ ㄱ, ㄴ  ④ ㄱ, ㄷ  ⑤ ㄴ, ㄷ 형식이 일반적입니다.
- <보기> 내용은 "ㄱ. [수식]", "ㄴ. [수식]", "ㄷ. [수식]" 형식입니다.`,
        },
        {
          role: 'user',
          content: userContent,
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
  const result = data.choices[0]?.message?.content?.trim() || ocrText;
  console.log(`[RefineGPT] 결과: ${result.substring(0, 200)}`);
  return result;
}
