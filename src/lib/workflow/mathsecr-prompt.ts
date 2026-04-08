/**
 * 수학비서(mathsecr) 분류 체계 기반 프롬프트 빌더
 *
 * mathsecr_complete.json의 트리 데이터를 활용하여
 * 과목별 소단원(L3) 테이블을 AI 프롬프트에 동적 주입한다.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TreeNode {
  t: string; // text
  c: string; // code
  ch?: TreeNode[];
}

// 과목명 → subject_code 매핑
const SUBJECT_CODE_MAP: Record<string, string> = {
  // 중학교
  '중1': '01', '중1-1': '01', '중1-2': '02',
  '중2': '03', '중2-1': '03', '중2-2': '04',
  '중3': '05', '중3-1': '05', '중3-2': '06',
  // 고등학교
  '고1': '07', '공통수학': '07', '공통수학1': '07', '공통수학2': '08',
  '대수': '09',
  '수학I': '10', '수학1': '10', '미적분1': '10',
  '확률과 통계': '11', '확률과통계': '11', '확통': '11',
  '수학II': '12', '수학2': '12', '미적분2': '12',
  '기하': '13',
  // gradeHint 형식
  '고등 수학Ⅰ': '10', '고등 수학Ⅱ': '12',
  '고등 미적분': '12', '고등 확률과 통계': '11', '고등 기하': '13',
  '고등 공통수학': '07',
  '고1 수학': '07', '고2 수학': '10', '고3 수학': '12',
  '중1 수학': '01', '중2 수학': '03', '중3 수학': '05',
};

// 과목 코드 → 과목명 매핑
const CODE_TO_NAME: Record<string, string> = {
  '01': '중1-1', '02': '중1-2', '03': '중2-1', '04': '중2-2',
  '05': '중3-1', '06': '중3-2',
  '07': '공통수학1', '08': '공통수학2', '09': '대수',
  '10': '미적분1', '11': '확률과 통계', '12': '미적분2', '13': '기하',
};

// 캐시
let _treeCache: TreeNode[] | null = null;

function loadTree(): TreeNode[] {
  if (_treeCache) return _treeCache;
  const jsonPath = path.join(process.cwd(), 'mathsecr_complete.json');
  _treeCache = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return _treeCache!;
}

/**
 * gradeHint(예: "고1 수학", "공통수학1")로부터 과목 코드를 추출
 */
export function resolveSubjectCode(gradeHint?: string, subject?: string): string | null {
  const hint = gradeHint || subject || '';
  // 직접 매핑
  for (const [key, code] of Object.entries(SUBJECT_CODE_MAP)) {
    if (hint.includes(key)) return code;
  }
  return null;
}

/**
 * 과목 코드에 해당하는 소단원(L3) 테이블을 프롬프트 문자열로 반환
 * AI가 typeCode를 선택할 수 있도록 코드 + 경로 형태
 */
export function buildTypeTable(subjectCode: string): string {
  const tree = loadTree();
  const subject = tree.find(s => s.c === subjectCode);
  if (!subject) return '';

  const lines: string[] = [];
  lines.push(`| 코드 | 대단원 | 중단원 | 소단원 |`);
  lines.push(`|------|--------|--------|--------|`);

  // 대단원(L1) → 중단원(L2) → 소단원(L3)
  for (const l1 of subject.ch || []) {
    for (const l2 of l1.ch || []) {
      for (const l3 of l2.ch || []) {
        const code = `MS${subjectCode}-${l1.c}-${l2.c}-${l3.c}`;
        lines.push(`| ${code} | ${l1.t} | ${l2.t} | ${l3.t} |`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * 분류 프롬프트에 주입할 수학비서 유형 체계 텍스트 생성
 */
export function buildMathsecrPromptSection(subjectCode: string): string {
  const subjectName = CODE_TO_NAME[subjectCode] || '수학';
  const typeTable = buildTypeTable(subjectCode);

  if (!typeTable) return '';

  return `
■ 수학비서 유형 분류 체계 (${subjectName})
아래 테이블에서 문제에 가장 적합한 유형 코드(typeCode)를 선택하세요.
typeCode는 반드시 아래 목록에 있는 코드 중 하나여야 합니다.

${typeTable}

★ typeCode는 반드시 "MS${subjectCode}-" 로 시작하는 위 코드 중 하나를 선택하세요.
★ typeName에는 "대단원 > 중단원 > 소단원" 형태로 기재하세요.
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
★ typeCode는 "MS{과목코드}-{대단원}-{중단원}-{소단원}" 형식입니다.
`;
}
