// ============================================================================
// GPT-4o Vision 이미지 해석 서비스
// 수학 문제의 그래프/도형/표 이미지를 분석하여 구조화된 데이터로 변환
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
// Vision 프롬프트
// ============================================================================

const VISION_SYSTEM_PROMPT = `당신은 수학 교육 자료의 시각적 요소를 분석하는 전문가입니다.
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
- **table**: 값의 표 (x, f(x) 등)
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
- 점선/파선은 "dashed", 점선은 "dotted", 실선은 "solid"

### geometry:
{
  "type": "geometry",
  "latex": "도형을 설명하는 LaTeX 수식 (예: \\triangle ABC)",
  "vertices": [{"label": "A", "x": 0, "y": 0}, {"label": "B", "x": 4, "y": 0}, {"label": "C", "x": 2, "y": 3}],
  "segments": [["A","B"], ["B","C"], ["C","A"]],
  "angles": [{"vertex": "A", "value": "60°"}],
  "lengths": [{"from": "A", "to": "B", "value": "5"}]
}

### table:
{
  "type": "table",
  "latex": "\\\\begin{array}{c|ccc} x & 1 & 2 & 3 \\\\\\\\ \\\\hline f(x) & 3 & 7 & 13 \\\\end{array}",
  "headers": ["x", "f(x)"],
  "rows": [["1", "3"], ["2", "7"], ["3", "13"]]
}

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
- JSON만 응답하세요. 다른 텍스트를 추가하지 마세요.`;

// ============================================================================
// 핵심 함수
// ============================================================================

/**
 * 이미지를 GPT-4o Vision으로 해석
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
    console.log(`[Vision] Interpreting image: ${imageUrl.substring(0, 80)}...`);

    const userMessage = context
      ? `이 이미지는 다음 수학 문제에 포함된 그래프/도형입니다:\n\n"${context.substring(0, 500)}"\n\n이미지를 분석해주세요.`
      : '이 수학 문제의 이미지를 분석해주세요.';

    const response = await callOpenAIVision(imageUrl, userMessage);
    const parsed = parseVisionResponse(response, imageUrl);

    console.log(`[Vision] Interpreted as: ${parsed.figureType} (confidence: ${parsed.confidence})`);
    return parsed;
  } catch (error) {
    console.error('[Vision] Image interpretation failed:', error);
    return createFallbackFigure(imageUrl, error instanceof Error ? error.message : '알 수 없는 오류');
  }
}

/**
 * 여러 이미지를 일괄 해석
 * @param imageUrls - 이미지 URL 배열
 * @param context - 문제 텍스트 (맥락)
 * @param onProgress - 진행률 콜백
 * @returns 해석 결과 배열
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

    // Rate limiting: 이미지 간 짧은 대기
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
  userMessage: string,
  retries = 3,
  backoff = 3000
): Promise<string> {
  // 이미지 content 구성
  const imageContent: { type: 'image_url'; image_url: { url: string; detail: string } } = {
    type: 'image_url',
    image_url: {
      url: imageUrl,
      detail: 'high',
    },
  };

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'system',
            content: VISION_SYSTEM_PROMPT,
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
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      if (response.status === 429 && retries > 0) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? Math.max(parseInt(retryAfter, 10) * 1000, backoff) : backoff;
        console.warn(`[Vision] Rate limited, retrying in ${waitTime}ms (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callOpenAIVision(imageUrl, userMessage, retries - 1, backoff * 2);
      }
      throw new Error(`OpenAI Vision API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (retries > 0 && error instanceof Error && error.message.includes('429')) {
      console.warn(`[Vision] Rate limited (exception), retrying in ${backoff}ms`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return callOpenAIVision(imageUrl, userMessage, retries - 1, backoff * 2);
    }
    throw error;
  }
}

// ============================================================================
// 응답 파싱
// ============================================================================

function parseVisionResponse(response: string, originalImageUrl: string): InterpretedFigure {
  try {
    // JSON 파싱 (LLM이 가끔 ```json ... ``` 로 감싸는 경우 처리)
    let cleanResponse = response.trim();
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanResponse);

    const figureType: FigureType = validateFigureType(parsed.figureType);
    const confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));
    const description = parsed.description || '이미지 설명 없음';

    // rendering 구조 검증 및 변환
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
  return {
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
}

function validateTableRendering(r: Record<string, unknown>): TableRendering | null {
  return {
    type: 'table',
    latex: String(r.latex || ''),
    headers: Array.isArray(r.headers) ? r.headers.map(String) : [],
    rows: Array.isArray(r.rows) ? r.rows.map((row: unknown[]) => Array.isArray(row) ? row.map(String) : []) : [],
  };
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
