// ============================================================================
// Image Pipeline Types — 도식 이미지 추출/보정/DB 관련 타입
// ============================================================================

/** 이미지 파이프라인 서버에 보낼 추출 요청 */
export interface ImageExtractRequest {
  file: File;
  subject: DiagramSubject;
  sourceName?: string;
  enhance?: boolean;
  uploadToSupabase?: boolean;
  minWidth?: number;
  minHeight?: number;
}

/** 추출 결과 */
export interface ImageExtractResponse {
  source: string;
  file_type: 'PDF' | 'HWP';
  extracted_count: number;
  enhanced_count: number;
  uploaded_count: number;
  db_entries_added: number;
  images: ExtractedDiagramImage[];
}

/** 추출된 개별 이미지 */
export interface ExtractedDiagramImage {
  db_id: string | null;
  filename: string;
  page: number;
  width: number;
  height: number;
  format: string;
  upscaled: boolean;
  is_grayscale: boolean | null;
  enhanced_size: [number, number] | null;
}

/** 보정 결과 */
export interface EnhanceResponse {
  original_size: [number, number];
  enhanced_size: [number, number];
  upscaled: boolean;
  is_grayscale: boolean;
  image_base64: string;
}

/** 유사도 검색 결과 */
export interface SimilarityMatch {
  id: string;
  filename: string;
  filepath: string;
  source: string;
  subject: string;
  width: number;
  height: number;
  phash: string;
  _distance: number;
  tags: DiagramTags;
}

export interface SimilaritySearchResponse {
  query: string;
  matches_count: number;
  matches: SimilarityMatch[];
}

/** DB 통계 */
export interface DiagramDBStats {
  total_images: number;
  sources_count: number;
  by_subject: Record<string, number>;
}

/** Supabase diagram_images 테이블 row */
export interface DiagramImageRow {
  id: string;
  filename: string;
  storage_path: string;
  public_url: string;
  source_name: string;
  subject: DiagramSubject;
  page_number: number;
  width: number;
  height: number;
  phash: string;
  file_hash: string;
  diagram_type: string;
  tags: string; // JSON string
  unit_code: string | null;
  unit_name: string | null;
  is_enhanced: boolean;
  created_at: string;
}

/** 도식 태그 */
export interface DiagramTags {
  subject: DiagramSubject;
  diagram_type: string;
  grade_level?: GradeLevel;
  curriculum_version?: CurriculumVersion;
  science_subject?: ScienceSubjectCode;
  unit_code?: string;
  unit_name?: string;
  unit_keywords?: string[];
  description?: string;
  labels?: string[];
  tags: string[];
}

// ============================================================================
// 교육과정 버전 & 학년 구분
// ============================================================================

/** 교육과정 버전 */
export type CurriculumVersion = '2015' | '2022';

/** 학교급 + 학년 */
export type GradeLevel =
  | 'middle_1' | 'middle_2' | 'middle_3'
  | 'high_common' | 'high_general' | 'high_career' | 'high_fusion';

// ============================================================================
// 과목 코드 체계
// ============================================================================

/** 기존 호환용 (이미지 파이프라인 서버 통신) */
export type DiagramSubject =
  | 'math'
  | 'science';

/** 과학 세부 과목 코드 — 실제 분류에 사용 */
export type ScienceSubjectCode =
  // 중학교
  | 'MS_SCI'
  // 고등학교 공통
  | 'IS1' | 'IS2' | 'SEL1' | 'SEL2'
  // 고등학교 일반선택
  | 'PHY' | 'CHM' | 'BIO' | 'EAR'
  // 고등학교 진로선택
  | 'PHY_ME' | 'PHY_EQ' | 'CHM_ME' | 'CHM_RW'
  | 'BIO_CM' | 'BIO_GN' | 'EAR_SS' | 'EAR_PS'
  // 고등학교 융합선택
  | 'FUS_CC' | 'FUS_SI' | 'FUS_HC';

/** 과학 과목 메타데이터 */
export interface ScienceSubjectMeta {
  code: ScienceSubjectCode;
  name: string;
  category: 'middle' | 'common' | 'general' | 'career' | 'fusion';
  gradeLevel: GradeLevel;
}

