// ============================================================================
// HML(한글 XML, 수학비서/포스트매스 내보내기) 파서 — OCR 없이 문제 추출.
//   HML 은 UTF-8 XML: 본문 <CHAR>, 수식 <EQUATION><SCRIPT>(한글 마크업),
//   그림 <PICTURE>(+ <BINDATA Encoding="Base64"> PNG). LibreOffice 불필요.
//
//   출력: saveEditedProblemsDirect 의 editedProblems 와 호환되는 문제 배열.
//   (number, content, choices[], answer?, cropImageBase64? 등)
//
//   ★ EQUATION 안에는 렌더 이미지 base64(SHAPEOBJECT>CAPTION>...>CHAR)가 섞여 있어
//     반드시 <SCRIPT> 직계 텍스트만 취하고 나머지 서브트리는 버린다(검증 완료).
// ============================================================================

import { XMLParser } from 'fast-xml-parser';
import { inflateRawSync, inflateSync } from 'zlib';
import { hangulEquationToInlineLatex } from './hangul-equation';
import { detectTabularChoices } from './tabular-choices';

export interface HmlProblem {
  number: number;
  content: string;            // 본문 (텍스트 + $LaTeX$ + [도형] 마커)
  choices: string[];          // ①~⑤ 보기 (없으면 빈 배열 = 서답형)
  answer: string;             // [정답] 마커에서 추출 (①~⑤ 또는 빈 문자열)
  imagesBase64: string[];     // 본문(stem) 그림 dataURL
  choiceImagesBase64: (string | null)[]; // 보기별 그림 (그림 객관식). 빈 배열=텍스트 보기
  choiceHeaders?: string[];   // 표 객관식 컬럼 헤더 (있으면 보기는 | 로 셀 구분)
  choiceLayout?: number;      // ★ 원본 보기 배치 감지값 (5=가로/3=3열/2=2열/1=세로). 자산화 answer_json 기본값용. undefined=불명.
}

export interface HmlParseResult {
  title: string;
  problems: HmlProblem[];
  rawLineCount: number;
}

type OrderedNode = Record<string, unknown> & { ':@'?: Record<string, string> };

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

function tagOf(node: OrderedNode): string {
  for (const k of Object.keys(node)) if (k !== ':@' && k !== '#text') return k;
  return '';
}

/** 매직바이트로 실제 이미지 MIME 판별 (Format 속성보다 신뢰) */
function sniffImageMime(buf: Buffer): string {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'; // "BM"
  if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (buf.length >= 4 && ((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d))) return 'image/tiff';
  return ''; // 미지 (WMF/EMF 등 벡터 — 브라우저 렌더 불가)
}

/** BINDATALIST(헤더) → { binId: dataURL } 맵 */
function collectBinData(root: OrderedNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (tag === 'BINDATA') {
        const attrs = n[':@'] || {};
        const id = attrs['Id'] || attrs['BinData'] || attrs['id'];
        const fmtAttr = (attrs['Format'] || 'png').toLowerCase();
        // ★ Compress="true" → zlib/raw-deflate 압축 (해강중 #8 BMP 사고). 안 풀면 깨진 이미지.
        const compressed = String(attrs['Compress'] || '').toLowerCase() === 'true';
        const children = (n[tag] as OrderedNode[]) || [];
        const text = children.map((c) => (c['#text'] as string) || '').join('').trim();
        if (id && text) {
          let buf = Buffer.from(text, 'base64');
          if (compressed) {
            // HWP HML 은 raw-deflate(헤더 없음)가 일반적 — raw 먼저, 안 되면 zlib.
            try { buf = inflateRawSync(buf); }
            catch { try { buf = inflateSync(buf); } catch { /* 압축 해제 실패 시 원본 유지 */ } }
          }
          // ★ Format 속성이 'png' 여도 실제는 BMP/JPEG 인 경우가 있어 매직바이트 우선.
          const mime = sniffImageMime(buf) || `image/${fmtAttr}`;
          map.set(String(id), `data:${mime};base64,${buf.toString('base64')}`);
        }
      }
      const children = n[tag] as OrderedNode[] | undefined;
      if (Array.isArray(children)) walk(children);
    }
  };
  walk(root);
  return map;
}

/** EQUATION 노드에서 <SCRIPT> 직계 텍스트만 추출 */
function extractScript(eqChildren: OrderedNode[]): string {
  for (const c of eqChildren) {
    if (tagOf(c) === 'SCRIPT') {
      const kids = (c['SCRIPT'] as OrderedNode[]) || [];
      return kids.map((k) => (k['#text'] as string) || '').join('');
    }
  }
  // 한 단계 깊이까지만 추가 탐색 (SCRIPT 가 직계가 아닌 변형 대비) — SHAPEOBJECT 는 제외
  for (const c of eqChildren) {
    const t = tagOf(c);
    if (t === 'SHAPEOBJECT' || t === 'SCRIPT') continue;
    const kids = c[t] as OrderedNode[] | undefined;
    if (Array.isArray(kids)) {
      const r = extractScript(kids);
      if (r) return r;
    }
  }
  return '';
}

