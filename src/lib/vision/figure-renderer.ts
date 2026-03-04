// ============================================================================
// Figure Renderer — Vision 해석 결과를 에디터 콘텐츠로 변환
// InterpretedFigure → Tiptap 에디터 노드용 데이터 생성
// ============================================================================

import type {
  InterpretedFigure,
  GraphRendering,
  GeometryRendering,
  TableRendering,
  DiagramRendering,
} from '@/types/ocr';
import type { GraphExpression, GraphSettings } from '@/types/editor';

// ============================================================================
// 변환 결과 타입
// ============================================================================

export type FigureContent =
  | { type: 'graph'; expressions: GraphExpression[]; settings: GraphSettings; imageUrl?: string }
  | { type: 'math-block'; latex: string }
  | { type: 'table-html'; html: string }
  | { type: 'svg'; svg: string; fallbackLatex?: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'mixed'; parts: FigureContent[] };

// ============================================================================
// 핵심 변환 함수
// ============================================================================

/**
 * InterpretedFigure를 에디터 렌더링용 콘텐츠로 변환
 */
export function figureToContent(figure: InterpretedFigure): FigureContent {
  // 해석 실패 또는 photo → 원본 이미지 유지
  if (!figure.rendering || figure.figureType === 'photo') {
    return {
      type: 'image',
      url: figure.originalImageUrl,
      alt: figure.description || '문제 이미지',
    };
  }

  // 신뢰도가 매우 낮으면 원본 이미지 유지
  if (figure.confidence < 0.3) {
    return {
      type: 'image',
      url: figure.originalImageUrl,
      alt: `[저신뢰] ${figure.description}`,
    };
  }

  switch (figure.rendering.type) {
    case 'graph':
      return graphToContent(figure.rendering, figure.description);
    case 'geometry':
      return geometryToContent(figure.rendering, figure.originalImageUrl);
    case 'table':
      return tableToContent(figure.rendering);
    case 'number_line':
    case 'diagram':
      return diagramToContent(figure.rendering, figure.originalImageUrl);
    default:
      return { type: 'image', url: figure.originalImageUrl, alt: figure.description };
  }
}

// ============================================================================
// 그래프 → Desmos GraphNode
// ============================================================================

function graphToContent(rendering: GraphRendering, description: string): FigureContent {
  const expressions: GraphExpression[] = rendering.expressions.map((expr, idx) => ({
    id: `vision-expr-${idx}-${Date.now()}`,
    latex: expr.latex,
    color: expr.color || ['#2d70b3', '#388c46', '#fa7e19', '#c74440', '#6042a6', '#000000'][idx % 6],
    lineStyle: expr.style || 'solid',
    hidden: expr.hidden || false,
  }));

  // 주요 점을 Desmos 표현식으로 추가
  for (const point of rendering.points) {
    const label = point.label ? `${point.label}` : '';
    expressions.push({
      id: `vision-point-${point.label || Date.now()}`,
      latex: `(${point.x}, ${point.y})`,
      color: '#000000',
      lineStyle: 'solid',
      hidden: false,
    });
    if (label) {
      // 라벨이 있는 점은 주석으로 추가 (annotations에서 처리)
    }
  }

  const settings: GraphSettings = {
    xAxisRange: rendering.xRange,
    yAxisRange: rendering.yRange,
    showGrid: true,
    showAxes: true,
    width: 450,
    height: 350,
  };

  return {
    type: 'graph',
    expressions,
    settings,
  };
}

// ============================================================================
// 도형 → SVG + LaTeX
// ============================================================================

function geometryToContent(rendering: GeometryRendering, fallbackUrl: string): FigureContent {
  // SVG가 있으면 SVG 사용
  if (rendering.svg) {
    return {
      type: 'svg',
      svg: rendering.svg,
      fallbackLatex: rendering.latex,
    };
  }

  // 꼭짓점 좌표로 SVG 생성 시도
  if (rendering.vertices.length >= 2) {
    const svg = generateGeometrySVG(rendering);
    if (svg) {
      return {
        type: 'svg',
        svg,
        fallbackLatex: rendering.latex,
      };
    }
  }

  // LaTeX 코드가 있으면 수식 블록으로
  if (rendering.latex) {
    return { type: 'math-block', latex: rendering.latex };
  }

  // Fallback: 원본 이미지
  return { type: 'image', url: fallbackUrl, alt: '도형' };
}

/**
 * 도형 데이터로 프로그래밍 기반 SVG 코드 생성 (참조사이트 수준 품질)
 * - 음영 영역 (polygon + 반투명 색상)
 * - 점선/보조선
 * - 직각 마커 (ㄱ 기호)
 * - 스마트 라벨 배치 (겹침 방지)
 * - 원
 * @param rendering - 기하 도형 렌더링 데이터
 * @param darkMode - 다크 테마 여부 (기본: false)
 */
