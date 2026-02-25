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
 * 도형 데이터로 SVG 코드 생성
 */
function generateGeometrySVG(rendering: GeometryRendering): string | null {
  const { vertices, segments, angles, lengths } = rendering;
  if (vertices.length < 2) return null;

  // 좌표 범위 계산
  const xs = vertices.map(v => v.x);
  const ys = vertices.map(v => v.y);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;

  const width = 400;
  const height = 350;
  const padding = 40;

  // 좌표 → SVG 좌표 변환 (y축 반전)
  const scaleX = (width - 2 * padding) / (maxX - minX);
  const scaleY = (height - 2 * padding) / (maxY - minY);
  const scale = Math.min(scaleX, scaleY);

  const toSvgX = (x: number) => padding + (x - minX) * scale;
  const toSvgY = (y: number) => height - padding - (y - minY) * scale;

  const vertexMap = new Map(vertices.map(v => [v.label, v]));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" class="figure-geometry">`;
  svg += `<style>.seg{stroke:#333;stroke-width:2;fill:none}.lbl{font:bold 14px sans-serif;fill:#333}.len{font:12px sans-serif;fill:#666}.ang{font:11px sans-serif;fill:#2563eb}</style>`;

  // 선분 그리기
  for (const [fromLabel, toLabel] of segments) {
    const from = vertexMap.get(fromLabel);
    const to = vertexMap.get(toLabel);
    if (from && to) {
      svg += `<line x1="${toSvgX(from.x)}" y1="${toSvgY(from.y)}" x2="${toSvgX(to.x)}" y2="${toSvgY(to.y)}" class="seg"/>`;
    }
  }

  // 길이 라벨
  for (const len of lengths) {
    const from = vertexMap.get(len.from);
    const to = vertexMap.get(len.to);
    if (from && to) {
      const mx = (toSvgX(from.x) + toSvgX(to.x)) / 2;
      const my = (toSvgY(from.y) + toSvgY(to.y)) / 2;
      svg += `<text x="${mx}" y="${my - 8}" text-anchor="middle" class="len">${len.value}</text>`;
    }
  }

  // 각도 라벨
  for (const ang of angles) {
    const v = vertexMap.get(ang.vertex);
    if (v) {
      svg += `<text x="${toSvgX(v.x)}" y="${toSvgY(v.y) - 16}" text-anchor="middle" class="ang">${ang.value}</text>`;
    }
  }

  // 꼭짓점 라벨
  for (const v of vertices) {
    const sx = toSvgX(v.x);
    const sy = toSvgY(v.y);
    svg += `<circle cx="${sx}" cy="${sy}" r="3" fill="#333"/>`;
    svg += `<text x="${sx}" y="${sy - 10}" text-anchor="middle" class="lbl">${v.label}</text>`;
  }

  svg += '</svg>';
  return svg;
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
