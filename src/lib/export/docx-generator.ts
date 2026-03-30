// ============================================================================
// DOCX Generator — 시험지를 DOCX 파일로 생성 (한글에서 열기 가능)
// ============================================================================

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  SectionType,
  ImageRun,
  ShadingType,
  Packer,
  PageBreak,
} from 'docx';

// ============================================================================
// Types
// ============================================================================

export interface DocxProblem {
  number: number;
  content: string;       // content_latex (LaTeX 포함 텍스트)
  choices: string[];     // 선택지 배열 (①~⑤)
  answer: number | string;
  solution?: string;
  points?: number;
  figureUrl?: string;    // 그림 이미지 URL
}

export interface DocxExamConfig {
  title: string;
  subtitle?: string;
  subject?: string;
  instituteName?: string;
  showNameField?: boolean;
  showAnswerSheet?: boolean;
  showSolutions?: boolean;
  columns?: 1 | 2;
}

// ============================================================================
// LaTeX → 유니코드 텍스트 변환 (향상된 버전)
// ============================================================================

function latexToPlainText(latex: string): string {
  if (!latex) return '';

  let text = latex;

  // 수식 블록 제거: \( ... \) 또는 $ ... $
  text = text.replace(/\\\(|\\\)/g, '');
  text = text.replace(/\$\$/g, '');
  text = text.replace(/\$/g, '');

  // 중첩 \frac 처리 (최대 3단계)
  for (let i = 0; i < 3; i++) {
    text = text.replace(/\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, num: string, den: string) => {
      const n = num.trim();
      const d = den.trim();
      // 단순 숫자/변수 분수는 깔끔하게
      if (/^[a-zA-Z0-9]+$/.test(n) && /^[a-zA-Z0-9]+$/.test(d)) return `${n}/${d}`;
      return `(${n})/(${d})`;
    });
  }

  // \sqrt 처리
  text = text.replace(/\\sqrt\[(\d+)\]\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, n: string, inner: string) => {
    const sup = n.split('').map((c: string) => ({ '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }[c] || c)).join('');
    return `${sup}√(${latexToPlainText(inner)})`;
  });
  text = text.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, inner: string) => {
    const converted = latexToPlainText(inner);
    // 단순한 숫자/변수는 괄호 없이, 복잡한 표현은 괄호 포함
    if (/^[a-zA-Z0-9.]+$/.test(converted)) return `√${converted}`;
    return `√(${converted})`;
  });
  text = text.replace(/\\sqrt\s*(\d)/g, '√$1');

  // \overline, \bar
  text = text.replace(/\\overline\{([^{}]*)\}/g, '$1̄');
  text = text.replace(/\\bar\{([^{}]*)\}/g, '$1̄');

  // 텍스트 명령
  text = text.replace(/\\mathrm\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\text\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\textbf\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\mathbf\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\boldsymbol\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\operatorname\{([^{}]*)\}/g, '$1');

  // \left, \right 제거
  text = text.replace(/\\left\s*([(\[{|.])/g, '$1');
  text = text.replace(/\\right\s*([)\]}|.])/g, '$1');
  text = text.replace(/\\left\s*/g, '');
  text = text.replace(/\\right\s*/g, '');

  // 상첨자 → 유니코드
  const superMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    'n': 'ⁿ', '+': '⁺', '-': '⁻', '(': '⁽', ')': '⁾',
  };
  text = text.replace(/\^{([^{}]*)}/g, (_, inner: string) => {
    // 간단한 숫자/기호만 유니코드로, 복잡하면 ^(...) 형식
    const converted = inner.split('').map((c: string) => superMap[c] || c).join('');
    if (converted !== inner && !converted.includes('{')) return converted;
    return `^(${inner})`;
  });
  text = text.replace(/\^(\d)/g, (_, d: string) => superMap[d] || `^${d}`);

  // 하첨자
  const subMap: Record<string, string> = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'n': 'ₙ', '+': '₊', '-': '₋',
  };
  text = text.replace(/_{([^{}]*)}/g, (_, inner: string) => {
    const converted = inner.split('').map((c: string) => subMap[c] || c).join('');
    if (converted !== inner && !converted.includes('{')) return converted;
    return `_(${inner})`;
  });
  text = text.replace(/_(\d)/g, (_, d: string) => subMap[d] || `_${d}`);

  // 그리스 문자
  const greekMap: Record<string, string> = {
    '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
    '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ',
    '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
    '\\sigma': 'σ', '\\tau': 'τ', '\\phi': 'φ', '\\varphi': 'φ',
    '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
    '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
    '\\Sigma': 'Σ', '\\Pi': 'Π', '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω',
  };
  for (const [cmd, char] of Object.entries(greekMap)) {
    text = text.replace(new RegExp(cmd.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), char);
  }

  // 수학 기호
  const symbolMap: Record<string, string> = {
    '\\times': '×', '\\div': '÷', '\\pm': '±', '\\mp': '∓',
    '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈',
    '\\equiv': '≡', '\\sim': '∼', '\\propto': '∝',
    '\\infty': '∞', '\\cdot': '·', '\\cdots': '⋯', '\\ldots': '…',
    '\\circ': '°', '\\degree': '°',
    '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\supset': '⊃',
    '\\subseteq': '⊆', '\\supseteq': '⊇',
    '\\cup': '∪', '\\cap': '∩', '\\emptyset': '∅',
    '\\forall': '∀', '\\exists': '∃',
    '\\rightarrow': '→', '\\leftarrow': '←', '\\Rightarrow': '⇒',
    '\\Leftarrow': '⇐', '\\leftrightarrow': '↔',
    '\\therefore': '∴', '\\because': '∵',
    '\\angle': '∠', '\\triangle': '△', '\\square': '□',
    '\\parallel': '∥', '\\perp': '⊥',
    '\\prime': '′', '\\dprime': '″',
    '\\neg': '¬', '\\land': '∧', '\\lor': '∨',
    '\\to': '→', '\\gets': '←',
    '\\le': '≤', '\\ge': '≥', '\\ne': '≠',
    '\\lt': '<', '\\gt': '>',
    '\\quad': '  ', '\\qquad': '    ',
    '\\,': ' ', '\\;': ' ', '\\:': ' ', '\\ ': ' ',
    '\\!': '',
  };
  for (const [cmd, char] of Object.entries(symbolMap)) {
    text = text.replace(new RegExp(cmd.replace(/\\/g, '\\\\').replace(/\|/g, '\\|') + '(?![a-zA-Z])', 'g'), char);
  }

  // 함수 이름
  const funcNames = ['log', 'ln', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'arcsin', 'arccos', 'arctan', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd'];
  for (const fn of funcNames) {
    text = text.replace(new RegExp(`\\\\${fn}(?![a-zA-Z])`, 'g'), fn);
  }

  // tabular/array 환경
  text = text.replace(/\\begin\{(?:tabular|array|matrix|pmatrix|bmatrix|cases)\}[^]*?\\end\{(?:tabular|array|matrix|pmatrix|bmatrix|cases)\}/g, (match) => {
    return match
      .replace(/\\begin\{[^}]*\}\{?[^}]*\}?/g, '')
      .replace(/\\end\{[^}]*\}/g, '')
      .replace(/\\hline/g, '')
      .replace(/\\\\/g, '\n')
      .replace(/&/g, '  ');
  });

  // 남은 LaTeX 명령 제거
  text = text.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1'); // \cmd{content} → content
  text = text.replace(/\\[a-zA-Z]+/g, ' ');
  text = text.replace(/[{}]/g, '');

  // 연속 공백 정리
  text = text.replace(/  +/g, ' ').trim();

  return text;
}

