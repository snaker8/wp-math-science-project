// ============================================================================
// HWPX Generator — 텍스트 + 수식 기반 (편집 가능)
// LaTeX → HWP 수식 변환 후 HWPX 파일 생성
// ============================================================================

import JSZip from 'jszip';

// ============================================================================
// Types
// ============================================================================

export interface HwpxProblem {
  number: number;
  content: string;       // LaTeX 포함 텍스트 (content_latex)
  choices: string[];     // 선택지 ①~⑤
  answer?: number | string;
  solution?: string;
  points?: number;
}

export interface HwpxExamConfig {
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
// LaTeX → HWP 수식 변환
// ============================================================================

function latexToHWPEquation(latex: string): string {
  let eq = latex.trim();

  // 수식 래퍼 제거
  eq = eq.replace(/^\\\(|\\\)$/g, '');
  eq = eq.replace(/^\$\$?|\$\$?$/g, '');
  eq = eq.trim();

  // \frac{a}{b} → {a} over {b}
  for (let i = 0; i < 5; i++) {
    eq = eq.replace(
      /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
      '{$1} over {$2}'
    );
  }

  // \sqrt[n]{x} → root n of {x}
  eq = eq.replace(/\\sqrt\[(\d+)\]\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, 'root $1 of {$2}');

  // \sqrt{x} → sqrt {x}
  eq = eq.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, 'sqrt {$1}');
  eq = eq.replace(/\\sqrt\s*(\d)/g, 'sqrt {$1}');

  // \log_{b} → log _{b}
  eq = eq.replace(/\\log_\{([^{}]*)\}/g, 'log _{$1}');
  eq = eq.replace(/\\log_(\w)/g, 'log _{$1}');
  eq = eq.replace(/\\log\b/g, 'log');

  // \ln → ln
  eq = eq.replace(/\\ln\b/g, 'ln');

  // 삼각함수
  for (const fn of ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan']) {
    eq = eq.replace(new RegExp(`\\\\${fn}\\b`, 'g'), fn);
  }

  // \lim_{x \to a} → lim from {x -> a}
  eq = eq.replace(/\\lim_\{([^{}]*?)\\to\s*([^{}]*?)\}/g, 'lim from {$1 -> $2}');
  eq = eq.replace(/\\lim\b/g, 'lim');

  // \sum_{a}^{b} → sum from {a} to {b}
  eq = eq.replace(/\\sum_\{([^{}]*)\}\^\{([^{}]*)\}/g, 'sum from {$1} to {$2}');
  eq = eq.replace(/\\sum\b/g, 'sum');

  // \prod_{a}^{b} → prod from {a} to {b}
  eq = eq.replace(/\\prod_\{([^{}]*)\}\^\{([^{}]*)\}/g, 'prod from {$1} to {$2}');
  eq = eq.replace(/\\prod\b/g, 'prod');

  // \int_{a}^{b} → int from {a} to {b}
  eq = eq.replace(/\\int_\{([^{}]*)\}\^\{([^{}]*)\}/g, 'int from {$1} to {$2}');
  eq = eq.replace(/\\int\b/g, 'int');

  // \overline{x} → overline {x}
  eq = eq.replace(/\\overline\{([^{}]*)\}/g, 'overline {$1}');
  eq = eq.replace(/\\bar\{([^{}]*)\}/g, 'bar {$1}');

  // \vec{x} → vec {x}
  eq = eq.replace(/\\vec\{([^{}]*)\}/g, 'vec {$1}');

  // 행렬: \begin{pmatrix}...\end{pmatrix} → matrix { ... }
  eq = eq.replace(/\\begin\{(?:pmatrix|bmatrix|matrix)\}([\s\S]*?)\\end\{(?:pmatrix|bmatrix|matrix)\}/g, (_, content: string) => {
    const rows = content.split('\\\\').map((r: string) => r.trim().replace(/&/g, '#'));
    return `matrix {${rows.join(' ## ')}}`;
  });

