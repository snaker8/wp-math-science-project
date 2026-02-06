// ============================================================================
// HWP (한글) 파일 처리기
// HWP 파일에서 텍스트와 수식을 추출
// ============================================================================

import type { OCRResult, OCRPage, MathExpression } from '@/types/workflow';

// ============================================================================
// HWP 파일 구조 타입
// ============================================================================

interface HWPParseResult {
  text: string;
  paragraphs: HWPParagraph[];
  equations: HWPEquation[];
  images: HWPImage[];
  metadata: HWPMetadata;
}

interface HWPParagraph {
  index: number;
  text: string;
  style?: string;
}

interface HWPEquation {
  index: number;
  rawEquation: string; // HWP 수식 형식
  latex: string; // 변환된 LaTeX
  position: { paragraph: number; offset: number };
}

interface HWPImage {
  id: string;
  type: string;
  data: string; // Base64
  position: { paragraph: number; offset: number };
}

interface HWPMetadata {
  title?: string;
  author?: string;
  createdAt?: string;
  pageCount?: number;
}

// ============================================================================
// HWP 수식 → LaTeX 변환 매핑
// ============================================================================

const HWP_TO_LATEX_MAP: Record<string, string> = {
  // 기본 연산
  'times': '\\times',
  'div': '\\div',
  'pm': '\\pm',
  'mp': '\\mp',
  'cdot': '\\cdot',

  // 분수
  'over': '/',  // {a} over {b} → \frac{a}{b}

  // 루트
  'sqrt': '\\sqrt',
  'root': '\\sqrt',

  // 첨자
  'sup': '^',
  'sub': '_',

  // 그리스 문자
  'alpha': '\\alpha',
  'beta': '\\beta',
  'gamma': '\\gamma',
  'delta': '\\delta',
  'epsilon': '\\epsilon',
  'theta': '\\theta',
  'lambda': '\\lambda',
  'mu': '\\mu',
  'pi': '\\pi',
  'sigma': '\\sigma',
  'phi': '\\phi',
  'omega': '\\omega',
  'ALPHA': '\\Alpha',
  'BETA': '\\Beta',
  'GAMMA': '\\Gamma',
  'DELTA': '\\Delta',
  'SIGMA': '\\Sigma',
  'PHI': '\\Phi',
  'OMEGA': '\\Omega',

  // 관계 연산자
  'leq': '\\leq',
  'geq': '\\geq',
  'neq': '\\neq',
  'approx': '\\approx',
  'equiv': '\\equiv',
  'sim': '\\sim',

  // 집합
  'in': '\\in',
  'notin': '\\notin',
  'subset': '\\subset',
  'supset': '\\supset',
  'cup': '\\cup',
  'cap': '\\cap',
  'emptyset': '\\emptyset',

  // 함수
  'sin': '\\sin',
  'cos': '\\cos',
  'tan': '\\tan',
  'log': '\\log',
  'ln': '\\ln',
  'lim': '\\lim',
  'sum': '\\sum',
  'prod': '\\prod',
  'int': '\\int',

  // 화살표
  'rightarrow': '\\rightarrow',
  'leftarrow': '\\leftarrow',
  'Rightarrow': '\\Rightarrow',
  'Leftarrow': '\\Leftarrow',
  'leftrightarrow': '\\leftrightarrow',

  // 기타
  'infty': '\\infty',
  'partial': '\\partial',
  'nabla': '\\nabla',
  'forall': '\\forall',
  'exists': '\\exists',
};

// ============================================================================
// HWP 수식 파서
// ============================================================================

/**
 * HWP 수식 문자열을 LaTeX로 변환
 */