/**
 * HWP ML 표(<TABLE><ROW><CELL>) → `\begin{tabular}` 복원.
 *   ★ 기존엔 표 처리가 없어 셀 <P> 들이 개별로 긁혀 "$x$$1$$3$$c$$7$$y$…" 처럼 구조 없이
 *     이어붙던 사고(거제여중 #2). 행·열을 보존해 격자 표로 렌더(렌더러 #379 다열표 테두리 유지).
 *   셀 내용은 renderParagraph 재귀로 텍스트+$수식$ 추출. 빈 셀은 유지(열 정렬).
 */
/** CELL 내부를 P(문단) 단위 줄 배열로 — base64 누출 줄 제거. 박스 줄 구조 보존용. */
function renderCellLines(
  cellNodes: OrderedNode[],
  binData: Map<string, string>,
  imagesOut: string[],
): string[] {
  const lines: string[] = [];
  const findP = (nodes: OrderedNode[]) => {
    for (const x of nodes) {
      const t = tagOf(x);
      if (t === 'P') {
        const txt = renderParagraph((x['P'] as OrderedNode[]) || [], binData, imagesOut, [])
          .replace(/[ \t]+/g, ' ').trim();
        // 이미지 데이터(base64 런) 누출 줄 제거 — 수식 렌더 이미지가 P 텍스트로 새는 경우(거제여중 #18)
        const cleaned = txt.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '').trim();
        if (cleaned) lines.push(cleaned);
      } else {
        const ch = x[t] as OrderedNode[] | undefined;
        if (Array.isArray(ch)) findP(ch);
      }
    }
  };
  findP(cellNodes);
  return lines;
}

function renderTableToTabular(
  tableNodes: OrderedNode[],
  binData: Map<string, string>,
  imagesOut: string[],
): string {
  const rows: string[][][] = []; // ROW → CELL → 줄[]
  const walkRows = (nodes: OrderedNode[]) => {
    for (const rn of nodes) {
      const t = tagOf(rn);
      if (t === 'ROW') {
        const cells: string[][] = [];
        for (const cn of (rn['ROW'] as OrderedNode[]) || []) {
          if (tagOf(cn) === 'CELL') {
            cells.push(renderCellLines((cn['CELL'] as OrderedNode[]) || [], binData, imagesOut));
          }
        }
        rows.push(cells);
      } else {
        const ch = rn[t] as OrderedNode[] | undefined;
        if (Array.isArray(ch)) walkRows(ch);
      }
    }
  };
  walkRows(tableNodes);
  const valid = rows.filter((r) => r.length > 0);
  if (!valid.length) return '';
  const cellText = (lines: string[]) => lines.join(' ').replace(/\s+/g, ' ').trim();
  const colN = Math.max(...valid.map((r) => r.length));

  // ★ "데이터 표"만 격자로 변환. <보기>/<조건> 박스(HWP도 표로 저장)는 ''반환 → 호출부가 기존
  //   텍스트 처리(normalizeBogiBox/조건박스)로 폴백. 안 그러면 보기/조건 박스가 깨진 표로 렌더됨.
  //   판정: 2행↑ + 2열↑ + 셀 60%↑ 채워짐 + 박스 헤더(보기/조건/규칙/참고) 없음.
  const allCells = valid.flat().map(cellText);
  // ★ 이미지가 든 표(그림 객관식·그림 나열·그림+설명 그리드)는 데이터표(\begin{tabular})로 변환 금지.
  //   렌더러가 이미지 표를 격자로 못 그려 \begin{tabular}·&·\hline 마크업이 리터럴로 새고, 그림 객관식은
  //   splitChoices 가 표 중간 ① 에서 본문을 잘라 \begin{tabular} 가 열린 채 남는 사고(온천중 #10/#21/#22).
  //   [도형] 2개↑ 면 '' 반환 → 인라인 펼침: ①②③④⑤=보기·[도형]=보기이미지, 그 외는 이미지+텍스트 순차.
  const figureCells = allCells.filter((c) => /\[도형\]/.test(c)).length;
  if (figureCells >= 2) return '';
  const filled = allCells.filter((c) => c.trim()).length;
  const isBoxHeader = /보\s*기|조건|규칙|참고/.test(allCells.join(' '));
  const dense = allCells.length > 0 && filled / allCells.length >= 0.6;
  const isDataTable = valid.length >= 2 && colN >= 2 && dense && !isBoxHeader;

  if (isDataTable) {
    const spec = '|' + 'l|'.repeat(colN);
    const body = valid
      .map((r) => {
        const padded = r.map(cellText);
        while (padded.length < colN) padded.push('');
        return padded.join(' & ');
      })
      .join(' \\\\ \\hline ');
    return `\n\\begin{tabular}{${spec}}\\hline ${body} \\\\ \\hline\\end{tabular}\n`;
  }

  // ★ 정의/요금 박스 — 보기·조건 아님 + 1열인데 셀 내부 줄(P)이 2개 이상이면, 원본처럼 가운데
  //   테두리 박스(단일 열 tabular)로 복원. 인라인 폴백은 줄바꿈을 뭉개 한 줄로 붕괴시킨다
  //   (거제여중 #18 버스 요금표 A⇔B/B⇔C/A⇔C 3줄이 한 줄로 붕괴 + 다음 문제로 밀림). 셀 줄 = 각 행.
  if (!isBoxHeader && colN === 1) {
    const boxLines = valid.flat().flat().map((s) => s.trim()).filter(Boolean);
    if (boxLines.length >= 2) {
      const body = boxLines.join(' \\\\ \\hline ');
      return `\n\\begin{tabular}{|c|}\\hline ${body} \\\\ \\hline\\end{tabular}\n`;
    }
  }

  return ''; // 보기/조건 박스·기타 → 기존 텍스트 폴백
}

