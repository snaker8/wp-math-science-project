// ============================================================================
// GPT-4o Vision 이미지 해석 서비스
// 수학 문제의 그래프/도형/표 이미지를 분석하여 구조화된 데이터로 변환
// 2단계: (1) 구조 분석 (JSON) → (2) geometry면 SVG 별도 생성
// ============================================================================

import type {
  InterpretedFigure,
  FigureType,
  GraphRendering,
  GeometryRendering,
  TableRendering,
  DiagramRendering,
} from '@/types/ocr';

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const VISION_MODEL = 'gpt-4o';

// ============================================================================
// 1단계: 구조 분석 프롬프트 (JSON 응답)
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `당신은 수학 교육 자료의 시각적 요소를 분석하는 전문가입니다.
주어진 이미지는 수학 문제에 포함된 그래프, 도형, 표 등입니다.

이미지를 분석하여 **반드시 아래 JSON 형식으로만** 응답하세요.

{
  "figureType": "graph" | "geometry" | "table" | "number_line" | "diagram" | "photo",
  "description": "이미지에 대한 간단한 한국어 설명",
  "confidence": 0.0~1.0,
  "rendering": { ... }
}

## figureType 판별 기준:
- **graph**: 좌표 평면 위의 함수 그래프 (포물선, 직선, 삼각함수 등)
- **geometry**: 삼각형, 원, 사각형 등 기하 도형 (꼭짓점 라벨, 각도, 길이 표시)
- **table**: 값의 표 (x, f(x), 조립제법 등)
- **number_line**: 수직선, 구간 표시
- **diagram**: 벤다이어그램, 트리, 순서도 등 기타 다이어그램
- **photo**: 사진이거나 수학적으로 해석 불가한 이미지

## rendering 구조 (figureType별):

### graph:
{
  "type": "graph",
  "expressions": [
    {"latex": "y=x^2-4x+3", "color": "#2d70b3", "style": "solid"},
    {"latex": "y=0", "color": "#c74440", "style": "dashed"}
  ],
  "xRange": [-5, 10],
  "yRange": [-5, 10],
  "points": [{"x": 1, "y": 0, "label": "A"}],
  "annotations": ["꼭짓점: (2, -1)"]
}
- expressions의 latex는 Desmos에서 사용할 수 있는 형식으로 작성

### geometry:
{
  "type": "geometry",
  "latex": "도형을 설명하는 LaTeX (예: \\\\triangle ABC)",
  "vertices": [{"label": "A", "x": 0, "y": 0}, {"label": "B", "x": 4, "y": 0}, {"label": "C", "x": 2, "y": 3}],
  "segments": [["A","B"], ["B","C"], ["C","A"]],
  "dashedSegments": [["A","D"]],
  "angles": [{"vertex": "A", "value": "60°"}],
  "lengths": [{"from": "A", "to": "B", "value": "5"}],
  "shadedRegions": [{"vertices": ["A","B","C"], "color": "yellow"}],
  "rightAngles": ["C"]
}

#### geometry 좌표 규칙 (★매우 중요 — 코드가 이 좌표로 직접 SVG를 생성합니다):
- 이 좌표 데이터가 곧바로 SVG 렌더링에 사용됩니다. **정확한 좌표가 핵심입니다**.
- 문제 텍스트의 수학적 조건(길이, 각도, 위치관계)을 사용하여 좌표를 계산하세요.
- **밑변을 x축 위에 배치**: 가장 긴 변 또는 기준이 되는 변의 양 끝점을 (0,0)과 (길이,0)에 놓으세요.
- **높이는 y축으로**: 위쪽 꼭짓점은 y값을 양수로 설정하세요.
- 예: "BC=10인 삼각형" → B(0,0), C(10,0), A는 위쪽
- 예: "정삼각형 ABC, 한 변 6" → B(0,0), C(6,0), A(3, 5.2)
- 예: "직각이등변삼각형 ABC, BC=10, ∠BAC=90°" → B(0,0), C(10,0), A(5, 5)
- 도형 내부 점(D, E, F 등)은 기준 삼각형의 좌표를 기준으로 비례 계산
- segments에 포함된 모든 꼭짓점은 반드시 vertices 배열에 있어야 합니다
- 좌표는 소수점 1자리까지 사용 가능

#### segments vs dashedSegments 구분 (★중요):
- **segments**: 이미지에서 실선(진한 선)으로 그려진 모든 선분. 도형의 변, 보조선 모두 포함
- **dashedSegments**: 이미지에서 **명확히 점선/파선**으로 그려진 선분만 해당
- ★ 도형의 변(삼각형 변, 사각형 변 등)은 거의 항상 segments (실선)
- ★ 보조선이라도 실선이면 segments에 넣으세요. 오직 이미지에서 점선으로 보이는 것만 dashedSegments
- 확신이 없으면 segments에 넣으세요 (실선 기본)

#### 기타 필드:
- shadedRegions: 음영 영역. color는 이미지에서 보이는 실제 색상 사용 (보통 "yellow")
- rightAngles: 이미지에서 **직각 기호(ㄱ 또는 □)가 명확히 그려진** 꼭짓점만. 문제 텍스트에 직각이 언급되어도 이미지에 기호가 없으면 넣지 마세요

### table:
{
  "type": "table",
  "latex": "\\\\begin{array}{c|ccc} x & 1 & 2 & 3 \\\\\\\\ \\\\hline f(x) & 3 & 7 & 13 \\\\end{array}",
  "headers": ["x", "1", "2", "3"],
  "rows": [["f(x)", "3", "7", "13"]]
}
#### table 규칙:
- headers: 첫 번째 행 (열 머리글)
- rows: 나머지 데이터 행들. 각 행의 첫 셀은 행 라벨
- 조립제법 표는 headers[0]에 나누는 수(예: "2"), 나머지는 계수들
- 빈 셀은 "" (빈 문자열)로 표시
- ★ 손글씨, 낙서, 필기 흔적이 있는 셀은 **무시**하고 "" (빈 문자열)로 처리하세요
- ★ 인쇄된 깨끗한 텍스트/숫자만 인식하세요. 그리스 문자(β, α 등)로 보이는 낙서는 빈 셀입니다

### number_line / diagram:
{
  "type": "number_line" 또는 "diagram",
  "latex": "관련 LaTeX 수식",
  "description": "상세 텍스트 설명"
}

### photo (해석 불가):
null

중요:
- LaTeX 수식에서 백슬래시는 이중으로 이스케이프하세요 (\\\\frac, \\\\sqrt 등)
- 확신이 낮으면 confidence를 낮게 설정하세요
- 해석 불가하면 figureType을 "photo"로 하고 rendering을 null로 하세요
- JSON만 응답하세요. 다른 텍스트를 추가하지 마세요.
- 음영 색상은 이미지에서 보이는 실제 색상을 사용하세요 (보통 yellow/노란색)`;

