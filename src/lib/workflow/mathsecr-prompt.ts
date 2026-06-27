/**
 * 수학비서(mathsecr) 분류 체계 기반 프롬프트 빌더
 *
 * mathsecr_complete.json의 트리 데이터를 활용하여
 * 과목별 소단원(L3) 테이블을 AI 프롬프트에 동적 주입한다.
 */

// JSON 직접 import (fs 불필요 — webpack/Next.js에서 정상 동작)
import mathsecrTree from '../../../mathsecr_complete.json';

interface TreeNode {
  t: string; // text
  c: string; // code
  ch?: TreeNode[];
}

// 과목명 → subject_code 매핑
// ★ 학기가 명시된 경우(중2-1, 중2-2)는 단일 코드,
//   학기 불명(중2, 중2 수학)은 배열 — 두 학기 테이블 모두 LLM에 제공하여
//   문제 내용으로 학기 직접 판단하도록 함 (파일명 "2-1"인 시험지에 2-2 내용 섞인 경우 대응).
const SUBJECT_CODE_MAP: Record<string, string | string[]> = {
  // 중학교 — 학기 명시
  '중1-1': '01', '중1-2': '02',
  '중2-1': '03', '중2-2': '04',
  '중3-1': '05', '중3-2': '06',
  // 중학교 — 학기 불명 → 두 학기 테이블 모두 제공
  '중1': ['01', '02'], '중1 수학': ['01', '02'],
  '중2': ['03', '04'], '중2 수학': ['03', '04'],
  '중3': ['05', '06'], '중3 수학': ['05', '06'],
  // 고등학교
  '고1': '07', '공통수학': '07', '공통수학1': '07', '공통수학2': '08',
  '공수1': '07', '공수2': '08',
  '수학(상)': '07', '수학(하)': '08',
  '대수': '09',
  // ★ 수1 = 수학I = 대수(09) — 지수로그, 삼각함수, 수열
  '수1': '09', '수학I': '09', '수학1': '09', '수학Ⅰ': '09',
  // ★ 수2 = 수학II = 미적분1(10) — 극한, 미분, 적분
  '수2': '10', '수학II': '10', '수학2': '10', '수학Ⅱ': '10',
  '미적분1': '10',
  '확률과 통계': '11', '확률과통계': '11', '확통': '11',
  '미적분2': '12',
  '미적분': '12',
  '기하': '13',
  // gradeHint 형식
  '고등 수학Ⅰ': '09', '고등 수학Ⅱ': '10', '고등 수1': '09', '고등 수2': '10',
  '고등 미적분': '12', '고등 확률과 통계': '11', '고등 기하': '13',
  '고등 공통수학': '07',
  '고1 수학': '07', '고2 수학': '10', '고3 수학': '12',
};

// 과목 코드 → 과목명 매핑
const CODE_TO_NAME: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2',
  '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2',
  '09': '대수',          // 수학비서 공식명. 구교육과정: 수학I = 수1
  '10': '미적분1',       // 수학비서 공식명. 구교육과정: 수학II = 수2
  '11': '확률과 통계',   // 수학비서 공식명
  '12': '미적분2',       // 수학비서 공식명. 구교육과정: 미적분
  '13': '기하',
  '14': '이산수학', '15': '경제수학', '16': '실용수학',
  '17': '인공지능수학', '18': '수학과제탐구',
};

/**
 * 자산화 업로드 UI 에서 학년·학기(특이 진도 대비 복수 선택)를 고르는 옵션 목록.
 * code 는 mathsecr 과목코드(01~13), label 은 표시명. 선택값은 exams.curriculum_codes 로 저장돼
 * 분류 컨텍스트에 제목 추론보다 우선 사용된다.
 */
export const CURRICULUM_OPTIONS: Array<{ code: string; label: string; group: '중등' | '고등' }> = [
  { code: '01', label: '중1-1', group: '중등' },
  { code: '02', label: '중1-2', group: '중등' },
  { code: '03', label: '중2-1', group: '중등' },
  { code: '04', label: '중2-2', group: '중등' },
  { code: '05', label: '중3-1', group: '중등' },
  { code: '06', label: '중3-2', group: '중등' },
  { code: '07', label: '공통수학1', group: '고등' },
  { code: '08', label: '공통수학2', group: '고등' },
  { code: '09', label: '대수', group: '고등' },
  { code: '10', label: '미적분1', group: '고등' },
  { code: '11', label: '확률과 통계', group: '고등' },
  { code: '12', label: '미적분2', group: '고등' },
  { code: '13', label: '기하', group: '고등' },
];