  // cases: \begin{cases}...\end{cases} → cases { ... }
  eq = eq.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_, content: string) => {
    const rows = content.split('\\\\').map((r: string) => r.trim().replace(/&/g, '#'));
    return `cases {${rows.join(' ## ')}}`;
  });

  // 그리스 문자
  const greekMap: Record<string, string> = {
    '\\alpha': 'alpha', '\\beta': 'beta', '\\gamma': 'gamma', '\\delta': 'delta',
    '\\epsilon': 'epsilon', '\\varepsilon': 'epsilon', '\\theta': 'theta',
    '\\lambda': 'lambda', '\\mu': 'mu', '\\nu': 'nu', '\\xi': 'xi',
    '\\pi': 'pi', '\\rho': 'rho', '\\sigma': 'sigma', '\\tau': 'tau',
    '\\phi': 'phi', '\\varphi': 'phi', '\\chi': 'chi', '\\psi': 'psi', '\\omega': 'omega',
    '\\Gamma': 'GAMMA', '\\Delta': 'DELTA', '\\Theta': 'THETA', '\\Lambda': 'LAMBDA',
    '\\Sigma': 'SIGMA', '\\Pi': 'PI', '\\Phi': 'PHI', '\\Psi': 'PSI', '\\Omega': 'OMEGA',
  };
  for (const [tex, hwp] of Object.entries(greekMap)) {
    eq = eq.replace(new RegExp(tex.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), hwp);
  }

  // 수학 기호
  const symbolMap: Record<string, string> = {
    '\\times': 'times', '\\div': 'div', '\\pm': 'pm', '\\mp': 'mp', '\\cdot': 'cdot',
    '\\leq': 'leq', '\\le': 'leq', '\\geq': 'geq', '\\ge': 'geq',
    '\\neq': 'neq', '\\ne': 'neq', '\\approx': 'approx', '\\equiv': 'equiv',
    '\\sim': 'sim', '\\infty': 'infty',
    '\\in': 'in', '\\notin': 'notin', '\\subset': 'subset', '\\supset': 'supset',
    '\\cup': 'cup', '\\cap': 'cap', '\\emptyset': 'emptyset',
    '\\forall': 'forall', '\\exists': 'exists',
    '\\rightarrow': 'rightarrow', '\\to': 'rightarrow',
    '\\leftarrow': 'leftarrow', '\\gets': 'leftarrow',
    '\\Rightarrow': 'Rightarrow', '\\Leftarrow': 'Leftarrow',
    '\\leftrightarrow': 'leftrightarrow',
    '\\therefore': 'therefore', '\\because': 'because',
    '\\angle': 'angle', '\\triangle': 'triangle',
    '\\parallel': 'parallel', '\\perp': 'perp',
    '\\prime': '`',
  };
  for (const [tex, hwp] of Object.entries(symbolMap)) {
    eq = eq.replace(new RegExp(tex.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), hwp);
  }

  // \left, \right 제거
  eq = eq.replace(/\\left\s*/g, '');
  eq = eq.replace(/\\right\s*/g, '');

  // \mathrm, \text, \textbf 등
  eq = eq.replace(/\\(?:mathrm|text|textbf|mathbf|boldsymbol|operatorname)\{([^{}]*)\}/g, '"$1"');

  // 남은 LaTeX 명령 정리
  eq = eq.replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, '$1');
  eq = eq.replace(/\\[a-zA-Z]+/g, '');

  // 공백 정리
  eq = eq.replace(/\s+/g, ' ').trim();

  return eq;
}

// ============================================================================
// 컨텐츠 파싱: HTML/LaTeX → 텍스트 + 수식 세그먼트
// ============================================================================

interface ContentSegment {
  type: 'text' | 'equation';
  value: string;
}

function parseContent(content: string): ContentSegment[] {
  if (!content) return [];

  // HTML 태그 제거 (기본적인 것만)
  let text = content;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');

  const segments: ContentSegment[] = [];

  // \( ... \) 또는 $ ... $ 패턴으로 수식과 텍스트 분리
  const mathPattern = /\\\((.+?)\\\)|\$\$(.+?)\$\$|\$(.+?)\$/g;
  let lastIndex = 0;
  let match;

  while ((match = mathPattern.exec(text)) !== null) {
    // 수식 앞 텍스트
    if (match.index > lastIndex) {
      const t = text.slice(lastIndex, match.index).trim();
      if (t) segments.push({ type: 'text', value: t });
    }

    // 수식
    const latex = match[1] || match[2] || match[3];
    const hwpEq = latexToHWPEquation(latex);
    if (hwpEq) segments.push({ type: 'equation', value: hwpEq });

    lastIndex = match.index + match[0].length;
  }

  // 남은 텍스트
  if (lastIndex < text.length) {
    const t = text.slice(lastIndex).trim();
    if (t) segments.push({ type: 'text', value: t });
  }

  // 수식이 없으면 전체를 텍스트로
  if (segments.length === 0 && text.trim()) {
    segments.push({ type: 'text', value: text.trim() });
  }

  return segments;
}

