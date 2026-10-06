import { describe, it, expect } from 'vitest';
import { typeCodePrefix, buildFailureLessonsBlock, buildCorrectionPromptBlock } from './correction-examples';
import { inferFigureTypeFromSvg } from './figure-learning';

describe('typeCodePrefix', () => {
  it('5마디 코드를 중단원(3마디)까지 자른다', () => {
    expect(typeCodePrefix('MS06-01-02-01-01')).toBe('MS06-01-02');
    expect(typeCodePrefix('MS06-01-02')).toBe('MS06-01-02');
    expect(typeCodePrefix(null)).toBeNull();
  });
});

describe('buildFailureLessonsBlock', () => {
  it('지적 사항을 짧은 불릿으로, 공백 정리', () => {
    const b = buildFailureLessonsBlock([
      { id: '1', figure_type: 'geometry', correction_type: 'svg_verify_failed', correction_note: '직각 표시가  빠짐 /\n 라벨 C 위치가 다름' },
    ]);
    expect(b).toContain('반드시 피할 것');
    expect(b).toContain('- 직각 표시가 빠짐 / 라벨 C 위치가 다름');
  });
  it('비면 빈 문자열', () => {
    expect(buildFailureLessonsBlock([])).toBe('');
  });
});

describe('buildCorrectionPromptBlock', () => {
  it('검증 통과 자동 SVG 는 표시가 붙는다', () => {
    const b = buildCorrectionPromptBlock([{ id: 'a', problem_content: 'p', figure_type: 'geometry', original_svg: null, corrected_svg_source: '<svg/>', corrected_image_url: null, correction_type: 'svg_verified' }]);
    expect(b).toContain('(검증 통과 자동 생성)');
  });
});

describe('inferFigureTypeFromSvg', () => {
  it('x·y 축 라벨이 있으면 graph, 폴리곤이면 geometry', () => {
    expect(inferFigureTypeFromSvg('<svg><text>x</text><text>y</text></svg>')).toBe('graph');
    expect(inferFigureTypeFromSvg('<svg><polygon points="0,0 1,1 2,0"/><text>A</text></svg>')).toBe('geometry');
  });
});