const VALID_CURRICULUM_CODES = new Set(CURRICULUM_OPTIONS.map((o) => o.code));

/**
 * 사용자가 지정한 학년·학기 입력(코드 '05' 또는 라벨 '중3-1')을 유효한 mathsecr 과목코드 배열로 정규화.
 * - 2자리 코드면 그대로(유효성 검사), 라벨이면 SUBJECT_CODE_MAP 단일키로 매핑.
 * - 중복 제거 + 순서 보존. 유효하지 않은 값은 버림. 빈 입력 → [].
 * ★ resolveSubjectCode 와 달리 학기를 흡수하지 않음 — 사용자가 명시한 학기를 그대로 존중.
 */
export function resolveCurriculumCodes(input?: string[] | null): string[] {
  if (!input || !Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw) continue;
    const v = String(raw).normalize('NFC').trim();
    let code: string | null = null;
    if (VALID_CURRICULUM_CODES.has(v)) {
      code = v;
    } else {
      const mapped = SUBJECT_CODE_MAP[v];
      // 단일 코드 매핑만 채택(배열=학기불명은 명시 선택과 모순이므로 제외)
      if (typeof mapped === 'string' && VALID_CURRICULUM_CODES.has(mapped)) code = mapped;
    }
    if (code && !seen.has(code)) { seen.add(code); out.push(code); }
  }
  return out;
}

/** 과목코드 배열 → 표시 라벨 (예: ['05','06'] → "중3-1 + 중3-2"). 빈 배열 → ''. */
export function curriculumCodesToLabel(codes?: string[] | null): string {
  if (!codes || !codes.length) return '';
  return codes.map((c) => CODE_TO_NAME[c] || c).join(' + ');
}

function loadTree(): TreeNode[] {
  return mathsecrTree as unknown as TreeNode[];
}

/**
 * gradeHint(예: "고1 수학")와 subject(예: "수학II")로부터 과목 코드를 추출.
 * ★ 반환값: 단일 코드 문자열 또는 코드 배열(학기 불명인 경우 두 학기 모두).
 *   - "중2-1 수학" → '03' (단일)
 *   - "중2 수학" → ['03','04'] (두 학기 테이블 모두 LLM에 제공 — 파일명 학기와
 *     실제 문제 학기가 다른 "특이 진도" 시험지 대응, 2026-06-03 사고 fix)
 * ★ subject가 더 구체적이므로 먼저 시도. 실패 시 gradeHint 시도.
 */
export function resolveSubjectCode(gradeHint?: string, subject?: string): string | string[] | null {
  // ★ 긴 key부터 매칭 — "수학II".includes("수학I")이 true라 "수학I"가 먼저 매치되던 버그 수정.
  // ★ Mac(NFD) vs Windows(NFC) 한글 정규화 — Mac 업로드 파일명/메타는 한글이 NFD(자모 분해)라
  //   "중2"(NFD ㅈㅜㅇ2)가 NFC 키 '중2'와 바이트 불일치 → 과목 해석 실패 → 공통수학1 오분류
  //   되던 사고(맥에서만 발생, 윈도우 정상). hint·key 모두 NFC 로 통일해 매칭.
  const sortedEntries = Object.entries(SUBJECT_CODE_MAP)
    .map(([k, v]) => [k.normalize('NFC'), v] as [string, string | string[]])
    .sort((a, b) => b[0].length - a[0].length);
  for (const hintRaw of [subject, gradeHint]) {
    if (!hintRaw) continue;
    // ★ 학기(1/2학기) 흡수 — "중2-1 수학"→"중2 수학" 로 정규화해 항상 양 학기 코드(['03','04']) 반환.
    //   파일명 학기와 실제 문제 학기가 다른 "특이 진도" 시험지(제목 2-1, 내용 2-2 평행사변형 등) 대응.
    //   call site(cloud-flow)마다 strip 하다 reanalyze·auto-fix 에서 누락되어 단일 학기로 박히던 사고
    //   → 중앙에서 흡수해 전 분류 경로(업로드/다시분석/고급분석/auto-fix) 일관 (2026-06-12).
    const hint = hintRaw.normalize('NFC').replace(/중([1-3])-[12]/g, '중$1');
    for (const [key, code] of sortedEntries) {
      if (hint.includes(key)) return code; // 단일 string 또는 string[]
    }
  }
  return null;
}