// ============================================================================
// 2단계: geometry SVG 생성 프롬프트 (raw SVG 응답, JSON 아님)
// ============================================================================

const SVG_GENERATION_PROMPT = `You are a math figure reproduction specialist for Korean math textbooks.
Your job: Look at the image and produce a CLEAN, SIMPLE SVG that matches the original as closely as possible.

CRITICAL OUTPUT RULES:
- Output ONLY valid SVG code (starting with <svg and ending with </svg>)
- No explanations, no markdown, just raw SVG
- Keep it SIMPLE and CLEAN — like a professional digital textbook figure

SVG STYLE RULES FOR GEOMETRY:
1. Use viewBox="0 0 400 300" width="100%"
2. Background: transparent (no rect background)
3. Main outlines: stroke="#374151" stroke-width="2" fill="none"
4. Vertex labels (A, B, C...): fill="#1f2937" font-family="sans-serif" font-size="18" font-weight="bold"
   - Place labels CLEARLY OUTSIDE the figure, with at least 15px gap from the nearest edge
   - Each label must be easily readable and NOT overlap with any line
5. Length/value labels: fill="#6b7280" font-size="14" font-family="sans-serif"
6. ★ SHADING: If the original has shaded/filled/hatched regions, convert them to SOLID semi-transparent fill:
   - Do NOT reproduce hatching lines (빗금/사선). Replace ALL hatching with a solid fill color.
   - Yellow hatching/shading → <polygon fill="rgba(250,204,21,0.45)"/>
   - Blue hatching/shading → <polygon fill="rgba(96,165,250,0.3)"/>
   - Gray hatching/shading → <polygon fill="rgba(156,163,175,0.25)"/>
   - Draw the shaded <polygon> BEFORE the outline edges so edges appear on top
7. Dashed lines: ONLY draw stroke-dasharray if the original CLEARLY shows dashed lines
8. Vertex dots: <circle r="3" fill="#374151"/>
9. Match the EXACT proportions and layout of the original image
10. Do NOT add extra elements that are not in the original (no extra lines, no right-angle markers unless drawn)
11. Do NOT reproduce hatching/crosshatching as individual lines — always use solid fills

SVG STYLE RULES FOR TABLES:
1. Use viewBox with appropriate dimensions for the table size
2. Clean grid lines: stroke="#374151" stroke-width="1" for inner, stroke-width="2" for outer borders
3. Header row: light gray background fill="#f3f4f6"
4. Text: font-family="sans-serif" font-size="14" fill="#1f2937"
5. For 조립제법 (synthetic division): draw L-shaped divider (vertical line after first column + horizontal line before last row)
6. ★ CRITICAL: IGNORE ALL handwriting, scribbles, pen marks, or unclear marks in cells
   - If a cell has handwriting/scribbles on it, render it as an EMPTY cell (small empty rectangle □)
   - Only reproduce PRINTED text/numbers. Any letter that looks handwritten (like a scribbled 'p', 'β', etc.) = EMPTY cell
   - The original image may have student handwriting on a printed table — IGNORE all handwriting
7. Empty cells: draw a small rect (20x20, stroke="#9ca3af", fill="none", rx="2") centered in the cell`;

