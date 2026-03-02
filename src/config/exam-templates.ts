// ============================================================================
// 시험지 템플릿 정의
// 6종 사전정의 템플릿 + 타입
// ============================================================================

/** 시험 메타데이터 */
export interface ExamMeta {
  schoolName: string;     // 학교명
  grade: string;          // 학년 (고1, 중2 등)
  semester: string;       // 학기 (1학기, 2학기)
  examType: string;       // 시험유형 (중간고사, 기말고사, 단원평가 등)
  subject: string;        // 과목 (공통수학1 등)
  teacher: string;        // 출제교사
  date: string;           // 시험일
  timeLimit: string;      // 시험시간 (50분 등)
  totalScore: string;     // 총점 (100점)
  className: string;      // 반
}

export const DEFAULT_EXAM_META: ExamMeta = {
  schoolName: '',
  grade: '',
  semester: '',
  examType: '',
  subject: '',
  teacher: '',
  date: '',
  timeLimit: '',
  totalScore: '100',
  className: '',
};

/** 헤더 스타일 타입 */
export type HeaderStyle = 'table-simple' | 'table-formal' | 'centered' | 'bordered-box';

/** 상단 장식 타입 */
export type TopBorder = 'none' | 'thick' | 'double' | 'decorated';

/** 학생 정보란 필드 */
export type StudentField = 'name' | 'class' | 'number' | 'score';

/** 템플릿 정의 */
export interface ExamTemplate {
  id: string;
  name: string;
  description: string;
  headerStyle: HeaderStyle;
  topBorder: TopBorder;
  showFields: (keyof ExamMeta)[];
  studentFields: StudentField[];
  footerText?: string;
}

/** 시험유형 옵션 */
export const EXAM_TYPE_OPTIONS = [
  '중간고사',
  '기말고사',
  '단원평가',
  '모의고사',
  '수행평가',
  '진단평가',
  '보충학습',
  '기타',
] as const;

/** 학기 옵션 */
export const SEMESTER_OPTIONS = ['1학기', '2학기'] as const;

/** 학년 옵션 */
export const GRADE_OPTIONS = [
  '초4', '초5', '초6',
  '중1', '중2', '중3',
  '고1', '고2', '고3',
] as const;

// ============================================================================
// 사전정의 템플릿 6종
// ============================================================================

export const EXAM_TEMPLATES: ExamTemplate[] = [
  {
    id: 'simple',
    name: '기본형',
    description: '간단한 1행 테이블 (과목|시험지명|담당)',
    headerStyle: 'table-simple',
    topBorder: 'thick',
    showFields: ['subject', 'teacher'],
    studentFields: [],
  },
  {
    id: 'formal-a',
    name: '학교시험A',
    description: '2행 테이블 — 학교/학년/과목 + 시험명/교사/날짜',
    headerStyle: 'table-formal',
    topBorder: 'double',
    showFields: ['schoolName', 'grade', 'semester', 'examType', 'subject', 'teacher', 'date', 'timeLimit'],
    studentFields: ['name', 'class', 'number', 'score'],
  },
  {
    id: 'formal-b',
    name: '학교시험B',
    description: '두꺼운 테두리 박스 — 학교명 강조 + 정보 테이블',
    headerStyle: 'bordered-box',
    topBorder: 'double',
    showFields: ['schoolName', 'grade', 'semester', 'examType', 'subject', 'teacher', 'date'],
    studentFields: ['name', 'class', 'number', 'score'],
  },
  {
    id: 'centered',
    name: '중앙정렬형',
    description: '학교명 큰 볼드 + 시험정보 중앙 배치',
    headerStyle: 'centered',
    topBorder: 'double',
    showFields: ['schoolName', 'grade', 'semester', 'examType', 'subject', 'timeLimit'],
    studentFields: ['name', 'class', 'number'],
  },
  {
    id: 'minimal',
    name: '미니멀',
    description: '과목만 좌측, 이름/반 우측 — 최소 정보',
    headerStyle: 'table-simple',
    topBorder: 'none',
    showFields: ['subject'],
    studentFields: ['name', 'class'],
  },
  {
    id: 'academy',
    name: '학원형',
    description: '학원 로고 + 이름 좌측, 시험정보 우측',
    headerStyle: 'bordered-box',
    topBorder: 'thick',
    showFields: ['schoolName', 'subject', 'teacher', 'date'],
    studentFields: ['name', 'class', 'score'],
    footerText: '※ 모든 문제에 풀이과정을 자세히 적으시오.',
  },
];

/** ID로 템플릿 조회 */
export function getExamTemplate(id: string): ExamTemplate {
  return EXAM_TEMPLATES.find(t => t.id === id) || EXAM_TEMPLATES[0];
}