/** 전체 과학 과목 목록 */
export const SCIENCE_SUBJECTS: ScienceSubjectMeta[] = [
  // ── 중학교 ──
  { code: 'MS_SCI', name: '과학', category: 'middle', gradeLevel: 'middle_1' },
  { code: 'MS_SCI', name: '과학', category: 'middle', gradeLevel: 'middle_2' },
  { code: 'MS_SCI', name: '과학', category: 'middle', gradeLevel: 'middle_3' },
  // ── 고등학교 공통 ──
  { code: 'IS1', name: '통합과학1', category: 'common', gradeLevel: 'high_common' },
  { code: 'IS2', name: '통합과학2', category: 'common', gradeLevel: 'high_common' },
  { code: 'SEL1', name: '과학탐구실험1', category: 'common', gradeLevel: 'high_common' },
  { code: 'SEL2', name: '과학탐구실험2', category: 'common', gradeLevel: 'high_common' },
  // ── 고등학교 일반선택 ──
  { code: 'PHY', name: '물리학', category: 'general', gradeLevel: 'high_general' },
  { code: 'CHM', name: '화학', category: 'general', gradeLevel: 'high_general' },
  { code: 'BIO', name: '생명과학', category: 'general', gradeLevel: 'high_general' },
  { code: 'EAR', name: '지구과학', category: 'general', gradeLevel: 'high_general' },
  // ── 고등학교 진로선택 ──
  { code: 'PHY_ME', name: '역학과 에너지', category: 'career', gradeLevel: 'high_career' },
  { code: 'PHY_EQ', name: '전자기와 양자', category: 'career', gradeLevel: 'high_career' },
  { code: 'CHM_ME', name: '물질과 에너지', category: 'career', gradeLevel: 'high_career' },
  { code: 'CHM_RW', name: '화학 반응의 세계', category: 'career', gradeLevel: 'high_career' },
  { code: 'BIO_CM', name: '세포와 물질대사', category: 'career', gradeLevel: 'high_career' },
  { code: 'BIO_GN', name: '생명의 유전', category: 'career', gradeLevel: 'high_career' },
  { code: 'EAR_SS', name: '지구시스템과학', category: 'career', gradeLevel: 'high_career' },
  { code: 'EAR_PS', name: '행성우주과학', category: 'career', gradeLevel: 'high_career' },
  // ── 고등학교 융합선택 ──
  { code: 'FUS_CC', name: '기후변화와 환경생태', category: 'fusion', gradeLevel: 'high_fusion' },
  { code: 'FUS_SI', name: '융합과학탐구', category: 'fusion', gradeLevel: 'high_fusion' },
  { code: 'FUS_HC', name: '과학의 역사와 문화', category: 'fusion', gradeLevel: 'high_fusion' },
];

// ============================================================================
// 2022 개정 교육과정 단원 체계
// ============================================================================

export interface CurriculumUnit {
  code: string;
  name: string;
}

export interface SubjectCurriculum {
  subject: ScienceSubjectCode;
  name: string;
  curriculumVersion: CurriculumVersion;
  units: CurriculumUnit[];
}