// ============================================================================
// 핵심 함수
// ============================================================================

/**
 * 이미지를 GPT-4o Vision으로 해석
 * geometry 타입이면 추가로 SVG를 별도 생성
 * @param imageUrl - 이미지 URL 또는 base64 data URL
 * @param context - 문제 텍스트 (맥락 제공, 선택)
 * @returns 해석된 도형 데이터
 */
export async function interpretImage(
  imageUrl: string,
  context?: string
): Promise<InterpretedFigure> {
  if (!OPENAI_API_KEY) {
    console.warn('[Vision] OpenAI API key not configured, returning original image');
    return createFallbackFigure(imageUrl, 'API 키 미설정');
  }

  try {
    console.log(`[Vision] Step 1: Analyzing image structure...`);

    // 문제 텍스트 맥락을 최대 800자까지 전달 + 수학 조건 활용 지시
    const userMessage = context
      ? `이 이미지는 다음 수학 문제에 포함된 그래프/도형입니다:\n\n"${context.substring(0, 800)}"\n\n중요: 문제 텍스트의 수학적 조건(길이, 각도, 위치관계 등)을 반드시 읽고, 이를 기반으로 정확한 좌표를 계산하여 응답하세요. 음영 색상은 이미지에서 보이는 실제 색상(보통 yellow)을 사용하세요.`
      : '이 수학 문제의 이미지를 분석해주세요.';

    // Step 1: 구조 분석 (JSON)
    const response = await callOpenAIVision(imageUrl, ANALYSIS_SYSTEM_PROMPT, userMessage, true);
    const parsed = parseVisionResponse(response, imageUrl);

    console.log(`[Vision] Step 1 result: ${parsed.figureType} (confidence: ${parsed.confidence})`);

    // Step 2 (Vision SVG) 제거 — GPT-4o Vision SVG는 빗금/손글씨를 그대로 재현하는 문제가 있음
    // 대신 프로그래밍 렌더러(generateGeometrySVG, generateTableSVG)가 Step 1 JSON 데이터로 깨끗한 SVG를 생성
    // → 빗금 → 단색 polygon fill, 손글씨 → cleanTableCell로 제거

    return parsed;
  } catch (error) {
    console.error('[Vision] Image interpretation failed:', error);
    return createFallbackFigure(imageUrl, error instanceof Error ? error.message : '알 수 없는 오류');
  }
}