export function generateGeometrySVG(rendering: GeometryRendering, darkMode = false): string | null {
  const { vertices, segments, angles, lengths } = rendering;
  const dashedSegments = rendering.dashedSegments || [];
  const shadedRegions = rendering.shadedRegions || [];
  const rightAngles = rendering.rightAngles || [];
  const circles = rendering.circles || [];

  if (vertices.length < 2) return null;

  // 테마별 색상
  const colors = darkMode
    ? { stroke: '#d4d4d8', fill: '#e4e4e7', label: '#1f2937', length: '#6b7280', angle: '#60a5fa', dashed: '#a1a1aa', rightAngle: '#9ca3af' }
    : { stroke: '#374151', fill: '#374151', label: '#1f2937', length: '#6b7280', angle: '#2563eb', dashed: '#9ca3af', rightAngle: '#6b7280' };

  // 음영 색상 매핑 (참조사이트 수준: 불투명에 가까운 진한 색상)
  const SHADING_COLORS: Record<string, string> = {
    yellow: 'rgba(250,204,21,0.75)',
    blue: 'rgba(96,165,250,0.45)',
    red: 'rgba(248,113,113,0.45)',
    green: 'rgba(74,222,128,0.45)',
    gray: 'rgba(156,163,175,0.35)',
  };

  // 좌표 범위 계산
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const rawMinX = Math.min(...xs);
  const rawMaxX = Math.max(...xs);
  const rawMinY = Math.min(...ys);
  const rawMaxY = Math.max(...ys);

  const width = 400;
  const height = 350;
  const padding = 50; // 라벨 공간 확보

  // 좌표 → SVG 좌표 변환 (y축 반전, 센터링)
  const rangeX = rawMaxX - rawMinX || 1;
  const rangeY = rawMaxY - rawMinY || 1;
  const scaleX = (width - 2 * padding) / rangeX;
  const scaleY = (height - 2 * padding) / rangeY;
  const scale = Math.min(scaleX, scaleY);

  // 도형을 가운데 배치
  const usedWidth = rangeX * scale;
  const usedHeight = rangeY * scale;
  const offsetX = padding + (width - 2 * padding - usedWidth) / 2;
  const offsetY = padding + (height - 2 * padding - usedHeight) / 2;

  const toSvgX = (x: number) => offsetX + (x - rawMinX) * scale;
  const toSvgY = (y: number) => height - offsetY - (y - rawMinY) * scale;

  const vertexMap = new Map(vertices.map(v => [v.label, v]));

  // 도형 중심점 (라벨 배치에 사용)
  const centroidX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const centroidY = ys.reduce((a, b) => a + b, 0) / ys.length;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" class="figure-geometry">`;

  // ── 1. 음영 영역 (가장 먼저 그려서 뒤에 배치) ──
  for (const region of shadedRegions) {
    const points = region.vertices
      .map(label => vertexMap.get(label))
      .filter(Boolean)
      .map(v => `${toSvgX(v!.x)},${toSvgY(v!.y)}`)
      .join(' ');
    if (points) {
      const fillColor = SHADING_COLORS[region.color] || SHADING_COLORS.yellow;
      svg += `<polygon points="${points}" fill="${fillColor}" stroke="none"/>`;
    }
  }

  // ── 2. 원 ──
  for (const circle of circles) {
    const center = vertexMap.get(circle.center);
    if (center) {
      const cx = toSvgX(center.x);
      const cy = toSvgY(center.y);
      const r = circle.radius * scale;
      if (circle.style === 'dashed') {
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors.dashed}" stroke-width="1.5" stroke-dasharray="6,4" fill="none"/>`;
      } else {
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${colors.stroke}" stroke-width="2" fill="none"/>`;
      }
    }
  }

  // ── 3. 실선 (변) — 도형의 주요 선분 ──
  for (const [fromLabel, toLabel] of segments) {
    const from = vertexMap.get(fromLabel);
    const to = vertexMap.get(toLabel);
    if (from && to) {
      svg += `<line x1="${toSvgX(from.x)}" y1="${toSvgY(from.y)}" x2="${toSvgX(to.x)}" y2="${toSvgY(to.y)}" stroke="${colors.stroke}" stroke-width="2.2" fill="none"/>`;
    }
  }

  // ── 4. 점선 (보조선) ──
  for (const [fromLabel, toLabel] of dashedSegments) {
    const from = vertexMap.get(fromLabel);
    const to = vertexMap.get(toLabel);
    if (from && to) {
      svg += `<line x1="${toSvgX(from.x)}" y1="${toSvgY(from.y)}" x2="${toSvgX(to.x)}" y2="${toSvgY(to.y)}" stroke="${colors.dashed}" stroke-width="1.5" stroke-dasharray="6,4" fill="none"/>`;
    }
  }

  // ── 5. 직각 마커 (ㄱ 기호) ──
  for (const label of rightAngles) {
    const v = vertexMap.get(label);
    if (!v) continue;
    // 이 꼭짓점에 연결된 두 변을 찾아서 직각 기호 방향 결정
    const allSegs = [...segments, ...dashedSegments];
    const connected = allSegs
      .filter(([a, b]) => a === label || b === label)
      .map(([a, b]) => (a === label ? b : a))
      .map(l => vertexMap.get(l))
      .filter(Boolean) as Array<{ label: string; x: number; y: number }>;

    if (connected.length >= 2) {
      const vx = toSvgX(v.x);
      const vy = toSvgY(v.y);

      // 두 인접 꼭짓점 방향
      const d1x = toSvgX(connected[0].x) - vx;
      const d1y = toSvgY(connected[0].y) - vy;
      const d2x = toSvgX(connected[1].x) - vx;
      const d2y = toSvgY(connected[1].y) - vy;

      const len1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
      const len2 = Math.sqrt(d2x * d2x + d2y * d2y) || 1;

      const sz = 12; // 직각 기호 크기
      const ux1 = (d1x / len1) * sz;
      const uy1 = (d1y / len1) * sz;
      const ux2 = (d2x / len2) * sz;
      const uy2 = (d2y / len2) * sz;

      svg += `<path d="M${vx + ux1},${vy + uy1} L${vx + ux1 + ux2},${vy + uy1 + uy2} L${vx + ux2},${vy + uy2}" stroke="${colors.rightAngle}" stroke-width="1.2" fill="none"/>`;
    }
  }

  // ── 6. 길이 라벨 (변 중점에서 바깥쪽으로 오프셋) ──
  for (const len of lengths) {
    const from = vertexMap.get(len.from);
    const to = vertexMap.get(len.to);
    if (from && to) {
      const mx = (toSvgX(from.x) + toSvgX(to.x)) / 2;
      const my = (toSvgY(from.y) + toSvgY(to.y)) / 2;
      // 중심에서 변 중점으로의 방향 반대 = 바깥쪽
      const cx = toSvgX(centroidX);
      const cy = toSvgY(centroidY);
      const dx = mx - cx;
      const dy = my - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const offsetLen = 14;
      const ox = mx + (dx / dist) * offsetLen;
      const oy = my + (dy / dist) * offsetLen;
      // 흰색 배경으로 선분 위 텍스트 가독성
      svg += `<rect x="${ox - 16}" y="${oy - 8}" width="32" height="16" fill="white" opacity="0.85" rx="2"/>`;
      svg += `<text x="${ox}" y="${oy}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-family="sans-serif" fill="${colors.length}">${len.value}</text>`;
    }
  }

  // ── 7. 각도 라벨 (꼭짓점 근처, 도형 안쪽, 참조사이트 스타일) ──
  for (const ang of angles) {
    const v = vertexMap.get(ang.vertex);
    if (v) {
      const vx = toSvgX(v.x);
      const vy = toSvgY(v.y);
      const cx = toSvgX(centroidX);
      const cy = toSvgY(centroidY);
      // 꼭짓점에서 중심 방향 (도형 안쪽)
      const dx = cx - vx;
      const dy = cy - vy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const offsetAng = 24;
      const ox = vx + (dx / dist) * offsetAng;
      const oy = vy + (dy / dist) * offsetAng;
      // 배경 + 텍스트 (가독성 향상)
      svg += `<rect x="${ox - 18}" y="${oy - 8}" width="36" height="16" fill="white" opacity="0.85" rx="2"/>`;
      svg += `<text x="${ox}" y="${oy}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-family="sans-serif" fill="${colors.angle}">${ang.value}</text>`;
    }
  }

  // ── 8. 꼭짓점 라벨 (바깥쪽으로 오프셋, 점 표시 없이 알파벳만) ──
  for (const v of vertices) {
    const sx = toSvgX(v.x);
    const sy = toSvgY(v.y);

    // 라벨: 중심에서 반대 방향 (바깥쪽)으로 배치
    const cx = toSvgX(centroidX);
    const cy = toSvgY(centroidY);
    const dx = sx - cx;
    const dy = sy - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const labelOffset = 20;
    let lx = sx + (dx / dist) * labelOffset;
    let ly = sy + (dy / dist) * labelOffset;

    // 화면 밖으로 나가지 않도록 클램핑
    lx = Math.max(14, Math.min(width - 14, lx));
    ly = Math.max(14, Math.min(height - 6, ly));

    // 라벨 텍스트 (참조사이트 스타일: serif + italic)
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="normal" font-style="italic" font-family="serif" fill="${colors.label}">${v.label}</text>`;
  }

  svg += '</svg>';
  return svg;
}

// ============================================================================
// 그래프 → 프로그래밍 기반 SVG (참조사이트 수준: 축 + 곡선 + 채우기)
// ============================================================================

// 참조사이트 스타일: 모든 곡선/직선을 검은색 계열로 통일
const GRAPH_COLORS = ['#1a1a1a', '#000000', '#1a1a1a', '#000000', '#1a1a1a', '#000000'];

// 음영 색상 (그래프용 — 참조사이트 수준: 거의 불투명한 진한 색상)
const GRAPH_SHADING: Record<string, string> = {
  yellow: 'rgba(245,195,50,0.88)',
  blue: 'rgba(96,165,250,0.65)',
  red: 'rgba(248,113,113,0.65)',
  green: 'rgba(74,222,128,0.65)',
  gray: 'rgba(156,163,175,0.50)',
};

/**
 * LaTeX 수식을 JS 함수 (x) => y 로 변환
 * 고등수학에서 흔히 나오는 다항식, 일차함수 등을 처리
 * ★ 핵심: ^를 ** 대신 Math.pow로 변환 (-x**2 SyntaxError 방지)
 * 변환 불가능하면 null 반환
 */
function latexToJsFunction(latex: string): ((x: number) => number) | null {
  try {
    let expr = latex.trim();

    // y = f(x) 형태에서 우변 추출
    const eqMatch = expr.match(/(?:y|f\s*\(\s*x\s*\))\s*=\s*(.+)/i);
    if (eqMatch) {
      expr = eqMatch[1].trim();
    } else if (expr.includes('=')) {
      // x = ... 같은 형태는 플롯 불가
      return null;
    }

    let js = expr;

    // 1. 이중 백슬래시 정리
    js = js.replace(/\\\\/g, '\\');

    // 2. \frac{a}{b} → ((a)/(b))
    js = js.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '(($1)/($2))');

    // 3. \sqrt{x} → Math.sqrt(x)
    js = js.replace(/\\sqrt\{([^}]+)\}/g, 'Math.sqrt($1)');

    // 4. Trig / log 함수
    js = js.replace(/\\sin/g, 'Math.sin');
    js = js.replace(/\\cos/g, 'Math.cos');
    js = js.replace(/\\tan/g, 'Math.tan');
    js = js.replace(/\\log/g, 'Math.log10');
    js = js.replace(/\\ln/g, 'Math.log');

    // 5. \pi → Math.PI
    js = js.replace(/\\pi/g, 'Math.PI');

    // 6. |x| → Math.abs(x)
    js = js.replace(/\\left\|([^|]+)\\right\|/g, 'Math.abs($1)');
    js = js.replace(/\|([^|]+)\|/g, 'Math.abs($1)');

    // 7. \left, \right 제거 (괄호만 남김)
    js = js.replace(/\\left/g, '');
    js = js.replace(/\\right/g, '');

    // 8. 거듭제곱: Math.pow 사용 (★ ** 대신 — -x**2 SyntaxError 방지)
    //    (...)^{n} → Math.pow((...), n)
    js = js.replace(/\(([^)]+)\)\^\{([^}]+)\}/g, 'Math.pow(($1),$2)');
    //    var^{n} (단일 변수/숫자) ★ 계수 분리: "2x^{2}" → "2"+"Math.pow(x,2)" (NOT "Math.pow(2x,2)")
    js = js.replace(/((?:[a-zA-Z]+)|(?:\d+))\^\{([^}]+)\}/g, 'Math.pow($1,$2)');
    //    (...)^n (단일 숫자 지수)
    js = js.replace(/\(([^)]+)\)\^([0-9])/g, 'Math.pow(($1),$2)');
    //    var^n (단일 숫자 지수)
    js = js.replace(/([a-zA-Z0-9])\^([0-9])/g, 'Math.pow($1,$2)');

    // 9. \cdot, \times → *
    js = js.replace(/\\cdot/g, '*');
    js = js.replace(/\\times/g, '*');

    // 10. 남은 { } 제거
    js = js.replace(/[{}]/g, '');

    // 11. 남은 LaTeX 명령 제거
    js = js.replace(/\\[a-zA-Z]+/g, '');

    // 12. 묵시적 곱셈: 2x → 2*x, )(  → )*(
    //     ★ Math.pow(, Math.sin( 등이 깨지지 않도록 함수명을 임시 보호
    const savedFns: string[] = [];
    js = js.replace(/Math\.\w+/g, (m) => { savedFns.push(m); return `§${savedFns.length - 1}§`; });
    js = js.replace(/(\d)([a-z(])/gi, '$1*$2');
    js = js.replace(/([a-z)])(\d)/gi, '$1*$2');
    js = js.replace(/\)\s*\(/g, ')*(');
    js = js.replace(/(?<![a-zA-Z])([a-z])\s*\(/gi, '$1*(');
    // Math 함수 복원
    js = js.replace(/§(\d+)§/g, (_, idx) => savedFns[parseInt(idx)]);
    // ★ 숫자 바로 뒤 Math 함수: "2Math.pow" → "2*Math.pow" (묵시적 곱셈)
    js = js.replace(/(\d)(Math\.)/g, '$1*$2');

    // 13. 공백 정리
    js = js.replace(/\s+/g, '').trim();

    // 미지수(a, b, c 등 x가 아닌 변수)가 있으면 플롯 불가
    if (/[a-wyzA-Z]/.test(js.replace(/Math\.\w+/g, '').replace(/PI/g, ''))) {
      console.warn('[GraphSVG] Expression has unknown variables:', latex, '→', js);
      return null;
    }

    // 안전 검증: 허용된 문자만
    const safeJs = js.replace(/Math\.(sin|cos|tan|log|log10|sqrt|abs|pow|PI|E)/g, '');
    if (/[a-wyzA-Z]/.test(safeJs)) return null;

    // 함수 생성 및 테스트
    const fn = new Function('x', `"use strict"; return ${js};`) as (x: number) => number;
    const test0 = fn(0);
    const test1 = fn(1);
    if (typeof test0 !== 'number' || typeof test1 !== 'number') return null;
    if (isNaN(test0) && isNaN(test1)) return null;

    console.log('[GraphSVG] Parsed expression:', latex, '→', js);
    return fn;
  } catch (e) {
    console.warn('[GraphSVG] Failed to parse LaTeX:', latex, e);
    return null;
  }
}

/**
 * 그래프 데이터로 정적 SVG 코드 생성 (참조사이트 수준)
 * - 좌표축 + 화살표 + 라벨 (x, y, O)
 * - 곡선 (LaTeX → JS 변환 후 샘플링)
 * - 점 라벨 (알파벳만, 점 마커 없음)
 * - 음영 영역 (삼각형 등)
 * - 선분 연결
 */
export function generateGraphSVG(rendering: GraphRendering): string | null {
  const { expressions, points } = rendering;
  const shadedRegions = rendering.shadedRegions || [];
  const segments = rendering.segments || [];

  const width = 420;
  const height = 350;
  const pad = { top: 30, right: 40, bottom: 60, left: 45 };

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // ── 스마트 범위 계산: 점 기반 → 곡선 적합 ──
  // ★ 핵심: AI의 넓은 xRange(-10~10 등)에 의존하지 않고, 점 범위를 기준으로 곡선 탐색
  // 이유: xRange가 넓으면 포물선 등이 극단적 y값(-150 등)을 생성하여 도형이 축소됨

  // 1) 점 좌표 수집 (원점 포함 보장)
  const pointXs = [...points.map(p => p.x), 0];
  const pointYs = [...points.map(p => p.y), 0];

  const ptXmin = Math.min(...pointXs);
  const ptXmax = Math.max(...pointXs);
  const ptYmin = Math.min(...pointYs);
  const ptYmax = Math.max(...pointYs);
  const ptXspan = ptXmax - ptXmin || 2;
  const ptYspan = ptYmax - ptYmin || 2;

  // 2) 곡선 탐색 범위 결정
  const hasLabeledPoints = points.some(p => p.label && p.label !== 'O');

  let scanXmin: number, scanXmax: number;
  let yClampLo: number, yClampHi: number;

  if (hasLabeledPoints && ptXspan > 0.5) {
    // ★ 점이 있는 경우: 점 범위의 ±50% 주변만 곡선 탐색
    const scanExt = Math.max(ptXspan * 0.5, 1.5);
    scanXmin = ptXmin - scanExt;
    scanXmax = ptXmax + scanExt;
    // Y 클램핑: 비대칭 — 상방은 넉넉히, 하방은 최소화
    // ★ 핵심: 모든 점이 y≥0이면 x축 아래는 거의 안 보이게 (원본처럼)
    const allPointsAboveAxis = ptYmin >= -0.01;
    const yClampUp = Math.max(ptYspan * 1.5, 3);
    const yClampDown = allPointsAboveAxis
      ? Math.max(ptYspan * 0.15, 0.5)  // x축 위 점만: 하방 극소화
      : Math.max(ptYspan * 1.5, 4);    // 음수 점 있으면 넉넉히
    yClampLo = ptYmin - yClampDown;
    yClampHi = ptYmax + yClampUp;
  } else {
    // 점이 없으면 AI 범위 사용 (기존 동작)
    scanXmin = rendering.xRange[0];
    scanXmax = rendering.xRange[1];
    yClampLo = -1000;
    yClampHi = 1000;
  }

  const allXs = [...pointXs];
  const allYs = [...pointYs];

  for (const expr of expressions) {
    if (expr.hidden) continue;
    const fn = latexToJsFunction(expr.latex);
    if (!fn) continue;
    // 곡선을 200포인트 샘플링 (점 범위 주변에서만)
    const samples = 200;
    for (let i = 0; i <= samples; i++) {
      const x = scanXmin + (scanXmax - scanXmin) * i / samples;
      const y = fn(x);
      if (isFinite(y) && !isNaN(y) && y >= yClampLo && y <= yClampHi) {
        allXs.push(x);
        allYs.push(y);
      }
    }
  }

  // 3) 범위 결정: 콘텐츠 기반 + 여유 패딩
  const contentXmin = Math.min(...allXs);
  const contentXmax = Math.max(...allXs);
  const contentYmin = Math.min(...allYs);
  const contentYmax = Math.max(...allYs);
  const xSpan = contentXmax - contentXmin || 1;
  const ySpan = contentYmax - contentYmin || 1;
  const xPad = xSpan * 0.12;
  const yPad = ySpan * 0.15;

  // ★ 콘텐츠 기반 범위를 직접 사용 (AI 범위와의 교집합 아님)
  // Math.round로 범위를 타이트하게 유지 (floor/ceil은 불필요한 공간 추가)
  const xMin = Math.floor(contentXmin - xPad);
  const xMax = Math.ceil(contentXmax + xPad);
  const yMin = Math.round(contentYmin - yPad);
  const yMax = Math.ceil(contentYmax + yPad);

  console.log('[GraphSVG] Range: AI', rendering.xRange, rendering.yRange, '→ fit', [xMin, xMax], [yMin, yMax]);

  const toSvgX = (x: number) => pad.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const toSvgY = (y: number) => pad.top + ((yMax - y) / (yMax - yMin)) * plotH;

  // 점 라벨 → 좌표 매핑
  const pointMap = new Map(points.map(p => [p.label || '', p]));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" class="figure-graph">`;

  // 클리핑 영역 (곡선이 축 밖으로 나가지 않게)
  svg += `<defs><clipPath id="plot-clip"><rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}"/></clipPath></defs>`;

  // ── 1. 음영 영역 (가장 먼저) ──
  for (const region of shadedRegions) {
    const pts = region.vertices
      .map(label => pointMap.get(label))
      .filter(Boolean)
      .map(p => `${toSvgX(p!.x)},${toSvgY(p!.y)}`)
      .join(' ');
    if (pts) {
      const fill = GRAPH_SHADING[region.color] || GRAPH_SHADING.yellow;
      // 음영 + 테두리선 (참조사이트 동일: 진한 채움 + 변 라인)
      svg += `<polygon points="${pts}" fill="${fill}" stroke="#374151" stroke-width="2" clip-path="url(#plot-clip)"/>`;
    }
  }

  // ── 2. 좌표축 (눈금 없이 깨끗한 스타일, 참조사이트 동일) ──
  const axisColor = '#374151';
  const originX = toSvgX(0);
  const originY = toSvgY(0);
  const axisInRange = (v: number, min: number, max: number) => v >= min && v <= max;

  // X축 (y=0이 범위 안에 있을 때)
  if (axisInRange(0, yMin, yMax)) {
    svg += `<line x1="${pad.left}" y1="${originY}" x2="${pad.left + plotW + 8}" y2="${originY}" stroke="${axisColor}" stroke-width="1.5"/>`;
    // 화살표
    svg += `<polygon points="${pad.left + plotW + 8},${originY} ${pad.left + plotW + 2},${originY - 4} ${pad.left + plotW + 2},${originY + 4}" fill="${axisColor}"/>`;
    // x 라벨
    svg += `<text x="${pad.left + plotW + 12}" y="${originY + 4}" font-size="14" font-style="italic" font-family="serif" fill="${axisColor}">x</text>`;
  }

  // Y축 (x=0이 범위 안에 있을 때)
  if (axisInRange(0, xMin, xMax)) {
    svg += `<line x1="${originX}" y1="${pad.top + plotH + 8}" x2="${originX}" y2="${pad.top - 8}" stroke="${axisColor}" stroke-width="1.5"/>`;
    // 화살표
    svg += `<polygon points="${originX},${pad.top - 8} ${originX - 4},${pad.top - 2} ${originX + 4},${pad.top - 2}" fill="${axisColor}"/>`;
    // y 라벨
    svg += `<text x="${originX - 14}" y="${pad.top - 8}" font-size="14" font-style="italic" font-family="serif" fill="${axisColor}">y</text>`;
  }

  // 원점 O 라벨
  if (axisInRange(0, xMin, xMax) && axisInRange(0, yMin, yMax)) {
    svg += `<text x="${originX - 12}" y="${originY + 16}" font-size="13" font-style="italic" font-family="serif" fill="${axisColor}">O</text>`;
  }

  // ※ 축 위 좌표 숫자는 표시하지 않음 — 좌표는 학생이 풀어야 하는 값이므로

  // ── 3. 곡선 (수식 → JS 변환 → 샘플링) ──
  const numSamples = 400;
  let curveCount = 0;
  for (let i = 0; i < expressions.length; i++) {
    const expr = expressions[i];
    if (expr.hidden) continue;

    const fn = latexToJsFunction(expr.latex);
    if (!fn) {
      console.warn(`[GraphSVG] Could not parse expression[${i}]:`, expr.latex);
      continue;
    }
    curveCount++;

    const step = (xMax - xMin) / numSamples;
    let pathData = '';
    let started = false;

    for (let j = 0; j <= numSamples; j++) {
      const x = xMin + j * step;
      const y = fn(x);
      if (isNaN(y) || !isFinite(y)) {
        started = false;
        continue;
      }
      // Y 범위 밖은 클리핑으로 처리하므로 약간 여유 둠
      if (y < yMin - (yMax - yMin) * 2 || y > yMax + (yMax - yMin) * 2) {
        started = false;
        continue;
      }
      const sx = toSvgX(x);
      const sy = toSvgY(y);
      if (!started) {
        pathData += `M${sx.toFixed(1)},${sy.toFixed(1)}`;
        started = true;
      } else {
        pathData += ` L${sx.toFixed(1)},${sy.toFixed(1)}`;
      }
    }

    if (pathData) {
      // 참조사이트 스타일: AI 색상 무시, 일관된 진한 색상 사용
      const color = GRAPH_COLORS[i % GRAPH_COLORS.length];
      const dashAttr = expr.style === 'dashed' ? ' stroke-dasharray="6,4"' : '';
      svg += `<path d="${pathData}" stroke="${color}" stroke-width="2.5" fill="none" clip-path="url(#plot-clip)"${dashAttr}/>`;
    }
  }
  console.log(`[GraphSVG] Rendered ${curveCount}/${expressions.length} curves`);

  // ── 4. 선분 연결 ──
  for (const [fromLabel, toLabel] of segments) {
    const from = pointMap.get(fromLabel);
    const to = pointMap.get(toLabel);
    if (from && to) {
      svg += `<line x1="${toSvgX(from.x)}" y1="${toSvgY(from.y)}" x2="${toSvgX(to.x)}" y2="${toSvgY(to.y)}" stroke="${axisColor}" stroke-width="2.2" clip-path="url(#plot-clip)"/>`;
    }
  }

  // ── 5. 점 라벨 (알파벳만, 마커 없음, 참조사이트 스타일) ──
  for (const pt of points) {
    if (!pt.label || pt.label === 'O') continue; // O는 이미 원점에 표시
    const sx = toSvgX(pt.x);
    const sy = toSvgY(pt.y);

    // 라벨 배치: 위치별 스마트 오프셋
    let labelX = sx;
    let labelY: number;

    if (pt.y === 0) {
      // x축 위의 점 (B, C 등): 곡선이 지나가는 교차점을 피해 아래-옆으로 배치
      // 원본 스타일: 글씨를 축 아래 + 약간 왼쪽/오른쪽으로 이동
      const graphCenter = toSvgX((xMin + xMax) / 2);
      const isLeft = sx < graphCenter;
      labelX = isLeft ? sx - 12 : sx + 12; // 곡선 교차점에서 좌/우로 비켜남
      labelY = originY + 16;
    } else if (pt.y > 0) {
      labelY = sy - 16;
    } else {
      labelY = sy + 22;
    }

    svg += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="16" font-weight="bold" font-style="italic" font-family="serif" fill="#000000">${escapeXml(pt.label)}</text>`;
  }

  svg += '</svg>';
  return svg;
}

// ============================================================================
// 표 → 프로그래밍 기반 SVG (조립제법/일반 표 모두 지원)
// ============================================================================

const TABLE_COLORS = {
  stroke: '#374151',
  text: '#1f2937',
  headerBg: '#f3f4f6',
  divider: '#374151',
};

/**
 * 표 데이터로 프로그래밍 기반 SVG 코드 생성
 * 조립제법(합성나눗셈) 표: L자형 구분선
 * 일반 표: 격자선
 * @param rendering - 표 렌더링 데이터
 */
export function generateTableSVG(rendering: TableRendering): string | null {
  let { headers, rows } = rendering;
  if (headers.length === 0 && rows.length === 0) return null;

  const numDataRows = rows.length;

  // 조립제법 감지: 첫 헤더가 숫자, 비어있음, 또는 "k"이고, 데이터 행이 2개 이상
  const isSyntheticDivision = headers.length > 0 &&
    numDataRows >= 2 &&
    (headers[0] === '' || /^-?\d+$/.test(headers[0].trim()) || /^k$/i.test(headers[0].trim()));

  const COL_W = 60;   // 열 너비
  const ROW_H = 38;   // 행 높이
  const PAD_X = 16;   // 좌우 여백
  const PAD_Y = 12;   // 상하 여백

  const numCols = Math.max(headers.length, ...rows.map(r => r.length));

  const totalW = numCols * COL_W + 2 * PAD_X;
  const totalH = (1 + numDataRows) * ROW_H + 2 * PAD_Y; // 1 = 헤더 행

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="100%" class="figure-table">`;

  const x0 = PAD_X;
  const y0 = PAD_Y;

  if (isSyntheticDivision) {
    // ── 조립제법 스타일 (원본 문제 동일) ──
    // L자 구분선: 첫 번째 열(k/나누는 수) 오른쪽에 위치
    const dividerX = x0 + COL_W; // 첫 열 오른쪽 (원본 동일)
    const lastRowY = y0 + numDataRows * ROW_H; // 마지막 데이터 행 위 (L자 가로선)
    const tableRight = x0 + numCols * COL_W;
    const tableBottom = y0 + (1 + numDataRows) * ROW_H;

    // L자형 구분선: 세로 (첫 열 오른쪽, 헤더~가로선까지만)
    svg += `<line x1="${dividerX}" y1="${y0}" x2="${dividerX}" y2="${lastRowY}" stroke="${TABLE_COLORS.divider}" stroke-width="2"/>`;

    // L자형 구분선: 가로 (마지막 행 위, 구분선부터 오른쪽 끝까지)
    svg += `<line x1="${dividerX}" y1="${lastRowY}" x2="${tableRight}" y2="${lastRowY}" stroke="${TABLE_COLORS.divider}" stroke-width="2"/>`;

    // 나머지 구분 ㄴ 형태 (마지막 열: 세로선 + 아래 가로선)
    if (numCols > 2) {
      const remainderX = x0 + (numCols - 1) * COL_W;
      // 세로선: 가로 구분선 ~ 표 하단
      svg += `<line x1="${remainderX}" y1="${lastRowY}" x2="${remainderX}" y2="${tableBottom}" stroke="${TABLE_COLORS.divider}" stroke-width="1.5"/>`;
      // 가로선: 표 하단 (ㄴ의 바닥)
      svg += `<line x1="${remainderX}" y1="${tableBottom}" x2="${tableRight}" y2="${tableBottom}" stroke="${TABLE_COLORS.divider}" stroke-width="1.5"/>`;
    }

    // 헤더 행 텍스트
    for (let c = 0; c < numCols; c++) {
      const hText = c < headers.length ? headers[c] : '';
      if (!hText) continue;
      const cx = x0 + c * COL_W + COL_W / 2;
      const cy = y0 + ROW_H / 2;
      // 이탤릭 처리: 알파벳 변수(a,b,c 등)
      const isVar = /^[a-zA-Z]$/.test(hText);
      svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="15" font-family="serif" fill="${TABLE_COLORS.text}"${isVar ? ' font-style="italic"' : ''}>${escapeXml(hText)}</text>`;
    }

    // 데이터 행 텍스트
    for (let r = 0; r < numDataRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const cell = c < rows[r].length ? rows[r][c] : '';
        const cx = x0 + c * COL_W + COL_W / 2;
        const cy = y0 + (1 + r) * ROW_H + ROW_H / 2;
        if (cell === '' || cell === '□' || cell === '?') {
          // 첫 열(k열)의 빈 셀은 박스를 그리지 않음 (원본 동일)
          if (c === 0) continue;
          // 중간행(결과행 제외)의 첫 계수 칸(c=1)도 박스 없음 — 조립제법에서 첫 계수는 바로 내려감
          if (c === 1 && r === 0) continue;
          // 빈 셀 → 네모 박스
          const boxW = 24;
          const boxH = 20;
          svg += `<rect x="${cx - boxW / 2}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" stroke="#9ca3af" stroke-width="1.2" fill="none" rx="2"/>`;
        } else {
          const isLastRow = r === numDataRows - 1;
          svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="15" font-family="serif" fill="${TABLE_COLORS.text}" font-weight="${isLastRow ? '600' : 'normal'}">${escapeXml(cell)}</text>`;
        }
      }
    }
  } else {
    // ── 일반 표 스타일 ──
    // 헤더 배경
    if (headers.length > 0) {
      svg += `<rect x="${x0}" y="${y0}" width="${numCols * COL_W}" height="${ROW_H}" fill="${TABLE_COLORS.headerBg}"/>`;
    }

    // 격자선
    for (let r = 0; r <= 1 + numDataRows; r++) {
      const y = y0 + r * ROW_H;
      const sw = r === 0 || r === 1 ? 2 : 1;
      svg += `<line x1="${x0}" y1="${y}" x2="${x0 + numCols * COL_W}" y2="${y}" stroke="${TABLE_COLORS.stroke}" stroke-width="${sw}"/>`;
    }
    for (let c = 0; c <= numCols; c++) {
      const x = x0 + c * COL_W;
      const sw = c === 0 || c === numCols ? 2 : 1;
      svg += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + (1 + numDataRows) * ROW_H}" stroke="${TABLE_COLORS.stroke}" stroke-width="${sw}"/>`;
    }

    // 헤더 텍스트
    for (let c = 0; c < headers.length; c++) {
      const cx = x0 + c * COL_W + COL_W / 2;
      const cy = y0 + ROW_H / 2;
      svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="bold" font-family="sans-serif" fill="${TABLE_COLORS.text}">${escapeXml(headers[c])}</text>`;
    }

    // 데이터 행 텍스트
    for (let r = 0; r < numDataRows; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const cx = x0 + c * COL_W + COL_W / 2;
        const cy = y0 + (1 + r) * ROW_H + ROW_H / 2;
        const cell = rows[r][c];
        if (cell === '' || cell === '□' || cell === '?') {
          const boxW = 24;
          const boxH = 20;
          svg += `<rect x="${cx - boxW / 2}" y="${cy - boxH / 2}" width="${boxW}" height="${boxH}" stroke="#9ca3af" stroke-width="1.2" fill="none" rx="2"/>`;
        } else {
          svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-family="sans-serif" fill="${TABLE_COLORS.text}">${escapeXml(cell)}</text>`;
        }
      }
    }
  }

  svg += '</svg>';
  return svg;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// 표 → HTML 테이블
