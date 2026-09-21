import { describe, it, expect } from 'vitest';
import { trimNewlinesAroundBlocks } from './block-gap';

const t = (value: string) => ({ type: 'text', value });

describe('trimNewlinesAroundBlocks — 조건 박스·표 앞뒤 빈 줄 (2026-09-21 대표 캡처)', () => {
  it('★ 박스 앞 텍스트의 끝 줄바꿈, 뒤 텍스트의 앞 줄바꿈을 걷는다', () => {
    const els = [t('두 점 $A$, $B$가 다음 조건을 만족시킨다.\n'), t('__CONDITION_BOX_0__'), t('\n점 $A$에서 $y$축에 내린 수선의 발을 $H$라 하자.')];
    trimNewlinesAroundBlocks(els);
    expect(els.map((e) => e.value)).toEqual([
      '두 점 $A$, $B$가 다음 조건을 만족시킨다.',
      '__CONDITION_BOX_0__',
      '점 $A$에서 $y$축에 내린 수선의 발을 $H$라 하자.',
    ]);
  });

  it('빈 줄이 두 개여도, 공백이 섞여도 전부 걷는다', () => {
    const els = [t('앞 문장\n \n'), { type: 'table', value: '' }, t('  \n\n뒤 문장')];
    trimNewlinesAroundBlocks(els);
    expect(els[0].value).toBe('앞 문장');
    expect(els[2].value).toBe('뒤 문장');
  });

  it('블록 사이에 줄바꿈만 남은 텍스트는 요소째 사라진다', () => {
    const els = [{ type: 'display-math', value: 'x' }, t('\n\n'), { type: 'image', value: 'u' }];
    trimNewlinesAroundBlocks(els);
    expect(els.map((e) => e.type)).toEqual(['display-math', 'image']);
  });

  it('텍스트↔텍스트·인라인 수식 사이의 줄바꿈은 그대로 (문장 줄바꿈 보존)', () => {
    const els = [t('첫 줄\n둘째 줄\n'), { type: 'inline-math', value: 'x' }, t('\n셋째 줄')];
    trimNewlinesAroundBlocks(els);
    expect(els[0].value).toBe('첫 줄\n둘째 줄\n');
    expect(els[2].value).toBe('\n셋째 줄');
  });

  it('박스 자리표 자체는 건드리지 않는다', () => {
    const els = [t('a\n'), t('__SOLUTION_BOX_2__'), t('\nb')];
    trimNewlinesAroundBlocks(els);
    expect(els[1].value).toBe('__SOLUTION_BOX_2__');
  });
});