/**
 * Step 1 구조 분석 결과를 기반으로 Step 2 SVG 생성 프롬프트 작성
 * 구조 데이터를 전달하여 GPT-4o가 더 정확한 SVG를 생성하도록 함
 */
function buildSvgPrompt(parsed: InterpretedFigure, context?: string): string {
  const parts: string[] = [];

  parts.push('Reproduce this math figure as clean SVG.');

  if (context) {
    parts.push(`\nProblem context: "${context.substring(0, 400)}"`);
  }

  if (parsed.rendering) {
    const r = parsed.rendering;

    if (r.type === 'geometry') {
      const geo = r as GeometryRendering;
      parts.push(`\nIMPORTANT: If the original image has hatching/crosshatching (빗금), replace it with a SOLID semi-transparent polygon fill. Do NOT draw individual hatching lines.`);
      if (geo.vertices.length > 0) {
        parts.push(`Vertices: ${JSON.stringify(geo.vertices)}`);
      }
      if (geo.segments.length > 0) {
        parts.push(`Solid segments: ${JSON.stringify(geo.segments)}`);
      }
      if (geo.dashedSegments && geo.dashedSegments.length > 0) {
        parts.push(`Dashed segments: ${JSON.stringify(geo.dashedSegments)}`);
      }
      if (geo.shadedRegions && geo.shadedRegions.length > 0) {
        parts.push(`Shaded regions: ${JSON.stringify(geo.shadedRegions)}`);
      }
      if (geo.rightAngles && geo.rightAngles.length > 0) {
        parts.push(`Right angles at: ${JSON.stringify(geo.rightAngles)}`);
      }
      if (geo.angles.length > 0) {
        parts.push(`Angles: ${JSON.stringify(geo.angles)}`);
      }
      if (geo.lengths.length > 0) {
        parts.push(`Lengths: ${JSON.stringify(geo.lengths)}`);
      }
    } else if (r.type === 'table') {
      const tbl = r as TableRendering;
      parts.push(`\nTable headers: ${JSON.stringify(tbl.headers)}`);
      parts.push(`Table rows: ${JSON.stringify(tbl.rows)}`);
      parts.push(`IMPORTANT: Empty string "" cells should be drawn as empty rectangles. Any cell with handwriting or scribbles in the original image should also be empty rectangles.`);
    }
  }

  return parts.join('\n');
}

/**
 * 여러 이미지를 일괄 해석
 */
