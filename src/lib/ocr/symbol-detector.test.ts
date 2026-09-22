import { describe, it, expect } from 'vitest';
import { jamoOcrPattern, repairCircledJamoText } from './symbol-detector';

// 학장중 24-2-2-M #7 (2026-09-22) — Mathpix 가 ㉠~㉤ 증명 박스를 `(ㄱ.` 꼴로 내보낸 실측
const OCR = "'두 내각의 크기가 같은 삼각형은 이등변삼각형이다.' 를 설명하는 과정이다. (ㄱ.~(ㅁ.에 들어갈 내용으로 적절하지 않은 것은?\n□ (ㄱ. 는 공통 ……②\n(1), (2), (3)에서 □ (ㄷ.( □ (ㄹ.합동)\n이므로 □ (ㅁ)";

describe('symbol-detector — 동그라미 한글 OCR 꼴', () => {
  it('★ 의심 패턴이 `(ㄱ.`·`(ㄱ ` 도 잡는다 (종전 `(ㄱ)` 만)', () => {
    expect(jamoOcrPattern('ㄱ', '').test('(ㄱ.~(ㅁ.에')).toBe(true);
    expect(jamoOcrPattern('ㅁ', '').test('(ㅁ.에')).toBe(true);
    expect(jamoOcrPattern('ㄷ', '').test('□ (ㄷ.(')).toBe(true);
    expect(jamoOcrPattern('ㅁ', '').test('(ㅁ)')).toBe(true);
    expect(jamoOcrPattern('ㄱ', '').test('(ㄱ, ㄴ)')).toBe(false); // 보기 나열 (ㄱ, ㄴ) 은 라벨이 아니다
  });
  it('★ Flash 가 본 기호만 ㉠ 로 — 빈칸 □ 는 \\boxed 로', () => {
    const { repairedText, repairCount } = repairCircledJamoText(OCR, ['㉠', '㉡', '㉢', '㉣', '㉤']);
    expect(repairCount).toBe(6);
    expect(repairedText).toContain('㉠~㉤에 들어갈');
    expect(repairedText).toContain('\\boxed{㉠} 는 공통');
    expect(repairedText).toContain('\\boxed{㉢}');
    expect(repairedText).toContain('\\boxed{㉤}');
    expect(repairedText).not.toContain('(ㄱ');
    expect(repairedText).not.toContain('□');
  });
  it('Flash 가 못 본 기호는 손대지 않는다 (원본 보호)', () => {
    const { repairedText, repairCount } = repairCircledJamoText('(ㄱ) 와 (ㄴ)', ['㉠']);
    expect(repairCount).toBe(1);
    expect(repairedText).toBe('㉠ 와 (ㄴ)');
  });
});