/**
 * 한 문단(P)을 읽기 순서대로 문자열로 — 텍스트 + $수식$ + [도형](이미지 id 수집).
 *   ★ ENDNOTE/FOOTNOTE(미주/각주)는 본문(stem)이 아니라 별도 answerOut 으로 분리한다.
 *     수학비서 HML 은 `[정답] {정답}` 을 ENDNOTE 안에 넣어, 재귀하면 정답이 문제 앞에
 *     인라인으로 박힌다(서답형 #19·#20·#23 사고). 미주를 떼어내면 stem 이 깨끗해지고
 *     서답형 정답도 answerOut 으로 추출된다.
 */
function renderParagraph(
  pChildren: OrderedNode[],
  binData: Map<string, string>,
  imagesOut: string[],
  answerOut: string[],
): string {
  const parts: string[] = [];
  let clearedAtEndnote = false;
  const rec = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (!tag) {
        const t = n['#text'] as string | undefined;
        if (t) parts.push(t);
        continue;
      }
      if (tag === 'ENDNOTE' || tag === 'FOOTNOTE') {
        // ★ 미주/각주 = 정답 채널. stem 에 미포함.
        const enChildren = (n[tag] as OrderedNode[]) || [];
        const dropImgs: string[] = [];
        const dropAns: string[] = [];
        const aText = renderParagraph(enChildren, binData, dropImgs, dropAns).trim();
        if (aText) answerOut.push(aText);
        // ★ HML 구조상 stem 은 미주 뒤에 온다. 미주 앞 텍스트(페이지 머리말·번호 잔재,
        //   예: 1번 "…제2교시수학영역")는 본문이 아니므로 버린다. 첫 미주에서 1회만.
        if (!clearedAtEndnote) { parts.length = 0; clearedAtEndnote = true; }
        continue;
      }
      if (tag === 'EQUATION') {
        const eqChildren = (n[tag] as OrderedNode[]) || [];
        parts.push(hangulEquationToInlineLatex(extractScript(eqChildren)));
        continue; // ★ 서브트리(렌더 이미지 base64) 미하강
      }
      if (tag === 'PICTURE') {
        // PICTURE 가 참조하는 BinData id
        const refId = findBinRef(n);
        if (refId && binData.has(refId)) imagesOut.push(binData.get(refId)!);
        parts.push('[도형]');
        continue; // 서브트리 미하강
      }
      if (tag === 'TABLE') {
        // ★ 데이터 표 → \begin{tabular} 복원 (거제여중 #2). 보기/조건 박스는 '' 반환 →
        //   아래 일반 재귀로 폴백(기존 텍스트 처리 = normalizeBogiBox/조건박스). 회귀 0.
        const tab = renderTableToTabular((n[tag] as OrderedNode[]) || [], binData, imagesOut);
        if (tab) { parts.push(tab); continue; }
        // 박스류 → 셀 내용을 본문으로 펼침(기존 동작)
        const tblChildren = n[tag] as OrderedNode[] | undefined;
        if (Array.isArray(tblChildren)) rec(tblChildren);
        continue;
      }
      // CHAR 등 일반 — 자식 재귀 (텍스트는 #text 로 잡힘)
      const children = n[tag] as OrderedNode[] | undefined;
      if (Array.isArray(children)) rec(children);
    }
  };
  rec(pChildren);
  return parts.join('');
}

/** PICTURE 서브트리에서 BinItem/Storage id 참조 추출 */
function findBinRef(node: OrderedNode): string | null {
  let found: string | null = null;
  const walk = (n: OrderedNode) => {
    if (found) return;
    const attrs = n[':@'] || {};
    const cand = attrs['BinItem'] || attrs['BinData'] || attrs['Item'] || attrs['Id'];
    const tag = tagOf(n);
    if ((tag === 'IMAGE' || tag === 'BINITEM') && cand) { found = String(cand); return; }
    const children = n[tag] as OrderedNode[] | undefined;
    if (Array.isArray(children)) for (const c of children) walk(c);
  };
  walk(node);
  return found;
}

interface RawPara { text: string; images: string[]; answer: string }

/** 모든 P 문단을 읽기 순서로 수집 (text=stem, answer=미주[정답], images) */
function collectParagraphs(
  root: OrderedNode[],
  binData: Map<string, string>,
): RawPara[] {
  const out: RawPara[] = [];
  const walk = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (tag === 'P') {
        const images: string[] = [];
        const answers: string[] = [];
        const text = renderParagraph((n[tag] as OrderedNode[]) || [], binData, images, answers)
          .replace(/[ \t]+/g, ' ')
          .trim();
        const answer = answers.join(' ').replace(/[ \t]+/g, ' ').trim();
        if (text || images.length || answer) out.push({ text, images, answer });
        continue; // P 안의 P 중첩은 드묾 — 상위만
      }
      const children = n[tag] as OrderedNode[] | undefined;
      if (Array.isArray(children)) walk(children);
    }
  };
  walk(root);
  return out;
}