// ============================================================================
// content 파싱 → 일반 텍스트 (개선된 regex)
// ============================================================================

function parseContentToPlainText(content: string): string {
  if (!content) return '';

  // 이미지 마크다운 제거
  let text = content.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // \( ... \) 수식을 인라인으로 변환 (중첩 괄호 지원)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex: string) => latexToPlainText(latex));

  // $$ ... $$ display math
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex: string) => `\n${latexToPlainText(latex)}\n`);

  // $ ... $ inline math
  text = text.replace(/\$([^$\n]+)\$/g, (_, latex: string) => latexToPlainText(latex));

  // 남은 raw LaTeX 명령 정리
  text = text.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\[a-zA-Z]+/g, ' ');
  text = text.replace(/[{}]/g, '');

  // 연속 공백/빈줄 정리
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/  +/g, ' ');

  return text.trim();
}

// ============================================================================
// 이미지 URL → ArrayBuffer 가져오기
// ============================================================================

async function fetchImageBuffer(url: string): Promise<{ buffer: ArrayBuffer; width: number; height: number } | null> {
  try {
    // Supabase 스토리지 인증 헤더 추가
    const headers: Record<string, string> = {};
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (anonKey && url.includes('supabase')) {
      headers['apikey'] = anonKey;
      headers['Authorization'] = `Bearer ${anonKey}`;
    }

    const response = await fetch(url, { headers, mode: 'cors' });
    if (!response.ok) {
      console.warn(`[DOCX] Image fetch failed: ${response.status} for ${url.slice(0, 80)}...`);
      return null;
    }

    const blob = await response.blob();
    if (blob.size < 100) return null; // 너무 작으면 유효하지 않은 이미지

    const buffer = await blob.arrayBuffer();

    // 이미지 크기 파악 (Image API 사용)
    return new Promise((resolve) => {
      const img = new (globalThis.Image || HTMLImageElement)();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        resolve({ buffer, width: img.naturalWidth || 300, height: img.naturalHeight || 200 });
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        resolve({ buffer, width: 300, height: 200 });
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    });
  } catch (e) {
    console.warn('[DOCX] Image fetch error:', e);
    return null;
  }
}