/** 2022 개정 교육과정 — 전체 과학 단원 */
export const SCIENCE_CURRICULUM_2022: SubjectCurriculum[] = [
  // ── 중학교 과학 (중1) ──
  {
    subject: 'MS_SCI', name: '과학 (중1)', curriculumVersion: '2022',
    units: [
      { code: 'MS1-ME-01', name: '힘과 운동' },
      { code: 'MS1-ME-02', name: '에너지 전환과 보존' },
      { code: 'MS1-MT-01', name: '물질의 성질' },
      { code: 'MS1-MT-02', name: '물질의 상태 변화' },
      { code: 'MS1-LF-01', name: '생물의 다양성' },
      { code: 'MS1-LF-02', name: '식물과 에너지' },
      { code: 'MS1-EU-01', name: '지권의 변화' },
      { code: 'MS1-EU-02', name: '대기와 해양' },
    ],
  },
  // ── 중학교 과학 (중2) ──
  {
    subject: 'MS_SCI', name: '과학 (중2)', curriculumVersion: '2022',
    units: [
      { code: 'MS2-ME-01', name: '전기와 자기' },
      { code: 'MS2-ME-02', name: '빛과 파동' },
      { code: 'MS2-MT-01', name: '물질의 구성' },
      { code: 'MS2-MT-02', name: '화학 반응의 규칙성' },
      { code: 'MS2-LF-01', name: '동물과 에너지' },
      { code: 'MS2-LF-02', name: '자극과 반응' },
      { code: 'MS2-EU-01', name: '태양계' },
      { code: 'MS2-EU-02', name: '별과 우주' },
    ],
  },
  // ── 중학교 과학 (중3) ──
  {
    subject: 'MS_SCI', name: '과학 (중3)', curriculumVersion: '2022',
    units: [
      { code: 'MS3-ME-01', name: '운동과 에너지' },
      { code: 'MS3-MT-01', name: '화학 반응에서의 규칙성' },
      { code: 'MS3-LF-01', name: '생식과 유전' },
      { code: 'MS3-LF-02', name: '생태계와 환경' },
      { code: 'MS3-EU-01', name: '기권과 날씨' },
      { code: 'MS3-SS-01', name: '과학과 사회' },
    ],
  },

  // ── 통합과학1 ──
  {
    subject: 'IS1', name: '통합과학1', curriculumVersion: '2022',
    units: [
      { code: 'IS1-01', name: '과학의 기초' },
      { code: 'IS1-01-01', name: '물질의 기본 단위' },
      { code: 'IS1-01-02', name: '힘과 에너지의 기본 단위' },
      { code: 'IS1-02', name: '물질과 규칙성' },
      { code: 'IS1-02-01', name: '우주의 시작과 원소의 생성' },
      { code: 'IS1-02-02', name: '원자의 구조와 주기율' },
      { code: 'IS1-02-03', name: '화학 결합과 물질의 성질' },
      { code: 'IS1-03', name: '시스템과 상호작용' },
      { code: 'IS1-03-01', name: '역학적 시스템' },
      { code: 'IS1-03-02', name: '지구 시스템' },
      { code: 'IS1-03-03', name: '생명 시스템' },
    ],
  },
  // ── 통합과학2 ──
  {
    subject: 'IS2', name: '통합과학2', curriculumVersion: '2022',
    units: [
      { code: 'IS2-01', name: '변화와 다양성' },
      { code: 'IS2-01-01', name: '화학 변화' },
      { code: 'IS2-01-02', name: '생물 다양성과 유지' },
      { code: 'IS2-02', name: '환경과 에너지' },
      { code: 'IS2-02-01', name: '생태계와 환경' },
      { code: 'IS2-02-02', name: '전기 에너지와 발전' },
      { code: 'IS2-03', name: '과학과 미래사회' },
      { code: 'IS2-03-01', name: '감염병과 과학' },
      { code: 'IS2-03-02', name: '첨단 과학기술과 미래사회' },
    ],
  },
  // ── 과학탐구실험1 ──
  {
    subject: 'SEL1', name: '과학탐구실험1', curriculumVersion: '2022',
    units: [
      { code: 'SEL1-01', name: '역사 속의 과학 탐구' },
      { code: 'SEL1-02', name: '생활 속의 과학 탐구' },
    ],
  },
  // ── 과학탐구실험2 ──
  {
    subject: 'SEL2', name: '과학탐구실험2', curriculumVersion: '2022',
    units: [
      { code: 'SEL2-01', name: '탐구 설계와 수행' },
      { code: 'SEL2-02', name: '자료 분석과 논증' },
    ],
  },

  // ── 물리학 (일반선택) ──
  {
    subject: 'PHY', name: '물리학', curriculumVersion: '2022',
    units: [
      { code: 'PHY-01', name: '힘과 에너지' },
      { code: 'PHY-02', name: '물질과 전자기장' },
      { code: 'PHY-03', name: '파동과 정보통신' },
    ],
  },
  // ── 화학 (일반선택) ──
  {
    subject: 'CHM', name: '화학', curriculumVersion: '2022',
    units: [
      { code: 'CHM-01', name: '물질의 구조' },
      { code: 'CHM-02', name: '물질의 변화' },
      { code: 'CHM-03', name: '화학 변화와 에너지' },
    ],
  },
  // ── 생명과학 (일반선택) ──
  {
    subject: 'BIO', name: '생명과학', curriculumVersion: '2022',
    units: [
      { code: 'BIO-01', name: '생명과학의 이해' },
      { code: 'BIO-02', name: '사람의 몸' },
      { code: 'BIO-03', name: '항상성과 몸의 조절' },
    ],
  },
  // ── 지구과학 (일반선택) ──
  {
    subject: 'EAR', name: '지구과학', curriculumVersion: '2022',
    units: [
      { code: 'EAR-01', name: '고체 지구' },
      { code: 'EAR-02', name: '유체 지구' },
      { code: 'EAR-03', name: '우주' },
    ],
  },

  // ── 역학과 에너지 (진로선택) ──
  {
    subject: 'PHY_ME', name: '역학과 에너지', curriculumVersion: '2022',
    units: [
      { code: 'PHY_ME-01', name: '힘과 운동' },
      { code: 'PHY_ME-02', name: '에너지와 열' },
      { code: 'PHY_ME-03', name: '시공간과 운동' },
    ],
  },
  // ── 전자기와 양자 (진로선택) ──
  {
    subject: 'PHY_EQ', name: '전자기와 양자', curriculumVersion: '2022',
    units: [
      { code: 'PHY_EQ-01', name: '전자기장' },
      { code: 'PHY_EQ-02', name: '양자와 물질' },
    ],
  },
  // ── 물질과 에너지 (진로선택) ──
  {
    subject: 'CHM_ME', name: '물질과 에너지', curriculumVersion: '2022',
    units: [
      { code: 'CHM_ME-01', name: '물질의 화학적 성질' },
      { code: 'CHM_ME-02', name: '분자 간 상호작용과 에너지' },
    ],
  },
  // ── 화학 반응의 세계 (진로선택) ──
  {
    subject: 'CHM_RW', name: '화학 반응의 세계', curriculumVersion: '2022',
    units: [
      { code: 'CHM_RW-01', name: '산 염기와 산화 환원' },
      { code: 'CHM_RW-02', name: '반응 속도와 화학 평형' },
      { code: 'CHM_RW-03', name: '전기 화학과 화학 에너지' },
    ],
  },
  // ── 세포와 물질대사 (진로선택) ──
  {
    subject: 'BIO_CM', name: '세포와 물질대사', curriculumVersion: '2022',
    units: [
      { code: 'BIO_CM-01', name: '세포의 구조와 기능' },
      { code: 'BIO_CM-02', name: '세포 호흡과 광합성' },
    ],
  },
  // ── 생명의 유전 (진로선택) ──
  {
    subject: 'BIO_GN', name: '생명의 유전', curriculumVersion: '2022',
    units: [
      { code: 'BIO_GN-01', name: '유전자와 형질 발현' },
      { code: 'BIO_GN-02', name: '유전' },
    ],
  },
  // ── 지구시스템과학 (진로선택) ──
  {
    subject: 'EAR_SS', name: '지구시스템과학', curriculumVersion: '2022',
    units: [
      { code: 'EAR_SS-01', name: '지구 시스템의 에너지' },
      { code: 'EAR_SS-02', name: '지구 시스템의 상호작용' },
      { code: 'EAR_SS-03', name: '지구의 역사' },
    ],
  },
  // ── 행성우주과학 (진로선택) ──
  {
    subject: 'EAR_PS', name: '행성우주과학', curriculumVersion: '2022',
    units: [
      { code: 'EAR_PS-01', name: '행성의 운동' },
      { code: 'EAR_PS-02', name: '우주의 구조와 진화' },
    ],
  },

  // ── 기후변화와 환경생태 (융합선택) ──
  {
    subject: 'FUS_CC', name: '기후변화와 환경생태', curriculumVersion: '2022',
    units: [
      { code: 'FUS_CC-01', name: '기후변화' },
      { code: 'FUS_CC-02', name: '환경생태' },
    ],
  },
  // ── 융합과학탐구 (융합선택) ──
  {
    subject: 'FUS_SI', name: '융합과학탐구', curriculumVersion: '2022',
    units: [
      { code: 'FUS_SI-01', name: '융합 탐구 프로젝트' },
    ],
  },
  // ── 과학의 역사와 문화 (융합선택) ──
  {
    subject: 'FUS_HC', name: '과학의 역사와 문화', curriculumVersion: '2022',
    units: [
      { code: 'FUS_HC-01', name: '동서양의 과학 전통' },
      { code: 'FUS_HC-02', name: '근현대 과학의 발전' },
    ],
  },
];