/** 문서 제목 (DOCSUMMARY>TITLE) */
function findTitle(root: OrderedNode[]): string {
  let title = '';
  const walk = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (tag === 'TITLE') {
        const kids = (n[tag] as OrderedNode[]) || [];
        title = kids.map((k) => (k['#text'] as string) || '').join('').trim();
        return;
      }
      const children = n[tag] as OrderedNode[] | undefined;
      if (Array.isArray(children) && !title) walk(children);
    }
  };
  walk(root);
  return title;
}

// 문제 구분: 수학비서 HML 은 각 문제를 "[정답] ⊙" 헤더로 시작(정답 인라인 포함)
const ANSWER_HEADER_RE = /\[\s*정답\s*\]|\[\s*답\s*\]/;

// 묶음문제 지문(공유 발문) — "…다음 물음에 답하시오" 한 문단이 [정답] 없이 오면 직전 문제 본문이
// 아니라 다음 소문제의 지문이다. (현대청운고 고급대수 #6→#7·#12→#13·#16→#17 묶음)
const PREAMBLE_RE = /(?:다음|아래)\s*물음에\s*답|물음에\s*답하(?:시오|여라|라)/;

/** 이미지 base64 누출·워터마크 제거 (EQUATION/PICTURE 외 경로로 새는 잔재 정리) */
function cleanText(s: string): string {
  return s
    // 40자 이상 연속 base64 런 (이미지 데이터 누출) 제거
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '')
    // 수학비서 워터마크 잔재
    .replace(/수학비서/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** "[정답]" 뒤 문자열에서 정답(①~⑤)과 문제 stem 분리 */
function extractAnswerAndStem(after: string): { answer: string; stem: string } {
  const s = after.trim();
  const m = s.match(/^([①②③④⑤⑥⑦⑧⑨⑩])\s*([\s\S]*)$/);
  if (m) return { answer: m[1], stem: m[2].trim() };
  // 원형숫자 정답이 아니면(서답형 등) 정답 분리 어려움 → 빈 정답, 원문 stem 유지(펼쳐보기에서 입력)
  return { answer: '', stem: s };
}

/** 미주 정답 채널에서 정답 추출 ([정답] 뒤). 객관식=①~⑤, 서답형=정답 수식·값 */
function answerFromChannel(after: string): string {
  const s = after.trim();
  const circled = s.match(/^([①②③④⑤⑥⑦⑧⑨⑩])/);
  return circled ? circled[1] : s;
}

/** 문단 배열 → 문제 분리.
 *   신구조: 미주(answer)에 `[정답]` → stem(text)은 깨끗한 본문 (서답형 정답이 앞에 안 박힘).
 *   구구조 폴백: `[정답]` 이 본문에 인라인 (이전 포맷) — extractAnswerAndStem 로 분리.
 */
/**
 * 수학비서가 문항 끝에 붙이는 **출처·난이도 각주 표**를 걷어낸다.
 *
 * 원본 형태 (표 한 칸에 출처, 다음 칸에 난이도):
 *   \begin{tabular}{|l|l|}\hline [출처] & 내신 2025년 … 2 [3.40점] \\ \hline & ∙∘∘∘쉬움2 \\ \hline\end{tabular}
 *
 * ★ 이 표는 문제 내용이 아니라 출처 표기다. 남겨두면 보기 ⑤ 뒤에 표가 통째로 붙어
 *   시험지·문제은행·인쇄에 그대로 노출된다 (2026-09-01 반여고 실사고: 본문 3·보기 18 오염).
 * ★ `[출처]` 가 들어 있는 tabular 만 지운다. 조건 박스·데이터 표·그림 표는 건드리지 않는다
 *   — 표 처리는 회귀가 잦은 자리라 판정을 좁게 잡는다.
 */
export function stripSourceFootnote(text: string): string {
  if (!text || !text.includes('[출처]')) return text;
  return text
    .replace(/\\begin\{tabular\}(?:\{[^}]*\})?[\s\S]*?\\end\{tabular\}/g, (block) =>
      block.includes('[출처]') ? '' : block,
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function segmentProblems(paras: RawPara[]): HmlProblem[] {
  const problems: HmlProblem[] = [];
  let cur: { number: number; answer: string; lines: string[]; images: string[] } | null = null;
  let n = 0;
  // 묶음문제 공유 지문 보류 — 다음 문제 생성 시 본문 앞에 prepend (직전 문제엔 안 붙임).
  let pending: { text: string; images: string[] } | null = null;
  const applyPending = (c: { lines: string[]; images: string[] }) => {
    if (!pending) return;
    if (pending.text) c.lines.unshift(pending.text);
    if (pending.images.length) c.images.unshift(...pending.images);
    pending = null;
  };

  const flush = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').trim();
    const split = splitChoices(body);
    let content = normalizeBogiBox(split.content);
    let choices = split.choices;
    // ★ 표 객관식 감지 — 헤더행 + 셀들 → choiceHeaders + `|` 셀구분. (감지 안 되면 그대로)
    let choiceHeaders: string[] | undefined;
    const tbl = detectTableChoices(content, choices);
    if (tbl) { content = tbl.content; choices = tbl.choices; choiceHeaders = tbl.choiceHeaders; }
    // ★ 보기가 안 잡혔는데(choices 비었음) 본문 전체가 표 객관식 블록(\begin{tabular} 헤더행 +
    //   ①~⑤ 라벨행)이면 choiceHeaders+choices 로 변환 (2026-07-24, 사직중 #13류).
    //   기존엔 PDF/OCR(cloud-flow)만 이 감지를 해서 HML 자산화 표 객관식이 서답형(표가 본문에
    //   박힌 채)으로 남았다. 두 경로 같은 공용 함수(tabular-choices)로 통일.
    if (choices.length === 0) {
      const blockTbl = detectTabularChoices(content);
      if (blockTbl) { content = blockTbl.content; choices = blockTbl.choices; choiceHeaders = blockTbl.choiceHeaders; }
    }
    if (content || choices.length) {
      // ★ [도형] 마커 순서 = cur.images 순서. 본문 [도형] → stem, 보기 [도형] → 보기 이미지.
      const stemCount = (content.match(/\[도형\]/g) || []).length;
      const stemImages = cur.images.slice(0, stemCount);
      const choiceImagesBase64: (string | null)[] = [];
      let imgIdx = stemCount;
      for (const c of choices) {
        if (/\[도형\]/.test(c)) { choiceImagesBase64.push(cur.images[imgIdx] ?? null); imgIdx++; }
        else choiceImagesBase64.push(null);
      }
      const hasChoiceImg = choiceImagesBase64.some(Boolean);
      // 그림 객관식: 보기 텍스트에서 [도형] 제거(마커만 남김) → 이미지는 choiceImages 로 렌더.
      const finalChoices = hasChoiceImg ? choices.map((c) => c.replace(/\[도형\]/g, '').trim()) : choices;
      // ★ 원본 보기 배치 감지 — OCR(cloud-flow)과 동일: body 라인당 보기 마커(①②③④⑤) 수로 열 수 추정.
      //   가로(한 줄 4~5)=5, 3열=3, 2열=2, 한 줄 1개+긴 보기=세로(1). 표 객관식은 자체 포맷이라 제외.
      //   자산화 answer_json.choiceLayout 기본값으로 흘러 "원본 배치가 기본세팅". 수동 변경은 그대로 우선.
      let choiceLayout: number | undefined;
      if (finalChoices.length > 0 && !choiceHeaders) {
        // 표 안 placeholder 동그라미가 열 수 추정을 왜곡하지 않도록 표 블록 제거 후 스캔
        const cLines = stripTabularBlocks(body).split('\n').filter((l) => /[①②③④⑤]/.test(l));
        if (cLines.length > 0) {
          let maxPerLine = 0;
          for (const l of cLines) {
            const c = (l.match(/[①②③④⑤]/g) || []).length;
            if (c > maxPerLine) maxPerLine = c;
          }
          if (maxPerLine >= 4) choiceLayout = 5;
          else if (maxPerLine === 3) choiceLayout = 3;
          else if (maxPerLine === 2) choiceLayout = 2;
          else if (maxPerLine === 1) {
            const avgLen = cLines.reduce((s, l) => s + l.length, 0) / cLines.length;
            if (avgLen > 25) choiceLayout = 1;
          }
        }
      }
      problems.push({
        number: cur.number,
        // ★ 수학비서 출처·난이도 각주 표 제거 (2026-09-01, 반여고 실사고).
        //   본문 3문항·보기 18문항이 오염됐다. 보기 ⑤ 뒤에 표가 통째로 붙어
        //   `⑤ $17$ \begin{tabular}…[출처] 내신 2025년 …[3.40점]…∙∘∘∘쉬움2…\end{tabular}`
        //   같은 값이 저장됐다. 시험지에도 문제은행에도 그대로 노출된다.
        content: stripSourceFootnote(content),
        choices: finalChoices.map(stripSourceFootnote),
        answer: cur.answer,
        imagesBase64: stemImages,
        choiceImagesBase64: hasChoiceImg ? choiceImagesBase64 : [],
        choiceHeaders,
        choiceLayout,
      });
    }
    cur = null;
  };

  for (const para of paras) {
    const ansRaw = cleanText(para.answer || '');
    const stem = cleanText(para.text || '');

    // ★ 빠른정답(정답지) 섹션 시작 → 문제 끝. 이후 표/정답지 전부 버림(마지막 문제에 푸터 유입 차단).
    if (/빠른\s*정답/.test(stem) || /빠른\s*정답/.test(para.text || '')) { flush(); break; }

    const ansHm = ansRaw.match(ANSWER_HEADER_RE);

    if (ansHm && ansHm.index != null) {
      // ── 신구조: 미주에 [정답] (본문은 이미 정답 분리됨) ──
      flush();
      n += 1;
      const answer = answerFromChannel(ansRaw.slice(ansHm.index + ansHm[0].length));
      cur = { number: n, answer, lines: stem ? [stem] : [], images: [...para.images] };
      applyPending(cur);
      continue;
    }

    const stemHm = stem.match(ANSWER_HEADER_RE);
    if (stemHm && stemHm.index != null) {
      // ── 구구조 폴백: [정답] 이 본문 인라인 ──
      const before = stem.slice(0, stemHm.index).trim();
      const after = stem.slice(stemHm.index + stemHm[0].length);
      if (cur && before) cur.lines.push(before);
      flush();
      n += 1;
      const { answer, stem: s2 } = extractAnswerAndStem(after);
      cur = { number: n, answer, lines: s2 ? [s2] : [], images: [...para.images] };
      applyPending(cur);
      continue;
    }

    if (cur) {
      // ★ 묶음 공유 지문 — "…다음 물음에 답하시오"([정답]·보기 없음) 문단을 만나면, 그 문단 + 직전
      //   문제에 이미 잘못 붙은 setup 줄들까지 함께 떼어 보류 → 다음 소문제 본문 앞에 prepend.
      //   지문은 여러 문단(설명 + 식 + "…답하시오")이라 마지막 줄만 옮기면 setup 이 앞 문제에 남음.
      //   setup 경계: 객관식이면 마지막 보기(①~⑤) 줄 다음부터, 서답형이면 첫 줄(본 질문) 다음부터.
      if (stem && PREAMBLE_RE.test(stem) && !hasChoiceMarkOutsideMathTable(stem)) {
        let boundary = 1;
        for (let i = cur.lines.length - 1; i >= 0; i--) {
          if (/[①②③④⑤]/.test(cur.lines[i])) { boundary = i + 1; break; }
        }
        const peeled = cur.lines.slice(boundary);
        cur.lines.length = boundary;
        const preText = [...peeled, stem].filter(Boolean).join('\n');
        pending = pending
          ? { text: `${pending.text}\n${preText}`, images: [...pending.images, ...para.images] }
          : { text: preText, images: [...para.images] };
        continue;
      }
      // ★ 공유 지문(pending) 활성 중 "표만 있는 문단"은 앞 문제로 되돌리지 말고 지문에 이어붙인다.
      //   근의공식 유도 표 등 표 지문이 preamble 과 다음 문제 [정답] 마커 문단 사이에 낄 때,
      //   표 안 ①②③ placeholder 때문에 아래 복원 분기로 새 문제 표가 앞 문제에 흡수되던 사고 차단
      //   (이사벨중 23-3-1 #8/#9). 다음에 [정답] 오면 applyPending 으로 새 문제에, 아니면
      //   복원 분기에서 현재 문제로 — 어느 쪽이든 표는 지문과 함께 움직인다.
      if (pending && stem && isTableOnlyParagraph(stem)) {
        pending = { text: `${pending.text}\n${stem}`, images: [...pending.images, ...para.images] };
        continue;
      }
      // ★ 단일 문제 인라인 소문제 보호 — 보류한 지문(preamble) 뒤에 [정답] 없이 본문((1)(2)(3)
      //   소문제 등)이 현재 문제로 이어지면, 그 지문은 "다음 문제 공유 지문"이 아니라 현재 문제 것이다.
      //   원위치(peel 경계)로 복원하고 보류 해제 → 표·지문이 다음 문제로 밀려가던 사고 차단.
      //   진짜 묶음(현대청운고)은 지문 뒤 바로 [정답] 문단이 와 위쪽 ansHm 분기에서 처리되므로 여기 안 옴.
      if (pending && (stem || para.images.length)) {
        if (pending.text) cur.lines.push(pending.text);
        if (pending.images.length) cur.images.push(...pending.images);
        pending = null;
      }
      if (stem) cur.lines.push(stem);
      cur.images.push(...para.images);
    }
    // 첫 [정답] 이전(페이지 머리말)은 스킵
  }
  flush();
  return problems;
}

/** `$…$` 내부 여부 마스크 (수식 안 ①②(㉠㉡ 라벨)를 보기 마커로 오인하지 않도록) */
function buildMathMask(s: string): boolean[] {
  const mask = new Array<boolean>(s.length).fill(false);
  let inMath = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$') { inMath = !inMath; mask[i] = inMath; }
    else mask[i] = inMath;
  }
  return mask;
}