// ============================================================================
// 시험 헤더 테이블 생성
// ============================================================================

function createHeaderTable(config: DocxExamConfig): Table {
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: '999999',
  };

  const cellBorders = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle,
  };

  const headerRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: '과목', bold: true, size: 20, font: 'Malgun Gothic' })],
          alignment: AlignmentType.CENTER,
        })],
        width: { size: 12, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        verticalAlign: 'center',
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: config.subject || '수학', bold: true, size: 22, font: 'Malgun Gothic' })],
        })],
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        verticalAlign: 'center',
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: config.title, bold: true, size: 24, font: 'Malgun Gothic' })],
          alignment: AlignmentType.CENTER,
        })],
        width: { size: 40, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        verticalAlign: 'center',
        columnSpan: 2,
      }),
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: '담당', bold: true, size: 20, font: 'Malgun Gothic' })],
          alignment: AlignmentType.CENTER,
        })],
        width: { size: 12, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        verticalAlign: 'center',
      }),
      new TableCell({
        children: [new Paragraph({ children: [] })],
        width: { size: 18, type: WidthType.PERCENTAGE },
        borders: cellBorders,
        verticalAlign: 'center',
      }),
    ],
  });

  return new Table({
    rows: [headerRow],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

// ============================================================================
// 선택지 번호 매핑
// ============================================================================

const CHOICE_PREFIXES = ['①', '②', '③', '④', '⑤'];

// ============================================================================
// 문제 → Paragraph 배열 변환 (이미지 포함)
// ============================================================================

async function problemToParagraphs(
  problem: DocxProblem,
  imageCache: Map<string, { buffer: ArrayBuffer; width: number; height: number }>,
): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = [];

  // 문제 본문 텍스트 변환
  const plainContent = parseContentToPlainText(problem.content);
  const lines = plainContent.split('\n').filter(l => l.trim());

  // 첫 줄: 문제 번호 + 본문
  const firstLine = lines[0] || '';
  const restLines = lines.slice(1);

  paragraphs.push(new Paragraph({
    children: [
      new TextRun({
        text: `${problem.number}. `,
        bold: true,
        size: 22,
        font: 'Malgun Gothic',
      }),
      new TextRun({
        text: firstLine,
        size: 22,
        font: 'Malgun Gothic',
      }),
      ...restLines.flatMap(line => [
        new TextRun({ break: 1 }),
        new TextRun({
          text: `    ${line.trim()}`,
          size: 22,
          font: 'Malgun Gothic',
        }),
      ]),
    ],
    spacing: { before: 240, after: 80 },
  }));

  // 이미지 삽입 (figureUrl이 있는 경우)
  if (problem.figureUrl) {
    const imgData = imageCache.get(problem.figureUrl);
    if (imgData) {
      // DOCX에 맞게 크기 조정 (2단 기준 최대 폭 200px, 1단 최대 300px)
      const maxW = 200;
      const maxH = 250;
      const scaleW = maxW / imgData.width;
      const scaleH = maxH / imgData.height;
      const scale = Math.min(1, scaleW, scaleH);
      const finalW = Math.round(imgData.width * scale);
      const finalH = Math.round(imgData.height * scale);

      // URL에서 이미지 포맷 감지
      const isPng = problem.figureUrl.includes('.png') || !problem.figureUrl.includes('.jpg');

      try {
        paragraphs.push(new Paragraph({
          children: [
            new ImageRun({
              data: imgData.buffer,
              transformation: { width: finalW, height: finalH },
              type: isPng ? 'png' : 'jpg',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 80 },
        }));
      } catch (e) {
        console.warn('[DOCX] Image embed failed:', e);
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: '    [그림 참조]',
            italics: true,
            size: 20,
            font: 'Malgun Gothic',
            color: '888888',
          })],
          spacing: { before: 40, after: 40 },
        }));
      }
    } else {
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: '    [그림 참조]',
          italics: true,
          size: 20,
          font: 'Malgun Gothic',
          color: '888888',
        })],
        spacing: { before: 40, after: 40 },
      }));
    }
  }

  // 선택지
  if (problem.choices.length > 0) {
    const choiceTexts = problem.choices.map((choice, i) => {
      // 기존 번호 제거 후 새 번호 부여
      const stripped = choice
        .replace(/^[①②③④⑤]\s*/, '')
        .replace(/^\(\s*\d+\s*\)\s*/, '')
        .replace(/^\d+[.)]\s*/, '');
      const prefix = CHOICE_PREFIXES[i] || `(${i + 1})`;
      const convertedText = latexToPlainText(stripped);
      return { prefix, text: convertedText };
    });

    // 선택지 길이에 따라 레이아웃 결정
    const maxLen = Math.max(...choiceTexts.map(c => c.text.length));

    if (maxLen <= 8) {
      // 짧은 선택지: 한 줄에 모두 배치
      const allChoices = choiceTexts.map(c => `${c.prefix} ${c.text}`).join('    ');
      paragraphs.push(new Paragraph({
        children: [new TextRun({
          text: `    ${allChoices}`,
          size: 21,
          font: 'Malgun Gothic',
        })],
        spacing: { before: 60, after: 60 },
      }));
    } else if (maxLen <= 20) {
      // 중간 길이: 2개씩 배치
      for (let i = 0; i < choiceTexts.length; i += 2) {
        const line = `    ${choiceTexts[i].prefix} ${choiceTexts[i].text}` +
          (i + 1 < choiceTexts.length ? `        ${choiceTexts[i + 1].prefix} ${choiceTexts[i + 1].text}` : '');
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: line,
            size: 21,
            font: 'Malgun Gothic',
          })],
          spacing: { before: 30, after: 30 },
        }));
      }
    } else {
      // 긴 선택지: 각각 한 줄
      for (const choice of choiceTexts) {
        paragraphs.push(new Paragraph({
          children: [new TextRun({
            text: `    ${choice.prefix} ${choice.text}`,
            size: 21,
            font: 'Malgun Gothic',
          })],
          spacing: { before: 30, after: 30 },
        }));
      }
    }
  }

  return paragraphs;
}

