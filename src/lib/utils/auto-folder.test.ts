import { describe, it, expect } from 'vitest';
import { CURRICULUM_CODE_LABEL } from './auto-folder';
import { CURRICULUM_OPTIONS } from '@/lib/workflow/mathsecr-prompt';

// 업로드 시 선택한 과목코드 → 폴더 매칭 라벨 맵이 CURRICULUM_OPTIONS 와 어긋나면
// "공통수학1 선택 → 공통수학1 폴더" 자동배치가 엉뚱한 폴더로 감. 동기화 잠금.
describe('CURRICULUM_CODE_LABEL ↔ CURRICULUM_OPTIONS 동기화', () => {
  it('★ 모든 코드·라벨이 CURRICULUM_OPTIONS 와 일치', () => {
    for (const opt of CURRICULUM_OPTIONS) {
      expect(CURRICULUM_CODE_LABEL[opt.code]).toBe(opt.label);
    }
    expect(Object.keys(CURRICULUM_CODE_LABEL).length).toBe(CURRICULUM_OPTIONS.length);
  });
  it('★ 07 = 공통수학1', () => {
    expect(CURRICULUM_CODE_LABEL['07']).toBe('공통수학1');
  });
});