export function convertHWPEquationToLatex(hwpEquation: string): string {
  let latex = hwpEquation;

  // 기본 변환
  for (const [hwp, tex] of Object.entries(HWP_TO_LATEX_MAP)) {
    const regex = new RegExp(`\\b${hwp}\\b`, 'g');
    latex = latex.replace(regex, tex);
  }

  // 분수 변환: {a} over {b} → \frac{a}{b}
  latex = latex.replace(/\{([^}]+)\}\s*over\s*\{([^}]+)\}/g, '\\frac{$1}{$2}');
  latex = latex.replace(/(\w+)\s*over\s*(\w+)/g, '\\frac{$1}{$2}');

  // 루트 변환: sqrt {a} → \sqrt{a}
  latex = latex.replace(/sqrt\s*\{([^}]+)\}/g, '\\sqrt{$1}');

  // 위첨자/아래첨자 변환
  latex = latex.replace(/\^\s*\{([^}]+)\}/g, '^{$1}');
  latex = latex.replace(/_\s*\{([^}]+)\}/g, '_{$1}');

  // 적분 범위: int from {a} to {b} → \int_{a}^{b}
  latex = latex.replace(/int\s+from\s+\{([^}]+)\}\s+to\s+\{([^}]+)\}/g, '\\int_{$1}^{$2}');

  // 합/곱 범위
  latex = latex.replace(/sum\s+from\s+\{([^}]+)\}\s+to\s+\{([^}]+)\}/g, '\\sum_{$1}^{$2}');
  latex = latex.replace(/prod\s+from\s+\{([^}]+)\}\s+to\s+\{([^}]+)\}/g, '\\prod_{$1}^{$2}');

  // 극한: lim from {x -> a} → \lim_{x \to a}
  latex = latex.replace(/lim\s+from\s+\{([^}]+)\s*->\s*([^}]+)\}/g, '\\lim_{$1 \\to $2}');

  // 행렬 변환 (간단한 케이스)
  latex = latex.replace(/matrix\s*\{([^}]+)\}/g, (_, content) => {
    const rows = content.split('#').map((row: string) => row.trim().split('&').join(' & '));
    return `\\begin{pmatrix} ${rows.join(' \\\\ ')} \\end{pmatrix}`;
  });

  // 중괄호 정리
  latex = latex.replace(/\{\s+/g, '{');
  latex = latex.replace(/\s+\}/g, '}');

  return latex;
}

// ============================================================================
// HWP 파일 파서 (클라이언트 사이드 - OLE 구조 해석)
// ============================================================================

/**
 * HWP 파일 파싱 (ArrayBuffer → 구조화된 데이터)
 * 참고: 실제 HWP 파싱은 복잡하므로 API 서비스 활용 권장
 */
export async function parseHWPFile(arrayBuffer: ArrayBuffer): Promise<HWPParseResult> {
  // HWP 파일 시그니처 확인
  const signature = new Uint8Array(arrayBuffer.slice(0, 8));
  const hwpSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]; // OLE 컴파운드 파일

  const isOLE = hwpSignature.every((byte, i) => signature[i] === byte);

  if (!isOLE) {
    // HWPX (XML 기반) 파일일 수 있음
    return parseHWPXFile(arrayBuffer);
  }

  // OLE 기반 HWP 파싱
  return parseOLEHWP(arrayBuffer);
}

/**
 * OLE 기반 HWP 파일 파싱
 */
async function parseOLEHWP(arrayBuffer: ArrayBuffer): Promise<HWPParseResult> {
  // 간소화된 구현 - 실제로는 olefile 라이브러리 또는 서버사이드 Python 처리 필요
  // 여기서는 텍스트 추출을 위한 기본 로직만 구현

  const result: HWPParseResult = {
    text: '',
    paragraphs: [],
    equations: [],
    images: [],
    metadata: {},
  };

  try {
    // OLE 구조에서 BodyText 스트림 찾기
    const dataView = new DataView(arrayBuffer);

    // 섹터 크기 확인 (offset 30)
    const sectorSizeShift = dataView.getUint16(30, true);
    const sectorSize = 1 << sectorSizeShift;

    // 텍스트 추출 시도 (간소화된 버전)
    const textDecoder = new TextDecoder('utf-16le');
    const bytes = new Uint8Array(arrayBuffer);

    // HWP 텍스트 마커 찾기
    let textContent = '';
    for (let i = 0; i < bytes.length - 2; i++) {
      // 한글 유니코드 범위 확인 (AC00-D7AF)
      if (bytes[i] >= 0xAC && bytes[i] <= 0xD7 && bytes[i + 1] !== 0) {
        // 한글 문자일 가능성
      }
    }

    // 폴백: 바이너리에서 텍스트 패턴 추출
    const rawText = extractTextFromBinary(bytes);
    result.text = rawText;

    // 문단 분리
    const paragraphs = rawText.split(/\n+/).filter(p => p.trim());
    result.paragraphs = paragraphs.map((text, index) => ({
      index,
      text: text.trim(),
    }));

    // 수식 추출 (패턴 매칭)
    const equationPatterns = [
      /\$([^$]+)\$/g,  // $ ... $
      /\\begin\{equation\}([\s\S]+?)\\end\{equation\}/g,
      /EQEDIT\s*([^\n]+)/g,  // HWP 수식 에디터 마커
    ];

    let equationIndex = 0;
    for (const pattern of equationPatterns) {
      let match;
      while ((match = pattern.exec(rawText)) !== null) {
        result.equations.push({
          index: equationIndex++,
          rawEquation: match[1],
          latex: convertHWPEquationToLatex(match[1]),
          position: { paragraph: 0, offset: match.index },
        });
      }
    }

  } catch (error) {
    console.error('HWP parsing error:', error);
    throw new Error('HWP 파일 파싱 실패');
  }

  return result;
}