/**
 * 과목 코드에 해당하는 소단원(L3) 테이블을 프롬프트 문자열로 반환
 * AI가 typeCode를 선택할 수 있도록 코드 + 경로 형태
 */
export function buildTypeTable(subjectCode: string | string[]): string {
  // ★ 학기 불명 등으로 배열(['03','04'])이 들어오면 각 학기 테이블을 합산.
  //   문자열 단일 호출은 아래 로직 그대로 — 기존 출력 불변.
  if (Array.isArray(subjectCode)) {
    return subjectCode.map((c) => buildTypeTable(c)).filter(Boolean).join('\n\n');
  }
  const tree = loadTree();
  const subject = tree.find(s => s.c === subjectCode);
  if (!subject) return '';

  const lines: string[] = [];
  lines.push(`| 코드 | 대단원 | 중단원 | 소단원 | 세부유형 |`);
  lines.push(`|------|--------|--------|--------|----------|`);

  // 대단원(L1) → 중단원(L2) → 소단원(L3) → 세부유형(L4)
  for (const l1 of subject.ch || []) {
    for (const l2 of l1.ch || []) {
      for (const l3 of l2.ch || []) {
        // 세부유형(L4)이 있으면 L4까지 노출, 없으면 L3를 leaf로 표시
        if (l3.ch && l3.ch.length > 0) {
          for (const l4 of l3.ch) {
            const code = `MS${subjectCode}-${l1.c}-${l2.c}-${l3.c}-${l4.c}`;
            lines.push(`| ${code} | ${l1.t} | ${l2.t} | ${l3.t} | ${l4.t} |`);
          }
        } else {
          const code = `MS${subjectCode}-${l1.c}-${l2.c}-${l3.c}`;
          lines.push(`| ${code} | ${l1.t} | ${l2.t} | ${l3.t} | — |`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * 1단계 분류용: 대단원(L1) + 중단원(L2)만 나열
 * 2단계 분류 구조에서 첫 호출에 사용.
 * 일반적으로 한 과목당 3~10K 토큰 수준 (기존 251K의 1/25~1/50).
 * 캐시 만료돼도 write 비용 미미.
 */
export function buildL1L2Table(subjectCode: string | string[]): string {
  // ★ 배열(학기 불명)이면 각 학기 L1L2 합산. 각 행 코드의 MS{과목} prefix로 학기 구분됨.
  //   → 2단계 분류가 배열에서도 작동 (예전엔 빈 테이블 반환 → 212K 폴백 폭발 버그).
  if (Array.isArray(subjectCode)) {
    return subjectCode.map((c) => buildL1L2Table(c)).filter(Boolean).join('\n');
  }
  const tree = loadTree();
  const subject = tree.find(s => s.c === subjectCode);
  if (!subject) return '';

  const lines: string[] = [];
  lines.push(`| 1단계코드 | 대단원 | 중단원 |`);
  lines.push(`|-----------|--------|--------|`);

  for (const l1 of subject.ch || []) {
    for (const l2 of l1.ch || []) {
      const code = `MS${subjectCode}-${l1.c}-${l2.c}`;
      lines.push(`| ${code} | ${l1.t} | ${l2.t} |`);
    }
  }

  return lines.join('\n');
}

/**
 * 2단계 분류용: 특정 (L1, L2) 하위의 소단원(L3) + 세부유형(L4)만 나열
 * 1단계에서 결정된 대단원·중단원 범위만 상세 전달.
 * 일반적으로 한 (L1, L2)당 3~15K 토큰 수준.
 */
export function buildL3L4Table(subjectCode: string, l1Code: string, l2Code: string): string {
  const tree = loadTree();
  const subject = tree.find(s => s.c === subjectCode);
  if (!subject) return '';
  const l1 = (subject.ch || []).find(x => x.c === l1Code);
  if (!l1) return '';
  const l2 = (l1.ch || []).find(x => x.c === l2Code);
  if (!l2) return '';

  const lines: string[] = [];
  lines.push(`| 최종코드 | 소단원 | 세부유형 |`);
  lines.push(`|----------|--------|----------|`);

  for (const l3 of l2.ch || []) {
    if (l3.ch && l3.ch.length > 0) {
      for (const l4 of l3.ch) {
        const code = `MS${subjectCode}-${l1Code}-${l2Code}-${l3.c}-${l4.c}`;
        lines.push(`| ${code} | ${l3.t} | ${l4.t} |`);
      }
    } else {
      const code = `MS${subjectCode}-${l1Code}-${l2Code}-${l3.c}`;
      lines.push(`| ${code} | ${l3.t} | — |`);
    }
  }

  return lines.join('\n');
}

/**
 * 분류 프롬프트에 주입할 수학비서 유형 체계 텍스트 생성.
 * ★ subjectCode 가 배열이면 여러 학기 테이블을 합산하여 반환
 *   (예: ['03','04'] → 중2-1 + 중2-2 단원 모두 제공 → LLM이 문제 내용으로 학기 직접 판단).
 */
export function buildMathsecrPromptSection(subjectCode: string | string[]): string {
  const codes = Array.isArray(subjectCode) ? subjectCode : [subjectCode];
  const subjectName = codes.map(c => CODE_TO_NAME[c] || '수학').join(' + ');
  const typeTable = codes.map(c => buildTypeTable(c)).filter(Boolean).join('\n');

  if (!typeTable) return '';

  const codePrefix = codes.map(c => `"MS${c}-"`).join(' 또는 ');

  return `
■ 수학비서 유형 분류 체계 (${subjectName})
아래 테이블에서 문제에 가장 적합한 유형 코드(typeCode)를 선택하세요.
typeCode는 반드시 아래 목록에 있는 코드 중 하나여야 합니다.
★ 학기가 여러 개 제공된 경우 — **문제 내용을 보고** 맞는 학기 코드를 선택하세요. 파일명의 학기 표시는 무시하세요.

${typeTable}

★ typeCode는 반드시 ${codePrefix} 로 시작하는 위 코드 중 하나를 선택하세요.
★ 가능한 가장 구체적인 레벨(세부유형이 있으면 5-세그먼트 코드)을 선택하세요.
★ typeName에는 "대단원 > 중단원 > 소단원 > 세부유형" 형태로 기재하세요. 세부유형이 "—"인 경우엔 "대단원 > 중단원 > 소단원"만 적으세요.
`;
}

/**
 * 과목을 모르는 경우 (gradeHint 없음) 전체 과목 목록만 제공
 */
export function buildSubjectOnlyPrompt(): string {
  return `
■ 수학비서 과목 체계
먼저 문제의 과목을 판별하세요:
| 코드 | 과목 | 학년 | 주요 내용 |
|------|------|------|----------|
| 01 | 중1-1 | 중1 | 소인수분해, 정수와 유리수, 일차방정식, 좌표평면 |
| 02 | 중1-2 | 중1 | 기본도형, 평면도형, 입체도형, 통계 |
| 03 | 중2-1 | 중2 | 유리수, 식의계산, 부등식, 연립방정식, 일차함수 |
| 04 | 중2-2 | 중2 | 삼각형, 사각형, 도형의닮음, 확률 |
| 05 | 중3-1 | 중3 | 실수, 인수분해, 이차방정식, 이차함수 |
| 06 | 중3-2 | 중3 | 삼각비, 원의성질, 통계 |
| 07 | 공통수학1 | 고1 | 다항식, 방정식·부등식, 복소수, 경우의수, 행렬 |
| 08 | 공통수학2 | 고1 | 좌표·직선·원, 집합·명제, 함수·유리·무리 |
| 09 | 대수 | 고2 | 지수·로그, 삼각함수, 수열 |
| 10 | 미적분1 | 고2 | 극한, 미분, 적분 |
| 11 | 확률과 통계 | 고2 | 경우의수, 순열·조합, 확률, 통계 |
| 12 | 미적분2 | 고3 | 급수, 삼각함수미분, 여러가지미적분, 적분활용 |
| 13 | 기하 | 고3 | 이차곡선, 벡터, 공간좌표 |

★ subject 필드에 위 과목명을 정확히 기재하세요.
★ typeCode는 "MS{과목코드}-{대단원}-{중단원}-{소단원}-{세부유형}" 형식입니다 (세부유형이 없는 일부 단원은 4-세그먼트).
`;
}