/**
 * 보기 마커 판정용 마스크 — `$…$`(수식) + `\begin{tabular}…\end{tabular}`(표) 내부를 모두 true.
 * ★ 표 안의 ①②③ 은 빈칸채우기·근의공식 유도 등 placeholder 이지 객관식 보기가 아니다.
 *   (CLAUDE.md 가드 #9: "동그라미가 있다고 다 객관식이 아니다" — 표/박스 안 동그라미는 본문.)
 *   이 마스크로 splitChoices·preamble 게이트가 표 안 동그라미를 보기로 오인하지 않게 한다.
 *   실증: 이사벨중 23-3-1 #8/#9(근의공식 표)·#17(연속 짝수 빈칸 표) — 표 placeholder 가
 *   보기로 잡혀 본문 토막 + garbage 보기 저장되던 사고.
 */
const TABULAR_OPEN = '\\begin{tabular}';
const TABULAR_CLOSE = '\\end{tabular}';
function buildChoiceMask(s: string): boolean[] {
  const mask = buildMathMask(s);
  let from = 0;
  for (;;) {
    const open = s.indexOf(TABULAR_OPEN, from);
    if (open < 0) break;
    const closeAt = s.indexOf(TABULAR_CLOSE, open);
    const end = closeAt < 0 ? s.length : closeAt + TABULAR_CLOSE.length; // 닫힘 없으면 끝까지
    for (let i = open; i < end; i++) mask[i] = true;
    from = end;
  }
  return mask;
}

