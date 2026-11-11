// ============================================================================
// 수학비서 「내 문제지」 출제본(HML) 파서 — 여러 시험지를 묶어 출제한 파일을 문항 단위로 가른다.
//
// 왜 필요한가 (2026-11-11 실측):
//   나만의DB 에서 학교기출 원본을 그대로 받으면 정답만 있고 해설이 없다. 같은 문항을 「내 문제지」에
//   담아 출제하면 해설·정답·유형이 붙어 나온다. 그래서 시험지 여러 장을 한 문제지로 묶어 출제한 뒤
//   이 파서로 다시 시험지·번호별로 가른다.
//
// 출제본 한 문항의 문단 순서 (출처 「문제 위」·유형 노출 설정):
//   [유형 표]  07 공통수학1 / 06 이차함수와 이차방정식 / 02 … / 05 …
//   [출처 줄]  내신 2025년 부산시 해운대구 해운대고 고1 공통 1학기 기말 공통수학1 > 1 [5.4점]
//   [본문 첫 문단] ← 미주(ENDNOTE) 에 「[정답] ④ [해설] …」 이 붙어 있다
//   [본문 나머지·보기]
//   … 다음 문항의 유형 표 …
//   (끝) 「(빠른 정답)」 섹션 — 여기서 멈춘다.
//
// ★ 출처 줄의 시험지명 = 수학비서 나만의DB 시험지 제목(그대로). 이걸로 원래 시험지와 번호를 되찾는다.
// ============================================================================

import { __dumpParagraphs, solutionFromNote, type RawPara } from './hml-parser';

export interface WorksheetItem {
  sourceTitle: string;     // 수학비서 시험지 제목
  number: number;          // 원본 시험지에서의 문항 번호
  points: number | null;   // 배점
  chapter: string[];       // 유형 경로 (과목 > 대단원 > 중단원 > 유형). 못 읽으면 []
  answer: string;          // [정답] ~ [해설] 사이
  solution: string;        // [해설] 이후 (텍스트 + $LaTeX$ + [도형])
  solutionImages: string[];// 해설 [도형] 순서의 그림 dataURL
  stem: string;            // 본문 (대조·검증용)
}

// `시험지명 > 번호 [배점점]` — 배점이 없는 문항도 있다.
const SOURCE_LINE_RE = /^(.+?)\s*>\s*(\d+)\s*(?:\[\s*(\d+(?:\.\d+)?)\s*점\s*\])?\s*$/;
// 유형 경로 한 칸: `07 공통수학1` 처럼 두 자리 번호로 시작
const CHAPTER_CELL_RE = /^\d{2}\s+\S/;

