// ============================================================================
// 학생 답안 시트 파서 (학습 분석 리포트용 일괄 업로드)
//
// 두 가지 포맷 지원:
//   1) VERTICAL (V_STUDENT) — 한 파일 = 한 학생
//      파일명: "<이름>_<기간>.xlsx" (예: "김은성_2-1기말.xlsx")
//      각 행이 한 문항. 컬럼: 문제/문항/번호, 점수/취득점수, 배점
//
//   2) HORIZONTAL (H_STUDENT) — 한 파일 = 학급
//      각 행이 한 학생. 컬럼: 이름/성명/학생, 1, 2, 3, ... (문항번호 컬럼)
//      각 셀 값: 'O'/'X'/'정답'/'오답' 또는 점수
//
// 채점 우선순위:
//   - 학생 응답이 정답 문자열과 일치 → 정답
//   - 'O' / '정답' → 정답
//   - 'X' / '오답' / 공란 → 오답
//   - 숫자 (부분점수): { earned, studentFull } → ratio 적용해 fullScore 환산
//
// 원본 참조: 학습분석리포트/index.html  L1098-1283 (CEO 작성, 그대로 포트)
// ============================================================================

import * as XLSX from 'xlsx';

// ============================================================================
// Types
// ============================================================================

export type ResponseValue =
  | { kind: 'mark'; correct: boolean }                       // O/X 명시
  | { kind: 'partial'; earned: number; studentFull: number } // 부분점수
  | { kind: 'numeric'; value: number }                       // 단일 숫자 (배점 정보 없음)
  | { kind: 'raw'; value: string };                          // 정답 문자열 (객관식 번호 등)

export interface ParsedStudent {
  /** 학생 이름 (엑셀에서 추출) */
  name: string;
  /** 학년 (선택, 동명이인 구분용) — H 포맷의 '학년' 컬럼 또는 파일명에서 추출 */
  grade?: number;
  /** 반/분반 (선택, 동명이인 구분용) */
  classLabel?: string;
  /** qNum → 응답 */
  responses: Record<number, ResponseValue>;
}

export type SheetFormat = 'vertical' | 'horizontal' | 'unknown';