// ============================================================================
// 2015 개정 교육과정 (병행 지원 — 현재 재학생 중 적용 학년 존재)
// ============================================================================

export const SCIENCE_CURRICULUM_2015: SubjectCurriculum[] = [
  // ── 중학교 과학 ──
  {
    subject: 'MS_SCI', name: '과학 (중1)', curriculumVersion: '2015',
    units: [
      { code: 'MS1-F01', name: '힘과 운동' },
      { code: 'MS1-F02', name: '여러 가지 힘' },
      { code: 'MS1-M01', name: '기체의 성질' },
      { code: 'MS1-M02', name: '물질의 상태 변화' },
      { code: 'MS1-L01', name: '생물의 다양성' },
      { code: 'MS1-E01', name: '지권의 변화' },
    ],
  },
  {
    subject: 'MS_SCI', name: '과학 (중2)', curriculumVersion: '2015',
    units: [
      { code: 'MS2-F01', name: '전기와 자기' },
      { code: 'MS2-F02', name: '열과 우리 생활' },
      { code: 'MS2-M01', name: '물질의 구성' },
      { code: 'MS2-M02', name: '화학 반응의 규칙과 에너지 변화' },
      { code: 'MS2-L01', name: '동물과 에너지' },
      { code: 'MS2-E01', name: '수권과 해수의 순환' },
      { code: 'MS2-E02', name: '열과 우리 생활' },
    ],
  },
  {
    subject: 'MS_SCI', name: '과학 (중3)', curriculumVersion: '2015',
    units: [
      { code: 'MS3-F01', name: '운동과 에너지' },
      { code: 'MS3-M01', name: '화학 반응에서의 규칙성' },
      { code: 'MS3-L01', name: '생식과 유전' },
      { code: 'MS3-L02', name: '생태계와 환경' },
      { code: 'MS3-E01', name: '기권과 날씨' },
      { code: 'MS3-E02', name: '별과 우주' },
    ],
  },
  // ── 통합과학 (2015에서는 단일) ──
  {
    subject: 'IS1', name: '통합과학', curriculumVersion: '2015',
    units: [
      { code: 'IS-01', name: '물질의 규칙성과 결합' },
      { code: 'IS-02', name: '자연의 구성 물질' },
      { code: 'IS-03', name: '역학적 시스템' },
      { code: 'IS-04', name: '지구 시스템' },
      { code: 'IS-05', name: '생명 시스템' },
      { code: 'IS-06', name: '화학 변화' },
      { code: 'IS-07', name: '생물 다양성과 유지' },
      { code: 'IS-08', name: '생태계와 환경' },
      { code: 'IS-09', name: '발전과 신재생 에너지' },
    ],
  },
  // ── 물리학Ⅰ/Ⅱ (2015) ──
  {
    subject: 'PHY', name: '물리학Ⅰ', curriculumVersion: '2015',
    units: [
      { code: 'PHY1-01', name: '역학과 에너지' },
      { code: 'PHY1-02', name: '물질과 전자기장' },
      { code: 'PHY1-03', name: '파동' },
    ],
  },
  {
    subject: 'PHY', name: '물리학Ⅱ', curriculumVersion: '2015',
    units: [
      { code: 'PHY2-01', name: '역학적 상호작용' },
      { code: 'PHY2-02', name: '전자기장' },
      { code: 'PHY2-03', name: '파동과 물질의 성질' },
    ],
  },
  // ── 화학Ⅰ/Ⅱ (2015) ──
  {
    subject: 'CHM', name: '화학Ⅰ', curriculumVersion: '2015',
    units: [
      { code: 'CHM1-01', name: '화학의 첫 걸음' },
      { code: 'CHM1-02', name: '원자의 세계' },
      { code: 'CHM1-03', name: '화학 결합과 분자의 세계' },
      { code: 'CHM1-04', name: '역동적인 화학 반응' },
    ],
  },
  {
    subject: 'CHM', name: '화학Ⅱ', curriculumVersion: '2015',
    units: [
      { code: 'CHM2-01', name: '물질의 세 가지 상태와 용액' },
      { code: 'CHM2-02', name: '반응 엔탈피와 화학 평형' },
      { code: 'CHM2-03', name: '반응 속도와 촉매' },
      { code: 'CHM2-04', name: '전기 화학과 이용' },
    ],
  },
  // ── 생명과학Ⅰ/Ⅱ (2015) ──
  {
    subject: 'BIO', name: '생명과학Ⅰ', curriculumVersion: '2015',
    units: [
      { code: 'BIO1-01', name: '생명과학의 이해' },
      { code: 'BIO1-02', name: '사람의 물질대사' },
      { code: 'BIO1-03', name: '항상성과 몸의 조절' },
      { code: 'BIO1-04', name: '유전' },
      { code: 'BIO1-05', name: '생태계와 상호작용' },
    ],
  },
  {
    subject: 'BIO', name: '생명과학Ⅱ', curriculumVersion: '2015',
    units: [
      { code: 'BIO2-01', name: '세포와 물질대사' },
      { code: 'BIO2-02', name: '유전자와 생명공학' },
      { code: 'BIO2-03', name: '생물의 진화' },
    ],
  },
  // ── 지구과학Ⅰ/Ⅱ (2015) ──
  {
    subject: 'EAR', name: '지구과학Ⅰ', curriculumVersion: '2015',
    units: [
      { code: 'EAR1-01', name: '고체 지구의 변화' },
      { code: 'EAR1-02', name: '유체 지구의 변화' },
      { code: 'EAR1-03', name: '우주' },
    ],
  },
  {
    subject: 'EAR', name: '지구과학Ⅱ', curriculumVersion: '2015',
    units: [
      { code: 'EAR2-01', name: '지구의 형성과 역장' },
      { code: 'EAR2-02', name: '지구의 역사' },
      { code: 'EAR2-03', name: '대기와 해양의 운동과 상호작용' },
      { code: 'EAR2-04', name: '천체와 우주' },
    ],
  },
];