// ============================================================================
// XML 이스케이프
// ============================================================================

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// HWPX XML 생성
// ============================================================================

// A4 크기 (HUnit: 1/7200 inch)
const A4_W = 59528;
const A4_H = 84188;
const MARGIN = 2835;  // ~10mm
const COL_GAP = 1134; // ~4mm

function mimetypeFile(): string {
  return 'application/hwp+zip';
}

function versionXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HWPVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" major="1" minor="2" micro="0" buildNumber="0"/>`;
}

function manifestXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <odf:file-entry odf:media-type="application/hwp+zip" odf:full-path="/"/>
  <odf:file-entry odf:media-type="text/xml" odf:full-path="Contents/content.hpf"/>
  <odf:file-entry odf:media-type="text/xml" odf:full-path="Contents/section0.xml"/>
</odf:manifest>`;
}

function contentHpf(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hc:HWPDocumentPackage xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">
  <hc:DocInfo>
    <hc:IdMappings FontFaceCount="2" BorderFillCount="1" CharShapeCount="3" ParaShapeCount="3">
      <hc:FontFaces>
        <hc:FontFace Lang="HANGUL"><hc:Font Id="0" Type="TTF" Name="함초롬돋움"/></hc:FontFace>
        <hc:FontFace Lang="LATIN"><hc:Font Id="0" Type="TTF" Name="함초롬돋움"/></hc:FontFace>
      </hc:FontFaces>
      <hc:BorderFills>
        <hc:BorderFill Id="1">
          <hc:FillBrush><hc:WinBrush FaceColor="white" HatchColor="black"/></hc:FillBrush>
        </hc:BorderFill>
      </hc:BorderFills>
      <hc:CharShapes>
        <hc:CharShape Id="0" Height="1000"><hc:FontRef Hangul="0" Latin="0"/></hc:CharShape>
        <hc:CharShape Id="1" Height="1400" Bold="1"><hc:FontRef Hangul="0" Latin="0"/></hc:CharShape>
        <hc:CharShape Id="2" Height="1100"><hc:FontRef Hangul="0" Latin="0"/></hc:CharShape>
      </hc:CharShapes>
      <hc:ParaShapes>
        <hc:ParaShape Id="0" Align="JUSTIFY">
          <hc:Margin Left="0" Right="0" Indent="0" Top="0" Bottom="200"/>
        </hc:ParaShape>
        <hc:ParaShape Id="1" Align="CENTER">
          <hc:Margin Left="0" Right="0" Indent="0" Top="0" Bottom="400"/>
        </hc:ParaShape>
        <hc:ParaShape Id="2" Align="JUSTIFY">
          <hc:Margin Left="400" Right="0" Indent="0" Top="0" Bottom="100"/>
        </hc:ParaShape>
      </hc:ParaShapes>
    </hc:IdMappings>
  </hc:DocInfo>
  <hc:BodyText>
    <hc:SectionRef Src="Contents/section0.xml"/>
  </hc:BodyText>
</hc:HWPDocumentPackage>`;
}

// 수식을 HWP eqEdit 형식으로 감싸기
function eqRun(hwpEq: string, charShapeId: number = 0): string {
  return `<hp:run charShapeId="${charShapeId}"><hp:secPr><hp:equation version="60"><![CDATA[${hwpEq}]]></hp:equation></hp:secPr></hp:run>`;
}

// 텍스트 run 생성
function textRun(text: string, charShapeId: number = 0): string {
  return `<hp:run charShapeId="${charShapeId}"><hp:t>${escXml(text)}</hp:t></hp:run>`;
}

// 단락 생성
function paragraph(runs: string, paraShapeId: number = 0): string {
  return `    <hp:p paraPrId="${paraShapeId}" styleId="0">\n      ${runs}\n    </hp:p>`;
}

// 세그먼트 배열 → run들 문자열
function segmentsToRuns(segments: ContentSegment[], charShapeId: number = 0): string {
  return segments.map(seg => {
    if (seg.type === 'equation') return eqRun(seg.value, charShapeId);
    return textRun(seg.value, charShapeId);
  }).join('\n      ');
}