/** 수식·표 밖에 진짜 보기 마커(①②③④⑤)가 있는지 — 표 안 placeholder 는 무시 */
function hasChoiceMarkOutsideMathTable(s: string): boolean {
  const mask = buildChoiceMask(s);
  for (let i = 0; i < s.length; i++) {
    if (!mask[i] && /[①②③④⑤]/.test(s[i])) return true;
  }
  return false;
}

/** `\begin{tabular}…\end{tabular}` 블록을 제거한 나머지 텍스트 (표만 있는 문단 판정용) */
function stripTabularBlocks(s: string): string {
  return s.replace(/\\begin\{tabular\}[\s\S]*?(?:\\end\{tabular\}|$)/g, ' ');
}

/**
 * "표만 있는 문단" — 표 블록을 걷어내면 유의미한 텍스트가 남지 않는 문단.
 * pending(공유 지문) 활성 중 이런 문단은 앞 문제로 되돌리지 말고 지문에 이어붙인다
 * (표 지문이 다음 문제의 [정답] 마커 문단 앞에 오는 경우 = 이사벨중 #9 근의공식 표).
 */
function isTableOnlyParagraph(s: string): boolean {
  if (!s.includes(TABULAR_OPEN)) return false;
  const rest = stripTabularBlocks(s).replace(/[\s ]+/g, ' ').trim();
  // 표를 걷어낸 나머지가 비었거나 극히 짧은 꼬리(문장부호·번호 조각)면 표 지문으로 본다.
  return rest.length <= 2;
}