// ============================================================================
// 유틸리티 함수
// ============================================================================

/** 과목 코드로 메타데이터 조회 */
export function getScienceSubjectMeta(code: ScienceSubjectCode): ScienceSubjectMeta | undefined {
  return SCIENCE_SUBJECTS.find((s) => s.code === code);
}

/** 교육과정 버전 + 과목 코드로 단원 목록 조회 */
export function getSubjectUnits(
  code: ScienceSubjectCode,
  version: CurriculumVersion = '2022',
): SubjectCurriculum[] {
  const curriculum = version === '2022' ? SCIENCE_CURRICULUM_2022 : SCIENCE_CURRICULUM_2015;
  return curriculum.filter((c) => c.subject === code);
}

/** 카테고리별 과목 필터 */
export function getSubjectsByCategory(
  category: ScienceSubjectMeta['category'],
): ScienceSubjectMeta[] {
  return SCIENCE_SUBJECTS.filter((s) => s.category === category);
}

/** 단원 코드로 단원명 역조회 (버전 자동 탐색) */
export function findUnitByCode(unitCode: string): { unit: CurriculumUnit; subject: SubjectCurriculum } | undefined {
  for (const subj of [...SCIENCE_CURRICULUM_2022, ...SCIENCE_CURRICULUM_2015]) {
    const unit = subj.units.find((u) => u.code === unitCode);
    if (unit) return { unit, subject: subj };
  }
  return undefined;
}