// ============================================================================
// 정답표 생성
// ============================================================================

function createAnswerTable(problems: DocxProblem[]): Table {
  const borderStyle = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: '666666',
  };
  const cellBorders = {
    top: borderStyle,
    bottom: borderStyle,
    left: borderStyle,
    right: borderStyle,
  };

  const halfLen = Math.ceil(problems.length / 2);

  // 헤더 행
  const headerRow = new TableRow({
    children: [
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: '문항', bold: true, size: 18, font: 'Malgun Gothic' })], alignment: AlignmentType.CENTER })],
        borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        width: { size: 15, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: '정답', bold: true, size: 18, font: 'Malgun Gothic' })], alignment: AlignmentType.CENTER })],
        borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        width: { size: 35, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: '문항', bold: true, size: 18, font: 'Malgun Gothic' })], alignment: AlignmentType.CENTER })],
        borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        width: { size: 15, type: WidthType.PERCENTAGE },
      }),
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: '정답', bold: true, size: 18, font: 'Malgun Gothic' })], alignment: AlignmentType.CENTER })],
        borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' },
        width: { size: 35, type: WidthType.PERCENTAGE },
      }),
    ],
  });

  const rows = [headerRow];

  for (let i = 0; i < halfLen; i++) {
    const leftP = problems[i];
    const rightP = i + halfLen < problems.length ? problems[i + halfLen] : null;

    const answerToText = (answer: number | string) => {
      if (typeof answer === 'number') {
        return CHOICE_PREFIXES[answer - 1] || String(answer);
      }
      return String(answer);
    };

    rows.push(new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(leftP.number), bold: true, size: 20, font: 'Malgun Gothic' })], alignment: AlignmentType.CENTER })],
          borders: cellBorders,
          shading: i % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F0F6FF' } : undefined,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: answerToText(leftP.answer), bold: true, size: 22, font: 'Malgun Gothic', color: '2563EB' })], alignment: AlignmentType.CENTER })],
          borders: cellBorders,
          shading: i % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F0F6FF' } : undefined,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: rightP ? String(rightP.number) : '', bold: true, size: 20, font: 'Malgun Gothic' })], alignment: AlignmentType.CENTER })],
          borders: cellBorders,
          shading: i % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F0F6FF' } : undefined,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: rightP ? answerToText(rightP.answer) : '', bold: true, size: 22, font: 'Malgun Gothic', color: '2563EB' })], alignment: AlignmentType.CENTER })],
          borders: cellBorders,
          shading: i % 2 === 1 ? { type: ShadingType.CLEAR, fill: 'F0F6FF' } : undefined,
        }),
      ],
    }));
  }

  return new Table({
    rows,
    width: { size: 80, type: WidthType.PERCENTAGE },
  });
}