const CHOICE_INDEX: Record<string, number> = {};
CHOICE_MARKS.forEach((m, i) => { CHOICE_INDEX[m] = i; });

/**
 * 보기 박스 줄 정리 — `<보 기>ㄱ. … ㄴ. …`(공백 없이 붙음)를 헤더·라벨 별도 줄로.
 *   렌더러(MixedContentRenderer)의 조건박스 파서는 줄 단위라, 라벨이 한 줄에 붙어
 *   있으면 박스로 안 그려진다(거제여중 #4). 실제 보기 박스(헤더 직후 ㄱ. 라벨)일 때만 적용.
 */
function normalizeBogiBox(content: string): string {
  // 헤더(〈보기〉/<보 기>) 바로 뒤에 ㄱ. 라벨이 오는 진짜 박스만 대상
  if (!/(?:〈|<)\s*보\s*기\s*(?:〉|>)\s*[ㄱ]\s*[.)]/.test(content)) return content;
  return content
    .replace(/((?:〈|<)\s*보\s*기\s*(?:〉|>))\s*(?=[ㄱ]\s*[.)])/g, '\n$1\n')
    .replace(/([^\n])\s*([ㄴㄷㄹㅁㅂ]\s*[.)])/g, '$1\n$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * 표 객관식 감지 — content 끝의 "헤더 행"(예: `${A}$사탕${B}$사탕`)과 각 보기가
 *   순수 `$…$` 셀들로만 구성(예: `①$5.5g$$5g$`)일 때, choiceHeaders + `|` 셀구분으로 변환.
 *   ★ 안전: 모든 보기가 "사이 텍스트 없는 N개 `$…$`"여야 하고 N≥2 + 헤더행도 N개여야 발동.
 *     일반 보기(`① $a=1$, $b=2$` 처럼 사이 텍스트)는 안 걸려 오탐 없음.
 */
function detectTableChoices(
  content: string,
  choices: string[],
): { content: string; choices: string[]; choiceHeaders: string[] } | null {
  if (choices.length < 2) return null;
  const lines = content.split('\n');
  let hi = -1;
  for (let i = lines.length - 1; i >= 0; i--) { if (lines[i].trim()) { hi = i; break; } }
  if (hi < 0) return null;
  const header = lines[hi].trim();
  // 헤더 행: 보기마커·물음표 없음 + `$…$`(+라벨) 세그먼트 ≥2
  if (/[①②③④⑤⑥⑦⑧⑨⑩?]/.test(header)) return null;
  const headerCells = header.match(/\$[^$]*\$[^$]*/g);
  if (!headerCells || headerCells.length < 2) return null;
  const N = headerCells.length;

  const newChoices: string[] = [];
  for (let i = 0; i < choices.length; i++) {
    const stripped = choices[i].replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim();
    // 순수 `$…$` 세그먼트만 (사이 텍스트 없음)
    if (!/^(?:\$[^$]*\$\s*){2,}$/.test(stripped)) return null;
    const cells = stripped.match(/\$[^$]*\$/g);
    if (!cells || cells.length !== N) return null;
    newChoices.push(`${CHOICE_MARKS[i] || ''} ${cells.map((c) => c.trim()).join(' | ')}`.trim());
  }

  return {
    content: lines.slice(0, hi).join('\n').trim(),
    choices: newChoices,
    choiceHeaders: headerCells.map((h) => h.trim()),
  };
}

/** 본문에서 ①~⑤ 보기 분리.
 *   ★ 수식($…$) 내부 마커 제외 + "마지막 증가 런(①②③④⑤)"만 진짜 보기로.
 *     연립방정식 라벨 ①②(㉠㉡) 나 스템 참조 "①을 ②에 대입"이 보기로 잘못 잘리던 사고(거제여중 #3).
 */