/**
 * HWPX (XML 기반) 파일 파싱
 */
async function parseHWPXFile(arrayBuffer: ArrayBuffer): Promise<HWPParseResult> {
  const result: HWPParseResult = {
    text: '',
    paragraphs: [],
    equations: [],
    images: [],
    metadata: {},
  };

  try {
    // HWPX는 ZIP 형식
    // JSZip 또는 fflate 라이브러리로 압축 해제 필요
    // 여기서는 기본 구조만 제시

    const textDecoder = new TextDecoder('utf-8');
    const content = textDecoder.decode(arrayBuffer);

    // XML 파싱 시도
    if (content.includes('<?xml') || content.includes('<w:document')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');

      // 텍스트 노드 추출
      const textNodes = doc.querySelectorAll('w\\:t, t');
      textNodes.forEach((node, index) => {
        const text = node.textContent || '';
        result.text += text + ' ';
        if (text.trim()) {
          result.paragraphs.push({ index, text: text.trim() });
        }
      });
    }

  } catch (error) {
    console.error('HWPX parsing error:', error);
    throw new Error('HWPX 파일 파싱 실패');
  }

  return result;
}

/**
 * 바이너리에서 텍스트 추출 (폴백)
 */
function extractTextFromBinary(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let currentChunk = '';

  // UTF-16LE 텍스트 패턴 찾기
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const charCode = bytes[i] | (bytes[i + 1] << 8);

    // 한글 범위 (AC00-D7AF) 또는 ASCII 범위 (20-7E)
    if ((charCode >= 0xAC00 && charCode <= 0xD7AF) ||
        (charCode >= 0x20 && charCode <= 0x7E) ||
        charCode === 0x0A || charCode === 0x0D) {
      currentChunk += String.fromCharCode(charCode);
    } else if (currentChunk.length > 3) {
      // 최소 길이의 텍스트 청크만 저장
      chunks.push(currentChunk);
      currentChunk = '';
    } else {
      currentChunk = '';
    }
  }

  if (currentChunk.length > 3) {
    chunks.push(currentChunk);
  }

  return chunks.join('\n').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// HWP → OCR Result 변환
// ============================================================================

/**
 * HWP 파싱 결과를 OCR Result 형식으로 변환
 */
export function convertHWPToOCRResult(
  hwpResult: HWPParseResult,
  jobId: string
): OCRResult {
  // 문단을 페이지 단위로 그룹화 (약 30개 문단 = 1페이지로 가정)
  const PARAGRAPHS_PER_PAGE = 30;
  const pages: OCRPage[] = [];

  for (let i = 0; i < hwpResult.paragraphs.length; i += PARAGRAPHS_PER_PAGE) {
    const pageParagraphs = hwpResult.paragraphs.slice(i, i + PARAGRAPHS_PER_PAGE);
    const pageText = pageParagraphs.map(p => p.text).join('\n');

    // 해당 페이지의 수식 찾기
    const pageEquations = hwpResult.equations.filter(eq => {
      const paragraphIndex = eq.position.paragraph;
      return paragraphIndex >= i && paragraphIndex < i + PARAGRAPHS_PER_PAGE;
    });

    const mathExpressions: MathExpression[] = pageEquations.map(eq => ({
      latex: eq.latex,
      boundingBox: { x: 0, y: 0, width: 100, height: 20 },
      confidence: 0.9,
    }));

    pages.push({
      pageNumber: Math.floor(i / PARAGRAPHS_PER_PAGE) + 1,
      text: pageText,
      mathExpressions,
      images: [],
      confidence: 0.85,
    });
  }

  // 페이지가 없으면 전체 텍스트를 하나의 페이지로
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      text: hwpResult.text,
      mathExpressions: hwpResult.equations.map(eq => ({
        latex: eq.latex,
        boundingBox: { x: 0, y: 0, width: 100, height: 20 },
        confidence: 0.9,
      })),
      images: [],
      confidence: 0.85,
    });
  }

  return {
    jobId,
    pages,
    rawText: hwpResult.text,
    confidence: 0.85,
    processedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HWP 처리 API (서버 사이드 Python 연동용)
// ============================================================================

/**
 * Python HWP 처리 서비스 호출 (서버가 있는 경우)
 */
export async function processHWPWithPython(
  fileBuffer: ArrayBuffer,
  apiEndpoint: string = '/api/hwp/parse'
): Promise<HWPParseResult> {
  try {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), 'document.hwp');

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HWP processing failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Python HWP processing error:', error);
    // 폴백: 클라이언트 사이드 파싱
    return parseHWPFile(fileBuffer);
  }
}

// ============================================================================
// Export
// ============================================================================

export type { HWPParseResult, HWPParagraph, HWPEquation, HWPImage, HWPMetadata };