// ============================================================================

function tableToContent(rendering: TableRendering): FigureContent {
  // LaTeX 표가 있으면 수식 블록으로 (더 정확함)
  if (rendering.latex && rendering.latex.includes('\\begin')) {
    return { type: 'math-block', latex: rendering.latex };
  }

  // HTML 표 생성
  let html = '<table class="figure-table">';

  if (rendering.headers.length > 0) {
    html += '<thead><tr>';
    for (const h of rendering.headers) {
      html += `<th>${escapeHtml(h)}</th>`;
    }
    html += '</tr></thead>';
  }

  if (rendering.rows.length > 0) {
    html += '<tbody>';
    for (const row of rendering.rows) {
      html += '<tr>';
      for (const cell of row) {
        html += `<td>${escapeHtml(cell)}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table>';

  return { type: 'table-html', html };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// 다이어그램/수직선 → LaTeX + 텍스트
// ============================================================================

function diagramToContent(rendering: DiagramRendering, fallbackUrl: string): FigureContent {
  const parts: FigureContent[] = [];

  if (rendering.latex) {
    parts.push({ type: 'math-block', latex: rendering.latex });
  }

  if (rendering.description && !rendering.latex) {
    // LaTeX가 없으면 원본 이미지 유지 + 텍스트 설명 추가
    parts.push({ type: 'image', url: fallbackUrl, alt: rendering.description });
  }

  if (parts.length === 0) {
    return { type: 'image', url: fallbackUrl, alt: '다이어그램' };
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return { type: 'mixed', parts };
}

// ============================================================================
// Tiptap 에디터 HTML 생성 (MixedContentRenderer 호환)
// ============================================================================

/**
 * FigureContent를 MixedContentRenderer가 처리할 수 있는 마크다운 문자열로 변환
 * 기존 파이프라인과의 호환성 유지
 */
export function figureContentToMarkdown(content: FigureContent): string {
  switch (content.type) {
    case 'graph':
      // 그래프는 에디터에서 직접 GraphNode로 삽입해야 하므로
      // 마크다운으로는 수식 목록 + 설명으로 변환
      return content.expressions
        .filter(e => !e.hidden)
        .map(e => `$$${e.latex}$$`)
        .join('\n');

    case 'math-block':
      return `$$${content.latex}$$`;

    case 'table-html':
      return content.html;

    case 'svg':
      return content.fallbackLatex ? `$$${content.fallbackLatex}$$` : '';

    case 'image':
      return `![${content.alt}](${content.url})`;

    case 'mixed':
      return content.parts.map(figureContentToMarkdown).join('\n\n');

    default:
      return '';
  }
}