/** 유형 표 문단 → 경로 배열. 표로 복원된 것(`\begin{tabular}…`)과 글자로 펼쳐진 것 둘 다. */
export function parseChapterPara(text: string): string[] {
  const tab = text.match(/\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/);
  if (tab) {
    const cells = tab[1]
      .split(/\\\\|\\hline/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (cells.length && cells.every((c) => CHAPTER_CELL_RE.test(c))) return cells;
  }
  // 표로 복원이 안 된 경우(칸 안에 「조건」 같은 글자가 있으면 박스로 판정돼 글자가 이어 붙는다):
  //   `07 공통수학108 부등식02 이차부등식06 이차부등식의 해석3 (해에 대한 조건)`
  //   두 자리 번호 + 공백 앞에서 자른다. 앞 칸 끝 숫자와 붙은 경우가 있어 완벽하진 않다 → 원문 한 칸으로 둔다.
  const plain = text.replace(/\s+/g, ' ').trim();
  if (/^\d{2} /.test(plain)) return [plain];
  return [];
}

/** 미주 원형에서 [정답] 과 [해설] 사이 */
function answerFromNoteText(text: string): string {
  const m = text.match(/\[\s*정\s*답\s*\]([\s\S]*?)(?:\[\s*해\s*설\s*\]|$)/);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

export function parseWorksheetParagraphs(paras: RawPara[]): WorksheetItem[] {
  const items: WorksheetItem[] = [];
  let cur: WorksheetItem | null = null;
  let stemLines: string[] = [];
  let lastNonSource: string | null = null; // 출처 줄 바로 앞 문단 = 그 문항의 유형 표

  const flush = () => {
    if (!cur) return;
    // 다음 문항의 유형 표가 본문 끝에 붙어 들어왔으면 뗀다
    if (stemLines.length && parseChapterPara(stemLines[stemLines.length - 1]).length) stemLines.pop();
    cur.stem = stemLines.join('\n').trim();
    items.push(cur);
    cur = null;
    stemLines = [];
  };

  for (const p of paras) {
    const text = p.text || '';
    if (/\(\s*빠른\s*정답\s*\)|빠른\s*정답/.test(text) && !p.notes?.length) { flush(); break; }

    const sm = text.match(SOURCE_LINE_RE);
    if (sm && !p.notes?.length) {
      flush();
      // 유형 표: 출처 줄 바로 앞 문단. 첫 문항은 문서 머리말과 같은 문단에 붙어 있어 표 부분만 찾는다.
      const chapter = lastNonSource ? parseChapterPara(lastNonSource.slice(lastNonSource.indexOf('\\begin{tabular}') >= 0 ? lastNonSource.indexOf('\\begin{tabular}') : 0)) : [];
      cur = {
        sourceTitle: sm[1].trim(),
        number: Number(sm[2]),
        points: sm[3] != null ? Number(sm[3]) : null,
        chapter,
        answer: '',
        solution: '',
        solutionImages: [],
        stem: '',
      };
      lastNonSource = null;
      continue;
    }
    lastNonSource = text;

    if (!cur) continue;
    const note = p.notes?.find((x) => /\[\s*정\s*답\s*\]/.test(x.text));
    if (note && !cur.answer && !cur.solution) {
      cur.answer = answerFromNoteText(note.text);
      const sol = solutionFromNote(note);
      if (sol) { cur.solution = sol.solution; cur.solutionImages = sol.images; }
    }
    if (text) stemLines.push(text);
  }
  flush();
  return items;
}

/**
 * 출제본을 일반 적재 파서(parseHml)로 읽으면 각 문항 본문 앞에 「유형 표」와 「출처 줄」이 붙는다.
 * 문제은행에 넣기 전에 걷어낸다 (시중교재처럼 원본 파일을 못 받고 출제본으로만 받는 자료, 2026-11-11).
 *   `\begin{tabular}…09 대수…\end{tabular}\n2010년 … 03월 > 2 [2점]\n본문…` → `본문…`
 * 유형 표가 아닌 표(본문 자료표)는 건드리지 않는다 — 칸이 전부 `NN 이름` 꼴일 때만 유형 표로 본다.
 */
export function stripWorksheetHeader(content: string): string {
  // ★ 머리가 본문 「앞」에 붙는 파일(모의고사 묶음)과, 다음 문항의 머리가 앞 문항 「끝」에 붙는 파일(시중교재)이 둘 다 있다
  //   (2026-11-11 실측). 위치와 상관없이 유형 표 줄 + 그 바로 뒤 출처 줄을 지운다. 출처 줄 단독은 맨 앞일 때만 —
  //   본문 줄이 우연히 `… > 3` 꼴일 수 있어 아무 데서나 지우지 않는다.
  const lines = content.split('\n');
  const isChapter = (l: string) => {
    const t = l.trim();
    if (/^\\begin\{tabular\}[\s\S]*\\end\{tabular\}$/.test(t)) return parseChapterPara(t).length > 0;
    return false;
  };
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isChapter(lines[i])) {
      if (i + 1 < lines.length && SOURCE_LINE_RE.test(lines[i + 1].trim())) i++;
      continue;
    }
    // 글자로 펼쳐진 유형 경로(`07 공통수학108 부등식…`) + 출처 줄
    if (/^\d{2} \S/.test(lines[i].trim()) && i + 1 < lines.length && SOURCE_LINE_RE.test(lines[i + 1].trim())) { i++; continue; }
    out.push(lines[i]);
  }
  while (out.length && !out[0].trim()) out.shift();
  if (out.length && SOURCE_LINE_RE.test(out[0].trim())) out.shift();
  // 끝 줄 출처 줄(유형 표가 앞 줄 꼬리에 붙어 따로 안 잡힌 경우) — 문제 끝은 「?」·「…시오.」 라 `> N [k점]` 로 끝날 일이 없다
  while (out.length && !out[out.length - 1].trim()) out.pop();
  if (out.length > 1 && SOURCE_LINE_RE.test(out[out.length - 1].trim())) out.pop();
  return out.join('\n').trim();
}

/** 출처 줄에서 원본 번호·배점만 (출제본 → 문제은행 적재 시 원래 번호를 살린다) */
export function sourceLineOf(content: string): { title: string; number: number; points: number | null } | null {
  for (const raw of content.split('\n').slice(0, 4)) {
    const m = raw.trim().match(SOURCE_LINE_RE);
    if (m) return { title: m[1].trim(), number: Number(m[2]), points: m[3] != null ? Number(m[3]) : null };
  }
  return null;
}

/** HML 버퍼 → 문항 목록 */
export function parseWorksheetHml(buf: ArrayBuffer | Buffer): WorksheetItem[] {
  return parseWorksheetParagraphs(__dumpParagraphs(buf));
}