export interface ParsedSheet {
  format: SheetFormat;
  students: ParsedStudent[];
  warnings: string[];
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 학생 답안 시트(엑셀/CSV/TSV) 파싱.
 *
 * @param buffer 파일 buffer (ArrayBuffer 또는 Node Buffer)
 * @param fileName 파일명 — V 포맷에서 학생 이름 추출, H 포맷에서 fallback period
 */
export function parseStudentSheet(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  fileName: string
): ParsedSheet {
  const warnings: string[] = [];
  const cleanFileName = stripFileExtension(fileName)
    .replace(/_유형분석|유형분석|_학생답안|학생답안/g, '')
    .trim();

  let aoa: unknown[][];
  try {
    aoa = readAsAOA(buffer, fileName);
  } catch (err) {
    warnings.push(`파일 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
    return { format: 'unknown', students: [], warnings };
  }

  if (aoa.length === 0) {
    warnings.push('시트가 비어있습니다.');
    return { format: 'unknown', students: [], warnings };
  }

  // 헤더 행 위치 + 포맷 감지 (앞쪽 15행 스캔)
  const { headerIdx, format } = detectHeader(aoa);

  if (headerIdx < 0 || format === 'unknown') {
    warnings.push(
      "헤더를 인식하지 못했습니다. " +
        "수직형(V): '문제'/'문항'/'쓴답'/'점수'/'취득점수'/'배점' 컬럼 필요. " +
        "수평형(H): '이름'/'성명'/'학생' + 문항번호 컬럼들 필요."
    );
    return { format: 'unknown', students: [], warnings };
  }

  const headers = (aoa[headerIdx] as unknown[]).map((h) =>
    String(h ?? '').trim().replace(/\s+/g, '')
  );
  const dataRows = aoa
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? '').trim() !== ''));

  const rowsAsObjects = dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    return obj;
  });

  if (format === 'vertical') {
    const student = parseVerticalSingleStudent(rowsAsObjects, cleanFileName);
    return {
      format,
      students: student ? [student] : [],
      warnings,
    };
  }

  // horizontal
  const students = parseHorizontalManyStudents(rowsAsObjects);
  if (students.length === 0) {
    warnings.push("수평형으로 인식했지만 '이름' 값이 있는 행을 찾지 못했습니다.");
  }
  return { format, students, warnings };
}

// ============================================================================
// Internal — 파일 형식별 buffer → AOA
// ============================================================================

function readAsAOA(buffer: ArrayBuffer | Buffer | Uint8Array, fileName: string): unknown[][] {
  const lower = fileName.toLowerCase();
  const isCsvLike = lower.endsWith('.csv') || lower.endsWith('.tsv');

  if (isCsvLike) {
    // 텍스트 디코딩 — UTF-8 우선, 실패 시 EUC-KR
    const u8 = toUint8Array(buffer);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch {
      text = new TextDecoder('euc-kr').decode(u8);
    }
    text = text.replace(/\r/g, '');
    const sep = text.includes('\t') ? '\t' : ',';
    return text
      .trim()
      .split('\n')
      .map((line) => line.split(sep));
  }

  // xlsx/xls
  const wb = XLSX.read(toUint8Array(buffer), { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
}

function toUint8Array(buffer: ArrayBuffer | Buffer | Uint8Array): Uint8Array {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  // Node Buffer is also a Uint8Array, handled above
  return new Uint8Array(buffer as ArrayBuffer);
}

function stripFileExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

// ============================================================================
// Internal — 헤더 감지
// ============================================================================

function detectHeader(aoa: unknown[][]): { headerIdx: number; format: SheetFormat } {
  const limit = Math.min(aoa.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i];
    if (!row) continue;
    const rowStr = row.map((c) => String(c ?? '')).join(',').replace(/\s+/g, '');

    // 수직형: '쓴답' 또는 ('문제' + ('정답' 또는 '취득점수'))
    if (
      rowStr.includes('쓴답') ||
      (rowStr.includes('문제') && (rowStr.includes('정답') || rowStr.includes('취득점수')))
    ) {
      return { headerIdx: i, format: 'vertical' };
    }

    // 수평형: '이름' / '성명' / '학생'
    if (rowStr.includes('이름') || rowStr.includes('성명') || rowStr.includes('학생')) {
      return { headerIdx: i, format: 'horizontal' };
    }
  }
  return { headerIdx: -1, format: 'unknown' };
}

// ============================================================================
// Internal — 수직형 파싱 (한 파일 = 한 학생)
// ============================================================================

function parseVerticalSingleStudent(
  rows: Record<string, unknown>[],
  cleanFileName: string
): ParsedStudent | null {
  // 파일명에서 학생 이름 추출
  let studentName = '학생';
  if (cleanFileName.includes('_')) {
    studentName = cleanFileName.split('_')[0].trim();
  } else {
    studentName = cleanFileName.trim();
  }
  if (!studentName) studentName = '학생';

  const responses: Record<number, ResponseValue> = {};

  for (const row of rows) {
    const qNumStr = findCellValue(row, ['문제', '문항', '번호', '순번']).replace(
      /[^0-9]/g,
      ''
    );
    if (!qNumStr) continue;
    const qNum = parseInt(qNumStr, 10);
    if (!Number.isFinite(qNum) || qNum <= 0) continue;

    // 핵심: '쓴 답' vs '정답' 우선 비교 (오르조 등 CSV 표준)
    //   '점수' 컬럼은 부분점수·서술형 보조 (배점 컬럼은 만점)
    const rawStudent = findCellValue(row, ['쓴답', '쓴 답', '학생답', '학생답안'], ['정답']);
    const rawAnswer = findCellValue(row, ['정답'], ['쓴', '학생']);
    const rawScore = findCellValue(row, ['점수', '취득점수', '획득점수'], ['배점']);
    const rawFull = findCellValue(row, ['배점', '만점']);

    const csvFull = parseFloat(rawFull.replace(/[^0-9.]/g, ''));
    const csvEarnedNum = parseFloat(rawScore.replace(/[^0-9.]/g, ''));
    const hasFull = Number.isFinite(csvFull) && csvFull > 0;

    // 서술형 판정: 정답 컬럼이 '서술형' 키워드 또는 학생답이 '필기/참조' 패턴
    const isEssay =
      /서술형|논술|풀이/.test(rawAnswer) || /필기|참조|사진/.test(rawStudent);

    if (isEssay) {
      // 서술형: '점수' 컬럼이 진실 (이미 채점된 부분점수).
      // ★ 점수 셀 라벨 = 출처 (2026-05-31): 매쓰플랫 export 는 "3학생"(학생 자가채점) /
      //   "0선생님"(선생님 채점) 처럼 숫자 뒤에 출처를 붙임. "선생님" 점수는 학생 자가채점보다
      //   우선하는 확정 점수다 (예: "0선생님" = 선생님이 0점 처리 → 학생이 맞다 해도 0점).
      //   현재 export 는 한 칸에 출처 하나라 csvEarnedNum(숫자만 추출)으로 값은 맞지만,
      //   향후 "3학생/0선생님" 동시 표기 대비 선생님 숫자를 우선 채택한다.
      const teacherMatch = rawScore.match(/(-?\d+(?:\.\d+)?)\s*선생/);
      const teacherScore = teacherMatch ? parseFloat(teacherMatch[1]) : NaN;
      const essayEarned = Number.isFinite(teacherScore) ? teacherScore : csvEarnedNum;
      if (Number.isFinite(essayEarned) && hasFull) {
        responses[qNum] = {
          kind: 'partial',
          earned: essayEarned,
          studentFull: csvFull,
        };
      } else {
        responses[qNum] = { kind: 'mark', correct: false };
      }
      continue;
    }

    // 객관식: '쓴 답' vs '정답' 직접 비교
    if (rawStudent && rawAnswer) {
      const sNorm = normalizeChoice(rawStudent);
      const aNorm = normalizeChoice(rawAnswer);
      const correct = sNorm !== '' && sNorm === aNorm;

      if (hasFull) {
        responses[qNum] = {
          kind: 'partial',
          earned: correct ? csvFull : 0,
          studentFull: csvFull,
        };
      } else {
        responses[qNum] = { kind: 'mark', correct };
      }
      continue;
    }

    // ──────── fallback: 쓴답·정답 컬럼이 없는 CSV ────────
    const upper = rawScore.toUpperCase();
    if (upper === 'O' || rawScore === '정답') {
      responses[qNum] = { kind: 'mark', correct: true };
      continue;
    }
    if (upper === 'X' || rawScore === '오답') {
      responses[qNum] = { kind: 'mark', correct: false };
      continue;
    }

    if (rawScore !== '' && Number.isFinite(csvEarnedNum)) {
      if (hasFull) {
        responses[qNum] = {
          kind: 'partial',
          earned: csvEarnedNum,
          studentFull: csvFull,
        };
      } else {
        responses[qNum] = { kind: 'numeric', value: csvEarnedNum };
      }
    } else if (rawScore === '' || rawScore === '-') {
      responses[qNum] = { kind: 'mark', correct: false };
    } else {
      responses[qNum] = { kind: 'raw', value: rawScore };
    }
  }

  return { name: studentName, responses };
}

// 동그라미 숫자 / 로마 / 일반 숫자 정규화 — 채점 비교용
//   ① → "1", "1)" → "1", "1번" → "1" 등
const CIRCLED_NUMS: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  '⒈': '1', '⒉': '2', '⒊': '3', '⒋': '4', '⒌': '5',
};
function normalizeChoice(s: string): string {
  if (!s) return '';
  const trimmed = String(s).trim();
  if (CIRCLED_NUMS[trimmed]) return CIRCLED_NUMS[trimmed];
  // 단일 문자가 동그라미 숫자인 경우
  if (trimmed.length === 1 && CIRCLED_NUMS[trimmed]) {
    return CIRCLED_NUMS[trimmed];
  }
  // "1.", "1)", "1번", "①" 으로 시작하는 경우 첫 숫자/기호 추출
  for (const c of trimmed) {
    if (CIRCLED_NUMS[c]) return CIRCLED_NUMS[c];
    if (/[0-9]/.test(c)) {
      // 숫자 연속 추출
      const m = trimmed.match(/^[^0-9]*([0-9]+)/);
      return m ? m[1] : c;
    }
  }
  return trimmed;
}

// ============================================================================
// Internal — 수평형 파싱 (한 파일 = 학급)
// ============================================================================

function parseHorizontalManyStudents(
  rows: Record<string, unknown>[]
): ParsedStudent[] {
  const out: ParsedStudent[] = [];

  for (const row of rows) {
    const name = findCellValue(row, ['이름', '학생', '성명']);
    if (!name) continue;

    const gradeStr = findCellValue(row, ['학년']);
    const grade = gradeStr ? parseInt(gradeStr.replace(/[^0-9]/g, ''), 10) : undefined;

    const classLabel =
      findCellValue(row, ['반', '분반', 'class', '클래스']) || undefined;

    const responses: Record<number, ResponseValue> = {};
    for (const key of Object.keys(row)) {
      // 문항번호 컬럼 추출 — 헤더가 숫자만 있거나 'Q1', '1번' 같은 형태
      const qNumStr = String(key).replace(/[^0-9]/g, '');
      if (!qNumStr) continue;
      const qNum = parseInt(qNumStr, 10);
      if (!Number.isFinite(qNum) || qNum <= 0 || qNum > 100) continue;
      // 이름/학년/반 같은 메타 컬럼은 제외 — 키에 '문항번호' 외 한글 있으면 건너뛰기
      const keyHasMeta =
        /이름|학생|성명|학년|반|분반|class|클래스/i.test(String(key));
      if (keyHasMeta) continue;

      const raw = String(row[key] ?? '').trim();
      if (raw === '') {
        responses[qNum] = { kind: 'mark', correct: false };
        continue;
      }
      const upper = raw.toUpperCase();
      if (upper === 'O' || raw === '정답') {
        responses[qNum] = { kind: 'mark', correct: true };
        continue;
      }
      if (upper === 'X' || raw === '오답') {
        responses[qNum] = { kind: 'mark', correct: false };
        continue;
      }
      const numeric = raw.replace(/[^0-9.]/g, '');
      if (numeric !== '' && numeric === raw.replace(/\s/g, '')) {
        const num = parseFloat(numeric);
        if (Number.isFinite(num)) {
          responses[qNum] = { kind: 'numeric', value: num };
          continue;
        }
      }
      responses[qNum] = { kind: 'raw', value: raw };
    }

    out.push({
      name,
      grade: Number.isFinite(grade as number) ? (grade as number) : undefined,
      classLabel,
      responses,
    });
  }

  return out;
}

// ============================================================================
// Internal — 헬퍼: 키워드 부분일치로 컬럼 값 찾기
// ============================================================================

function findCellValue(
  row: Record<string, unknown>,
  keywords: string[],
  excludes: string[] = []
): string {
  const normalizedKeywords = keywords.map((kw) => kw.replace(/\s+/g, ''));
  const normalizedExcludes = excludes.map((ex) => ex.replace(/\s+/g, ''));

  const key = Object.keys(row).find((k) => {
    const cleanK = String(k).replace(/\s+/g, '');
    const matches = normalizedKeywords.some((kw) => cleanK.includes(kw));
    const excluded = normalizedExcludes.some((ex) => cleanK.includes(ex));
    return matches && !excluded;
  });

  return key ? String(row[key] ?? '').trim() : '';
}

// ============================================================================
// 채점 — ResponseValue + (problems.answer_json, points) → 정/오/부분점수
// ============================================================================

export interface GradeProblemSpec {
  /** 문항 번호 (qNum) */
  seq: number;
  /** 만점 (problems.answer_json.points 또는 폴백) */
  fullScore: number;
  /** 정답 문자열 (객관식 번호 '3' 등). 없으면 빈 문자열 */
  correctAnswer: string;
}

export interface GradedResult {
  seq: number;
  fullScore: number;
  earnedScore: number;
  status: 'O' | 'X' | '△';
  isCorrect: boolean;
}

/**
 * ResponseValue 와 문제 스펙(만점, 정답)을 받아 채점.
 * 원본 참조: 학습분석리포트/index.html L820-851 (CEO 작성 자동 채점 엔진 그대로 포트)
 */
export function gradeResponse(
  response: ResponseValue | undefined,
  spec: GradeProblemSpec
): GradedResult {
  const { seq, fullScore, correctAnswer } = spec;

  if (!response) {
    return { seq, fullScore, earnedScore: 0, status: 'X', isCorrect: false };
  }

  // 1. O/X 마크
  if (response.kind === 'mark') {
    return {
      seq,
      fullScore,
      earnedScore: response.correct ? fullScore : 0,
      status: response.correct ? 'O' : 'X',
      isCorrect: response.correct,
    };
  }

  // 2. 정답 문자열 일치
  if (response.kind === 'raw') {
    const ans = String(correctAnswer ?? '').trim();
    if (ans !== '' && response.value === ans) {
      return { seq, fullScore, earnedScore: fullScore, status: 'O', isCorrect: true };
    }
    return { seq, fullScore, earnedScore: 0, status: 'X', isCorrect: false };
  }

  // 3. 부분점수 — ★ 만점은 시스템 배점(exam_problems.points) 우선 (2026-05-31).
  //    CSV 의 "정/오 비율"(csvEarned/csvFull)만 신뢰하고, 만점은 시스템 배점으로 환산한다.
  //    이유: 매쓰플랫 export CSV 의 '배점' 컬럼이 전 문항 "1" 로 깨져 오는 케이스가 있어
  //    (신곡중 2-2 등) CSV full 을 그대로 쓰면 "18점=18개" 가 됨. 문항 배점은
  //    exam_problems 에 이미 정확히 있으므로(3·4·5··· 점) 그걸 만점으로 써야 한다.
  //    - 시스템 배점(spec.fullScore) 이 있으면(>0) 그것을 만점으로, 비율 적용해 earned 환산.
  //    - 시스템 배점이 없으면(0/누락) 기존처럼 CSV full 사용 → 무회귀(신곡중 2-1: 시스템 NULL).
  if (response.kind === 'partial') {
    const csvFull = response.studentFull;
    const csvEarned = response.earned;
    const ratio = csvFull > 0 ? csvEarned / csvFull : 0;            // CSV 의 정/오 비율 (0~1)
    const effFull = fullScore > 0 ? fullScore : csvFull;           // 시스템 배점 우선, 없으면 CSV
    if (effFull <= 0) {
      return { seq, fullScore: 0, earnedScore: 0, status: 'X', isCorrect: false };
    }
    const earned = Math.round(ratio * effFull * 10) / 10;
    if (earned >= effFull) {
      return { seq, fullScore: effFull, earnedScore: effFull, status: 'O', isCorrect: true };
    }
    if (earned > 0) {
      return { seq, fullScore: effFull, earnedScore: earned, status: '△', isCorrect: true };
    }
    return { seq, fullScore: effFull, earnedScore: 0, status: 'X', isCorrect: false };
  }

  // 4. 단일 숫자 — 만점 정보 없이 학생이 받은 점수만 적혀있는 경우
  if (response.kind === 'numeric') {
    const earned = response.value;
    if (earned >= fullScore && fullScore > 0) {
      return { seq, fullScore, earnedScore: fullScore, status: 'O', isCorrect: true };
    }
    if (earned > 0) {
      return {
        seq,
        fullScore,
        earnedScore: Math.round(earned * 10) / 10,
        status: '△',
        isCorrect: true,
      };
    }
    return { seq, fullScore, earnedScore: 0, status: 'X', isCorrect: false };
  }

  return { seq, fullScore, earnedScore: 0, status: 'X', isCorrect: false };
}
