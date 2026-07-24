import { describe, it, expect } from 'vitest';
import { detectTabularChoices } from './tabular-choices';

// ============================================================================
// 표 객관식 자동 감지 — content 안 \begin{tabular}(헤더행+①~⑤) → choiceHeaders + choices.
// 사직중 23-2-1 #13 실데이터 기반. PDF/OCR·HML 두 경로 공용.
// ============================================================================

describe('detectTabularChoices — 표 객관식 블록 → choiceHeaders/choices', () => {
  it('★ 사직중 #13 실데이터 (헤더 2셀 + ①~⑤ 5행)', () => {
    const content = String.raw`연립방정식의 해와 $a+c$의 값을 순서대로 배열하면?
\begin{tabular}{|l|l|l|}& 연립방정식의 해 & $a+c$의 값 \\ ① & 해가 무수히 많다. & $0$ \\ ② & 해가 무수히 많다. & $-2$ \\ ③ & 해가 무수히 많다. & $-4$ \\ ④ & 해가 없다. & $0$ \\ ⑤ & 해가 없다. & $-4$ \\ \end{tabular}`;
    const r = detectTabularChoices(content);
    expect(r).not.toBeNull();
    expect(r!.choiceHeaders).toEqual(['연립방정식의 해', '$a+c$의 값']);
    expect(r!.choices).toHaveLength(5);
    expect(r!.choices[0]).toBe('① 해가 무수히 많다. | $0$');
    expect(r!.choices[4]).toBe('⑤ 해가 없다. | $-4$');
    // 표는 본문에서 제거되고 stem 만 남는다
    expect(r!.content).toContain('순서대로 배열하면?');
    expect(r!.content).not.toContain('tabular');
  });

  it('(1)~(5) 괄호 라벨 형식도 인식', () => {
    const content = String.raw`다음 중 옳은 것은? \begin{tabular}{|l|l|l|}& A & B \\ (1) & 5 & 3 \\ (2) & 6 & 2 \\ (3) & 7 & 1 \\ \end{tabular}`;
    const r = detectTabularChoices(content);
    expect(r).not.toBeNull();
    expect(r!.choiceHeaders).toEqual(['A', 'B']);
    expect(r!.choices).toEqual(['① 5 | 3', '② 6 | 2', '③ 7 | 1']);
  });

  it('★ 데이터 표(라벨 아님)는 미발동 — null (오탐 0)', () => {
    // x/y 값 표: 첫 열이 ①②③ 가 아니라 데이터
    const content = String.raw`표를 보고 답하시오. \begin{tabular}{|l|l|l|}$x$ & 1 & 2 \\ $y$ & 3 & 4 \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });

  it('헤더 셀 수 ≠ 보기 셀 수면 미발동', () => {
    const content = String.raw`\begin{tabular}{|l|l|}& 값 \\ ① & 1 & 2 \\ ② & 3 & 4 \\ ③ & 5 & 6 \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });

  it('라벨 행 2개뿐이면 미발동 (최소 3)', () => {
    const content = String.raw`\begin{tabular}{|l|l|}& A \\ ① & 1 \\ ② & 2 \\ \end{tabular}`;
    expect(detectTabularChoices(content)).toBeNull();
  });

  it('표가 없으면 null', () => {
    expect(detectTabularChoices('그냥 텍스트 문제입니다.')).toBeNull();
  });
});