/** 2015 구 과목 코드 → 2022 신 코드 매핑 (하위 호환) */
export const LEGACY_SUBJECT_MAP: Record<string, ScienceSubjectCode> = {
  // 영문 키
  'physics': 'PHY',
  'chemistry': 'CHM',
  'biology': 'BIO',
  'earth_science': 'EAR',
  // 2015 개정 코드 → 2022 일반선택 (기본 매핑)
  'PHY1': 'PHY',
  'PHY2': 'PHY_ME',  // 물리학II → 역학과 에너지 (기본), 내용에 따라 PHY_EQ 가능
  'CHE1': 'CHM',
  'CHE2': 'CHM_ME',  // 화학II → 물질과 에너지 (기본), 내용에 따라 CHM_RW 가능
  'BIO1': 'BIO',
  'BIO2': 'BIO_CM',  // 생명과학II → 세포와 물질대사 (기본), 내용에 따라 BIO_GN 가능
  'ESC1': 'EAR',
  'ESC2': 'EAR_SS',  // 지구과학II → 지구시스템과학 (기본), 내용에 따라 EAR_PS 가능
  // 한글 과목명
  '물리학1': 'PHY',
  '물리학2': 'PHY_ME',
  '화학1': 'CHM',
  '화학2': 'CHM_ME',
  '생명과학1': 'BIO',
  '생명과학2': 'BIO_CM',
  '지구과학1': 'EAR',
  '지구과학2': 'EAR_SS',
};