function buildSectionXml(problems: HwpxProblem[], config: HwpxExamConfig): string {
  const paras: string[] = [];

  // 제목
  paras.push(paragraph(textRun(config.title, 1), 1));

  // 부제목
  if (config.subtitle) {
    paras.push(paragraph(textRun(config.subtitle, 2), 1));
  }

  // 학원명
  if (config.instituteName) {
    paras.push(paragraph(textRun(config.instituteName, 0), 1));
  }

  // 이름/반 필드
  if (config.showNameField !== false) {
    paras.push(paragraph(textRun('이름: ________________    반: ________    날짜: ________', 0), 0));
  }

  // 빈 줄
  paras.push(paragraph(textRun(' ', 0), 0));

  // 문제들
  for (const prob of problems) {
    // 문제 번호 + 내용
    const contentSegs = parseContent(prob.content);
    const pointsStr = prob.points ? ` [${prob.points}점]` : '';
    const numberRun = textRun(`${prob.number}. `, 2);
    const contentRuns = segmentsToRuns(contentSegs, 0);
    const pointsRun = pointsStr ? textRun(pointsStr, 0) : '';

    paras.push(paragraph(`${numberRun}\n      ${contentRuns}${pointsRun}`, 0));

    // 선택지
    if (prob.choices && prob.choices.length > 0) {
      const circleNums = ['①', '②', '③', '④', '⑤'];
      for (let i = 0; i < prob.choices.length; i++) {
        const choiceSegs = parseContent(prob.choices[i]);
        const choicePrefix = textRun(`    ${circleNums[i] || `(${i + 1})`} `, 0);
        const choiceRuns = segmentsToRuns(choiceSegs, 0);
        paras.push(paragraph(`${choicePrefix}${choiceRuns}`, 2));
      }
    }

    // 문제 간 간격
    paras.push(paragraph(textRun(' ', 0), 0));
  }

  // 정답표
  if (config.showAnswerSheet !== false) {
    paras.push(paragraph(textRun(' ', 0), 0));
    paras.push(paragraph(textRun('[ 정답 ]', 1), 1));
    const answers = problems
      .filter(p => p.answer !== undefined)
      .map(p => `${p.number}번: ${p.answer}`)
      .join('    ');
    if (answers) {
      paras.push(paragraph(textRun(answers, 0), 0));
    }
  }

  // 해설
  if (config.showSolutions) {
    paras.push(paragraph(textRun(' ', 0), 0));
    paras.push(paragraph(textRun('[ 해설 ]', 1), 1));
    for (const prob of problems) {
      if (prob.solution) {
        const solSegs = parseContent(prob.solution);
        const numRun = textRun(`${prob.number}. `, 2);
        const solRuns = segmentsToRuns(solSegs, 0);
        paras.push(paragraph(`${numRun}${solRuns}`, 0));
      }
    }
  }

  const colCount = config.columns || 1;
  const colDef = colCount === 2
    ? `<hs:colDef Type="NEWSPAPER" Count="${colCount}" SameWidth="1" Gap="${COL_GAP}"/>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
  <hs:secPr>
    <hs:grid lineGrid="0" charGrid="0"/>
    <hs:startNum pageStartsOn="BOTH" page="0"/>
    ${colDef}
    <hs:pagePr landscape="0" width="${A4_W}" height="${A4_H}">
      <hs:margin left="${MARGIN}" right="${MARGIN}" top="${MARGIN}" bottom="${MARGIN}" header="850" footer="850" gutter="0"/>
    </hs:pagePr>
  </hs:secPr>
${paras.join('\n')}
</hs:sec>`;
}

// ============================================================================
// 메인 생성 / 다운로드
// ============================================================================

export async function generateHWPX(
  problems: HwpxProblem[],
  config: HwpxExamConfig,
): Promise<Blob> {
  const zip = new JSZip();

  // ★ mimetype: 첫 번째, 비압축 (STORE)
  zip.file('mimetype', mimetypeFile(), { compression: 'STORE' });

  // META-INF/manifest.xml (DEFLATE)
  zip.file('META-INF/manifest.xml', manifestXml());

  // version.xml (DEFLATE)
  zip.file('version.xml', versionXml());

  // Contents/content.hpf (DEFLATE)
  zip.file('Contents/content.hpf', contentHpf());

  // Contents/section0.xml (DEFLATE)
  zip.file('Contents/section0.xml', buildSectionXml(problems, config));

  // Preview/PrvText.txt (DEFLATE)
  const previewText = problems.map(p => `${p.number}. ${(p.content || '').replace(/<[^>]*>/g, '').slice(0, 50)}`).join('\r\n');
  zip.file('Preview/PrvText.txt', previewText);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/hwp+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function downloadHWPX(
  problems: HwpxProblem[],
  config: HwpxExamConfig,
  filename?: string,
): Promise<void> {
  const blob = await generateHWPX(problems, config);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${config.title || 'exam'}.hwpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// Re-export for testing
export { latexToHWPEquation, parseContent };
