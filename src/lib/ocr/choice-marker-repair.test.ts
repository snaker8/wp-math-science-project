import { describe, it, expect } from 'vitest';
import { repairConfusedChoiceMarkers } from './choice-marker-repair';
import { extractChoicesFromOCR } from './extract-choices-from-ocr';

const SENTUM_17 = '다음 <보기>에서 극한값이 존재하는 것만을 있는 대로 고른 것은?\n\n<보기>\nㄱ. $\\lim_{x\\to1}\\frac{2}{(x-1)^2}$\nㄴ. $\\lim_{x\\to\\infty}\\frac{1}{|x-7|}$\n\n(1) ㄴ (2) ㄱ, ㄹ (B) ㄴ, ㄷ\n(4) ㄷ, ㄹ (5) ㄴ, ㄷ, ㄹ';

describe('repairConfusedChoiceMarkers', () => {
  it('(B) 한 자리만 틀린 5개 세트 → (3)', () => {
    const out = repairConfusedChoiceMarkers(SENTUM_17);
    expect(out).toContain('(3) ㄴ, ㄷ');
    expect(out).not.toContain('(B)');
  });
  it('이미 맞으면 그대로, 두 자리 틀리면 손대지 않음', () => {
    const ok = '(1) a (2) b (3) c (4) d (5) e';
    expect(repairConfusedChoiceMarkers(ok)).toBe(ok);
    const two = '(1) a (B) b (S) c (4) d (5) e';
    expect(repairConfusedChoiceMarkers(two)).toBe(two);
  });
  it('수식 안 괄호·함수 인수는 마커가 아니다', () => {
    const t = '$f(1)=2$ 이고 f(2)=3 일 때 (1) a (2) b (B) c (4) d (5) e';
    expect(repairConfusedChoiceMarkers(t)).toBe('$f(1)=2$ 이고 f(2)=3 일 때 (1) a (2) b (3) c (4) d (5) e');
  });
  it('보기 본문 (x-1)^2 같은 괄호는 한 글자가 아니라 안 걸린다', () => {
    expect(repairConfusedChoiceMarkers(SENTUM_17)).toContain('(x-1)^2');
  });
});

describe('extractChoicesFromOCR — (B) 오인식 세트도 5지선다로', () => {
  it('센텀여고 #17: (1)(2)(B)(4)(5) → 보기 5개 (객관식 유지)', () => {
    const ch = extractChoicesFromOCR(SENTUM_17);
    expect(ch).toEqual(['ㄴ', 'ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']);
  });
});
