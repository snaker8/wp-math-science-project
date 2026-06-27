// ============================================================================
// mathsecr-prompt 회귀 테스트 — 학기-불명 212K 폭발 사고(PR #292) 클래스 방어
//   - resolveSubjectCode: 배열 반환(학기 불명) / NFD 정규화(맥) / 긴 key 우선
//   - buildTypeTable / buildL1L2Table: 배열 입력에서 빈 테이블 반환 금지
// ============================================================================
import { describe, it, expect } from 'vitest';
import { resolveSubjectCode, buildTypeTable, buildL1L2Table, resolveCurriculumCodes, curriculumCodesToLabel, CURRICULUM_OPTIONS } from './mathsecr-prompt';

describe('resolveSubjectCode', () => {
  it('★ 학기 명시 중등도 양 학기 배열 — 제목 학기 불신(제목 2-1+내용 2-2 평행사변형 오분류 fix, 2026-06-12)', () => {
    expect(resolveSubjectCode('중2-1 수학')).toEqual(['03', '04']);
    expect(resolveSubjectCode('중3-2')).toEqual(['05', '06']);
  });

  it('★ 학기 불명 중등 → 두 학기 배열 (212K 사고 fix 핵심)', () => {
    expect(resolveSubjectCode('중2 수학')).toEqual(['03', '04']);
    expect(resolveSubjectCode(undefined, '중1')).toEqual(['01', '02']);
  });

  it('★ 긴 key 우선 — "수학II"가 "수학I"보다 먼저 매치', () => {
    expect(resolveSubjectCode(undefined, '수학II')).toBe('10');
    expect(resolveSubjectCode(undefined, '수학I')).toBe('09');
  });

  it('★ NFD(맥 자모 분해) 한글도 매치 — 공통수학1 오분류 사고 방어', () => {
    expect(resolveSubjectCode('중2-1 수학'.normalize('NFD'))).toEqual(['03', '04']);
    expect(resolveSubjectCode(undefined, '수학II'.normalize('NFD'))).toBe('10');
  });

  it('subject 가 gradeHint 보다 우선', () => {
    expect(resolveSubjectCode('고1 수학', '수학II')).toBe('10');
  });

  it('미매치 → null', () => {
    expect(resolveSubjectCode('영어 독해')).toBeNull();
    expect(resolveSubjectCode()).toBeNull();
  });
});

describe('buildTypeTable', () => {
  it('단일 코드 → 해당 과목 행만 포함', () => {
    const table = buildTypeTable('03');
    expect(table).toContain('MS03-');
    expect(table).not.toContain('MS04-');
  });

  it('★ 배열 코드 → 두 학기 모두 합산 (빈 문자열 금지)', () => {
    const table = buildTypeTable(['03', '04']);
    expect(table.length).toBeGreaterThan(0);
    expect(table).toContain('MS03-');
    expect(table).toContain('MS04-');
  });

  it('미존재 코드 → 빈 문자열 (throw 금지)', () => {
    expect(buildTypeTable('99')).toBe('');
  });
});

describe('buildL1L2Table', () => {
  it('★ 배열 코드에서 빈 테이블 반환 금지 — 2단계 분류 미작동 → 212K 폴백 폭발 회귀 방지', () => {
    const table = buildL1L2Table(['03', '04']);
    expect(table.length).toBeGreaterThan(0);
    expect(table).toContain('MS03-');
    expect(table).toContain('MS04-');
  });
});

describe('resolveCurriculumCodes (자산화 학년·학기 명시 선택)', () => {
  it('★ 코드 직접 입력 — 그대로 유지(유효성)', () => {
    expect(resolveCurriculumCodes(['05', '06'])).toEqual(['05', '06']);
  });

  it('★ 라벨 입력 — 단일 학기 코드로 매핑 (학기 흡수 안 함 — resolveSubjectCode 와 차이)', () => {
    expect(resolveCurriculumCodes(['중3-1'])).toEqual(['05']);
    expect(resolveCurriculumCodes(['중3-1', '중3-2'])).toEqual(['05', '06']);
  });

  it('★ 명시 단일 학기는 단일 코드 — resolveSubjectCode("중3-1")=배열과 달리 사용자 의도 존중', () => {
    expect(resolveCurriculumCodes(['중3-1'])).toEqual(['05']);
    // 대비: resolveSubjectCode 는 학기 흡수해 양 학기 반환
    expect(resolveSubjectCode('중3-1')).toEqual(['05', '06']);
  });

  it('중복 제거 + 순서 보존', () => {
    expect(resolveCurriculumCodes(['05', '05', '06'])).toEqual(['05', '06']);
  });

  it('NFD(맥) 라벨도 매치', () => {
    expect(resolveCurriculumCodes(['중3-1'.normalize('NFD')])).toEqual(['05']);
  });

  it('유효하지 않은 값/빈 입력 → []', () => {
    expect(resolveCurriculumCodes(['99', '영어', ''])).toEqual([]);
    expect(resolveCurriculumCodes(undefined)).toEqual([]);
    expect(resolveCurriculumCodes(null)).toEqual([]);
  });

  it('고등 과목 라벨/코드', () => {
    expect(resolveCurriculumCodes(['공통수학1'])).toEqual(['07']);
    expect(resolveCurriculumCodes(['09', '대수'])).toEqual(['09']); // 중복 제거
  });

  it('모든 CURRICULUM_OPTIONS 코드가 유효(라운드트립)', () => {
    const codes = CURRICULUM_OPTIONS.map((o) => o.code);
    expect(resolveCurriculumCodes(codes)).toEqual(codes);
  });
});

describe('curriculumCodesToLabel', () => {
  it('코드 배열 → 라벨 결합', () => {
    expect(curriculumCodesToLabel(['05', '06'])).toBe('중3-1 + 중3-2');
    expect(curriculumCodesToLabel(['07'])).toBe('공통수학1');
  });
  it('빈 입력 → 빈 문자열', () => {
    expect(curriculumCodesToLabel([])).toBe('');
    expect(curriculumCodesToLabel(null)).toBe('');
  });
});