// ============================================================================
// 해설지 Paragraph 배열 생성
// ============================================================================

function solutionToParagraphs(problem: DocxProblem): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (!problem.solution) {
    return paragraphs;
  }

  const answerText = typeof problem.answer === 'number'
    ? CHOICE_PREFIXES[problem.answer - 1] || String(problem.answer)
    : String(problem.answer);

  // 문제 번호 + 정답
  paragraphs.push(new Paragraph({
    children: [
      new TextRun({
        text: `${problem.number}. `,
        bold: true,
        size: 22,
        font: 'Malgun Gothic',
      }),
      new TextRun({
        text: `[정답: ${answerText}]`,
        bold: true,
        size: 20,
        font: 'Malgun Gothic',
        color: '2563EB',
      }),
    ],
    spacing: { before: 240, after: 80 },
  }));

  // 해설 내용
  const solutionText = parseContentToPlainText(problem.solution);
  const lines = solutionText.split('\n').filter(l => l.trim());

  if (lines.length > 0) {
    paragraphs.push(new Paragraph({
      children: lines.flatMap((line, idx) => {
        const runs: TextRun[] = [];
        if (idx > 0) runs.push(new TextRun({ break: 1 }));
        runs.push(new TextRun({
          text: line.trim(),
          size: 20,
          font: 'Malgun Gothic',
        }));
        return runs;
      }),
      indent: { left: 360 },
      spacing: { before: 40, after: 80 },
    }));
  }

  // 구분선 역할 빈 줄
  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: '─'.repeat(40), size: 14, color: 'CCCCCC', font: 'Malgun Gothic' })],
    spacing: { before: 40, after: 40 },
  }));

  return paragraphs;
}