export async function interpretImages(
  imageUrls: string[],
  context?: string,
  onProgress?: (completed: number, total: number) => void
): Promise<InterpretedFigure[]> {
  const results: InterpretedFigure[] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    const result = await interpretImage(imageUrls[i], context);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, imageUrls.length);
    }

    // Rate limiting
    if (i < imageUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

// ============================================================================
// OpenAI Vision API 호출
// ============================================================================

async function callOpenAIVision(
  imageUrl: string,
  systemPrompt: string,
  userMessage: string,
  jsonMode: boolean,
  retries = 3,
  backoff = 3000
): Promise<string> {
  const imageContent: { type: 'image_url'; image_url: { url: string; detail: string } } = {
    type: 'image_url',
    image_url: {
      url: imageUrl,
      detail: 'high',
    },
  };

  const body: Record<string, unknown> = {
    model: VISION_MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userMessage },
          imageContent,
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: jsonMode ? 4000 : 8000, // SVG 모드는 더 많은 토큰 필요
  };

  // JSON 모드는 구조 분석에만 적용
  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, backoff) : backoff;
        console.warn(`[Vision] Rate limited, retrying in ${waitTime}ms (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callOpenAIVision(imageUrl, systemPrompt, userMessage, jsonMode, retries - 1, backoff * 2);
      }
      throw new Error(`OpenAI Vision API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (retries > 0 && error instanceof Error && error.message.includes('429')) {
      console.warn(`[Vision] Rate limited (exception), retrying in ${backoff}ms`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callOpenAIVision(imageUrl, systemPrompt, userMessage, jsonMode, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// ============================================================================
// SVG 추출 (raw 응답에서 SVG 코드만 추출)
// ============================================================================

function extractSvgFromResponse(response: string): string | null {
  let text = response.trim();

  // 마크다운 코드블록 제거
  if (text.includes('```svg')) {
    text = text.split('```svg')[1].split('```')[0].trim();
  } else if (text.includes('```xml')) {
    text = text.split('```xml')[1].split('```')[0].trim();
  } else if (text.includes('```html')) {
    text = text.split('```html')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    const parts = text.split('```');
    if (parts.length >= 2) {
      text = parts[1].split('```')[0].trim();
    }
  }

  // <svg ... </svg> 추출
  const svgStart = text.indexOf('<svg');
  const svgEnd = text.lastIndexOf('</svg>');
  if (svgStart !== -1 && svgEnd !== -1) {
    return text.substring(svgStart, svgEnd + '</svg>'.length);
  }

  return null;
}

// ============================================================================
// 응답 파싱 (구조 분석 JSON)
// ============================================================================

function parseVisionResponse(response: string, originalImageUrl: string): InterpretedFigure {
  try {
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanResponse);

    const figureType: FigureType = validateFigureType(parsed.figureType);
    const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
    const description = parsed.description || '이미지 설명 없음';

    const rendering = validateRendering(figureType, parsed.rendering);

    return {
      figureType,
      description,
      originalImageUrl,
      rendering,
      confidence,
    };
  } catch (error) {
    console.error('[Vision] Failed to parse response:', error, '\nRaw:', response.substring(0, 500));
    return createFallbackFigure(originalImageUrl, '응답 파싱 실패');
  }
}

function validateFigureType(type: unknown): FigureType {
  const validTypes: FigureType[] = ['graph', 'geometry', 'table', 'number_line', 'diagram', 'photo'];
  if (typeof type === 'string' && validTypes.includes(type as FigureType)) {
    return type as FigureType;
  }
  return 'photo';
}

function validateRendering(
  figureType: FigureType,
  rendering: unknown
): GraphRendering | GeometryRendering | TableRendering | DiagramRendering | null {
  if (!rendering || figureType === 'photo') {
    return null;
  }

  const r = rendering as Record<string, unknown>;

  switch (figureType) {
    case 'graph':
      return validateGraphRendering(r);
    case 'geometry':
      return validateGeometryRendering(r);
    case 'table':
      return validateTableRendering(r);
    case 'number_line':
    case 'diagram':
      return validateDiagramRendering(r, figureType);
    default:
      return null;
  }
}

function validateGraphRendering(r: Record<string, unknown>): GraphRendering | null {
  const expressions = Array.isArray(r.expressions) ? r.expressions : [];
  if (expressions.length === 0) return null;

  return {
    type: 'graph',
    expressions: expressions.map((e: Record<string, unknown>) => ({
      latex: String(e.latex || ''),
      color: String(e.color || '#2d70b3'),
      style: (['solid', 'dashed', 'dotted'].includes(String(e.style)) ? String(e.style) : 'solid') as 'solid' | 'dashed' | 'dotted',
      hidden: Boolean(e.hidden),
    })).filter(e => e.latex.length > 0),
    xRange: validateRange(r.xRange, [-10, 10]),
    yRange: validateRange(r.yRange, [-10, 10]),
    points: Array.isArray(r.points) ? r.points.map((p: Record<string, unknown>) => ({
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      label: p.label ? String(p.label) : undefined,
    })) : [],
    annotations: Array.isArray(r.annotations) ? r.annotations.map(String) : [],
  };
}

function validateGeometryRendering(r: Record<string, unknown>): GeometryRendering | null {
  const result: GeometryRendering = {
    type: 'geometry',
    latex: String(r.latex || ''),
    svg: r.svg ? String(r.svg) : undefined,
    vertices: Array.isArray(r.vertices) ? r.vertices.map((v: Record<string, unknown>) => ({
      label: String(v.label || ''),
      x: Number(v.x) || 0,
      y: Number(v.y) || 0,
    })) : [],
    segments: Array.isArray(r.segments) ? r.segments.map((s: unknown[]) => [String(s[0]), String(s[1])] as [string, string]) : [],
    angles: Array.isArray(r.angles) ? r.angles.map((a: Record<string, unknown>) => ({
      vertex: String(a.vertex || ''),
      value: String(a.value || ''),
    })) : [],
    lengths: Array.isArray(r.lengths) ? r.lengths.map((l: Record<string, unknown>) => ({
      from: String(l.from || ''),
      to: String(l.to || ''),
      value: String(l.value || ''),
    })) : [],
  };

  // 점선/보조선
  if (Array.isArray(r.dashedSegments)) {
    result.dashedSegments = r.dashedSegments.map((s: unknown[]) => [String(s[0]), String(s[1])] as [string, string]);
  }

  // 음영 영역
  if (Array.isArray(r.shadedRegions)) {
    result.shadedRegions = r.shadedRegions
      .filter((s: Record<string, unknown>) => Array.isArray(s.vertices))
      .map((s: Record<string, unknown>) => ({
        vertices: (s.vertices as unknown[]).map(String),
        color: String(s.color || 'yellow'),
      }));
  }

  // 직각 표시
  if (Array.isArray(r.rightAngles)) {
    result.rightAngles = r.rightAngles.map(String);
  }

  // 원
  if (Array.isArray(r.circles)) {
    result.circles = r.circles.map((c: Record<string, unknown>) => ({
      center: String(c.center || ''),
      radius: Number(c.radius) || 1,
      style: (c.style === 'dashed' ? 'dashed' : 'solid') as 'solid' | 'dashed',
    }));
  }

  return result;
}

function validateTableRendering(r: Record<string, unknown>): TableRendering | null {
  return {
    type: 'table',
    latex: String(r.latex || ''),
    headers: Array.isArray(r.headers) ? r.headers.map(String).map(cleanTableCell) : [],
    rows: Array.isArray(r.rows) ? r.rows.map((row: unknown[]) => Array.isArray(row) ? row.map(String).map(cleanTableCell) : []) : [],
  };
}

/**
 * 테이블 셀 정리: 낙서/손글씨로 오인된 그리스 문자 등을 빈 문자열로 변환
 */
function cleanTableCell(cell: string): string {
  const trimmed = cell.trim();
  // 단독 그리스 문자 (낙서 오인 가능성 높음)
  if (/^[αβγδεζηθικλμνξοπρστυφχψω]$/i.test(trimmed)) {
    return '';
  }
  // "β" 같은 그리스 소문자가 홀로 있는 경우
  if (/^\\?(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function validateDiagramRendering(r: Record<string, unknown>, figureType: 'number_line' | 'diagram'): DiagramRendering | null {
  return {
    type: figureType,
    latex: String(r.latex || ''),
    description: String(r.description || ''),
  };
}

function validateRange(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    const min = Number(value[0]);
    const max = Number(value[1]);
    if (!isNaN(min) && !isNaN(max) && min < max) {
      return [min, max];
    }
  }
  return fallback;
}

// ============================================================================
// Fallback
// ============================================================================

function createFallbackFigure(imageUrl: string, reason: string): InterpretedFigure {
  return {
    figureType: 'photo',
    description: `원본 이미지 (해석 실패: ${reason})`,
    originalImageUrl: imageUrl,
    rendering: null,
    confidence: 0,
  };
}
