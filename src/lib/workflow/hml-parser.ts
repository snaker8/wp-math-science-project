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
import { hangulEquationToInlineLatex } from './hangul-equation';

export interface HmlProblem {
  number: number;
  content: string;            // 본문 (텍스트 + $LaTeX$ + [도형] 마커)
  choices: string[];          // ①~⑤ 보기 (없으면 빈 배열 = 서답형)
  answer: string;             // [정답] 마커에서 추출 (①~⑤ 또는 빈 문자열)
  imagesBase64: string[];     // 이 문제에 등장한 그림 PNG dataURL
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

/** BINDATALIST(헤더) → { binId: dataURL } 맵 */
function collectBinData(root: OrderedNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (tag === 'BINDATA') {
        const attrs = n[':@'] || {};
        const id = attrs['Id'] || attrs['BinData'] || attrs['id'];
        const fmt = (attrs['Format'] || 'png').toLowerCase();
        const children = (n[tag] as OrderedNode[]) || [];
        const text = children.map((c) => (c['#text'] as string) || '').join('').trim();
        if (id && text) map.set(String(id), `data:image/${fmt};base64,${text}`);
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

/** 한 문단(P)을 읽기 순서대로 문자열로 — 텍스트 + $수식$ + [도형](이미지 id 수집) */
function renderParagraph(
  pChildren: OrderedNode[],
  binData: Map<string, string>,
  imagesOut: string[],
): string {
  const parts: string[] = [];
  const rec = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (!tag) {
        const t = n['#text'] as string | undefined;
        if (t) parts.push(t);
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

/** 모든 P 문단을 읽기 순서로 수집 */
function collectParagraphs(
  root: OrderedNode[],
  binData: Map<string, string>,
): Array<{ text: string; images: string[] }> {
  const out: Array<{ text: string; images: string[] }> = [];
  const walk = (nodes: OrderedNode[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (tag === 'P') {
        const images: string[] = [];
        const text = renderParagraph((n[tag] as OrderedNode[]) || [], binData, images)
          .replace(/[ \t]+/g, ' ')
          .trim();
        if (text || images.length) out.push({ text, images });
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

/** 문단 배열 → 문제 분리 ([정답] 헤더 기준, 정답 추출) */
function segmentProblems(paras: Array<{ text: string; images: string[] }>): HmlProblem[] {
  const problems: HmlProblem[] = [];
  let cur: { number: number; answer: string; lines: string[]; images: string[] } | null = null;
  let n = 0;

  const flush = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').trim();
    const { content, choices } = splitChoices(body);
    if (content || choices.length) {
      problems.push({ number: cur.number, content, choices, answer: cur.answer, imagesBase64: cur.images });
    }
    cur = null;
  };

  for (const para of paras) {
    const text = cleanText(para.text);
    const hm = text.match(ANSWER_HEADER_RE);
    if (hm && hm.index != null) {
      const before = text.slice(0, hm.index).trim();
      const after = text.slice(hm.index + hm[0].length);
      // [정답] 앞부분(직전 문제의 꼬리 보기 등)은 직전 문제에 귀속
      if (cur && before) cur.lines.push(before);
      flush();
      n += 1;
      const { answer, stem } = extractAnswerAndStem(after);
      cur = { number: n, answer, lines: stem ? [stem] : [], images: [...para.images] };
    } else if (cur) {
      if (text) cur.lines.push(text);
      cur.images.push(...para.images);
    }
    // 첫 [정답] 이전(페이지 머리말)은 스킵
  }
  flush();
  return problems;
}

/** 본문에서 ①~⑤ 보기 분리 */
function splitChoices(body: string): { content: string; choices: string[] } {
  const firstMark = CHOICE_MARKS.find((m) => body.includes(m));
  if (!firstMark) return { content: body, choices: [] };
  const idx = body.indexOf(firstMark);
  const content = body.slice(0, idx).trim();
  const rest = body.slice(idx);
  // ①②③④⑤ 기준 split
  const choices: string[] = [];
  const re = /([①②③④⑤⑥⑦⑧⑨⑩])\s*([\s\S]*?)(?=[①②③④⑤⑥⑦⑧⑨⑩]|$)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(rest)) !== null) {
    const t = (mm[1] + ' ' + mm[2].trim()).trim();
    if (t) choices.push(t);
  }
  // 보기가 2개 미만이면 보기 아님 (서답형) → 원문 유지
  if (choices.length < 2) return { content: body, choices: [] };
  return { content, choices };
}

/** 디버그 — 문단 원시 추출 (검증용) */
export function __dumpParagraphs(fileBuffer: ArrayBuffer | Buffer): Array<{ text: string; images: string[] }> {
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