// ============================================================================
// 메인: DOCX 생성
// ============================================================================

export async function generateExamDocx(
  problems: DocxProblem[],
  config: DocxExamConfig,
): Promise<Blob> {
  // 이미지 사전 다운로드 (실패해도 DOCX 생성 계속)
  const imageCache = new Map<string, { buffer: ArrayBuffer; width: number; height: number }>();
  try {
    const imageUrls = problems
      .filter(p => p.figureUrl)
      .map(p => p.figureUrl!);

    if (imageUrls.length > 0) {
      await Promise.allSettled(
        imageUrls.map(async (url) => {
          try {
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
            const fetchPromise = fetchImageBuffer(url);
            const result = await Promise.race([fetchPromise, timeoutPromise]);
            if (result) {
              imageCache.set(url, result);
            }
          } catch {
            // 개별 이미지 실패 무시
          }
        })
      );
    }
    console.log(`[DOCX] Images loaded: ${imageCache.size}/${problems.filter(p => p.figureUrl).length}`);
  } catch (e) {
    console.warn('[DOCX] Image loading failed, continuing without images:', e);
  }

  // 문제 → Paragraph 배열 변환 (비동기)
  const allParagraphs: Paragraph[] = [];
  for (const problem of problems) {
    const paras = await problemToParagraphs(problem, imageCache);
    allParagraphs.push(...paras);
  }

  // 섹션 구성
  const sections: any[] = [];

  // 1. 시험지 섹션
  sections.push({
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: 1134, right: 850, bottom: 1134, left: 850 },
      },
      column: config.columns === 2 ? {
        count: 2,
        space: 708, // ~0.5 inch
        separate: true,
      } : undefined,
    },
    children: [
      createHeaderTable(config),
      new Paragraph({ spacing: { before: 200 } }),
      ...allParagraphs,
    ],
  });

  // 2. 빠른정답 섹션
  if (config.showAnswerSheet !== false) {
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      children: [
        new Paragraph({
          children: [new TextRun({ text: config.title, bold: true, size: 28, font: 'Malgun Gothic' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '빠른 정답', size: 22, color: '666666', font: 'Malgun Gothic' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        }),
        createAnswerTable(problems),
      ],
    });
  }

  // 3. 해설지 섹션
  if (config.showSolutions !== false) {
    const solutionParagraphs: Paragraph[] = [];
    for (const problem of problems) {
      solutionParagraphs.push(...solutionToParagraphs(problem));
    }

    if (solutionParagraphs.length > 0) {
      sections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 850, bottom: 1134, left: 850 },
          },
          column: config.columns === 2 ? {
            count: 2,
            space: 708,
            separate: true,
          } : undefined,
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: config.title, bold: true, size: 28, font: 'Malgun Gothic' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: '해설지', size: 22, color: '666666', font: 'Malgun Gothic' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          ...solutionParagraphs,
        ],
      });
    }
  }

  const doc = new Document({
    sections,
    styles: {
      default: {
        document: {
          run: {
            font: 'Malgun Gothic',
            size: 22,
          },
        },
      },
    },
  });

  const buffer = await Packer.toBlob(doc);
  return buffer;
}

// ============================================================================
// 다운로드 헬퍼
// ============================================================================

export async function downloadExamDocx(
  problems: DocxProblem[],
  config: DocxExamConfig,
  filename?: string,
): Promise<void> {
  try {
    const blob = await generateExamDocx(problems, config);
    const downloadName = filename || `${config.title}.docx`;

    // navigator.msSaveBlob fallback (IE/Edge legacy)
    if (typeof (navigator as any).msSaveBlob === 'function') {
      (navigator as any).msSaveBlob(blob, downloadName);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    link.style.display = 'none';
    document.body.appendChild(link);

    // 클릭 후 cleanup
    link.click();

    // 약간의 지연 후 정리 (브라우저 다운로드 완료 대기)
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (e) {
    console.error('[DOCX] Generation failed:', e);
    alert('DOCX 파일 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
}