/**
 * 본문에서 보기(①~⑤)를 분리한다.
 * ★ export 이유 — 순수 문자열 로직이라 단위 테스트로 직접 잠근다.
 *   기존 파서 회귀 테스트는 실제 .hml 파일에 의존해 파일이 없으면 통째로 skip 된다.
 *   보기 분리는 채점에 직결되므로 파일 유무와 무관하게 항상 검증되어야 한다.
 */
export function splitChoices(body: string): { content: string; choices: string[] } {
  const mask = buildChoiceMask(body); // 수식+표 내부 동그라미 제외
  const marks: Array<{ idx: number; val: number }> = [];
  for (let i = 0; i < body.length; i++) {
    if (!mask[i] && Object.prototype.hasOwnProperty.call(CHOICE_INDEX, body[i])) {
      marks.push({ idx: i, val: CHOICE_INDEX[body[i]] });
    }
  }
  if (marks.length < 2) return { content: body, choices: [] };

  // 마지막 증가 런의 시작 = 진짜 보기 시작 (앞선 ①② 참조 런은 스템에 귀속)
  let runStart = 0;
  for (let k = 1; k < marks.length; k++) {
    if (marks[k].val <= marks[k - 1].val) runStart = k;
  }

  // ★ 원본 오타 내성 (2026-09-01, 반여고 확률과통계 #3 실측)
  //   수학비서 원본에 보기 번호가 잘못 찍힌 파일이 드물게 있다:
  //     ① 3/16  ② 1/4  ③ 5/16
  //     ③ 3/8   ⑤ 7/16          ← ④ 가 ③ 으로 오타
  //   마커가 1,2,3,3,5 라 "증가가 끊긴 곳"을 새 보기 시작으로 보고 뒤 2개만 잡았다.
  //   원본 오타 하나에 멀쩡한 보기 3개가 버려지고, 정답 ⑤ 는 보기 범위 밖이 되어
  //   채점이 불가능해진다. 원본은 우리가 못 고치므로 파서가 견뎌야 한다.
  //
  //   → **①로 시작하고 4~6개인 꼬리 구간**이 있으면 그쪽을 우선한다. 5지선다(때로 4지)의
  //     실제 모양이다. 스템의 `①과 ②` 같은 참조 런은 길이가 2~3이라 여기 안 걸린다.
  //     오타가 2개 이상이면 포기하고 기존 판정을 쓴다 (억지로 맞추지 않는다).
  //   ★ CHOICE_INDEX 는 0-based (① = 0). 1 과 비교하면 ② 부터 잡혀 ① 이 본문에 남는다.
  if (marks.length - runStart < 4) {
    for (let k = 0; k <= marks.length - 4; k++) {
      if (marks[k].val !== CHOICE_INDEX['①']) continue;
      const tail = marks.slice(k);
      if (tail.length < 4 || tail.length > 6) continue;
      let violations = 0;
      for (let j = 1; j < tail.length; j++) if (tail[j].val <= tail[j - 1].val) violations++;
      if (violations <= 1) { runStart = k; break; }
    }
  }

  const choiceMarks = marks.slice(runStart);
  if (choiceMarks.length < 2) return { content: body, choices: [] };

  const content = body.slice(0, choiceMarks[0].idx).trim();
  const choices: string[] = [];
  for (let k = 0; k < choiceMarks.length; k++) {
    const start = choiceMarks[k].idx;
    const end = k + 1 < choiceMarks.length ? choiceMarks[k + 1].idx : body.length;
    // ★ 마지막 보기 뒤에 붙는 배점 표기 제거 (`⑤ $7/16$\n[3.20점]`).
    //   HML 은 배점을 별도 문단으로 두는데, 마지막 보기부터 문단 끝까지를 잘라내므로
    //   그대로 두면 보기 텍스트에 `[3.20점]` 이 섞인다 (반여고 실측).
    const t = body.slice(start, end)
      .replace(/\s*[\[(]\s*(?:총\s*)?\d+(?:\.\d+)?\s*[점졈졍]\s*[\])]\s*$/g, '')
      .trim();
    if (t) choices.push(t);
  }
  if (choices.length < 2) return { content: body, choices: [] };
  return { content, choices };
}

/** 디버그 — 문단 원시 추출 (검증용) */
export function __dumpParagraphs(fileBuffer: ArrayBuffer | Buffer): RawPara[] {
  const xml = Buffer.from(fileBuffer as ArrayBuffer).toString('utf-8').replace(/^﻿/, '');
  const parser = new XMLParser({
    preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '',
    attributesGroupName: ':@', textNodeName: '#text', trimValues: false, parseTagValue: false,
  });
  const root = parser.parse(xml) as OrderedNode[];
  return collectParagraphs(root, collectBinData(root));
}

/**
 * HML 파일 버퍼 → 문제 추출
 */
export function parseHml(fileBuffer: ArrayBuffer | Buffer): HmlParseResult {
  const xml = Buffer.from(fileBuffer as ArrayBuffer).toString('utf-8').replace(/^﻿/, '');
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    attributesGroupName: ':@',
    textNodeName: '#text',
    trimValues: false,
    parseTagValue: false,
  });
  const root = parser.parse(xml) as OrderedNode[];

  const binData = collectBinData(root);
  const title = findTitle(root);
  const paras = collectParagraphs(root, binData);
  const problems = segmentProblems(paras);

  return { title, problems, rawLineCount: paras.length };
}
