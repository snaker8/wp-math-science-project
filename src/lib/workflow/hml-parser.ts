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

export interface HmlProblem {
  number: number;
  content: string;            // 본문 (텍스트 + $LaTeX$ + [도형] 마커)
  choices: string[];          // ①~⑤ 보기 (없으면 빈 배열 = 서답형)
  answer: string;             // [정답] 마커에서 추출 (①~⑤ 또는 빈 문자열)
  imagesBase64: string[];     // 본문(stem) 그림 dataURL
  choiceImagesBase64: (string | null)[]; // 보기별 그림 (그림 객관식). 빈 배열=텍스트 보기
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
function segmentProblems(paras: RawPara[]): HmlProblem[] {
  const problems: HmlProblem[] = [];
  let cur: { number: number; answer: string; lines: string[]; images: string[] } | null = null;
  let n = 0;

  const flush = () => {
    if (!cur) return;
    const body = cur.lines.join('\n').trim();
    const split = splitChoices(body);
    const content = normalizeBogiBox(split.content);
    const choices = split.choices;
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
      problems.push({
        number: cur.number, content, choices: finalChoices, answer: cur.answer,
        imagesBase64: stemImages,
        choiceImagesBase64: hasChoiceImg ? choiceImagesBase64 : [],
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
      continue;
    }

    if (cur) {
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

/** 본문에서 ①~⑤ 보기 분리.
 *   ★ 수식($…$) 내부 마커 제외 + "마지막 증가 런(①②③④⑤)"만 진짜 보기로.
 *     연립방정식 라벨 ①②(㉠㉡) 나 스템 참조 "①을 ②에 대입"이 보기로 잘못 잘리던 사고(거제여중 #3).
 */
function splitChoices(body: string): { content: string; choices: string[] } {
  const mask = buildMathMask(body);
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
  const choiceMarks = marks.slice(runStart);
  if (choiceMarks.length < 2) return { content: body, choices: [] };

  const content = body.slice(0, choiceMarks[0].idx).trim();
  const choices: string[] = [];
  for (let k = 0; k < choiceMarks.length; k++) {
    const start = choiceMarks[k].idx;
    const end = k + 1 < choiceMarks.length ? choiceMarks[k + 1].idx : body.length;
    const t = body.slice(start, end).trim();
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
